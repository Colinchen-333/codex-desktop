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

  const [showExitConfirm, setShowExitConfirm] = useState(false)

  const handleMultiAgentToggle = useCallback(async () => {
    if (transitionRef.current) {
      log.debug('[handleMultiAgentToggle] Transition already in progress, ignoring click', 'StatusBarActions')
      return
    }

    if (appMode === 'multi-agent') {
      const multiAgentState = useMultiAgentStore.getState()
      const hasActiveWorkflow = multiAgentState.workflow && multiAgentState.workflow.status === 'running'
      const hasAgents = Object.keys(multiAgentState.agents).length > 0

      if (hasActiveWorkflow || hasAgents) {
        setShowExitConfirm(true)
        return
      }
    }

    await performModeSwitch()
  }, [appMode])

  const performModeSwitch = useCallback(async () => {
    transitionRef.current = true
    setIsTransitioning(true)

    const targetMode = appMode === 'normal' ? 'multi-agent' : 'normal'

    try {
      if (appMode === 'multi-agent') {
        const multiAgentState = useMultiAgentStore.getState()

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

        multiAgentState.reset()
      }

      setAppMode(targetMode)
    } finally {
      transitionRef.current = false
      setIsTransitioning(false)
    }
  }, [appMode, setAppMode])

  const handleConfirmExit = useCallback(async () => {
    setShowExitConfirm(false)
    await performModeSwitch()
  }, [performModeSwitch])

  const handleCancelExit = useCallback(() => {
    setShowExitConfirm(false)
  }, [])

  return (
    <>
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden border border-border">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-base font-semibold text-foreground">退出多智能体模式？</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-muted-foreground">
                当前有活动的工作流或代理。退出将取消所有运行中的任务并清除状态。
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
              <button
                onClick={handleCancelExit}
                className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => void handleConfirmExit()}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                确认退出
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1">
        {/* Multi-Agent Mode Toggle */}
        <button
          className="hover:bg-primary/10 h-7 w-7 flex items-center justify-center rounded-lg transition-colors hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => void handleMultiAgentToggle()}
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
    </>
  )
})
