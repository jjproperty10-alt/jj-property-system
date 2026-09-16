/**
 * @module partner-settlement/external-partner/externalPartnerAttribution
 * @description Explicit Avi funding attribution for three ledger rows whose
 * stored payer is the generic label Client. Amounts are NEVER taken from this
 * map — only ids and control fingerprints. Paid totals are summed from the
 * transaction rows.
 *
 * Yossi 2026-09-03: Client is a wrong general classification; attributed
 * payer is AVI. Production payer is not rewritten (no correction-case RPC).
 */

import { roundEur } from './roundEur'
import {
  EXTERNAL_PARTNER_PROPERTY_NAME,
  asFiniteEur,
  isAviPayerField,
  isInExternalPartnerReadScope,
  resolvePayerIdentity,
} from './externalPartnerScope'
import type { RawExternalPartnerTransaction } from './externalPartnerReadTypes'

export const YOSSI_AVI_FUNDING_ATTRIBUTION_SOURCE =
  'YOSSI_BUSINESS_DECISION_2026_09_03' as const

export type AviFundingAttributionSource = typeof YOSSI_AVI_FUNDING_ATTRIBUTION_SOURCE

export interface AviClientToAviAttributionRule {
  readonly id: string
  readonly expectedRawPayer: 'Client'
  readonly attributedPayer: 'AVI'
  readonly attributionSource: AviFundingAttributionSource
  readonly expectedPropertyName: typeof EXTERNAL_PARTNER_PROPERTY_NAME
  readonly expectedCategory: string
  readonly expectedSubcategory: string
}

/** Id + fingerprints only. No amounts. */
export const AVI_CLIENT_TO_AVI_ATTRIBUTION: readonly AviClientToAviAttributionRule[] =
  Object.freeze([
    {
      id: 'b71e4098-39fb-4562-a0b4-1d8db9fbdfd1',
      expectedRawPayer: 'Client',
      attributedPayer: 'AVI',
      attributionSource: YOSSI_AVI_FUNDING_ATTRIBUTION_SOURCE,
      expectedPropertyName: EXTERNAL_PARTNER_PROPERTY_NAME,
      expectedCategory: 'Purchase',
      expectedSubcategory: 'Purchase Payment',
    },
    {
      id: 'c51df847-5275-47b2-b104-1a57aea0c293',
      expectedRawPayer: 'Client',
      attributedPayer: 'AVI',
      attributionSource: YOSSI_AVI_FUNDING_ATTRIBUTION_SOURCE,
      expectedPropertyName: EXTERNAL_PARTNER_PROPERTY_NAME,
      expectedCategory: 'Renovation',
      expectedSubcategory: 'Client Payment',
    },
    {
      id: '3afd3b3f-b6de-4e6e-8476-2b07bbd09ea7',
      expectedRawPayer: 'Client',
      attributedPayer: 'AVI',
      attributionSource: YOSSI_AVI_FUNDING_ATTRIBUTION_SOURCE,
      expectedPropertyName: EXTERNAL_PARTNER_PROPERTY_NAME,
      expectedCategory: 'Renovation',
      expectedSubcategory: 'Client Payment',
    },
  ])

export interface ExternalPartnerAttributedFundingLine {
  readonly id: string
  readonly rawPayer: 'Client'
  readonly attributedPayer: 'AVI'
  readonly attributionSource: AviFundingAttributionSource
  readonly amountEur: number
}

export interface ExternalPartnerCorrectionLineageEntry {
  readonly originalTransactionId: string
  readonly appliedTransactionId?: string
  readonly entryRole: 'reversal' | 'replacement' | 'rebook' | 'append'
}

export interface ExternalPartnerAttributedAmountControl {
  readonly id: string
  readonly amountEur: number
}

export type ExternalPartnerAviPaidAttribution =
  | {
      readonly status: 'ok'
      readonly paidEurAvi: number
      readonly attributedLines: readonly ExternalPartnerAttributedFundingLine[]
      readonly directAviPayerIds: readonly string[]
      readonly countedIds: readonly string[]
    }
  | {
      readonly status: 'failed'
      readonly failures: readonly string[]
    }

const CONTROL_EPS = 0.005

function idMatches(present: string, needle: string): boolean {
  if (!present || !needle) return false
  return present === needle || present.startsWith(needle.slice(0, 8)) || needle.startsWith(present.slice(0, 8))
}

export function findAviClientToAviRule(id: string): AviClientToAviAttributionRule | undefined {
  return AVI_CLIENT_TO_AVI_ATTRIBUTION.find((rule) => idMatches(id, rule.id))
}

export function isAviAttributedFundingId(id: string): boolean {
  return findAviClientToAviRule(id) != null
}

export function attributedAviPaymentIdSet(
  attribution: ExternalPartnerAviPaidAttribution,
): ReadonlySet<string> {
  if (attribution.status !== 'ok') return new Set()
  return new Set(attribution.attributedLines.map((line) => line.id))
}

