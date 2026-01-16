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
import { useMultiAgentStore } from '../../../stores/multi-agent-v2'
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
        // 退出多智能体模式时，关闭所有代理线程并重置状态
        // v2: 不再使用单个编排器线程，而是管理多个代理线程
        const multiAgentState = useMultiAgentStore.getState()
        
        // 取消所有运行中的工作流
        if (multiAgentState.workflow) {
          try {
            await multiAgentState.cancelWorkflow()
          } catch (error) {
            log.error(
              `Failed to cancel workflow: ${error instanceof Error ? error.message : String(error)}`,
              'StatusBarActions'
            )
          }
        }
        
        // 重置多智能体状态（会关闭所有代理线程）
        multiAgentState.reset()
      }

      // P1 Fix: Use captured target mode to ensure consistency
      setAppMode(targetMode)
    } finally {
      // P1 Fix: Always reset transition state
      transitionRef.current = false
      setIsTransitioning(false)
    }
  }, [appMode, setAppMode])

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
