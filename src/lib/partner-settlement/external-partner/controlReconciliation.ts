/**
 * @module partner-settlement/external-partner/controlReconciliation
 * @description Test/engine gate: approved control amounts must reconcile before
 * an external-partner settlement may be treated as evidence. Missing evidence,
 * missing required payments, a double-counted renovation row, or a total that
 * does not match the authoritative figure fails closed.
 *
 * Does not embed the 202-row classification. Callers pass the control subset
 * plus the canonical artifact hash/version.
 */

import { roundEur } from './roundEur'
import type { ExternalPartnerEvidence } from './types'
import { applyAviFundingAttribution } from './externalPartnerAttribution'
import type {
  ExternalPartnerAttributedAmountControl,
  ExternalPartnerCorrectionLineageEntry,
} from './externalPartnerAttribution'
import type { RawExternalPartnerTransaction } from './externalPartnerReadTypes'

export interface ExternalPartnerControlTxn {
  readonly id: string
  readonly amountEur: number
}

export interface ExternalPartnerControlInput {
  readonly evidence: ExternalPartnerEvidence | null | undefined
  readonly expectedEvidence: ExternalPartnerEvidence
  readonly purchaseExpenseRows: readonly ExternalPartnerControlTxn[]
  readonly requiredPurchaseExpensePayments: readonly ExternalPartnerControlTxn[]
  readonly purchaseExpensesAuthoritativeEur: number
  readonly renovationTotalEur: number
  readonly renovationAuthoritativeEur: number
  readonly presentIds: readonly string[]
  readonly mustIncludeOnce: readonly string[]
  readonly mustExclude: readonly string[]
  /**
   * Optional Commit 2B overlay. When `expectedAttributedAmounts` is set,
   * attribution must succeed (ids found, fingerprints match, no lineage).
   * Do not set this on Commit 1 golden control input.
   */
  readonly expectedAttributedAmounts?: readonly ExternalPartnerAttributedAmountControl[]
  readonly attributedFundingRows?: readonly RawExternalPartnerTransaction[]
  readonly correctionLineage?: readonly ExternalPartnerCorrectionLineageEntry[]
}

export interface ExternalPartnerControlResult {
  readonly status: 'passed' | 'failed'
  readonly failures: readonly string[]
}

function idMatches(present: string, needle: string): boolean {
  if (!present || !needle) return false
  return present === needle || present.startsWith(needle) || needle.startsWith(present)
}

function countMatches(presentIds: readonly string[], needle: string): number {
  return presentIds.filter((id) => idMatches(id, needle)).length
}

function evidenceComplete(e: ExternalPartnerEvidence | null | undefined): boolean {
  if (!e) return false
  if (!e.sha256 || !e.version || !e.classificationArtifact) return false
  if (!Number.isFinite(e.rowCount) || e.rowCount <= 0) return false
  return true
}

export function reconcileExternalPartnerControls(
  input: ExternalPartnerControlInput,
): ExternalPartnerControlResult {
  const failures: string[] = []

  if (!evidenceComplete(input.evidence)) {
    failures.push('evidence_missing')
  } else {
    const got = input.evidence as ExternalPartnerEvidence
    if (got.sha256 !== input.expectedEvidence.sha256) failures.push('evidence_sha256_mismatch')
    if (got.version !== input.expectedEvidence.version) failures.push('evidence_version_mismatch')
    if (got.rowCount !== input.expectedEvidence.rowCount) failures.push('evidence_row_count_mismatch')
  }

  const purchaseSum = roundEur(
    input.purchaseExpenseRows.reduce((s, r) => s + r.amountEur, 0),
  )
  if (Math.abs(purchaseSum - input.purchaseExpensesAuthoritativeEur) >= 0.005) {
    failures.push('purchase_expenses_total_mismatch')
  }

  for (const required of input.requiredPurchaseExpensePayments) {
    const matches = input.purchaseExpenseRows.filter(
      (r) => idMatches(r.id, required.id) && Math.abs(r.amountEur - required.amountEur) < 0.005,
    )
    if (matches.length !== 1) {
      failures.push(`required_purchase_expense_missing:${required.id}`)
    }
  }

  if (Math.abs(input.renovationTotalEur - input.renovationAuthoritativeEur) >= 0.005) {
    failures.push('renovation_total_mismatch')
  }

  for (const id of input.mustIncludeOnce) {
    const n = countMatches(input.presentIds, id)
    if (n !== 1) failures.push(`must_include_once_failed:${id}`)
  }
  for (const id of input.mustExclude) {
    const n = countMatches(input.presentIds, id)
    if (n !== 0) failures.push(`must_exclude_failed:${id}`)
  }

  if (input.expectedAttributedAmounts) {
    const attribution = applyAviFundingAttribution(input.attributedFundingRows ?? [], {
      expectedAttributedAmounts: input.expectedAttributedAmounts,
      correctionLineage: input.correctionLineage,
    })
    if (attribution.status === 'failed') {
      failures.push(...attribution.failures)
    }
  }

  return {
    status: failures.length === 0 ? 'passed' : 'failed',
    failures,
  }
}
