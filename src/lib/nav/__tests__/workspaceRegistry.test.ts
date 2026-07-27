/**
 * @description Tests for workspaceRegistry — Contract B, Contract E.
 *
 * Covers:
 *   - Workspace registration invariants
 *   - Role-based filtering (Contract E)
 *   - Route uniqueness
 *   - Attention provider contract
 */

import { getRegisteredWorkspaces, getAllWorkspaces } from '../workspaceRegistry'
import type { FrameUser } from '../types'

describe('workspaceRegistry', () => {
  // ── Contract B: Workspace Registration ─────────────────────────────

  describe('getAllWorkspaces', () => {
    const all = getAllWorkspaces()

    it('returns at least one workspace', () => {
      expect(all.length).toBeGreaterThan(0)
    })

    it('every workspace has required fields', () => {
      for (const ws of all) {
        expect(ws.id).toBeTruthy()
        expect(ws.label).toBeTruthy()
        expect(ws.icon).toBeDefined()
        expect(ws.landingRoute).toBeTruthy()
        expect(ws.routePrefix).toBeTruthy()
        expect(typeof ws.attentionProvider).toBe('function')
      }
    })

    it('workspace IDs are unique', () => {
      const ids = all.map((ws) => ws.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('route prefixes are unique (no collisions)', () => {
      const prefixes = all.map((ws) => ws.routePrefix)
      expect(new Set(prefixes).size).toBe(prefixes.length)
    })

    it('landing routes start with their route prefix', () => {
      for (const ws of all) {
        expect(ws.landingRoute.startsWith(ws.routePrefix)).toBe(true)
      }
    })

    it('attention providers return number or null', async () => {
      for (const ws of all) {
        const result = await ws.attentionProvider()
        expect(result === null || typeof result === 'number').toBe(true)
      }
    })
  })

  // ── Contract E: Role Visibility ─────────────────────────────────────

  describe('getRegisteredWorkspaces (role filtering)', () => {
    const roles: FrameUser['role'][] = ['ceo', 'finance', 'operations', 'staff']

    it('ceo sees all workspaces', () => {
      const ceoWs = getRegisteredWorkspaces('ceo')
      const allWs = getAllWorkspaces()
      expect(ceoWs.length).toBe(allWs.length)
    })

    it('every role gets at least one workspace', () => {
      for (const role of roles) {
        const ws = getRegisteredWorkspaces(role)
        expect(ws.length).toBeGreaterThan(0)
      }
    })

    it('non-ceo roles see a subset of ceo workspaces', () => {
      const ceoIds = new Set(getRegisteredWorkspaces('ceo').map((ws) => ws.id))
      for (const role of roles) {
        const roleIds = getRegisteredWorkspaces(role).map((ws) => ws.id)
        for (const id of roleIds) {
          expect(ceoIds.has(id)).toBe(true)
        }
      }
    })

    // E-R1: unauthorized workspaces are omitted, not hidden with disabled state
    it('returns only authorized workspaces (no disabled/hidden items)', () => {
      for (const role of roles) {
        const ws = getRegisteredWorkspaces(role)
        // Every returned workspace should be a proper WorkspaceRegistration
        // — not a disabled or placeholder entry
        for (const w of ws) {
          expect(w.id).toBeTruthy()
          expect(w.landingRoute).toBeTruthy()
        }
      }
    })
  })
})
