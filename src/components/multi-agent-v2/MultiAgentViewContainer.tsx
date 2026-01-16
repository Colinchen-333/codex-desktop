/**
 * MultiAgentViewContainer - Container managing setup and main view
 *
 * Handles the transition between setup view and main multi-agent view
 */

import { SetupView } from './SetupView'
import { MultiAgentView } from './MultiAgentView'
import { useMultiAgentStore } from '../../stores/multi-agent-v2'

export function MultiAgentViewContainer() {
  const workingDirectory = useMultiAgentStore((state) => state.workingDirectory)
  
  // Check if setup is complete (has working directory)
  const isSetupComplete = !!workingDirectory

  // Show setup view if not configured
  if (!isSetupComplete) {
    return <SetupView onComplete={() => {}} />
  }

  // Show main multi-agent view
  return <MultiAgentView />
}
