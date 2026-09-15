/**
 * Tamir certified-close reconciliation.
 *
 * Source of live pre-image and component splits:
 *   scripts/peek-tamir-parity-correction-pack.ts (read-only pack, 2026-09-14)
 *   tmp-tamir-production-parity-correction-pack.json dryRun.layers
 *
 * Identity (certified reconstruction, locked):
 *   24579.16 + 21001.86 − 10667.55 − 1960 − 9575.72 − 1029 − 19100 = 3248.75
 *
 * C3 (€1,160) is the MISSING Hostaway listing-months. It is NOT inside the
 * live Hostaway ledger (€800). It must be applied exactly once: either as
 * 29 future ledger rows OR as a labeled overlay — never both.
 *
 * C2 = zero INSERT rows. The four soft-deleted events are an evidence overlay
 * (counted in certified reconstruction, excluded from live views because
 * is_deleted=true). They are not rebooks.
 */

import { C1_AMOUNT_EUR, C3_TOTAL_EUR, CERTIFIED_DUE_TO_TAMIR_EUR } from './ownerLevelPaymentTypes'
import { roundEur } from './ownerLevelPaymentComposition'

export { CERTIFIED_DUE_TO_TAMIR_EUR }

export const LIVE_PRODUCTION_PREIMAGE_EUR = 13095.71
export const C1_DELTA_EUR = -C1_AMOUNT_EUR
export const C3_DELTA_EUR = -C3_TOTAL_EUR
export const GROUP_A_ALREADY_IN_LIVE_EUR = 1_029
export const C2_OVERLAY_NET_EUR = 1313.04

export type ReconciliationLayer =
  | 'live_already_counted'
  | 'c1_owner_level_once'
  | 'c3_hostaway_missing_once'
  | 'c2_evidence_overlay_zero_rows'
  | 'presentation_only'

export interface ReconciliationLine {
  readonly id: string
  readonly layer: ReconciliationLayer
  readonly label: string
  readonly liveViewsEur: number
  readonly overlayEur: number
  readonly ledgerOnceEur: number
  readonly source: string
}

