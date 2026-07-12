/**
 * JJ Property 10 — Ownership Engine: Settlement Layer
 * Phase 2-A — 2026-07-12
 *
 * Applies ownership percentages to RC3 accounting output.
 * Pure functions only — no DB calls, no side effects.
 *
 * Contract:
 *   Input:  RC3PropertyReport  (100% project view from Accounting Engine)
 *           PropertyOwnershipRecord (from Ownership Engine lookup)
 *   Output: PropertySettlementDTO
 *
 * Key rules:
 *   1. Ownership percentage applied exactly once (here) — never again downstream
 *   2. Accounting Engine outputs are never modified — preserved in projectAccounts / projectBalance100
 *   3. V3 receives a finalized DTO and performs zero arithmetic
 *
 * Balance sign convention for portfolio netting (unified owner perspective):
 *   owner_credit account: +closing_balance → positive = owed to owner
 *   client_debt account:  -closing_balance → positive = owed to owner
 *
 * This mirrors the computeNetOwnerBalance convention in executiveSummary.ts
 * and the computeDashboard loop in client-report-rc3/page.tsx.
 */

import type { RC3AccountSection, RC3PropertyReport } from '@/lib/report/types'
import type {
  OwnerAdjustedAccount,
  PropertyOwnershipRecord,
  PropertySettlementDTO,
  SettlementDirection,
} from './types'

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Compute the 100% unified owner balance across all account sections.
 *
 * Convention (same as computeNetOwnerBalance in executiveSummary.ts):
 *   owner_credit account: +closing_balance (JJ owes owner → positive = good for owner)
 *   client_debt  account: -closing_balance (client debt → negative from owner's perspective)
 *
 * This is the pre-ownership 100% figure. The Settlement Engine applies
 * ownershipPct to this once to produce ownerAdjustedBalance.
 */
export function computeProjectBalance100(accounts: RC3AccountSection[]): number {
  let balance = 0
  for (const acc of accounts) {
    if (acc.balance_convention === 'owner_credit') {
      balance += acc.closing_balance
    } else {
      balance -= acc.closing_balance
    }
  }
  return balance
}

function computeDirection(ownerAdjustedBalance: number): SettlementDirection {
  if (Math.abs(ownerAdjustedBalance) < 0.005) return 'settled'
  return ownerAdjustedBalance > 0 ? 'payable_to_owner' : 'payable_to_jj'
}

/**
 * Build one owner-adjusted account from a 100% project section.
 *
 * Ownership percentage is applied exactly once here.
 * The original projectSection is preserved untouched.
 *
 * @param section     - 100% RC3AccountSection from Accounting Engine
 * @param ownershipPct - percentage to apply (100 = passthrough)
 */
export function buildOwnerAdjustedAccount(
  section: RC3AccountSection,
  ownershipPct: number,
): OwnerAdjustedAccount {
  const factor = ownershipPct / 100
  return {
    account_type:          section.account_type,
    account_label:         section.account_label,
    account_label_he:      section.account_label_he,
    ownershipPct,
    owner_income:          round2(section.total_income   * factor),
    owner_expenses:        round2(section.total_expenses * factor),
    owner_bpo:             round2(section.total_bpo      * factor),
    owner_closing_balance: round2(section.closing_balance * factor),
    balance_convention:    section.balance_convention,
    projectSection:        section,  // 100% original — untouched
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Build a complete PropertySettlementDTO from an RC3 report + ownership record.
 *
 * This is the single point where ownership percentage is applied.
 * All downstream consumers (Portfolio Engine, V3) receive pre-computed values.
 *
 * @param report    - Full RC3PropertyReport from Accounting Engine (100% figures)
 * @param ownership - PropertyOwnershipRecord from Ownership Engine
 */
export function buildPropertySettlement(
  report: RC3PropertyReport,
  ownership: PropertyOwnershipRecord,
): PropertySettlementDTO {
  const pct = ownership.ownershipPct // 100 if !hasOwnershipRecords; else from partnership_ownership

  // Project balance: 100% unified owner view (Accounting Engine output, untouched)
  const projectBalance100 = computeProjectBalance100(report.accounts)

  // Apply ownership pct ONCE — all downstream consumers receive this finished value
  const ownerAdjustedBalance = round2(projectBalance100 * pct / 100)

  // Build per-account owner-adjusted figures (pct applied once inside buildOwnerAdjustedAccount)
  const ownerAdjustedAccounts = report.accounts.map(section =>
    buildOwnerAdjustedAccount(section, pct),
  )

  return {
    propertyName:        report.reporting_name,
    entityType:          ownership.entityType,          // presentation only
    hasOwnershipRecords: ownership.hasOwnershipRecords, // routing flag
    ownershipPct:        pct,
    ownershipStructure:  ownership.allPartners,
    projectBalance100,
    projectAccounts:     report.accounts,               // 100% originals — untouched
    ownerAdjustedBalance,
    ownerAdjustedAccounts,
    direction:           computeDirection(ownerAdjustedBalance),
    reportingPeriod:     { from: report.from_date, to: report.to_date },
  }
}
