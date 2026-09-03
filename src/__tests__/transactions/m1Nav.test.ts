/**
 * M1 nav registry — transactions + validation visible to staff roles.
 */
import { getRegisteredWorkspaces, getAllWorkspaces } from '@/lib/nav/workspaceRegistry'

describe('M1 navigation workspaces', () => {
  it('registers transactions and validation workspaces', () => {
    const ids = getAllWorkspaces().map((w) => w.id)
    expect(ids).toContain('clientReports')
    expect(ids).toContain('transactions')
    expect(ids).toContain('validation')
    expect(ids.indexOf('clientReports')).toBe(ids.indexOf('owners') + 1)
    expect(ids.indexOf('transactions')).toBe(ids.indexOf('finance') + 1)
    expect(ids.indexOf('validation')).toBe(ids.indexOf('transactions') + 1)
    const tx = getAllWorkspaces().find((w) => w.id === 'transactions')!
    const val = getAllWorkspaces().find((w) => w.id === 'validation')!
    expect(tx.landingRoute).toBe('/transactions')
    expect(val.landingRoute).toBe('/validation')
    expect(tx.label).toContain('עסקאות')
    expect(val.label).toContain('בדיקות')
  })

  it('exposes both entries to ceo, finance, operations, and staff', () => {
    for (const role of ['ceo', 'finance', 'operations', 'staff'] as const) {
      const ids = getRegisteredWorkspaces(role).map((w) => w.id)
      expect(ids).toContain('transactions')
      expect(ids).toContain('validation')
    }
  })

  it('does not add Partner Report routes to the registry', () => {
    for (const ws of getAllWorkspaces()) {
      expect(ws.landingRoute).not.toMatch(/^\/partner/)
      expect(ws.routePrefix).not.toMatch(/^\/partner/)
    }
  })
})
