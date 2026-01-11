import { useState, useCallback } from 'react'
import { log } from '../../../lib/logger'
import { useProjectsStore } from '../../../stores/projects'
import { useSessionsStore } from '../../../stores/sessions'
import { useToast } from '../../ui/Toast'

interface RenameTarget {
  id: string
  name: string
}

interface DeleteProjectConfirm {
  isOpen: boolean
  projectId: string | null
  projectName: string
}

interface DeleteSessionConfirm {
  isOpen: boolean
  sessionId: string | null
  sessionName: string
}

/**
 * useSidebarDialogs - Custom hook for managing all sidebar dialog states and actions
 *
 * Extracts dialog state management from Sidebar component to reduce complexity.
 * Handles: project rename, session rename, project settings, delete confirmations
 */
export function useSidebarDialogs() {
  const { updateProject, removeProject } = useProjectsStore()
  const { updateSession, deleteSession } = useSessionsStore()
  const { showToast } = useToast()

  // Project rename dialog
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [projectToRename, setProjectToRename] = useState<RenameTarget | null>(null)

  // Session rename dialog
  const [sessionRenameDialogOpen, setSessionRenameDialogOpen] = useState(false)
  const [sessionToRename, setSessionToRename] = useState<RenameTarget | null>(null)

  // Project settings dialog
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false)
  const [projectSettingsId, setProjectSettingsId] = useState<string | null>(null)

  // Delete confirmations
  const [deleteProjectConfirm, setDeleteProjectConfirm] = useState<DeleteProjectConfirm>({
    isOpen: false,
    projectId: null,
    projectName: '',
  })
  const [deleteSessionConfirm, setDeleteSessionConfirm] = useState<DeleteSessionConfirm>({
    isOpen: false,
    sessionId: null,
    sessionName: '',
  })

  // --- Project rename handlers ---
  const handleRenameProject = useCallback((id: string, currentName: string) => {
    setProjectToRename({ id, name: currentName })
    setRenameDialogOpen(true)
  }, [])

  const handleConfirmRename = useCallback(
    async (newName: string) => {
      if (projectToRename) {
        try {
          await updateProject(projectToRename.id, newName)
          showToast('Project renamed successfully', 'success')
        } catch (error) {
          log.error(`Failed to rename project: ${error}`, 'Sidebar')
          showToast('Failed to rename project', 'error')
        }
      }
      setRenameDialogOpen(false)
      setProjectToRename(null)
    },
    [projectToRename, updateProject, showToast]
  )

  const cancelRenameProject = useCallback(() => {
    setRenameDialogOpen(false)
    setProjectToRename(null)
  }, [])

  // --- Session rename handlers ---
  const handleRenameSession = useCallback((id: string, currentName: string) => {
    setSessionToRename({ id, name: currentName })
    setSessionRenameDialogOpen(true)
  }, [])

  const handleConfirmSessionRename = useCallback(
    async (newName: string) => {
      if (sessionToRename) {
        try {
          await updateSession(sessionToRename.id, { title: newName })
          showToast('Session renamed', 'success')
        } catch (error) {
          log.error(`Failed to rename session: ${error}`, 'Sidebar')
          showToast('Failed to rename session', 'error')
        }
      }
      setSessionRenameDialogOpen(false)
      setSessionToRename(null)
    },
    [sessionToRename, updateSession, showToast]
  )

  const cancelRenameSession = useCallback(() => {
    setSessionRenameDialogOpen(false)
    setSessionToRename(null)
  }, [])

  // --- Project settings handlers ---
  const handleOpenProjectSettings = useCallback((id: string) => {
    setProjectSettingsId(id)
    setProjectSettingsOpen(true)
  }, [])

  const closeProjectSettings = useCallback(() => {
    setProjectSettingsOpen(false)
    setProjectSettingsId(null)
  }, [])

  // --- Delete project handlers ---
  const handleDeleteProject = useCallback((id: string, name: string) => {
    setDeleteProjectConfirm({ isOpen: true, projectId: id, projectName: name })
  }, [])

  const confirmDeleteProject = useCallback(async () => {
    if (!deleteProjectConfirm.projectId) return
    try {
      await removeProject(deleteProjectConfirm.projectId)
      showToast('Project removed', 'success')
    } catch (error) {
      log.error(`Failed to remove project: ${error}`, 'Sidebar')
      showToast('Failed to remove project', 'error')
    } finally {
      setDeleteProjectConfirm({ isOpen: false, projectId: null, projectName: '' })
    }
  }, [deleteProjectConfirm.projectId, removeProject, showToast])

  const cancelDeleteProject = useCallback(() => {
    setDeleteProjectConfirm({ isOpen: false, projectId: null, projectName: '' })
  }, [])

  // --- Delete session handlers ---
  const handleDeleteSession = useCallback((sessionId: string, sessionName: string) => {
    setDeleteSessionConfirm({ isOpen: true, sessionId, sessionName })
  }, [])

  const confirmDeleteSession = useCallback(async () => {
    if (!deleteSessionConfirm.sessionId) return
    try {
      await deleteSession(deleteSessionConfirm.sessionId)
      showToast('Session deleted', 'success')
    } catch {
      showToast('Failed to delete session', 'error')
    } finally {
      setDeleteSessionConfirm({ isOpen: false, sessionId: null, sessionName: '' })
    }
  }, [deleteSessionConfirm.sessionId, deleteSession, showToast])

  const cancelDeleteSession = useCallback(() => {
    setDeleteSessionConfirm({ isOpen: false, sessionId: null, sessionName: '' })
  }, [])

  return {
    // Project rename
    renameDialogOpen,
    projectToRename,
    handleRenameProject,
    handleConfirmRename,
    cancelRenameProject,

    // Session rename
    sessionRenameDialogOpen,
    sessionToRename,
    handleRenameSession,
    handleConfirmSessionRename,
    cancelRenameSession,

    // Project settings
    projectSettingsOpen,
    projectSettingsId,
    handleOpenProjectSettings,
    closeProjectSettings,

    // Delete project
    deleteProjectConfirm,
    handleDeleteProject,
    confirmDeleteProject,
    cancelDeleteProject,

    // Delete session
    deleteSessionConfirm,
    handleDeleteSession,
    confirmDeleteSession,
    cancelDeleteSession,
  }
}
