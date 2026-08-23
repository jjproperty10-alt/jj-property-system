import {
  classifyLine, buildPartnerLedger, capitalEqualizationDelta, profitEqualization,
  deriveHeadlineFromEP,
} from '@/lib/partner-settlement/partnerLedgerEngine'
import { normalizePartnerTx, type RawLedgerRow } from '@/lib/partner-settlement/ledgerRowFilter'
import { resolvePartnerSplit } from '@/lib/partner-settlement/ownershipRules'

let seq = 0
function tx(p: Partial<RawLedgerRow>): ReturnType<typeof normalizePartnerTx> {
  seq += 1
  return normalizePartnerTx({
    id: p.id ?? `t${seq}`,
    date: p.date ?? '2026-03-01',
    property_name: p.property_name ?? null,
    category: p.category ?? 'Management',
    subcategory: p.subcategory ?? 'Other',
    payer: p.payer ?? null,
    payee: p.payee ?? null,
    amount_eur: p.amount_eur ?? 0,
  })
}

const CONFIRMED_5050 = [
  { party: 'Yossi', pct: 50, confidence: 'confirmed' as const },
  { party: 'Jacob', pct: 50, confidence: 'confirmed' as const },
]

describe('partnerLedgerEngine — Layer A', () => {
  it('€100 reimbursable expense by Yossi → JJ owes Yossi €100; no Yossi↔Jacob headline effect', () => {
    const r = buildPartnerLedger([
      tx({ payer: 'yossi', payee: 'company', category: 'Management', subcategory: 'Cleaning', amount_eur: 100 }),
    ])
    const yossi = r.partnerAccounts.find(a => a.party === 'Yossi')!
    const jacob = r.partnerAccounts.find(a => a.party === 'Jacob')!
    expect(yossi.ledgerBalanceEur).toBe(100)      // JJ owes Yossi 100
    expect(jacob.ledgerBalanceEur).toBeNull()      // Jacob untouched → null, not 0
    expect(r.interPartnerTransferNetEur).toBe(0)
    expect(r.capitalEqualizationNetEur).toBe(0)    // no inter-partner effect
    expect(r.unresolved).toHaveLength(0)
  })

  it('JJ→partner reimbursement nets against the current account', () => {
    const r = buildPartnerLedger([
      tx({ payer: 'yossi', payee: 'company', category: 'Management', subcategory: 'Cleaning', amount_eur: 100 }),
      tx({ payer: 'jj', payee: 'yossi', category: 'Transfer', subcategory: 'Expense Reimbursement', amount_eur: 30 }),
    ])
    const yossi = r.partnerAccounts.find(a => a.party === 'Yossi')!
    expect(yossi.ledgerBalanceEur).toBe(70) // 100 owed − 30 paid back
  })

  it('empty ledger → null current accounts (never 0)', () => {
    const r = buildPartnerLedger([])
    for (const a of r.partnerAccounts) {
      expect(a.ledgerBalanceEur).toBeNull()
      expect(a.status).toBe('PENDING')
    }
  })
})

describe('partnerLedgerEngine — Layer B (capital / profit math)', () => {
  it('€100 approved capital by Yossi in confirmed 50/50 → Jacob owes Yossi €50', () => {
    const split = resolvePartnerSplit('SomeProp', CONFIRMED_5050)
    const line = classifyLine(
      tx({ id: 'cap1', payer: 'yossi', payee: 'company', category: 'Purchase', subcategory: 'Purchase Payment', amount_eur: 100 }),
      { approvedCapitalTxIds: new Set(['cap1']), split },
    )
    expect(line.klass).toBe('CAPITAL')
    expect(line.layerAClaim).toBe(0)          // capital never enters Layer A
    const d = capitalEqualizationDelta({ contributor: 'Yossi', amountEur: 100, split })
    const h = deriveHeadlineFromEP(d.epYossi, d.epJacob)
    expect(h.symmetric).toBe(true)
    expect(h.headline).toMatchObject({ debtor: 'Jacob', creditor: 'Yossi', amountEur: 50 })
  })

  it('Villa Mazotos regression: €100 capital by Yossi → Jacob owes Yossi €25 (25/25, not 50/50)', () => {
    const split = resolvePartnerSplit('Villa Mazotos') // approved fact: Y 25 / J 25 / ext 50
    expect(split.yossi).toBeCloseTo(0.25, 6)
    expect(split.jacob).toBeCloseTo(0.25, 6)
    const d = capitalEqualizationDelta({ contributor: 'Yossi', amountEur: 100, split })
    const h = deriveHeadlineFromEP(d.epYossi, d.epJacob)
    expect(h.headline).toMatchObject({ debtor: 'Jacob', creditor: 'Yossi', amountEur: 25 })
  })

  it('€10,000 certified profit, Yossi €7,000 / Jacob €3,000 → Yossi owes Jacob €2,000', () => {
    const ep = profitEqualization({ entitlementYossi: 5000, entitlementJacob: 5000, receivedYossi: 7000, receivedJacob: 3000 })
    expect(ep.epYossi).toBe(-2000)
    expect(ep.epJacob).toBe(2000)
    const h = deriveHeadlineFromEP(ep.epYossi, ep.epJacob)
    expect(h.symmetric).toBe(true)
    expect(h.headline).toMatchObject({ debtor: 'Yossi', creditor: 'Jacob', amountEur: 2000 })
  })

  it('asymmetric EPs never assert a headline (symmetry guard)', () => {
    const h = deriveHeadlineFromEP(100, 100) // residual 200 ≠ 0
    expect(h.symmetric).toBe(false)
    expect(h.headline.debtor).toBeNull()
  })
})

