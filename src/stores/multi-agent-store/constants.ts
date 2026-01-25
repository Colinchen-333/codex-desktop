import { APPROVAL_TIMEOUT_MS } from '../thread/constants'
import type { MultiAgentConfig } from './types'

export const DEFAULT_CONFIG: MultiAgentConfig = {
  projectId: undefined,
  cwd: '',
  model: '',
  approvalPolicy: 'on-request',
  timeout: 300,
  maxConcurrentAgents: 10,
}

export const APPROVAL_POLICY_ORDER: Record<string, number> = {
  never: 0,
  'on-failure': 1,
  untrusted: 2,
  'on-request': 3,
}

export const MAX_AGENT_OUTPUT_CHARS = 4000
export const START_SLOT_POLL_MS = 500
export const DEFAULT_APPROVAL_TIMEOUT_MS = APPROVAL_TIMEOUT_MS
export const DEFAULT_DEPENDENCY_WAIT_TIMEOUT_MS = 5 * 60 * 1000
export const DEFAULT_PAUSE_TIMEOUT_MS = 30 * 60 * 1000
export const MAX_PHASE_OUTPUT_LENGTH = 8000
export const MAX_AGENT_TASK_LENGTH = 500
