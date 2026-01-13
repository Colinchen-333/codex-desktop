/**
 * Sidebar - Main coordinator component for project/session navigation
 *
 * Refactored from 802 lines to ~180 lines by extracting sub-components:
 * - SidebarTabs: Tab switcher UI
 * - SessionSearch: Search input with debounce
 * - ProjectList: Project cards with context menu
 * - SessionList: Session cards with sorting and context menu
 * - SidebarDialogs: All dialog components
 * - useSidebarDialogs: Dialog state management hook
 */

import { useEffect, useCallback, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { Download } from 'lucide-react'
import { log } from '../../lib/logger'
import { useProjectsStore } from '../../stores/projects'
import { useSessionsStore } from '../../stores/sessions'
import { useAppStore } from '../../stores/app'
import { useThreadStore } from '../../stores/thread'
import { useSettingsStore, mergeProjectSettings, getEffectiveWorkingDirectory } from '../../stores/settings'
import { useToast } from '../ui/Toast'
import { SidebarTabs, SessionSearch, ProjectList, SessionList, SidebarDialogs, useSidebarDialogs } from './sidebar/index'
import { ImportCodexSessionDialog } from '../LazyComponents'
import type { CodexSessionSummary } from '../../lib/api'

export function Sidebar() {
  const { sidebarTab: activeTab, setSidebarTab: setActiveTab } = useAppStore()
  const { projects, selectedProjectId, addProject, selectProject } = useProjectsStore()
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const {
    sessions,
    selectedSessionId,
    updateSession,
    isLoading: sessionsLoading,
    searchQuery,
    searchResults,
    isSearching,
    selectSession,
    fetchSessions,
  } = useSessionsStore()
  const closeAllThreads = useThreadStore((state) => state.closeAllThreads)
  const startThread = useThreadStore((state) => state.startThread)
  const settings = useSettingsStore((state) => state.settings)
  const { showToast } = useToast()
  const dialogs = useSidebarDialogs()

  useEffect(() => {
    if (selectedProjectId) void fetchSessions(selectedProjectId)
  }, [fetchSessions, selectedProjectId])

  const displaySessions = searchQuery ? searchResults : sessions
  const isGlobalSearch = !!searchQuery

  const handleSelectProject = useCallback((projectId: string | null) => {
    if (!projectId) return
    if (projectId !== selectedProjectId) {
      selectSession(null)
      closeAllThreads()
    }
    selectProject(projectId)
    setActiveTab('sessions')
  }, [closeAllThreads, selectProject, selectSession, selectedProjectId, setActiveTab])

  const handleSelectSession = useCallback((sessionId: string | null, sessionProjectId?: string) => {
    if (sessionProjectId && sessionProjectId !== selectedProjectId) {
      closeAllThreads()
      selectProject(sessionProjectId)
    }
    selectSession(sessionId)
  }, [closeAllThreads, selectProject, selectSession, selectedProjectId])

  const handleAddProject = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: 'Select Project Folder' })
      if (selected && typeof selected === 'string') {
        await addProject(selected)
        showToast('Project added successfully', 'success')
      }
    } catch (error) {
      log.error(`Failed to add project: ${error}`, 'Sidebar')
      showToast('Failed to add project', 'error')
    }
  }

  const handleNewSession = async () => {
    if (!selectedProjectId) { showToast('Please select a project first', 'error'); return }
    const project = projects.find((p) => p.id === selectedProjectId)
    if (!project) return
    const effective = mergeProjectSettings(settings, project.settingsJson)
    const cwd = getEffectiveWorkingDirectory(project.path, project.settingsJson)
    try {
      selectSession(null)
      await startThread(selectedProjectId, cwd, effective.model, effective.sandboxMode, effective.approvalPolicy)
      const newThread = useThreadStore.getState().activeThread
      if (newThread) selectSession(newThread.id)
      await fetchSessions(selectedProjectId)
      setActiveTab('sessions')
      showToast('New session started', 'success')
    } catch (error) {
      log.error(`Failed to start new session: ${error}`, 'Sidebar')
      showToast('Failed to start new session', 'error')
    }
  }

  const handleImportSession = useCallback(async (session: CodexSessionSummary) => {
    // Find or create project for the imported session's cwd
    let projectId = projects.find((p) => p.path === session.cwd)?.id

    if (!projectId) {
      // Auto-add the project if it doesn't exist
      try {
        const newProject = await addProject(session.cwd)
        projectId = newProject.id
        showToast(`Project "${session.projectName}" added`, 'success')
      } catch (error) {
        log.error(`Failed to add project for imported session: ${error}`, 'Sidebar')
        showToast('Failed to add project for imported session', 'error')
        return
      }
    }

    // Select the project and switch to sessions tab
    selectProject(projectId)
    setActiveTab('sessions')

    // Start a new thread that resumes from the imported session
    const project = projects.find((p) => p.id === projectId) ?? { path: session.cwd, settingsJson: null }
    const effective = mergeProjectSettings(settings, project.settingsJson)
    const cwd = getEffectiveWorkingDirectory(project.path, project.settingsJson)

    try {
      // Resume the CLI session by starting a thread with the session ID
      selectSession(null)
      await startThread(projectId, cwd, effective.model, effective.sandboxMode, effective.approvalPolicy)

      // Get the new thread and try to resume the CLI session
      const resumeThread = useThreadStore.getState().resumeThread
      const newThread = useThreadStore.getState().activeThread
      if (newThread) {
        try {
          // Try to resume the imported session
          await resumeThread(session.id)
          selectSession(session.id)
          showToast('Session imported and resumed', 'success')
        } catch {
          // If resume fails, just use the new session
          selectSession(newThread.id)
          showToast('Session imported (started new)', 'info')
        }
      }

      await fetchSessions(projectId)
    } catch (error) {
      log.error(`Failed to import session: ${error}`, 'Sidebar')
      showToast('Failed to import session', 'error')
    }
  }, [projects, addProject, selectProject, setActiveTab, settings, startThread, fetchSessions, selectSession, showToast])

  return (
    <div className="flex h-full w-64 flex-col bg-background p-3">
      <SidebarTabs activeTab={activeTab} onTabChange={setActiveTab} />
      <SessionSearch visible={activeTab === 'sessions'} />
      <div className="flex-1 overflow-y-auto -mx-2 px-2">
        {activeTab === 'projects' ? (
          <ProjectList
            projects={projects}
            selectedId={selectedProjectId}
            onSelect={handleSelectProject}
            onRename={dialogs.handleRenameProject}
            onDelete={dialogs.handleDeleteProject}
            onSettings={dialogs.handleOpenProjectSettings}
          />
        ) : (
          <SessionList
            sessions={displaySessions}
            selectedId={selectedSessionId}
            onSelect={handleSelectSession}
            onToggleFavorite={async (id, fav) => {
              try { await updateSession(id, { isFavorite: !fav }) }
              catch { showToast('Failed to update session', 'error') }
            }}
            onRename={dialogs.handleRenameSession}
            onDelete={dialogs.handleDeleteSession}
            isLoading={sessionsLoading || isSearching}
            hasProject={!!selectedProjectId}
            isGlobalSearch={isGlobalSearch}
          />
        )}
      </div>
      <div className="mt-2 pt-2 space-y-2">
        <div className="flex gap-2">
          <button
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 active:bg-primary/80 disabled:opacity-50 shadow-sm transition-colors"
            onClick={activeTab === 'projects' ? handleAddProject : handleNewSession}
            disabled={activeTab === 'sessions' && !selectedProjectId}
          >
            {activeTab === 'projects' ? 'Add Project' : 'New Session'}
          </button>
          {activeTab === 'sessions' && (
            <button
              className="rounded-lg bg-secondary px-3 py-2.5 text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70 shadow-sm transition-colors"
              onClick={() => setImportDialogOpen(true)}
              title="Import from Codex CLI"
            >
              <Download size={16} />
            </button>
          )}
        </div>
      </div>
      <SidebarDialogs
        renameDialogOpen={dialogs.renameDialogOpen}
        projectToRename={dialogs.projectToRename}
        onConfirmRename={dialogs.handleConfirmRename}
        onCancelRenameProject={dialogs.cancelRenameProject}
        sessionRenameDialogOpen={dialogs.sessionRenameDialogOpen}
        sessionToRename={dialogs.sessionToRename}
        onConfirmSessionRename={dialogs.handleConfirmSessionRename}
        onCancelRenameSession={dialogs.cancelRenameSession}
        projectSettingsOpen={dialogs.projectSettingsOpen}
        projectSettingsId={dialogs.projectSettingsId}
        onCloseProjectSettings={dialogs.closeProjectSettings}
        deleteProjectConfirm={dialogs.deleteProjectConfirm}
        onConfirmDeleteProject={dialogs.confirmDeleteProject}
        onCancelDeleteProject={dialogs.cancelDeleteProject}
        deleteSessionConfirm={dialogs.deleteSessionConfirm}
        onConfirmDeleteSession={dialogs.confirmDeleteSession}
        onCancelDeleteSession={dialogs.cancelDeleteSession}
      />
      <ImportCodexSessionDialog
        isOpen={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImport={handleImportSession}
      />
    </div>
  )
}
