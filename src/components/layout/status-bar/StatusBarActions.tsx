/**
 * StatusBarActions - Action buttons component
 *
 * Displays help, about, settings, and other action buttons.
 * Memoized to prevent unnecessary re-renders.
 */
import { memo, useCallback, useState, useRef } from 'react'
import { HelpCircle, Info, Settings, Camera, Bot, ArrowLeft, Loader2 } from 'lucide-react'
import { useThreadStore } from '../../../stores/thread'
import { selectActiveThread } from '../../../stores/thread/selectors'
import { useAppStore } from '../../../stores/app'
import { useMultiAgentStore } from '../../../stores/multi-agent'
import { preloadSettingsDialog } from '../../../lib/lazyPreload'
import { log } from '../../../lib/logger'

export interface StatusBarActionsProps {
  onHelpClick: () => void
  onAboutClick: () => void
  onSettingsClick: () => void
  onSnapshotsClick: () => void
  onMultiAgentToggle?: () => void
}

export const StatusBarActions = memo(function StatusBarActions({
  onHelpClick,
  onAboutClick,
  onSettingsClick,
  onSnapshotsClick,
}: StatusBarActionsProps) {
  const activeThread = useThreadStore(selectActiveThread)
  const closeThread = useThreadStore((state) => state.closeThread)
  const appMode = useAppStore((state) => state.appMode)
  const setAppMode = useAppStore((state) => state.setAppMode)

  // P1 Fix: Add transition state to prevent rapid clicking issues
  const [isTransitioning, setIsTransitioning] = useState(false)
  const transitionRef = useRef(false)

  const handleMultiAgentToggle = useCallback(async () => {
    // P1 Fix: Use ref for synchronous check to prevent race conditions
    if (transitionRef.current) {
      log.debug('[handleMultiAgentToggle] Transition already in progress, ignoring click', 'StatusBarActions')
      return
    }
    transitionRef.current = true
    setIsTransitioning(true)

    // P1 Fix: Capture target mode before any async operations
    const targetMode = appMode === 'normal' ? 'multi-agent' : 'normal'

    try {
      if (appMode === 'multi-agent') {
        // 退出多智能体模式时，先关闭编排器线程再重置状态
        // 这样可以避免快速切换时线程和 orchestratorThreadId 不同步
        const orchestratorThreadId = useMultiAgentStore.getState().orchestratorThreadId
        if (orchestratorThreadId) {
          try {
            closeThread(orchestratorThreadId)
          } catch (error) {
            // 记录错误但不阻塞后续操作，确保 UI 响应和状态一致性
            log.error(
              `Failed to close orchestrator thread ${orchestratorThreadId}: ${error instanceof Error ? error.message : String(error)}`,
              'StatusBarActions'
            )
          }
        }
        // P1 Fix: Always reset multi-agent state when exiting multi-agent mode
        // This is now outside the try block to ensure it always runs
        useMultiAgentStore.getState().reset()
      }

      // P1 Fix: Use captured target mode to ensure consistency
      setAppMode(targetMode)
    } finally {
      // P1 Fix: Always reset transition state
      transitionRef.current = false
      setIsTransitioning(false)
    }
  }, [appMode, setAppMode, closeThread])

  return (
    <div className="flex items-center gap-1">
      {/* Multi-Agent Mode Toggle */}
      <button
        className="hover:bg-primary/10 h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={handleMultiAgentToggle}
        disabled={isTransitioning}
        title={isTransitioning ? 'Switching...' : appMode === 'normal' ? 'Multi-Agent Mode' : 'Exit Multi-Agent Mode'}
      >
        {isTransitioning ? (
          <Loader2 size={14} className="animate-spin" />
        ) : appMode === 'normal' ? (
          <Bot size={14} />
        ) : (
          <ArrowLeft size={14} />
        )}
      </button>
      {activeThread && appMode === 'normal' && (
        <button
          className="hover:bg-primary/10 h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:text-foreground"
          onClick={onSnapshotsClick}
          title="Snapshots"
        >
          <Camera size={14} />
        </button>
      )}
      <button
        className="hover:bg-primary/10 h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:text-foreground"
        onClick={onHelpClick}
        title="Help"
      >
        <HelpCircle size={14} />
      </button>
      <button
        className="hover:bg-primary/10 h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:text-foreground"
        onClick={onAboutClick}
        title="About"
      >
        <Info size={14} />
      </button>
      <button
        className="hover:bg-primary/10 h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:text-foreground"
        onClick={onSettingsClick}
        onMouseEnter={preloadSettingsDialog}
        title="Settings"
      >
        <Settings size={14} />
      </button>
    </div>
  )
})
