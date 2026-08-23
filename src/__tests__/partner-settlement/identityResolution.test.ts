import {
  resolvePartyWith, resolveParty, type IdentityDirectory,
} from '@/lib/partner-settlement/identityResolver'
import { isPartnerRelevant, normalizePartnerTx, type RawLedgerRow } from '@/lib/partner-settlement/ledgerRowFilter'
import { classifyLine } from '@/lib/partner-settlement/partnerLedgerEngine'

// Simulated canonical directory (as built read-only from registry.parties).
const DIR: IdentityDirectory = new Map([
  ['yossi', { role: 'PARTNER', canonical: 'Yossi', custodian: false }],
  ['jacob', { role: 'PARTNER', canonical: 'Jacob', custodian: false }],
  ['yossi azizi', { role: 'PARTNER', canonical: 'Yossi', custodian: false }], // full name known to registry
  ['anastasia', { role: 'EXTERNAL', canonical: null, custodian: true }],
])

function row(p: Partial<RawLedgerRow>): RawLedgerRow {
  return {
    id: p.id ?? 'x', date: p.date ?? '2026-03-01', property_name: p.property_name ?? null,
    category: p.category ?? 'Management', subcategory: p.subcategory ?? 'Other',
    payer: p.payer ?? null, payee: p.payee ?? null, amount_eur: p.amount_eur ?? 10,
  }
}

describe('canonical-first identity resolution (QA #185-2)', () => {
  it('resolves a full name via the canonical directory (not dropped as External)', () => {
    const r = resolvePartyWith(DIR, 'Yossi Azizi')
    expect(r.role).toBe('PARTNER')
    expect(r.canonical).toBe('Yossi')
    // and the row is retained by isPartnerRelevant
    expect(isPartnerRelevant(row({ payer: 'Yossi Azizi', payee: 'company' }), DIR)).toBe(true)
  })

  it('normalizePartnerTx uses the directory so a full-name partner is recognized', () => {
    const tx = normalizePartnerTx(row({ payer: 'Yossi Azizi', payee: 'company', category: 'Management', amount_eur: 100 }), DIR)
    expect(tx.payer.canonical).toBe('Yossi')
  })

  it('approved aliases remain an explicit fallback when the directory has no entry (JJ, Jacob spelling)', () => {
    // no directory → alias fallback
    expect(resolveParty('company').role).toBe('JJ')
    expect(resolveParty('yaakov').canonical).toBe('Jacob')
    // directory present but missing 'company' → still falls back to alias
    expect(resolvePartyWith(DIR, 'company').role).toBe('JJ')
  })

  it('an ambiguous partner-sensitive identity becomes IDENTITY_UNRESOLVED, never silently dropped', () => {
    const tx = normalizePartnerTx(row({ payer: 'jacob', payee: 'mystery person', category: 'Transfer', subcategory: 'Transfer', amount_eur: 500 }), DIR)
    const line = classifyLine(tx)
    expect(line.klass).toBe('UNRESOLVED')
    expect(line.unresolved?.kind).toBe('IDENTITY_UNRESOLVED')
    // and it is partner-relevant (retained), not dropped
    expect(isPartnerRelevant(row({ payer: 'jacob', payee: 'mystery person', category: 'Transfer' }), DIR)).toBe(true)
  })

  it('JJ paired with an ambiguous counterparty in a Transfer is retained and surfaced (not dropped)', () => {
    expect(isPartnerRelevant(row({ payer: 'company', payee: 'mystery', category: 'Transfer' }), DIR)).toBe(true)
    const tx = normalizePartnerTx(row({ payer: 'company', payee: 'mystery', category: 'Transfer', subcategory: 'Transfer', amount_eur: 200 }), DIR)
    const line = classifyLine(tx)
    expect(line.unresolved?.kind).toBe('IDENTITY_UNRESOLVED')
  })
})
