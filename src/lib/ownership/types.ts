/**
 * JJ Property 10 — Ownership Engine Types
 * Phase 2-A — 2026-07-12
 *
 * Defines the complete DTO pipeline for the ownership layer:
 *   Accounting Engine → Ownership Engine → Settlement Engine
 *     → Portfolio Engine → Reporting Engine → V3 UI / PDF / API
 *
 * Architectural contract:
 *   - Financial routing is based on `hasOwnershipRecords` (boolean flag)
 *   - `entityType` is presentation-only — never used for financial routing
 *   - `property_owners` table is never referenced (superseded by partnership_ownership)
 *   - Ownership percentage applied exactly once in Settlement Engine
 *   - V3 renderer receives a finalized DTO and performs zero calculation
 */

import type { RC3AccountSection, RC3AccountType } from '@/lib/report/types'

// ─── Primitive enums ──────────────────────────────────────────────────────────

export type OwnerType = 'external_investor' | 'jj_group' | 'client'

export type EntityType =
  | 'partnership_property'
  | 'jj_property'
  | 'client_property'
  | 'jj_internal'
  | 'person'
  | 'special_case'

export type SettlementDirection = 'payable_to_owner' | 'payable_to_jj' | 'settled'

// ─── Identity ─────────────────────────────────────────────────────────────────

/**
 * Identifies who is receiving the report.
 *
 * `members` is for future joint-group resolution (e.g. JJ = ["Yossi","Jacob"]).
 * JJ currently remains undivided — no members sub-split in Phase 2-A.
 */
export interface OwnerIdentity {
  name: string
  ownerType: OwnerType
  members?: string[]
}

// ─── Ownership record (from Ownership Engine) ─────────────────────────────────

/**
 * One partner row from the partnership_ownership table.
 * Only confirmed, date-effective rows are included.
 */
export interface OwnershipStructureRow {
  partnerName: string
  ownershipPct: number
  effectiveFrom: string    // ISO date e.g. "2020-01-01"
  effectiveTo: string | null
}

/**
 * Result of the Ownership Engine lookup for one property.
 *
 * KEY ROUTING RULE — the `hasOwnershipRecords` boolean is the only flag
 * that controls financial routing:
 *   true  → apply ownershipPct to all figures
 *   false → 100% passthrough (ownershipPct = 100)
 *
 * `entityType` is fetched from entity_registry for presentation labels only.
 * It does NOT control which code path executes.
 *
 * `property_owners` is never read — all ownership data comes from
 * entity_registry + partnership_ownership exclusively.
 */
export interface PropertyOwnershipRecord {
  propertyName: string
  entityId: string
  entityType: EntityType
  /** TRUE if partnership_ownership has ≥1 confirmed, date-effective row for this entity */
  hasOwnershipRecords: boolean
  /** All confirmed, date-effective partner rows (empty array if !hasOwnershipRecords) */
  allPartners: OwnershipStructureRow[]
  /** The selected owner's row, or null if owner not in partnership / no records */
  selectedPartner: OwnershipStructureRow | null
  /** 100 when !hasOwnershipRecords; else selectedPartner.ownershipPct (0 if owner not found) */
  ownershipPct: number
}

// ─── Settlement DTOs ──────────────────────────────────────────────────────────

/**
 * One account section adjusted for the selected owner's ownership percentage.
 * Carries the original 100% project section for V3 "Project View" rendering.
 *
 * Convention:
 *   owner_credit: positive closing_balance = JJ owes owner
 *   client_debt:  positive closing_balance = client owes JJ
 *
 * `owner_closing_balance` follows the same convention as the source account.
 */
export interface OwnerAdjustedAccount {
  account_type: RC3AccountType
  account_label: string
  account_label_he: string
  ownershipPct: number
  owner_income: number
  owner_expenses: number
  owner_bpo: number
  owner_closing_balance: number
  balance_convention: 'owner_credit' | 'client_debt'
  /** The original 100% section — preserved for V3 Project View rendering */
  projectSection: RC3AccountSection
}

/**
 * Complete settlement result for one property.
 * Produced by the Settlement Engine from an RC3PropertyReport + ownership record.
 *
 * `projectBalance100` and `projectAccounts` are the Accounting Engine outputs,
 * untouched. V3 may display them alongside the owner-adjusted figures.
 *
 * `ownerAdjustedBalance` = projectBalance100 × ownershipPct / 100 (applied once).
 *
 * Unified balance sign convention (for portfolio netting):
 *   positive = owed to owner (owner_credit accounts with positive balance;
 *              client_debt accounts contribute negatively)
 */
export interface PropertySettlementDTO {
  propertyName: string
  /** Presentation label only — does NOT control financial routing */
  entityType: EntityType
  /** TRUE if partnership_ownership data was applied; FALSE = 100% passthrough */
  hasOwnershipRecords: boolean
  ownershipPct: number
  ownershipStructure: OwnershipStructureRow[]
  /** 100% unified owner balance (Accounting Engine output, untouched) */
  projectBalance100: number
  /** Original 100% account sections (Accounting Engine output, untouched) */
  projectAccounts: RC3AccountSection[]
  /** Owner-adjusted balance = projectBalance100 × ownershipPct / 100 */
  ownerAdjustedBalance: number
  ownerAdjustedAccounts: OwnerAdjustedAccount[]
  direction: SettlementDirection
  reportingPeriod: { from: string | null; to: string | null }
}

/**
 * Final portfolio DTO passed to the Reporting Engine and then V3.
 * All calculations are complete at this point.
 * V3 renders only — zero arithmetic.
 *
 * `totalOwnerCredits` = sum of positive ownerAdjustedBalance values
 * `totalOwnerDebts`   = sum of abs(negative ownerAdjustedBalance values)
 * `finalNetBalance`   = totalOwnerCredits − totalOwnerDebts
 */
export interface OwnerPortfolioSettlementDTO {
  selectedOwner: OwnerIdentity
  period: { from: string | null; to: string | null }
  properties: PropertySettlementDTO[]
  totalOwnerCredits: number
  totalOwnerDebts: number
  finalNetBalance: number
  finalDirection: SettlementDirection
  generatedAt: string
}

// ─── Reporting Engine output ──────────────────────────────────────────────────

/**
 * Channel-neutral output from the Reporting Engine.
 * A single source for UI, PDF, and future API consumers.
 * Contains no accounting logic — metadata only wraps the DTO.
 */
export interface ReportingOutput {
  dto: OwnerPortfolioSettlementDTO
  metadata: {
    propertyCount: number
    partnershipPropertyCount: number
    clientPropertyCount: number
    hasPartnershipProperties: boolean
    hasClientProperties: boolean
    ownerName: string
  }
}
