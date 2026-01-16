/**
 * Plan Mode Workflow - 4-phase structured workflow
 *
 * Phases:
 * 1. Explore - Explore codebase and understand structure
 * 2. Design - Design implementation plan
 * 3. Review - Review design for feasibility
 * 4. Implement - Execute code changes
 */

import type {
  Workflow,
  WorkflowPhase,
  AgentType,
  WorkflowExecutionContext,
} from './types'

/**
 * Create a Plan Mode workflow instance
 */
export function createPlanModeWorkflow(
  userTask: string,
  _context: WorkflowExecutionContext
): Workflow {
  const workflowId = `workflow-${Date.now()}`

  // Phase 1: Explore
  const explorePhase: WorkflowPhase = {
    id: `${workflowId}-explore`,
    name: '探索',
    description: '探索代码库，理解现有结构和相关代码',
    agentIds: [], // Will be populated when agents are spawned
    status: 'pending',
    requiresApproval: false,
    createdAt: new Date(),
    metadata: {
      agentCount: 2,
      agentTypes: ['explore', 'explore'] as AgentType[],
      tasks: [
        `探索与任务相关的代码结构：${userTask}`,
        `查找现有的相似实现和模式，为任务提供参考：${userTask}`,
      ],
    },
  }

  // Phase 2: Design
  const designPhase: WorkflowPhase = {
    id: `${workflowId}-design`,
    name: '设计',
    description: '基于探索结果,设计详细的实施方案',
    agentIds: [],
    status: 'pending',
    requiresApproval: true, // Requires user approval
    createdAt: new Date(),
    metadata: {
      agentCount: 1,
      agentTypes: ['plan'] as AgentType[],
      tasks: [
        `基于探索阶段的发现,设计完整的实施方案:${userTask}\n请包括:\n1. 需要修改的文件列表\n2. 详细的实施步骤\n3. 潜在的风险和注意事项`,
      ],
    },
  }

  // Phase 3: Review
  const reviewPhase: WorkflowPhase = {
    id: `${workflowId}-review`,
    name: '审查',
    description: '审查设计方案的可行性和完整性',
    agentIds: [],
    status: 'pending',
    requiresApproval: true, // Requires user approval
    createdAt: new Date(),
    metadata: {
      agentCount: 1,
      agentTypes: ['reviewer'] as AgentType[],
      tasks: [
        `审查设计方案,检查以下方面:\n1. 方案是否完整可行\n2. 是否遵循了项目的架构和代码规范\n3. 是否存在潜在的问题或遗漏\n4. 提供改进建议`,
      ],
    },
  }

  // Phase 4: Implement
  const implementPhase: WorkflowPhase = {
    id: `${workflowId}-implement`,
    name: '实施',
    description: '执行代码变更和测试',
    agentIds: [],
    status: 'pending',
    requiresApproval: false,
    createdAt: new Date(),
    metadata: {
      agentCount: 2,
      agentTypes: ['code-writer', 'tester'] as AgentType[],
      tasks: [
        `根据设计方案实施代码变更:${userTask}`,
        `为新实现的功能编写测试用例并执行测试`,
      ],
    },
  }

  const workflow: Workflow = {
    id: workflowId,
    name: 'Plan Mode 工作流',
    description: `4 阶段结构化工作流：${userTask}`,
    phases: [explorePhase, designPhase, reviewPhase, implementPhase],
    currentPhaseIndex: 0,
    status: 'pending',
    createdAt: new Date(),
  }

  return workflow
}

/**
 * Generate agent tasks for a specific phase
 */
export function generatePhaseAgentTasks(
  phase: WorkflowPhase,
  previousPhaseOutput?: string
): Array<{ type: AgentType; task: string; config?: Record<string, unknown> }> {
  const metadata = phase.metadata
  if (!metadata || !metadata.agentTypes || !metadata.tasks) {
    return []
  }

  const agentTypes = metadata.agentTypes as AgentType[]
  const tasks = metadata.tasks as string[]

  return agentTypes.map((type, index) => {
    let task = tasks[index] || tasks[0]

    // Append previous phase output as context if available
    if (previousPhaseOutput && index === 0) {
      task += `\n\n## 前一阶段的输出：\n${previousPhaseOutput}`
    }

    return {
      type,
      task,
    }
  })
}

/**
 * Extract phase summary from agents
 */
export function extractPhaseSummary(
  phase: WorkflowPhase,
  agents: Array<{ id: string; output?: string }>
): string {
  const phaseAgents = agents.filter((a) => phase.agentIds.includes(a.id))

  if (phaseAgents.length === 0) {
    return `阶段 ${phase.name} 完成，但没有代理输出。`
  }

  const summaries = phaseAgents
    .map((agent, index) => {
      const output = agent.output || '无输出'
      return `### 代理 ${index + 1} 输出：\n${output}`
    })
    .join('\n\n')

  return `## ${phase.name} 阶段总结\n\n${summaries}`
}

/**
 * Validate if workflow can proceed to next phase
 */
export function canProceedToNextPhase(
  workflow: Workflow,
  agents: Array<{ id: string; status: string }>
): boolean {
  const currentPhase = workflow.phases[workflow.currentPhaseIndex]
  if (!currentPhase) return false

  const phaseAgents = agents.filter((a) => currentPhase.agentIds.includes(a.id))
  if (phaseAgents.length === 0) return false

  // Check if all agents completed successfully
  const allCompleted = phaseAgents.every((a) => a.status === 'completed')
  const hasError = phaseAgents.some((a) => a.status === 'error')

  return allCompleted && !hasError
}
