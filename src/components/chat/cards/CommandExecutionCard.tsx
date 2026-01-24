/**
 * CommandExecutionCard - Shows shell command execution with approval UI
 *
 * Refactored to use BaseCard as the foundation component.
 * Handles command approval, output display, and feedback modes.
 *
 * Performance optimization: Wrapped with React.memo and custom comparison function
 * to prevent unnecessary re-renders in message lists.
 */
import { memo, useState, useEffect, useRef, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Terminal } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { isCommandExecutionContent } from '../../../lib/typeGuards'
import { useThreadStore, selectFocusedThread, type ThreadState } from '../../../stores/thread'
import { log } from '../../../lib/logger'
import { truncateOutput, shallowContentEqual } from '../utils'
import { MAX_OUTPUT_LINES } from '../types'
import { ColorizedOutput } from '../messages/ColorizedOutput'
import type { MessageItemProps } from '../types'
import { BaseCard, CardSection, CardOutput, StatusBadge, type CardStatus } from './BaseCard'
import { formatDuration } from './card-utils'

// -----------------------------------------------------------------------------
// Helper Components
// -----------------------------------------------------------------------------

interface ApprovalUIProps {
  proposedExecpolicyAmendment?: { command: string[] } | null
  onApprove: (decision: 'accept' | 'acceptForSession' | 'acceptWithExecpolicyAmendment' | 'decline') => Promise<void>
  onExplain: () => Promise<void>
  isExplaining: boolean
  explanation: string
}

/**
 * Approval UI component - handles the approval workflow
 */
