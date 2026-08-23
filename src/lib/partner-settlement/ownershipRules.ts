/**
 * @module partner-settlement/ownershipRules
 * @description Pure partner ownership-split resolution for Layer B (Stage 2). No I/O.
 *
 * Approved business decisions (Stage-2 authorization by Yossi; see
 * PARTNER_REPORT_PHASE1_DISCOVERY.md §7/§12):
 *   - Default ownership is 50/50 ONLY where the canonical ownership source confirms it.
 *     A bare 50/50 is NEVER assumed for an unconfirmed property.
 *   - Special ownership is respected. Villa Mazotos: external partner 50%, Yossi 25%,
 *     Jacob 25% (an authorized fact, NOT an inferred rule).
 *
 * Resolution precedence for the Yossi/Jacob split used to allocate a capital
 * contribution's inter-partner equalization:
 *   1. A CONFIRMED canonical ownership share (status='confirmed') → use it.
 *   2. An APPROVED_OWNERSHIP_FACTS entry → use it, but confidence 'estimated'
 *      (authorized fact; still flagged until the canonical source is confirmed).
 *   3. Otherwise → PENDING (null); the property's Layer B stays blocked.
 */

export interface PartnerSplit {
  /**
   * Fraction 0..1 of the WHOLE property owned by Yossi (used to allocate a capital
   * contribution's inter-partner equalization — NOT normalized to partners only, so
   * an external co-owner's share is correctly excluded from the partner claim).
   */
  readonly yossi: number | null
  /** Fraction 0..1 of the WHOLE property owned by Jacob. */
  readonly jacob: number | null
  readonly confidence: 'confirmed' | 'estimated' | 'pending_verification'
  readonly source: string
}

/** A confirmed canonical share row (already resolved to a party name). */
export interface ConfirmedShare {
  readonly party: string // 'Yossi' | 'Jacob' | external name
  readonly pct: number | null // 0..100
  readonly confidence: 'confirmed' | 'estimated' | 'pending_verification'
}

interface ApprovedOwnershipFact {
  readonly yossiPct: number // 0..100 of the WHOLE property
  readonly jacobPct: number
  readonly externalPct: number
  readonly note: string
}

/**
 * Authorized special-ownership facts. Keyed by lower-cased reporting/canonical name.
 * Provenance: Stage-2 authorization (Yossi) + PARTNER_REPORT_PHASE1_DISCOVERY.md §12.
 * These are approved facts, never inferred from category/property name.
 */
export const APPROVED_OWNERSHIP_FACTS: Readonly<Record<string, ApprovedOwnershipFact>> = {
  'villa mazotos': {
    yossiPct: 25,
    jacobPct: 25,
    externalPct: 50,
    note: 'Villa Mazotos — external 50% / Yossi 25% / Jacob 25% (Stage-2 authorized fact)',
  },
}

function wholeFraction(yossiPctWhole: number, jacobPctWhole: number): { yossi: number; jacob: number } {
  // Whole-property fractions. A capital contribution of C by one partner makes the
  // OTHER partner owe C × (their WHOLE fraction) — an external co-owner's share is
  // simply not an inter-partner claim, so it must NOT be normalized away.
  return { yossi: yossiPctWhole / 100, jacob: jacobPctWhole / 100 }
}

/**
 * Resolve the Yossi/Jacob equalization split for a property.
 * `confirmedShares` are canonical ownership_period rows already name-resolved.
 */
export function resolvePartnerSplit(
  propertyName: string,
  confirmedShares?: readonly ConfirmedShare[],
): PartnerSplit {
  // 1. Confirmed canonical shares win.
  if (confirmedShares && confirmedShares.length > 0) {
    const confirmed = confirmedShares.filter(s => s.confidence === 'confirmed' && s.pct != null)
    const y = confirmed.find(s => s.party.toLowerCase() === 'yossi')
    const j = confirmed.find(s => s.party.toLowerCase() === 'jacob')
    if (y && j && y.pct != null && j.pct != null) {
      const { yossi, jacob } = wholeFraction(y.pct, j.pct)
      return { yossi, jacob, confidence: 'confirmed', source: 'lifecycle.ownership_period(confirmed)' }
    }
  }

  // 2. Authorized special-ownership fact.
  const fact = APPROVED_OWNERSHIP_FACTS[propertyName.trim().toLowerCase()]
  if (fact) {
    const { yossi, jacob } = wholeFraction(fact.yossiPct, fact.jacobPct)
    return { yossi, jacob, confidence: 'estimated', source: `approved_fact:${fact.note}` }
  }

  // 3. Nothing confirmed — PENDING. NEVER assume 50/50.
  return { yossi: null, jacob: null, confidence: 'pending_verification', source: 'unconfirmed' }
}