describe('partnerLedgerEngine — non-double-count & cap', () => {
  it('a reimbursable line touches Layer A only; a capital line touches Layer B only', () => {
    const split = resolvePartnerSplit('SomeProp', CONFIRMED_5050)
    const reimb = classifyLine(tx({ payer: 'yossi', payee: 'company', category: 'Management', subcategory: 'Repairs', amount_eur: 100 }))
    const cap = classifyLine(
      tx({ id: 'cap2', payer: 'yossi', payee: 'company', category: 'Renovation', subcategory: 'Contractors', amount_eur: 100 }),
      { approvedCapitalTxIds: new Set(['cap2']), split },
    )
    expect(reimb.layerBClaim).toBe(0)
    expect(cap.layerAClaim).toBe(0)
    expect(reimb.capOk).toBe(true)
    expect(cap.capOk).toBe(true)
  })
})

describe('partnerLedgerEngine — direct transfers & purpose gating', () => {
  it('direct partner transfer with known purpose settles the inter-partner balance and is not profit', () => {
    const line = classifyLine(tx({ payer: 'jacob', payee: 'yossi', category: 'Transfer', subcategory: 'Partner Loan', amount_eur: 500 }))
    expect(line.klass).toBe('DIRECT_PARTNER_TRANSFER')
    expect(line.certified).toBe(true)
    expect(line.layerBClaim).toBe(-500) // Jacob paid Yossi → Jacob-owes-Yossi decreases
    // not income / profit
    expect(['INCOME_COLLECTED_BY_PARTNER', 'CAPITAL']).not.toContain(line.klass)
  })

  it('direct partner transfer with unknown purpose blocks certification', () => {
    const r = buildPartnerLedger([
      tx({ payer: 'jacob', payee: 'yossi', category: 'Transfer', subcategory: 'Transfer', amount_eur: 638700 }),
    ])
    expect(r.unresolved.some(u => u.kind === 'TRANSFER_PURPOSE_UNKNOWN')).toBe(true)
    expect(r.interPartnerTransferNetEur).toBe(0) // unresolved → not counted
  })
})

describe('partnerLedgerEngine — identity & custodian', () => {
  it('identity ambiguity in a Transfer → UNRESOLVED, never guessed', () => {
    const line = classifyLine(tx({ payer: 'yossi', payee: 'some random vendor', category: 'Transfer', subcategory: 'Transfer', amount_eur: 400 }))
    expect(line.klass).toBe('UNRESOLVED')
    expect(line.unresolved?.kind).toBe('IDENTITY_UNRESOLVED')
  })

  it('custodian movement is uncertified custody, not a partner loan', () => {
    const line = classifyLine(tx({ payer: 'yossi', payee: 'anastasia', category: 'Transfer', subcategory: 'Transfer', amount_eur: 1000 }))
    expect(line.klass).toBe('CUSTODIAN_MOVEMENT')
    expect(line.certified).toBe(false)
    expect(line.unresolved?.kind).toBe('CUSTODIAN_SETTLEMENT_UNCERTIFIED')
  })

  it('partner-funded Purchase/Renovation without an approved capital fact → LOAN_VS_CAPITAL_UNPROVEN', () => {
    const line = classifyLine(tx({ payer: 'yossi', payee: 'company', category: 'Renovation', subcategory: 'Materials', amount_eur: 5000 }))
    expect(line.klass).toBe('UNRESOLVED')
    expect(line.unresolved?.kind).toBe('LOAN_VS_CAPITAL_UNPROVEN')
    expect(line.layerAClaim).toBe(0)
  })
})
