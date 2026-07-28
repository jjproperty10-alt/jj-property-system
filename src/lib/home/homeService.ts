/**
 * @module home/homeService
 * @description Home screen data service — PR #79 Reference Case #2.
 *
 * This is the ONLY file in the Home module that calls the Executive Brief
 * orchestrator. It resolves the brief, then delegates to buildHomeBrief()
 * (a pure function) for all derivation.
 *
 * Data flow:
 *   getAuthorizedExecutiveBrief() → ExecutiveBriefDTO | null
 *       ↓
 *   buildHomeBrief(dto, ownerName, timeOfDay) → HomeBriefDTO
 *
 * @see homeBriefService.ts — pure transform (no service calls)
 * @see executiveBriefService.ts — DAL-protected orchestrator
 */

import { getAuthorizedExecutiveBrief } from '@/lib/executive/executiveBriefService'
import { buildHomeBrief } from './homeBriefService'
import type { HomeBriefDTO } from './homeBriefTypes'
import type { TimeOfDay } from '@/components/ds/DailyGreeting'

// ─── Time of day (server clock) ────────────────────────────────────────────

/**
 * Determine time of day from the server clock.
 * Pure function — no side effects beyond reading the current hour.
 */
export function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours()
  if (hour < 6) return 'night'
  if (hour < 12) return 'morning'
  if (hour < 13) return 'midday'
  if (hour < 17) return 'afternoon'
  if (hour < 21) return 'evening'
  return 'night'
}

// ─── getHomeBrief (public API) ─────────────────────────────────────────────

/**
 * Fetch the complete Home screen state.
 *
 * Steps:
 * 1. Resolve Executive Brief (DAL-protected, server-side)
 * 2. Extract the DTO (or null on failure)
 * 3. Derive HomeBriefDTO via pure transform
 *
 * This function is called from the Home page server component.
 * It never throws — failures produce a HomeBriefDTO with null fields.
 *
 * @param ownerName - Authenticated owner name (from server-side auth)
 * @returns HomeBriefDTO — always valid, never throws
 */
export async function getHomeBrief(ownerName: string): Promise<HomeBriefDTO> {
  const timeOfDay = getTimeOfDay()

  // Step 1: Resolve Executive Brief (DAL-protected)
  const briefResult = await getAuthorizedExecutiveBrief()

  // Step 2: Extract DTO or null
  const briefDTO = briefResult.ok ? briefResult.dto : null

  // Step 3: Pure transform — buildHomeBrief never throws
  return buildHomeBrief(briefDTO, ownerName, timeOfDay)
}
