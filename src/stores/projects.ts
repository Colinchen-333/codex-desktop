import { create } from 'zustand'
import { projectApi, type Project, type GitInfo } from '../lib/api'
import { parseError, logError } from '../lib/errorUtils'

export interface ProjectsState {
  projects: Project[]
  selectedProjectId: string | null
  gitInfo: Record<string, GitInfo>
  isLoading: boolean
  error: string | null

  // Actions
  fetchProjects: () => Promise<void>
  addProject: (path: string) => Promise<Project>
  removeProject: (id: string) => Promise<void>
  updateProject: (id: string, displayName: string) => Promise<void>
  selectProject: (id: string | null) => void
  fetchGitInfo: (projectId: string, path: string) => Promise<void>
}

export const useProjectsStore = create<ProjectsState>((set) => ({
  projects: [],
  selectedProjectId: null,
  gitInfo: {},
  isLoading: false,
  error: null,

  fetchProjects: async () => {
    set({ isLoading: true, error: null })
    try {
      const projects = await projectApi.list()
      set((state) => {
        const selectedProjectId = state.selectedProjectId
        const hasSelected = selectedProjectId
          ? projects.some((project) => project.id === selectedProjectId)
          : false
        return {
          projects,
          selectedProjectId: hasSelected ? selectedProjectId : null,
          isLoading: false,
        }
      })
    } catch (error) {
      set({ error: parseError(error), isLoading: false })
    }
  },

  addProject: async (path: string) => {
    set({ isLoading: true, error: null })
    try {
      const project = await projectApi.add(path)
      set((state) => ({
        projects: [project, ...state.projects],
        isLoading: false,
      }))
      return project
    } catch (error) {
      set({ error: parseError(error), isLoading: false })
      throw error
    }
  },

  removeProject: async (id: string) => {
    // P0 Fix: Set isLoading to prevent duplicate operations
    set({ isLoading: true, error: null })
    try {
      await projectApi.remove(id)
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        selectedProjectId:
          state.selectedProjectId === id ? null : state.selectedProjectId,
        isLoading: false,
      }))
    } catch (error) {
      set({ error: parseError(error), isLoading: false })
      throw error
    }
  },

  updateProject: async (id: string, displayName: string) => {
    // P0 Fix: Set isLoading to prevent duplicate operations
    set({ isLoading: true, error: null })
    try {
      const updated = await projectApi.update(id, displayName)
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? updated : p)),
        isLoading: false,
      }))
    } catch (error) {
      set({ error: parseError(error), isLoading: false })
      throw error
    }
  },

  selectProject: (id: string | null) => {
    set({ selectedProjectId: id })
  },

  fetchGitInfo: async (projectId: string, path: string) => {
    try {
      const info = await projectApi.getGitInfo(path)
      set((state) => ({
        gitInfo: { ...state.gitInfo, [projectId]: info },
      }))
    } catch (error) {
      logError(error, {
        context: 'fetchGitInfo',
        source: 'projects',
        details: 'Failed to fetch git info'
      })
    }
  },
}))
