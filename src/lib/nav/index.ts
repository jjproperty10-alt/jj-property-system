/**
 * @module nav
 * @description NAV-1 — Navigation library barrel exports.
 *
 * Types, workspace registry, and server-side user resolution.
 *
 * Note: resolveFrameUser is server-only and must be imported directly
 * from '@/lib/nav/resolveFrameUser' in server components. It is NOT
 * re-exported here to avoid 'server-only' contaminating client bundles.
 */

// Types
export type {
  FrameUser,
  WorkspaceRegistration,
  EntityContext,
  AttentionItem,
  WorkspaceAttention,
  GlobalContextShape,
} from './types'

// Registry
export { getRegisteredWorkspaces, getAllWorkspaces } from './workspaceRegistry'
