import { memo } from 'react'
import { RenameDialog } from '../../ui/RenameDialog'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { ProjectSettingsDialog } from '../../LazyComponents'

interface RenameTarget {
  id: string
  name: string
}

interface DeleteConfirm {
  isOpen: boolean
  projectId?: string | null
  projectName?: string
  sessionId?: string | null
  sessionName?: string
}

export interface SidebarDialogsProps {
  // Project rename
  renameDialogOpen: boolean
  projectToRename: RenameTarget | null
  onConfirmRename: (newName: string) => void
  onCancelRenameProject: () => void

  // Session rename
  sessionRenameDialogOpen: boolean
  sessionToRename: RenameTarget | null
  onConfirmSessionRename: (newName: string) => void
  onCancelRenameSession: () => void

  // Project settings
  projectSettingsOpen: boolean
  projectSettingsId: string | null
  onCloseProjectSettings: () => void

  // Delete project
  deleteProjectConfirm: DeleteConfirm
  onConfirmDeleteProject: () => void
  onCancelDeleteProject: () => void

  // Delete session
  deleteSessionConfirm: DeleteConfirm
  onConfirmDeleteSession: () => void
  onCancelDeleteSession: () => void
}

/**
 * SidebarDialogs - All dialog components used by Sidebar
 *
 * Extracts dialog rendering to reduce main Sidebar component size.
 * Includes: RenameDialog (project/session), ProjectSettingsDialog, ConfirmDialog (delete)
 */
export const SidebarDialogs = memo(function SidebarDialogs({
  renameDialogOpen,
  projectToRename,
  onConfirmRename,
  onCancelRenameProject,
  sessionRenameDialogOpen,
  sessionToRename,
  onConfirmSessionRename,
  onCancelRenameSession,
  projectSettingsOpen,
  projectSettingsId,
  onCloseProjectSettings,
  deleteProjectConfirm,
  onConfirmDeleteProject,
  onCancelDeleteProject,
  deleteSessionConfirm,
  onConfirmDeleteSession,
  onCancelDeleteSession,
}: SidebarDialogsProps) {
  return (
    <>
      <RenameDialog
        isOpen={renameDialogOpen}
        title="Rename Project"
        currentName={projectToRename?.name || ''}
        onConfirm={onConfirmRename}
        onCancel={onCancelRenameProject}
      />
      <RenameDialog
        isOpen={sessionRenameDialogOpen}
        title="Rename Session"
        currentName={sessionToRename?.name || ''}
        onConfirm={onConfirmSessionRename}
        onCancel={onCancelRenameSession}
      />
      <ProjectSettingsDialog
        isOpen={projectSettingsOpen}
        onClose={onCloseProjectSettings}
        projectId={projectSettingsId}
      />
      <ConfirmDialog
        isOpen={deleteProjectConfirm.isOpen}
        title="Remove Project"
        message={`Are you sure you want to remove "${deleteProjectConfirm.projectName || ''}"? This will only remove the project from your list and will not delete any files.`}
        confirmText="Remove"
        cancelText="Cancel"
        variant="danger"
        onConfirm={onConfirmDeleteProject}
        onCancel={onCancelDeleteProject}
      />
      <ConfirmDialog
        isOpen={deleteSessionConfirm.isOpen}
        title="Delete Session"
        message={`Are you sure you want to delete "${deleteSessionConfirm.sessionName || ''}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={onConfirmDeleteSession}
        onCancel={onCancelDeleteSession}
      />
    </>
  )
})
