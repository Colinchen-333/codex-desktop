import { create } from 'zustand'

type SidebarTab = 'projects' | 'sessions'

interface AppState {
  // Dialog states
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void

  // Sidebar state
  sidebarTab: SidebarTab
  setSidebarTab: (tab: SidebarTab) => void

  // Input focus
  shouldFocusInput: boolean
  triggerFocusInput: () => void
  clearFocusInput: () => void
}

export const useAppStore = create<AppState>((set) => ({
  // Dialog states
  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  // Sidebar state
  sidebarTab: 'projects',
  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  // Input focus
  shouldFocusInput: false,
  triggerFocusInput: () => set({ shouldFocusInput: true }),
  clearFocusInput: () => set({ shouldFocusInput: false }),
}))
