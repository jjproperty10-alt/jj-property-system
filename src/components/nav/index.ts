/**
 * @module nav (components)
 * @description NAV-1 — Navigation component barrel exports.
 *
 * Only client-safe components are exported here.
 * Server-only modules (resolveFrameUser) live in @/lib/nav
 * and must be imported directly.
 */

export { OperatingFrame } from './OperatingFrame'
export { Sidebar } from './Sidebar'
export {
  GlobalContextProvider,
  useGlobalContext,
  useUpdateEntityContext,
  useUpdateAttention,
  useSetMobileMenu,
} from './GlobalContextProvider'
export { fetchAllAttentionCounts, fetchSingleAttentionCount } from './AttentionLayer'
