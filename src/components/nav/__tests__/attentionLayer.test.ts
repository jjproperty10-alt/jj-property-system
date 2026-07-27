/**
 * @description Tests for AttentionLayer — pure data coordination.
 *
 * Test Contracts covered:
 *   TC-AL-1: fetchAllAttentionCounts returns Map with all workspace IDs
 *   TC-AL-2: Provider returning number → that number in the Map
 *   TC-AL-3: Provider returning null → null in the Map (P-ARCH-1)
 *   TC-AL-4: Provider throwing → null (G2)
 *   TC-AL-5: Provider timing out → null (G2)
 *   TC-AL-6: One provider failing doesn't block others (G6)
 *   TC-AL-7: fetchSingleAttentionCount works independently
 */

import { fetchAllAttentionCounts, fetchSingleAttentionCount } from '../AttentionLayer'
import type { WorkspaceRegistration } from '@/lib/nav/types'
import { Home } from 'lucide-react'

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeWorkspace(
  id: string,
  provider: () => Promise<number | null>
): WorkspaceRegistration {
  return {
    id,
    label: id,
    icon: Home,
    landingRoute: `/${id}`,
    routePrefix: `/${id}`,
    attentionProvider: provider,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('AttentionLayer', () => {
  describe('fetchAllAttentionCounts', () => {
    // TC-AL-1: returns Map with all workspace IDs
    it('returns a Map with all workspace IDs', async () => {
      const workspaces = [
        makeWorkspace('a', async () => 5),
        makeWorkspace('b', async () => null),
      ]
      const result = await fetchAllAttentionCounts(workspaces)

      expect(result).toBeInstanceOf(Map)
      expect(result.size).toBe(2)
      expect(result.has('a')).toBe(true)
      expect(result.has('b')).toBe(true)
    })

    // TC-AL-2: Provider returning number → number
    it('captures numeric count from provider', async () => {
      const workspaces = [makeWorkspace('ws', async () => 7)]
      const result = await fetchAllAttentionCounts(workspaces)
      expect(result.get('ws')).toBe(7)
    })

    // TC-AL-3: Provider returning null → null (P-ARCH-1)
    it('preserves null from provider (P-ARCH-1)', async () => {
      const workspaces = [makeWorkspace('ws', async () => null)]
      const result = await fetchAllAttentionCounts(workspaces)
      expect(result.get('ws')).toBeNull()
    })

    // TC-AL-4: Provider throwing → null (G2)
    it('returns null when provider throws (G2)', async () => {
      const workspaces = [
        makeWorkspace('failing', async () => {
          throw new Error('provider crash')
        }),
      ]
      const result = await fetchAllAttentionCounts(workspaces)
      expect(result.get('failing')).toBeNull()
    })

    // TC-AL-5: Provider timing out → null (G2)
    it('returns null when provider times out (G2)', async () => {
      const workspaces = [
        makeWorkspace('slow', () =>
          new Promise<number>((resolve) => {
            setTimeout(() => resolve(99), 10_000) // 10s — way past timeout
          })
        ),
      ]
      // Use very short timeout for test
      const result = await fetchAllAttentionCounts(workspaces, 50)
      expect(result.get('slow')).toBeNull()
    })

    // TC-AL-6: One failure doesn't block others (G6)
    it('isolates provider failures — other providers still succeed (G6)', async () => {
      const workspaces = [
        makeWorkspace('good', async () => 3),
        makeWorkspace('bad', async () => {
          throw new Error('boom')
        }),
        makeWorkspace('also-good', async () => 0),
      ]
      const result = await fetchAllAttentionCounts(workspaces)

      expect(result.get('good')).toBe(3)
      expect(result.get('bad')).toBeNull()
      expect(result.get('also-good')).toBe(0)
    })

    // Empty workspaces
    it('returns empty Map for no workspaces', async () => {
      const result = await fetchAllAttentionCounts([])
      expect(result.size).toBe(0)
    })
  })

  describe('fetchSingleAttentionCount', () => {
    // TC-AL-7: works independently
    it('returns count from a single provider', async () => {
      const result = await fetchSingleAttentionCount(async () => 42)
      expect(result).toBe(42)
    })

    it('returns null from a single provider', async () => {
      const result = await fetchSingleAttentionCount(async () => null)
      expect(result).toBeNull()
    })

    it('returns null on provider error', async () => {
      const result = await fetchSingleAttentionCount(async () => {
        throw new Error('fail')
      })
      expect(result).toBeNull()
    })

    it('returns null on provider timeout', async () => {
      const result = await fetchSingleAttentionCount(
        () => new Promise<number>((resolve) => setTimeout(() => resolve(1), 10_000)),
        50
      )
      expect(result).toBeNull()
    })
  })
})
