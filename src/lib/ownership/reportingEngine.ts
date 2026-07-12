/**
 * JJ Property 10 — Ownership Engine: Reporting Layer
 * Phase 2-A — 2026-07-12
 *
 * Channel-neutral output adapter — the final stage before V3 / PDF / API.
 * Pure function — deterministic from the same input.
 *
 * Contract:
 *   Input:  OwnerPortfolioSettlementDTO (fully computed by Portfolio Engine)
 *   Output: ReportingOutput (DTO + metadata)
 *
 * This layer:
 *   - Contains ZERO accounting logic
 *   - Contains ZERO ownership arithmetic
 *   - Is the single source for UI, PDF, and future API consumers
 *   - Can be extended with formatting hints without touching any engine
 *
 * V3 rendering contract:
 *   V3 receives `ReportingOutput.dto` and renders from it.
 *   No calculation, no ownership lookup, no percentage math in V3.
 */

import type {
  OwnerPortfolioSettlementDTO,
  ReportingOutput,
} from './types'

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Build the Reporting Engine output from a finalized portfolio DTO.
 *
 * Pure function — same input always produces same output.
 * Metadata describes the portfolio shape for conditional UI rendering.
 *
 * @param dto - Fully computed portfolio DTO from Portfolio Engine
 */
export function buildReportingOutput(
  dto: OwnerPortfolioSettlementDTO,
): ReportingOutput {
  const partnershipPropertyCount = dto.properties.filter(p => p.hasOwnershipRecords).length
  const clientPropertyCount      = dto.properties.filter(p => !p.hasOwnershipRecords).length

  return {
    dto,
    metadata: {
      propertyCount:              dto.properties.length,
      partnershipPropertyCount,
      clientPropertyCount,
      hasPartnershipProperties:   partnershipPropertyCount > 0,
      hasClientProperties:        clientPropertyCount > 0,
      ownerName:                  dto.selectedOwner.name,
    },
  }
}
