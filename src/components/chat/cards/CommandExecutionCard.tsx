/**
 * CommandExecutionCard - Shows shell command execution with approval UI
 *
 * Performance optimization: Wrapped with React.memo and custom comparison function
 * to prevent unnecessary re-renders in message lists. Only re-renders when:
 * - item.id changes (different message)
 * - item.status changes (status update)
 * - item.content changes meaningfully (shallow comparison)
 */
import { memo, useState, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Terminal } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { isCommandExecutionContent } from '../../../lib/typeGuards'
import { useThreadStore, selectFocusedThread, type ThreadState } from '../../../stores/thread'
import { log } from '../../../lib/logger'
import { formatTimestamp, truncateOutput, shallowContentEqual } from '../utils'
import { MAX_OUTPUT_LINES } from '../types'
import { ColorizedOutput } from '../messages/ColorizedOutput'
import type { MessageItemProps } from '../types'

/**
 * CommandExecutionCard Component
 *
 * Memoized to prevent re-renders when parent components update but this
 * specific message item hasn't changed. Custom comparison checks:
 * - item.id: Skip if different message entirely
 * - item.status: Re-render on status changes (pending -> completed, etc.)
 * - item.content: Shallow compare to catch content updates
 */
export const CommandExecutionCard = memo(
  function CommandExecutionCard({ item }: MessageItemProps) {
  // Use selector to avoid infinite re-render loops from getter-based state access
  const { activeThread, respondToApproval, sendMessage } = useThreadStore(
    useShallow((state: ThreadState) => ({
      activeThread: selectFocusedThread(state)?.thread ?? null,
      respondToApproval: state.respondToApproval,
      sendMessage: state.sendMessage,
    }))
  )
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const [showFullOutput, setShowFullOutput] = useState(false)
  const [approvalMode, setApprovalMode] = useState<'select' | 'explain' | 'feedback'>('select')
  const [feedbackText, setFeedbackText] = useState('')
  const [explanation, setExplanation] = useState('')
  const [isExplaining, setIsExplaining] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  // Synchronous lock to prevent double-click race condition (state updates are async)
  const isApprovingRef = useRef(false)
  // P0 Fix: Add synchronous lock for explain to prevent double-click race condition
  const isExplainingRef = useRef(false)
  const outputRef = useRef<HTMLPreElement>(null)
  const feedbackInputRef = useRef<HTMLInputElement>(null)

  // Early return validation - check content type before proceeding
  const content = isCommandExecutionContent(item.content) ? item.content : null

  // Auto-scroll output when streaming - must be before early return
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

  // Get output content (prefer output, fallback to stdout)
  const rawOutput = content.output || content.stdout || ''
  const {
    text: outputContent,
    truncated: isOutputTruncated,
    omittedLines,
  } = showFullOutput
    ? { text: rawOutput, truncated: false, omittedLines: 0 }
    : truncateOutput(rawOutput)

  const handleApprove = async (
    decision: 'accept' | 'acceptForSession' | 'acceptWithExecpolicyAmendment' | 'decline'
  ) => {
    // Prevent double-click race condition using synchronous ref check
    // State updates are async, so we use a ref for immediate synchronous check
    if (isApprovingRef.current || !activeThread) return
    isApprovingRef.current = true
    setIsApproving(true)
    try {
      await respondToApproval(item.id, decision, {
        execpolicyAmendment: content.proposedExecpolicyAmendment,
      })
    } finally {
      isApprovingRef.current = false
      setIsApproving(false)
    }
  }

  // Handle explain request - like CLI's 'x' option
  const handleExplain = async () => {
    // P0 Fix: Prevent double-click race condition using synchronous ref check
    if (isExplainingRef.current) return
    isExplainingRef.current = true

    // CRITICAL: Validate thread hasn't changed since component rendered
    const currentThread = useThreadStore.getState().activeThread
    if (!currentThread || !activeThread || currentThread.id !== activeThread.id) {
      log.error('Thread changed before explain, aborting', 'CommandExecutionCard')
      isExplainingRef.current = false
      return
    }

    setApprovalMode('explain')
    setIsExplaining(true)
    try {
      // Generate explanation by sending a message to the AI
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

  // Handle feedback submission - like CLI's 'e' option
  const handleFeedbackSubmit = async () => {
    // Prevent double submission
    if (isApprovingRef.current) return
    isApprovingRef.current = true

    // CRITICAL: Validate thread hasn't changed since component rendered
    const currentThread = useThreadStore.getState().activeThread
    if (!currentThread || !activeThread || currentThread.id !== activeThread.id) {
      log.error('Thread changed before feedback submit, aborting', 'CommandExecutionCard')
      setFeedbackText('')
      setApprovalMode('select')
      isApprovingRef.current = false
      return
    }

    setIsApproving(true)
    try {
      await respondToApproval(item.id, 'decline')
      if (feedbackText.trim()) {
        await sendMessage(feedbackText.trim())
      }
    } finally {
      isApprovingRef.current = false
      setIsApproving(false)
      setFeedbackText('')
      setApprovalMode('select')
    }
  }

  return (
    <div className="flex justify-start pr-12 animate-in slide-in-from-bottom-2 duration-150">
      <div
        className={cn(
          'w-full max-w-2xl overflow-hidden rounded-xl border bg-card shadow-sm transition-all',
          content.needsApproval
            ? 'border-l-4 border-l-yellow-500 border-y-border/50 border-r-border/50'
            : content.isRunning
              ? 'border-l-4 border-l-blue-500 border-y-border/50 border-r-border/50'
              : 'border-border/50'
        )}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b border-border/40 bg-secondary/30 px-4 py-2.5 cursor-pointer select-none"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'rounded-md p-1 shadow-sm',
                content.isRunning
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'bg-background text-muted-foreground'
              )}
            >
              <Terminal size={14} className={content.isRunning ? 'animate-pulse' : ''} />
            </div>
            <code className="text-xs font-medium text-foreground font-mono truncate max-w-md">
              {commandDisplay}
            </code>
          </div>
          <div className="flex items-center gap-2">
            {content.isRunning && (
              <span className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                Running...
              </span>
            )}
            {content.exitCode !== undefined && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-medium',
                  content.exitCode === 0
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                )}
              >
                Exit: {content.exitCode}
              </span>
            )}
            {content.durationMs !== undefined && (
              <span className="text-[10px] text-muted-foreground">
                {content.durationMs < 1000
                  ? `${content.durationMs}ms`
                  : `${(content.durationMs / 1000).toFixed(1)}s`}
              </span>
            )}
            {/* Timestamp */}
            <span className="text-[10px] text-muted-foreground/60">
              {formatTimestamp(item.createdAt)}
            </span>
            <span className="text-muted-foreground text-xs">{isExpanded ? '▼' : '▶'}</span>
          </div>
        </div>

        {/* Content */}
        {isExpanded && (
          <div className="p-4">
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
              <div>
                <div className="mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  Output
                  {content.isRunning && (
                    <span className="text-[9px] normal-case text-blue-500 animate-pulse">
                      streaming...
                    </span>
                  )}
                </div>
                <pre
                  ref={outputRef}
                  className={cn(
                    'max-h-60 overflow-auto rounded-lg p-3 font-mono text-xs scrollbar-thin scrollbar-thumb-border whitespace-pre-wrap',
                    content.exitCode !== undefined && content.exitCode !== 0
                      ? 'bg-red-50/50 dark:bg-red-900/10 text-red-800 dark:text-red-300'
                      : 'bg-black/[0.03] dark:bg-white/[0.03] text-muted-foreground'
                  )}
                >
                  {outputContent ? (
                    <ColorizedOutput text={outputContent} />
                  ) : content.isRunning ? (
                    '...'
                  ) : (
                    ''
                  )}
                </pre>
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
              </div>
            )}

            {/* Stderr if different from output */}
            {content.stderr && content.stderr !== content.output && (
              <div className="mt-3">
                <div className="mb-1 text-[11px] font-medium text-red-600 dark:text-red-400 uppercase tracking-wider">
                  Stderr
                </div>
                <pre className="max-h-40 overflow-auto rounded-lg bg-red-50/50 dark:bg-red-900/10 p-3 font-mono text-xs text-red-800 dark:text-red-300 scrollbar-thin scrollbar-thumb-border">
                  {content.stderr}
                </pre>
              </div>
            )}

            {content.reason && (
              <div className="mt-3 text-xs text-muted-foreground">Reason: {content.reason}</div>
            )}

            {/* Approval UI */}
            {content.needsApproval && (
              <div className="mt-5 pt-3 border-t border-border/40">
                {/* Explanation Mode - like CLI 'x' option */}
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
                      ← Back to options
                    </button>
                  </div>
                )}

                {/* Feedback Mode - like CLI 'e' option */}
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
                        placeholder="Type a reason..."
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
                      ← Back to options
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
                        onClick={() => handleApprove('accept')}
                        title="Keyboard: Y"
                      >
                        Yes (y)
                      </button>
                      <button
                        className="flex-1 rounded-lg bg-secondary px-4 py-2.5 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80 transition-colors"
                        onClick={() => handleApprove('acceptForSession')}
                        title="Keyboard: A"
                      >
                        Always (a)
                      </button>
                      <button
                        className="rounded-lg border border-border bg-background px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
                        onClick={() => handleApprove('decline')}
                        title="Keyboard: N"
                      >
                        No (n)
                      </button>
                    </div>

                    {/* Secondary Actions - like CLI */}
                    <div className="mt-2 flex gap-2">
                      <button
                        className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-[11px] font-medium text-muted-foreground hover:bg-secondary transition-colors"
                        onClick={handleExplain}
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
                    {content.proposedExecpolicyAmendment && (
                      <button
                        className="mt-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                      >
                        {showAdvanced ? '▼ Hide options' : '▶ More options'}
                      </button>
                    )}

                    {/* Advanced Actions */}
                    {showAdvanced && content.proposedExecpolicyAmendment && (
                      <div className="mt-2 flex gap-2 animate-in slide-in-from-top-2 duration-100">
                        <button
                          className="flex-1 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-3 py-2 text-[11px] font-medium text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                          onClick={() => handleApprove('acceptWithExecpolicyAmendment')}
                        >
                          Always Allow (Persistent)
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
  },
  // Custom comparison function for React.memo
  // Returns true if props are equal (skip re-render), false if different (trigger re-render)
  (prev, next) => {
    // Different message entirely - must re-render
    if (prev.item.id !== next.item.id) return false
    // Status changed (e.g., pending -> completed) - must re-render
    if (prev.item.status !== next.item.status) return false
    // Shallow compare content for meaningful changes
    return shallowContentEqual(prev.item.content, next.item.content)
  }
)
