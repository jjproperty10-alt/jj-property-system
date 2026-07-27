/**
 * @module nav/AttentionLayer
 * @description NAV-1 — Attention coordination layer.
 *
 * Stability: STABLE
 *
 * Fetches, aggregates, and surfaces attention counts from workspace providers.
 * NOT a visual component — it is a data coordination layer (AL-F1).
 *
 * Guarantees:
 *   G1: Initial fetch of all providers completes before frameReady.
 *   G2: Provider failure returns null — never throws.
 *   G3: null count = unknown → Frame renders no badge.
 *   G4: 0 count = all clear → Frame renders no badge (EX-2).
 *   G5: > 0 count → badge shows count.
 *   G6: Each provider called independently — one failure doesn't block others.
 *   G7: refreshAttention(id) re-fetches only the specified provider.
 *
 * Forbidden:
 *   AL-F1: No UI rendering.
 *   AL-F2: No cross-session caching.
 *   AL-F3: No cross-workspace count combining.
 *   AL-F4: No attention severity determination.
 *
 * @see NAV-1_PHASE3_COMPONENT_CONTRACTS.md — AttentionLayer contract
 */

import type { WorkspaceRegistration } from '@/lib/nav/types'

/** Default timeout for a single provider fetch (ms). */
const PROVIDER_TIMEOUT_MS = 5_000

/**
 * Fetch attention counts from all registered workspace providers.
 * Each provider is called independently (G6).
 * Provider failure or timeout → null (G2).
 *
 * Returns a Map of workspaceId → count (number | null).
 */
export async function fetchAllAttentionCounts(
  workspaces: readonly WorkspaceRegistration[],
  timeoutMs: number = PROVIDER_TIMEOUT_MS
): Promise<Map<string, number | null>> {
  const entries = await Promise.all(
    workspaces.map(async (ws) => {
      const count = await fetchProviderSafe(ws.attentionProvider, timeoutMs)
      return [ws.id, count] as const
    })
  )
  return new Map(entries)
}

/**
 * Fetch attention count from a single provider.
 * Returns null on error or timeout (G2).
 */
export async function fetchSingleAttentionCount(
  provider: () => Promise<number | null>,
  timeoutMs: number = PROVIDER_TIMEOUT_MS
): Promise<number | null> {
  return fetchProviderSafe(provider, timeoutMs)
}

// ─── Internal ───────────────────────────────────────────────────────────

async function fetchProviderSafe(
  provider: () => Promise<number | null>,
  timeoutMs: number
): Promise<number | null> {
  try {
    const result = await Promise.race([
      provider(),
      timeout(timeoutMs),
    ])
    return result
  } catch {
    return null // G2: failure → null
  }
}

function timeout(ms: number): Promise<null> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), ms)
  })
}
