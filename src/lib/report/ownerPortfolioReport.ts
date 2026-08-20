/**
 * JJ Property 10 — Owner Portfolio Report Composition (G1 backbone)
 *
 * Data layer for the Full Owner Report across one OR many properties. Built on
 * the canonical G6 owner/client composition (getOwnerClientReport), so the
 * portfolio Overall Net is exactly the sum of per-property owner-facing nets —
 * reconciling with the Owner Workspace Owner Summary by construction.
 *
 * SCOPE: composition/data only. No accounting field is modified; nets are summed
 * via the existing computeNetOwnerBalance through getOwnerClientReport. Purchase
 * is excluded per the canonical rule (never in any owner-facing net). This module
 * intentionally contains NO react-pdf / presentation code — the PDF/Print layer
 * consumes this structure so no presentation component recomputes accounting.
 */
import type { RC3PropertyReport } from './types'
import { getOwnerClientReport, type OwnerClientReportView } from './ownerClientReport'

export interface OwnerPortfolioReport {
  /** Per-property owner-facing views, in the order supplied. */
  properties: OwnerClientReportView[]
  /** Canonical portfolio Overall Net = Σ per-property owner-facing net. */
  overallNet: number
  /** Convenience: number of properties with any owner-facing account data. */
  propertyCount: number
}

/**
 * Compose the Full Owner Report data for an owner across the supplied property
 * reports. Single-property owners pass a one-element array and get identical
 * per-property numbers to the current single-property path.
 */
export function getOwnerPortfolioReport(reports: RC3PropertyReport[]): OwnerPortfolioReport {
  const properties = reports.map(getOwnerClientReport)
  const overallNet = properties.reduce((sum, p) => sum + p.overallNet, 0)
  return {
    properties,
    overallNet,
    propertyCount: properties.filter(p => p.ownerFacingAccounts.length > 0).length,
  }
}
