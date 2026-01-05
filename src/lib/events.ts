import { listen, type UnlistenFn } from '@tauri-apps/api/event'

// ==================== Event Types ====================

export interface ItemStartedEvent {
  itemId: string
  type: string
  threadId: string
}

export interface ItemCompletedEvent {
  itemId: string
  type: string
  threadId: string
  content: unknown
}

export interface AgentMessageDeltaEvent {
  itemId: string
  threadId: string
  delta: string
}

export interface CommandApprovalRequestedEvent {
  itemId: string
  threadId: string
  command: string
  cwd: string
  commandActions: string[]
}

export interface FileChangeApprovalRequestedEvent {
  itemId: string
  threadId: string
  changes: Array<{
    path: string
    kind: 'add' | 'modify' | 'delete'
    diff: string
  }>
}

export interface TurnCompletedEvent {
  threadId: string
  turnId: string
}

export interface TurnFailedEvent {
  threadId: string
  turnId: string
  error: string
  errorInfo?: {
    type: string
    message: string
  }
}

export interface ServerDisconnectedEvent {
  // Empty payload
}

// ==================== Event Handlers ====================

export type EventHandlers = {
  onItemStarted?: (event: ItemStartedEvent) => void
  onItemCompleted?: (event: ItemCompletedEvent) => void
  onAgentMessageDelta?: (event: AgentMessageDeltaEvent) => void
  onCommandApprovalRequested?: (event: CommandApprovalRequestedEvent) => void
  onFileChangeApprovalRequested?: (event: FileChangeApprovalRequestedEvent) => void
  onTurnCompleted?: (event: TurnCompletedEvent) => void
  onTurnFailed?: (event: TurnFailedEvent) => void
  onServerDisconnected?: (event: ServerDisconnectedEvent) => void
}

// ==================== Setup Event Listeners ====================

export async function setupEventListeners(
  handlers: EventHandlers
): Promise<UnlistenFn[]> {
  const unlisteners: UnlistenFn[] = []

  if (handlers.onItemStarted) {
    const unlisten = await listen<ItemStartedEvent>('item-started', (event) => {
      handlers.onItemStarted?.(event.payload)
    })
    unlisteners.push(unlisten)
  }

  if (handlers.onItemCompleted) {
    const unlisten = await listen<ItemCompletedEvent>('item-completed', (event) => {
      handlers.onItemCompleted?.(event.payload)
    })
    unlisteners.push(unlisten)
  }

  if (handlers.onAgentMessageDelta) {
    const unlisten = await listen<AgentMessageDeltaEvent>(
      'agent-message-delta',
      (event) => {
        handlers.onAgentMessageDelta?.(event.payload)
      }
    )
    unlisteners.push(unlisten)
  }

  if (handlers.onCommandApprovalRequested) {
    const unlisten = await listen<CommandApprovalRequestedEvent>(
      'command-approval-requested',
      (event) => {
        handlers.onCommandApprovalRequested?.(event.payload)
      }
    )
    unlisteners.push(unlisten)
  }

  if (handlers.onFileChangeApprovalRequested) {
    const unlisten = await listen<FileChangeApprovalRequestedEvent>(
      'file-change-approval-requested',
      (event) => {
        handlers.onFileChangeApprovalRequested?.(event.payload)
      }
    )
    unlisteners.push(unlisten)
  }

  if (handlers.onTurnCompleted) {
    const unlisten = await listen<TurnCompletedEvent>('turn-completed', (event) => {
      handlers.onTurnCompleted?.(event.payload)
    })
    unlisteners.push(unlisten)
  }

  if (handlers.onTurnFailed) {
    const unlisten = await listen<TurnFailedEvent>('turn-failed', (event) => {
      handlers.onTurnFailed?.(event.payload)
    })
    unlisteners.push(unlisten)
  }

  if (handlers.onServerDisconnected) {
    const unlisten = await listen<ServerDisconnectedEvent>(
      'app-server-disconnected',
      (event) => {
        handlers.onServerDisconnected?.(event.payload)
      }
    )
    unlisteners.push(unlisten)
  }

  return unlisteners
}

// Cleanup all listeners
export function cleanupEventListeners(unlisteners: UnlistenFn[]) {
  unlisteners.forEach((unlisten) => unlisten())
}
