/**
 * ownerMaintenanceService.test.ts
 *
 * G3-A: Unit tests for the Owner Maintenance service boundary.
 *
 * Tests verify:
 * - Service delegates to adapter
 * - Adapter throws → service returns [] (never throws itself)
 * - Empty properties → returns []
 */

jest.mock('server-only', () => ({}), { virtual: true })

const mockFetchOwnerMaintenance = jest.fn()
jest.mock('@/lib/owners/ownerMaintenanceAdapter', () => ({
  fetchOwnerMaintenance: (...args: unknown[]) => mockFetchOwnerMaintenance(...args),
}))

import { getMaintenanceItems } from '@/lib/owners/ownerMaintenanceService'
import type { OwnerMaintenanceItemDTO } from '@/lib/owners/ownerWorkspaceTypes'

const SAMPLE_ITEM: OwnerMaintenanceItemDTO = {
  id:           'uuid-1',
  propertyName: 'Villa Mazotos',
  date:         '2026-05-01',
  title:        'Roof repair',
  subcategory:  'General Renovation',
  status:       'unknown',
  statusReason: 'rc3_has_no_lifecycle_status',
  amountEur:    '1200',
  source:       'rc3',
}

afterEach(() => jest.clearAllMocks())

describe('getMaintenanceItems', () => {
  it('delegates to fetchOwnerMaintenance and returns its result', async () => {
    mockFetchOwnerMaintenance.mockResolvedValueOnce([SAMPLE_ITEM])

    const result = await getMaintenanceItems({
      properties: ['Villa Mazotos'],
    })

    expect(mockFetchOwnerMaintenance).toHaveBeenCalledWith({
      properties: ['Villa Mazotos'],
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(SAMPLE_ITEM)
  })

  it('returns [] when adapter throws (never re-throws)', async () => {
    mockFetchOwnerMaintenance.mockRejectedValueOnce(new Error('[TEST] adapter failure'))

    // Must not throw
    const result = await getMaintenanceItems({ properties: ['Villa Mazotos'] })
    expect(result).toEqual([])
  })

  it('returns [] when properties is empty (adapter returns [])', async () => {
    mockFetchOwnerMaintenance.mockResolvedValueOnce([])

    const result = await getMaintenanceItems({ properties: [] })
    expect(result).toEqual([])
  })

  it('passes fromDate and toDate through to adapter', async () => {
    mockFetchOwnerMaintenance.mockResolvedValueOnce([])

    await getMaintenanceItems({
      properties: ['Villa Mazotos'],
      fromDate: '2026-01-01',
      toDate:   '2026-06-30',
    })

    expect(mockFetchOwnerMaintenance).toHaveBeenCalledWith({
      properties: ['Villa Mazotos'],
      fromDate: '2026-01-01',
      toDate:   '2026-06-30',
    })
  })
})
