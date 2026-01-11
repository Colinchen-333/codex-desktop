/**
 * Sidebar sub-components barrel export
 *
 * This module exports all sidebar-related components for use in the main Sidebar.tsx
 * Each component is designed to be independently memoized and testable.
 */

export { SidebarTabs, type SidebarTabType } from './SidebarTabs'
export { SessionSearch } from './SessionSearch'
export { ProjectList, type Project, type ProjectListProps } from './ProjectList'
export { SessionList, type Session, type SessionListProps } from './SessionList'
export { SidebarDialogs, type SidebarDialogsProps } from './SidebarDialogs'
export { useSidebarDialogs } from './useSidebarDialogs'