const ApprovalUI = memo(function ApprovalUI({
  proposedExecpolicyAmendment,
  onApprove,
  onExplain,
  isExplaining,
  explanation,
}: ApprovalUIProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [approvalMode, setApprovalMode] = useState<'select' | 'explain' | 'feedback'>('select')
  const [feedbackText, setFeedbackText] = useState('')
  const feedbackInputRef = useRef<HTMLInputElement>(null)

  // Get thread store for feedback submission
  const { activeThread, sendMessage } = useThreadStore(
    useShallow((state: ThreadState) => ({
      activeThread: selectFocusedThread(state)?.thread ?? null,
      sendMessage: state.sendMessage,
    }))
  )

  // Handle feedback submission
  const handleFeedbackSubmit = async () => {
    if (!activeThread) return
    try {
      await onApprove('decline')
      if (feedbackText.trim()) {
        await sendMessage(feedbackText.trim())
      }
    } finally {
      setFeedbackText('')
      setApprovalMode('select')
    }
  }

  return (
    <div className="mt-5 pt-3 border-t border-border/40">
      {/* Explanation Mode */}
      {approvalMode === 'explain' && (
        <div className="animate-in fade-in duration-100">
          <div className="mb-3 text-sm font-medium text-yellow-600 dark:text-yellow-400">
            Command Explanation:
          </div>
          {isExplaining ? (
            <div className="text-sm text-muted-foreground italic">
              Generating explanation...
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">{explanation}</div>
          )}
          <button
            className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setApprovalMode('select')}
          >
            &larr; Back to options
          </button>
        </div>
      )}

      {/* Feedback Mode */}
      {approvalMode === 'feedback' && (
        <div className="animate-in fade-in duration-100">
          <div className="mb-2 text-sm">Give the model feedback (Enter to submit):</div>
          <div className="flex gap-2">
            <input
              ref={feedbackInputRef}
              type="text"
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFeedbackSubmit()}
              placeholder="Explain why you’re declining or how to fix it…"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
            <button
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              onClick={handleFeedbackSubmit}
            >
              Submit
            </button>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Default: Decline and continue without feedback
          </div>
          <button
            className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setApprovalMode('select')}
          >
            &larr; Back to options
          </button>
        </div>
      )}

      {/* Selection Mode - main approval options */}
      {approvalMode === 'select' && (
        <>
          {/* Primary Actions */}
          <div className="flex gap-2">
            <button
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
              onClick={() => onApprove('accept')}
              title="Keyboard: Y"
            >
              Yes (y)
            </button>
            <button
              className="flex-1 rounded-lg bg-secondary px-4 py-2.5 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80 transition-colors"
              onClick={() => onApprove('acceptForSession')}
              title="Keyboard: A"
            >
              Always (a)
            </button>
            <button
              className="rounded-lg border border-border bg-background px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
              onClick={() => onApprove('decline')}
              title="Keyboard: N"
            >
              No (n)
            </button>
          </div>

          {/* Secondary Actions */}
          <div className="mt-2 flex gap-2">
            <button
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-[11px] font-medium text-muted-foreground hover:bg-secondary transition-colors"
              onClick={() => {
                setApprovalMode('explain')
                void onExplain()
              }}
              title="Keyboard: X"
            >
              Explain (x)
            </button>
            <button
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-[11px] font-medium text-muted-foreground hover:bg-secondary transition-colors"
              onClick={() => {
                setApprovalMode('feedback')
                setTimeout(() => feedbackInputRef.current?.focus(), 100)
              }}
              title="Keyboard: E"
            >
              Edit/Feedback (e)
            </button>
          </div>

          {/* Advanced Options Toggle */}
          {proposedExecpolicyAmendment && (
            <button
              className="mt-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? '\u25BC Hide options' : '\u25B6 More options'}
            </button>
          )}

          {/* Advanced Actions */}
          {showAdvanced && proposedExecpolicyAmendment && (
            <div className="mt-2 flex gap-2 animate-in slide-in-from-top-2 duration-100">
              <button
                className="flex-1 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-3 py-2 text-[11px] font-medium text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                onClick={() => onApprove('acceptWithExecpolicyAmendment')}
              >
                Always Allow (Persistent)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
})

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

/**
 * CommandExecutionCard Component
 *
 * Memoized to prevent re-renders when parent components update but this
 * specific message item hasn't changed.
 */
export const CommandExecutionCard = memo(
  function CommandExecutionCard({ item }: MessageItemProps) {
    // Use selector to avoid infinite re-render loops
    const { activeThread, respondToApproval, sendMessage } = useThreadStore(
      useShallow((state: ThreadState) => ({
        activeThread: selectFocusedThread(state)?.thread ?? null,
        respondToApproval: state.respondToApproval,
        sendMessage: state.sendMessage,
      }))
    )

    const [showFullOutput, setShowFullOutput] = useState(false)
    const [explanation, setExplanation] = useState('')
    const [isExplaining, setIsExplaining] = useState(false)
    const isApprovingRef = useRef(false)
    const isExplainingRef = useRef(false)
    const outputRef = useRef<HTMLPreElement>(null)

    // Early return validation
    const content = isCommandExecutionContent(item.content) ? item.content : null

    // Auto-scroll output when streaming
    useEffect(() => {
      if (content && content.isRunning && outputRef.current) {
        outputRef.current.scrollTop = outputRef.current.scrollHeight
      }
    }, [content, showFullOutput])

    // Early return after all hooks
    if (!content) {
      log.warn(`Invalid command execution content for item ${item.id}`, 'CommandExecutionCard')
      return null
    }

    // Format command for display
    const commandDisplay = Array.isArray(content.command)
      ? content.command.join(' ')
      : content.command

    // Get output content
    const rawOutput = content.output || content.stdout || ''
    const {
      text: outputContent,
      truncated: isOutputTruncated,
      omittedLines,
    } = showFullOutput
      ? { text: rawOutput, truncated: false, omittedLines: 0 }
      : truncateOutput(rawOutput)

    // Determine card status
    const getCardStatus = (): CardStatus | undefined => {
      if (content.needsApproval) return 'pending'
      if (content.isRunning) return 'running'
      if (content.exitCode !== undefined) {
        return content.exitCode === 0 ? 'completed' : 'failed'
      }
      return undefined
    }

    // Determine status text
    const getStatusText = (): string | undefined => {
      if (content.isRunning) return 'Running...'
      return undefined
    }

    // Handle approval
    const handleApprove = async (
      decision: 'accept' | 'acceptForSession' | 'acceptWithExecpolicyAmendment' | 'decline'
    ) => {
      if (isApprovingRef.current || !activeThread) return
      isApprovingRef.current = true
      try {
        await respondToApproval(item.id, decision, {
          execpolicyAmendment: content.proposedExecpolicyAmendment,
        })
      } finally {
        isApprovingRef.current = false
      }
    }

    // Handle explain request
    const handleExplain = async () => {
      if (isExplainingRef.current) return
      isExplainingRef.current = true

      const currentThread = useThreadStore.getState().activeThread
      if (!currentThread || !activeThread || currentThread.id !== activeThread.id) {
        log.error('Thread changed before explain, aborting', 'CommandExecutionCard')
        isExplainingRef.current = false
        return
      }

      setIsExplaining(true)
      try {
        const cmd = commandDisplay
        await sendMessage(
          `Please explain what this command does step by step, including any potential risks:\n\`\`\`\n${cmd}\n\`\`\``
        )
        setExplanation('Explanation sent to AI. Check the response above.')
      } catch {
        setExplanation('Unable to generate explanation.')
      } finally {
        isExplainingRef.current = false
        setIsExplaining(false)
      }
    }

    // Build header actions (exit code badge + duration)
    const headerActions: ReactNode = (
      <>
        {content.exitCode !== undefined && (
          <StatusBadge
            status={content.exitCode === 0 ? 'completed' : 'failed'}
            text={`Exit: ${content.exitCode}`}
          />
        )}
        {content.durationMs !== undefined && (
          <span className="text-[10px] text-muted-foreground">
            {formatDuration(content.durationMs)}
          </span>
        )}
      </>
    )

    return (
      <BaseCard
        icon={<Terminal size={14} />}
        title="Command"
        subtitle={commandDisplay}
        timestamp={item.createdAt}
        status={getCardStatus()}
        statusText={getStatusText()}
        headerActions={headerActions}
        expandable
        defaultExpanded
        iconAnimated={content.isRunning}
        iconActiveBgClass="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
      >
        {/* Working directory */}
        <div className="text-[11px] text-muted-foreground font-mono mb-3">
          <span className="text-muted-foreground/70">cwd:</span> {content.cwd}
        </div>

        {/* Command Actions Tags */}
        {content.commandActions && content.commandActions.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {content.commandActions.map((action: string, i: number) => (
              <span
                key={i}
                className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border/50"
              >
                {action}
              </span>
            ))}
          </div>
        )}

        {/* Output */}
        {(rawOutput || content.isRunning) && (
          <CardSection
            title="Output"
            className="mb-0"
          >
            {content.isRunning && (
              <span className="ml-2 text-[9px] normal-case text-blue-500 animate-pulse inline-block mb-1">
                streaming...
              </span>
            )}
            <CardOutput
              error={content.exitCode !== undefined && content.exitCode !== 0}
              className={cn(content.isRunning && 'min-h-[2rem]')}
            >
              <pre ref={outputRef} className="m-0 p-0 bg-transparent">
                {outputContent ? (
                  <ColorizedOutput text={outputContent} />
                ) : content.isRunning ? (
                  '...'
                ) : (
                  ''
                )}
              </pre>
            </CardOutput>

            {/* Truncation indicator */}
            {isOutputTruncated && !content.isRunning && (
              <button
                className="mt-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                onClick={() => setShowFullOutput(true)}
              >
                <span className="text-yellow-600 dark:text-yellow-400">...</span>+{omittedLines}{' '}
                lines hidden
                <span className="text-blue-500 hover:underline">Show all</span>
              </button>
            )}
            {showFullOutput && rawOutput.split('\n').length > MAX_OUTPUT_LINES && (
              <button
                className="mt-1 text-[10px] text-blue-500 hover:underline"
                onClick={() => setShowFullOutput(false)}
              >
                Collapse output
              </button>
            )}
          </CardSection>
        )}

        {/* Stderr if different from output */}
        {content.stderr && content.stderr !== content.output && (
          <CardSection title="Stderr" titleColor="text-red-600 dark:text-red-400" className="mt-3">
            <CardOutput error maxHeight="max-h-40">
              {content.stderr}
            </CardOutput>
          </CardSection>
        )}

        {/* Reason */}
        {content.reason && (
          <div className="mt-3 text-xs text-muted-foreground">Reason: {content.reason}</div>
        )}

        {/* Approval UI */}
        {content.needsApproval && (
          <ApprovalUI
            proposedExecpolicyAmendment={content.proposedExecpolicyAmendment}
            onApprove={handleApprove}
            onExplain={handleExplain}
            isExplaining={isExplaining}
            explanation={explanation}
          />
        )}
      </BaseCard>
    )
  },
  // Custom comparison function for React.memo
  (prev, next) => {
    if (prev.item.id !== next.item.id) return false
    if (prev.item.status !== next.item.status) return false
    return shallowContentEqual(prev.item.content, next.item.content)
  }
)
