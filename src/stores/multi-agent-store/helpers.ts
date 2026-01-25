import { getAgentSystemPrompt, getAgentToolWhitelist } from '../../lib/agent-types'
import { log } from '../../lib/logger'
import { normalizeApprovalPolicy, normalizeSandboxMode } from '../../lib/normalize'
import { extractPhaseSummary } from '../../lib/workflows/plan-mode'
import type { AgentType, WorkflowPhase, AgentDescriptor } from '../../lib/workflows/types'
import type { SingleThreadState } from '../thread/types'
import { useThreadStore } from '../thread'
import { APPROVAL_POLICY_ORDER, MAX_AGENT_OUTPUT_CHARS } from './constants'

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function getRequiredApprovalPolicy(sandboxPolicy: string): string | undefined {
  const approvalPolicyMap: Record<string, string> = {
    'read-only': 'never',
    'workspace-write': 'on-failure',
    'workspace-write-with-approval': 'on-request',
  }
  return approvalPolicyMap[sandboxPolicy]
}

export function resolveApprovalPolicy(
  sandboxPolicy: string,
  requested?: string,
  fallback?: string
): string | undefined {
  const required = normalizeApprovalPolicy(getRequiredApprovalPolicy(sandboxPolicy))
  const normalizedRequested = normalizeApprovalPolicy(requested)
  const normalizedFallback = normalizeApprovalPolicy(fallback)
  const candidate = normalizedRequested ?? normalizedFallback ?? required

  if (!required || !candidate) return candidate ?? required
  const candidatePriority = APPROVAL_POLICY_ORDER[candidate] ?? 0
  const requiredPriority = APPROVAL_POLICY_ORDER[required] ?? 0
  return candidatePriority >= requiredPriority ? candidate : required
}

export function resolveSandboxPolicy(policy: string): string {
  const normalized = normalizeSandboxMode(policy)
  if (normalized) return normalized
  if (policy === 'workspace-write-with-approval') {
    return 'workspace-write'
  }
  log.warn(`[resolveSandboxPolicy] Unknown sandbox policy "${policy}", defaulting to workspace-write`, 'multi-agent')
  return 'workspace-write'
}

export function extractLatestAgentMessage(threadState?: SingleThreadState): string | undefined {
  if (!threadState) return undefined

  for (let index = threadState.itemOrder.length - 1; index >= 0; index -= 1) {
    const itemId = threadState.itemOrder[index]
    const item = threadState.items[itemId]
    if (item?.type === 'agentMessage') {
      const content = item.content as { text?: string }
      if (content.text) {
        return content.text
      }
    }
  }

  return undefined
}

export function truncateOutput(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}...`
}

export function buildAgentDeveloperInstructions(type: AgentType): string | undefined {
  const systemPrompt = getAgentSystemPrompt(type)
  const toolWhitelist = getAgentToolWhitelist(type)

  const sections: string[] = []

  if (systemPrompt) {
    sections.push(`## 角色指引\n${systemPrompt}`)
  }

  if (toolWhitelist.length > 0) {
    sections.push(`## 可用工具\n${toolWhitelist.join(', ')}`)
  }
  if (sections.length === 0) return undefined

  return sections.join('\n\n')
}

export function buildAgentTaskMessage(task: string): string {
  return task
}

export function buildPhaseOutput(phase: WorkflowPhase, agents: AgentDescriptor[]): string {
  const threads = useThreadStore.getState().threads
  const outputs = agents.map((agent) => {
    const threadState = agent.threadId ? threads[agent.threadId] : undefined
    const latest = extractLatestAgentMessage(threadState) ?? '无输出'
    return {
      id: agent.id,
      output: truncateOutput(latest, MAX_AGENT_OUTPUT_CHARS),
    }
  })

  return extractPhaseSummary(phase, outputs)
}