export function overlayHasAttributedId(ids: ReadonlySet<string> | undefined, id: string): boolean {
  if (!ids || ids.size === 0) return false
  if (ids.has(id)) return true
  let hit = false
  ids.forEach((present) => {
    if (idMatches(id, present)) hit = true
  })
  return hit
}

function lineageTouches(
  lineage: readonly ExternalPartnerCorrectionLineageEntry[],
  ruleId: string,
): boolean {
  return lineage.some(
    (e) =>
      idMatches(e.originalTransactionId, ruleId) ||
      (e.appliedTransactionId != null && idMatches(e.appliedTransactionId, ruleId)),
  )
}

/**
 * Attribute the three Client-payer Avi funding rows and sum Avi paid from
 * transaction amounts (direct AVI payer + attributed ids, each id once).
 * Fails closed on missing id, fingerprint mismatch, amount-control mismatch,
 * duplicate ids, or any correction lineage for those ids.
 */
export function applyAviFundingAttribution(
  rows: readonly RawExternalPartnerTransaction[],
  controls: {
    readonly expectedAttributedAmounts: readonly ExternalPartnerAttributedAmountControl[]
    readonly correctionLineage?: readonly ExternalPartnerCorrectionLineageEntry[]
  },
): ExternalPartnerAviPaidAttribution {
  const failures: string[] = []
  const inScope = rows.filter(isInExternalPartnerReadScope)
  const lineage = controls.correctionLineage ?? []
  const attributedLines: ExternalPartnerAttributedFundingLine[] = []
  const counted = new Set<string>()

  for (const rule of AVI_CLIENT_TO_AVI_ATTRIBUTION) {
    if (lineageTouches(lineage, rule.id)) {
      failures.push(`correction_lineage_present:${rule.id}`)
    }
    const matches = rows.filter((r) => idMatches(r.id, rule.id))
    if (matches.length === 0) {
      failures.push(`attributed_id_missing:${rule.id}`)
      continue
    }
    if (matches.length !== 1) {
      failures.push(`attributed_id_duplicate:${rule.id}`)
      continue
    }
    const row = matches[0]
    const rawPayer = resolvePayerIdentity(row)
    if (rawPayer !== rule.expectedRawPayer) {
      failures.push(`attributed_raw_payer_mismatch:${rule.id}`)
    }
    if (!isInExternalPartnerReadScope(row) || row.property_name !== rule.expectedPropertyName) {
      failures.push(`attributed_property_mismatch:${rule.id}`)
    }
    if (row.category !== rule.expectedCategory) {
      failures.push(`attributed_category_mismatch:${rule.id}`)
    }
    if (row.subcategory !== rule.expectedSubcategory) {
      failures.push(`attributed_subcategory_mismatch:${rule.id}`)
    }
    const amount = asFiniteEur(row.amount_eur)
    if (amount === null) {
      failures.push(`attributed_amount_unverified:${rule.id}`)
      continue
    }
    const expected = controls.expectedAttributedAmounts.find((c) => idMatches(c.id, rule.id))
    if (!expected) {
      failures.push(`attributed_amount_control_missing:${rule.id}`)
      continue
    }
    if (Math.abs(amount - expected.amountEur) >= CONTROL_EPS) {
      failures.push(`attributed_amount_mismatch:${rule.id}`)
      continue
    }
    attributedLines.push({
      id: row.id,
      rawPayer: 'Client',
      attributedPayer: 'AVI',
      attributionSource: rule.attributionSource,
      amountEur: amount,
    })
    counted.add(row.id)
  }

  if (controls.expectedAttributedAmounts.length !== AVI_CLIENT_TO_AVI_ATTRIBUTION.length) {
    failures.push('attributed_amount_control_count_mismatch')
  }

  const lineageApplied = new Set(
    lineage
      .map((e) => e.appliedTransactionId)
      .filter((id): id is string => id != null && id !== ''),
  )

  const directAviPayerIds: string[] = []
  let directSum = 0
  for (const row of inScope) {
    if (counted.has(row.id)) continue
    if (findAviClientToAviRule(row.id)) continue
    if (lineageApplied.has(row.id) || lineage.some((e) => e.appliedTransactionId && idMatches(row.id, e.appliedTransactionId))) {
      failures.push(`correction_lineage_applied_row_present:${row.id}`)
      continue
    }
    if (!isAviPayerField(resolvePayerIdentity(row))) continue
    const amount = asFiniteEur(row.amount_eur)
    if (amount === null) {
      failures.push(`direct_avi_amount_unverified:${row.id}`)
      continue
    }
    directAviPayerIds.push(row.id)
    counted.add(row.id)
    directSum = roundEur(directSum + amount)
  }

  const attributedSum = roundEur(attributedLines.reduce((s, l) => s + l.amountEur, 0))
  const paidEurAvi = roundEur(directSum + attributedSum)

  if (failures.length > 0) {
    return { status: 'failed', failures }
  }
  return {
    status: 'ok',
    paidEurAvi,
    attributedLines,
    directAviPayerIds,
    countedIds: [...attributedLines.map((line) => line.id), ...directAviPayerIds],
  }
}
