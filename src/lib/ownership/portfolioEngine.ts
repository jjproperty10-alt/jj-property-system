/**
 * JJ Property 10 — Ownership Engine: Portfolio Layer
 * Phase 2-A — 2026-07-12
 *
 * Nets multiple settled properties into a single owner portfolio DTO.
 * Pure functions only — no DB calls, no side effects.
 *
 * Contract:
 *   Input:  PropertySettlementDTO[]  (from Settlement Engine, all for the same owner)
 *           OwnerIdentity            (the selected owner)
 *           period                   (report date range)
 *   Output: OwnerPortfolioSettlementDTO
 *
 * Key rules:
 *   1. Only same-owner properties may appear in the settlements list (caller responsibility)
 *   2. No new arithmetic on percentages — already applied in Settlement Engine
 *   3. Project totals per property preserved in each PropertySettlementDTO
 *   4. Credits and debts are separated before netting (for transparent reporting)
 *   5. JJ remains undivided — no Yossi/Jacob sub-split
 *
 * Owner separation guarantee:
 *   Each call to buildPortfolio produces an independent portfolio for ONE owner.
 *   Separate calls for Avi and Oren produce separate DTOs — they are never mixed.
 */

import type {
  OwnerIdentity,
  OwnerPortfolioSettlementDTO,
  PropertySettlementDTO,
  SettlementDirection,
} from './types'

// ─── Helper ───────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function computePortfolioDirection(net: number): SettlementDirection {
  if (Math.abs(net) < 0.005) return 'settled'
  return net > 0 ? 'payable_to_owner' : 'payable_to_jj'
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Build the owner portfolio DTO from pre-settled property DTOs.
 *
 * `totalOwnerCredits` = Σ positive ownerAdjustedBalance values (properties where JJ owes owner)
 * `totalOwnerDebts`   = Σ abs(negative ownerAdjustedBalance values) (properties where owner owes JJ)
 * `finalNetBalance`   = totalOwnerCredits − totalOwnerDebts
 *
 * @param settlements - PropertySettlementDTOs for the selected owner only
 * @param owner       - The selected owner identity
 * @param period      - Report date range
 */
export function buildPortfolio(
  settlements: PropertySettlementDTO[],
  owner: OwnerIdentity,
  period: { from: string | null; to: string | null },
): OwnerPortfolioSettlementDTO {
  let rawCredits = 0
  let rawDebts = 0

  for (const s of settlements) {
    if (s.ownerAdjustedBalance >= 0) {
      rawCredits += s.ownerAdjustedBalance
    } else {
      rawDebts += Math.abs(s.ownerAdjustedBalance)
    }
  }

  const totalOwnerCredits = round2(rawCredits)
  const totalOwnerDebts   = round2(rawDebts)
  const finalNetBalance   = round2(totalOwnerCredits - totalOwnerDebts)

  return {
    selectedOwner:  owner,
    period,
    properties:     settlements,
    totalOwnerCredits,
    totalOwnerDebts,
    finalNetBalance,
    finalDirection: computePortfolioDirection(finalNetBalance),
    generatedAt:    new Date().toISOString(),
  }
}
