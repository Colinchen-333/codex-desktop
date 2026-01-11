import { create } from 'zustand'

type SidebarTab = 'projects' | 'sessions'

export interface AppState {
  // Dialog states
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
  settingsTab: 'general' | 'model' | 'safety' | 'account' | 'allowlist'
  setSettingsTab: (tab: 'general' | 'model' | 'safety' | 'account' | 'allowlist') => void
  snapshotsOpen: boolean
  setSnapshotsOpen: (open: boolean) => void
  aboutOpen: boolean
  setAboutOpen: (open: boolean) => void
  helpOpen: boolean
  setHelpOpen: (open: boolean) => void
  keyboardShortcutsOpen: boolean
  setKeyboardShortcutsOpen: (open: boolean) => void

  // Sidebar state
  sidebarTab: SidebarTab
  setSidebarTab: (tab: SidebarTab) => void

  // Input focus
  shouldFocusInput: boolean
  triggerFocusInput: () => void
  clearFocusInput: () => void

  // Escape pending state (for double-escape interrupt like CLI)
  escapePending: boolean
  setEscapePending: (pending: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  // Dialog states
  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  settingsTab: 'general',
  setSettingsTab: (tab) => set({ settingsTab: tab }),
  snapshotsOpen: false,
  setSnapshotsOpen: (open) => set({ snapshotsOpen: open }),
  aboutOpen: false,
  setAboutOpen: (open) => set({ aboutOpen: open }),
  helpOpen: false,
  setHelpOpen: (open) => set({ helpOpen: open }),
  keyboardShortcutsOpen: false,
  setKeyboardShortcutsOpen: (open) => set({ keyboardShortcutsOpen: open }),

  // Sidebar state
  sidebarTab: 'projects',
  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  // Input focus
  shouldFocusInput: false,
  triggerFocusInput: () => set({ shouldFocusInput: true }),
  clearFocusInput: () => set({ shouldFocusInput: false }),

  // Escape pending state (for double-escape interrupt like CLI)
  escapePending: false,
  setEscapePending: (pending) => set({ escapePending: pending }),
}))
