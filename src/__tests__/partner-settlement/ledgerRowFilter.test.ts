import {
  isCertifiedLedgerRow, isPartnerRelevant, toPartnerLedger, type RawLedgerRow,
} from '@/lib/partner-settlement/ledgerRowFilter'

const EMPTY = new Set<string>()

function row(p: Partial<RawLedgerRow>): RawLedgerRow {
  return {
    id: p.id ?? 'x', date: p.date ?? '2026-03-01', property_name: p.property_name ?? null,
    category: p.category ?? 'Management', subcategory: p.subcategory ?? 'Other',
    payer: p.payer ?? null, payee: p.payee ?? null, amount_eur: p.amount_eur ?? 10,
    is_deleted: p.is_deleted, review_status: p.review_status,
  }
}

describe('isCertifiedLedgerRow (certified-read predicate)', () => {
  it('excludes soft-deleted rows', () => {
    expect(isCertifiedLedgerRow(row({ id: 'a', is_deleted: true }), EMPTY)).toBe(false)
  })
  it('excludes confirmed_duplicate (any non-active review_status)', () => {
    expect(isCertifiedLedgerRow(row({ id: 'b', review_status: 'confirmed_duplicate' }), EMPTY)).toBe(false)
  })
  it('keeps active and null review_status', () => {
    expect(isCertifiedLedgerRow(row({ id: 'c', review_status: 'active' }), EMPTY)).toBe(true)
    expect(isCertifiedLedgerRow(row({ id: 'd', review_status: null }), EMPTY)).toBe(true)
  })
  it('excludes rows in the active transaction_exclusions set', () => {
    expect(isCertifiedLedgerRow(row({ id: 'e' }), new Set(['e']))).toBe(false)
  })
})

describe('isPartnerRelevant', () => {
  it('true when a partner is payer or payee', () => {
    expect(isPartnerRelevant({ payer: 'yossi', payee: 'company' })).toBe(true)
    expect(isPartnerRelevant({ payer: 'anastasia', payee: 'jacob' })).toBe(true)
  })
  it('false for non-partner rows', () => {
    expect(isPartnerRelevant({ payer: 'tenant', payee: 'jj' })).toBe(false)
    expect(isPartnerRelevant({ payer: 'client', payee: 'owner' })).toBe(false)
  })
})

describe('toPartnerLedger (deleted/reversed/duplicate excluded using certified rules)', () => {
  it('returns only certified + partner-relevant normalized rows', () => {
    const rows: RawLedgerRow[] = [
      row({ id: '1', payer: 'yossi', payee: 'company', amount_eur: 100 }),                       // keep
      row({ id: '2', payer: 'yossi', payee: 'company', amount_eur: 999, is_deleted: true }),      // drop: deleted
      row({ id: '3', payer: 'jacob', payee: 'yossi', amount_eur: 50, review_status: 'confirmed_duplicate' }), // drop: dup
      row({ id: '4', payer: 'tenant', payee: 'jj', amount_eur: 20 }),                              // drop: not partner
      row({ id: '5', payer: 'jacob', payee: 'company', amount_eur: 30 }),                          // keep
      row({ id: '6', payer: 'yossi', payee: 'company', amount_eur: 40 }),                          // drop: excluded
    ]
    const out = toPartnerLedger(rows, new Set(['6']))
    expect(out.map(o => o.id).sort()).toEqual(['1', '5'])
    expect(out[0].payer.canonical).toBe('Yossi')
  })
})