export const TAMIR_RECONCILIATION_LINES: readonly ReconciliationLine[] = [
  {
    id: 'str_net',
    layer: 'live_already_counted',
    label: 'STR net',
    liveViewsEur: 24579.16,
    overlayEur: 0,
    ledgerOnceEur: 0,
    source: 'certified strNet; live = certified (already in Hostaway/STR views)',
  },
  {
    id: 'ltr_rent_live',
    layer: 'live_already_counted',
    label: 'LTR rent in live views',
    liveViewsEur: 19401.86,
    overlayEur: 0,
    ledgerOnceEur: 0,
    source: 'certified 21001.86 − soft-deleted €1,600 May+June rent (07859b5d)',
  },
  {
    id: 'ltr_opex_live',
    layer: 'live_already_counted',
    label: 'LTR operating expenses in live views',
    liveViewsEur: -10473.38,
    overlayEur: 0,
    ledgerOnceEur: 0,
    source: 'certified 10667.55 − soft-deleted €117.36 − €76.81',
  },
  {
    id: 'hostaway_live',
    layer: 'live_already_counted',
    label: 'Hostaway already on ledger',
    liveViewsEur: -800,
    overlayEur: 0,
    ledgerOnceEur: 0,
    source: '4 existing Software/Hostaway rows; NOT the missing €1,160',
  },
  {
    id: 'str_owner_exp_live',
    layer: 'live_already_counted',
    label: 'Historical STR owner expenses in live views',
    liveViewsEur: -9482.93,
    overlayEur: 0,
    ledgerOnceEur: 0,
    source: 'certified 9575.72 − soft-deleted €92.79 (98a46392)',
  },
  {
    id: 'group_a',
    layer: 'live_already_counted',
    label: 'Group A owner charges',
    liveViewsEur: -GROUP_A_ALREADY_IN_LIVE_EUR,
    overlayEur: 0,
    ledgerOnceEur: 0,
    source: 'already in live views AND certified; delta €0 — must not overlay again',
  },
  {
    id: 'payments_live',
    layer: 'live_already_counted',
    label: 'Verified property-linked payments to Tamir',
    liveViewsEur: -9100,
    overlayEur: 0,
    ledgerOnceEur: 0,
    source: '€19,100 certified − C1 €10,000 not yet on ledger',
  },
  {
    id: 'c1',
    layer: 'c1_owner_level_once',
    label: 'C1 Jacob→Tamir owner-level BPO 2026-08-24',
    liveViewsEur: 0,
    overlayEur: 0,
    ledgerOnceEur: C1_DELTA_EUR,
    source: 'NOT in live views. Count once via owner_transaction_links after INSERT. Idempotency tamir_owner_pmt_yaakov_2026-08-24_10000',
  },
  {
    id: 'c3',
    layer: 'c3_hostaway_missing_once',
    label: 'C3 missing Hostaway listing-months (29 × €40)',
    liveViewsEur: 0,
    overlayEur: 0,
    ledgerOnceEur: C3_DELTA_EUR,
    source: 'NOT in live Hostaway €800. Count once as 29 billing-only rows (amount_eur=0, client_charge=40). Never also as a second overlay.',
  },
  {
    id: 'c2_ltr_rent',
    layer: 'c2_evidence_overlay_zero_rows',
    label: 'C2 evidence overlay: LTR rent €1,600 (soft-deleted 07859b5d)',
    liveViewsEur: 0,
    overlayEur: 1600,
    ledgerOnceEur: 0,
    source: 'is_deleted=true so live views exclude it. Certified reconstruction includes it. ZERO INSERT rows (C2 out of this implementation).',
  },
  {
    id: 'c2_ltr_elec',
    layer: 'c2_evidence_overlay_zero_rows',
    label: 'C2 evidence overlay: LTR electricity €117.36 (soft-deleted 2976a45a)',
    liveViewsEur: 0,
    overlayEur: -117.36,
    ledgerOnceEur: 0,
    source: 'soft-deleted; not in live; certified overlay; no rebook',
  },
  {
    id: 'c2_ltr_water',
    layer: 'c2_evidence_overlay_zero_rows',
    label: 'C2 evidence overlay: LTR water €76.81 (soft-deleted 490f499a)',
    liveViewsEur: 0,
    overlayEur: -76.81,
    ledgerOnceEur: 0,
    source: 'soft-deleted; not in live; certified overlay; no rebook',
  },
  {
    id: 'c2_str_elec',
    layer: 'c2_evidence_overlay_zero_rows',
    label: 'C2 evidence overlay: STR electricity €92.79 (soft-deleted 98a46392)',
    liveViewsEur: 0,
    overlayEur: -92.79,
    ledgerOnceEur: 0,
    source: 'soft-deleted; not in live; certified overlay; no rebook',
  },
]

export function sumLivePreimage(lines: readonly ReconciliationLine[] = TAMIR_RECONCILIATION_LINES): number {
  return roundEur(lines.reduce((s, l) => s + l.liveViewsEur, 0))
}

export type ApplyOnceResult =
  | { ok: true; closingEur: number; doubleCountedC3: false }
  | { ok: false; closingEur: null; doubleCountedC3: true }

export function applyOnce(
  lines: readonly ReconciliationLine[] = TAMIR_RECONCILIATION_LINES,
  opts: { applyC3AsLedger: boolean; applyC3AsOverlay: boolean } = {
    applyC3AsLedger: true,
    applyC3AsOverlay: false,
  },
): ApplyOnceResult {
  if (opts.applyC3AsLedger && opts.applyC3AsOverlay) {
    return { ok: false, closingEur: null, doubleCountedC3: true }
  }
  let total = 0
  for (const line of lines) {
    total = roundEur(total + line.liveViewsEur)
    if (line.id === 'c3') {
      if (opts.applyC3AsLedger) total = roundEur(total + line.ledgerOnceEur)
      if (opts.applyC3AsOverlay) total = roundEur(total + C3_DELTA_EUR)
    } else {
      total = roundEur(total + line.overlayEur + line.ledgerOnceEur)
    }
  }
  return { ok: true, closingEur: total, doubleCountedC3: false }
}

/** Forbidden QA-pack start: certified + C1 hides C3 inside the baseline. */
export function hiddenC3BaselineError(): number {
  return roundEur(CERTIFIED_DUE_TO_TAMIR_EUR + C1_AMOUNT_EUR)
}
