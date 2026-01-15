/**
 * MultiAgentView - Main container for multi-agent mode
 *
 * Displays either the setup view (directory selection) or the orchestrator view
 * based on the current phase.
 */

import { useMultiAgentStore } from '../../stores/multi-agent'
import { SetupView } from './SetupView'
import { OrchestratorView } from './OrchestratorView'

export function MultiAgentView() {
  const phase = useMultiAgentStore((state) => state.phase)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {phase === 'setup' ? <SetupView /> : <OrchestratorView />}
    </div>
  )
}
