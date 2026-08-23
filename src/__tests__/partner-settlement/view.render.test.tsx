import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as fs from 'fs'
import { PartnerReportBView } from '@/components/partner-settlement/PartnerReportBView'
import type { PartnerReportB } from '@/lib/partner-settlement/partnerReportBTypes'

function baseDto(): PartnerReportB {
  return {
    meta: { schemaVersion: 'PartnerReportB/stage2', periodStart: '2026-01-01', periodEnd: '2026-06-30', generatedAt: '2026-08-23T00:00:00.000Z', currency: 'EUR', stage: 2 },
    properties: [{
      propertyName: 'Villa Mazotos', relationshipType: 'partnership',
      ownership: [
        { party: 'Avi', pct: 50, confidence: 'pending_verification' },
        { party: 'Yossi', pct: 25, confidence: 'pending_verification' },
        { party: 'Jacob', pct: 25, confidence: 'pending_verification' },
      ],
      accounts: [{
        accountType: 'renovation',
        economic: { income: 4000, expenses: 30000, profitOrLoss: null, status: 'CERTIFIED', sourceRef: { system: 'v_rc3_renovation', ref: 'Villa Mazotos' } },
        cash: { received: null, paid: null, byParty: [], sourceRef: { system: 'public.transactions' } },
        rights: { contractValue: 50000, received: 30000, receivable: 20000, payables: null, commitments: null, status: 'CERTIFIED', sourceRef: { system: 'v_rc3_renovation', ref: 'Villa Mazotos' } },
        ownerEntitlement: null, externalShare: null, jjShare: null,
        partnerShares: { yossi: null, jacob: null }, residualToRollUp: null,
        unresolved: [{ kind: 'ACCOUNT_PROFIT_PENDING', ref: 'Villa Mazotos / renovation', reason: 'profit authority not wired' }],
        explain: [{ label: 'contract', amountEur: 50000, tracesTo: [{ system: 'v_rc3_renovation', ref: 'Villa Mazotos' }] }],
        status: 'PENDING',
      }],
      partnerPositions: [
        { party: 'Yossi', certifiedContributionEur: 12000, unresolvedContributionEur: 18000 },
      ],
      unresolved: [{ kind: 'OWNERSHIP_PENDING', ref: 'Villa Mazotos', reason: 'ownership pending_verification' }],
      status: 'PENDING',
    }],
    cashboxes: [
      { name: 'Yossi', kind: 'cash_holder', ledgerCashPosition: -41689.07, verifiedBankOrPhysicalCash: null, reconciliationDifference: null, verificationStatus: 'LEDGER_ONLY', sourceRef: { system: 'v_cashbox_audit', ref: 'Yossi' } },
      { name: 'JJ', kind: 'cash_holder', ledgerCashPosition: 126780.91, verifiedBankOrPhysicalCash: null, reconciliationDifference: null, verificationStatus: 'LEDGER_ONLY', sourceRef: { system: 'v_cashbox_audit', ref: 'JJ' } },
      { name: 'Anastasia (custodian)', kind: 'custodian', ledgerCashPosition: 10074.88, verifiedBankOrPhysicalCash: null, reconciliationDifference: null, verificationStatus: 'LEDGER_ONLY', sourceRef: { system: 'v_anastasia_clearing' }, note: 'Cash custodian — excluded from partner equalization' },
    ],
    jjPosition: { economicProfit: -60637.89, economicProfitStatus: 'PENDING', actualCashLedger: 126780.91, cashVerificationStatus: 'LEDGER_ONLY', receivables: 84233.11, payables: 34452.79, receivablesScope: 'PARTIAL', sourceRefs: [{ system: 'v_money_position' }] },
    partnerCurrentAccounts: [
      { party: 'Yossi', ledgerBalanceEur: 12000, status: 'PARTIAL', components: [{ label: 'Reimbursable expenses funded (JJ owes partner)', klass: 'REIMBURSABLE_LOAN', amountEur: 12000, count: 8, certified: true }], unresolvedAmountEur: 18000, explain: [] },
      { party: 'Jacob', ledgerBalanceEur: null, status: 'PENDING', components: [], unresolvedAmountEur: null, explain: [] },
    ],
    classificationSummary: [
      { klass: 'REIMBURSABLE_LOAN', count: 8, amountEur: 12000, certified: true },
      { klass: 'DIRECT_PARTNER_TRANSFER', count: 50, amountEur: 638700, certified: false },
    ],
    equalization: {
      epYossi: null, epJacob: null, symmetryResidual: null,
      headline: { debtor: null, creditor: null, amountEur: null, certificationStatus: 'PENDING_RECONCILIATION', canAssertDebtorCreditor: false, blockingReasons: ['unresolved item(s) must be classified', 'property ownership pending confirmation', 'equalization not computed (Stage 1 framework)'] },
      certifiedSubtotalEur: 0, unresolvedCount: 3, unresolvedAmountEur: null, components: [],
    },
    opening: { value: null, status: 'PENDING_RECONCILIATION' },
    closing: { value: null, status: 'PENDING_RECONCILIATION' },
    unresolved: [
      { kind: 'OWNERSHIP_PENDING', ref: 'Villa Mazotos', reason: 'ownership pending_verification' },
      { kind: 'TRANSFER_PURPOSE_UNKNOWN', ref: 'tx', reason: 'direct partner transfer with unknown purpose' },
      { kind: 'MONEY_POSITION_SCOPE_PARTIAL', ref: 'v_money_position', reason: 'partial scope' },
    ],
    explain: [],
  }
}

function wrap(title: string, markup: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>`
    + `<script src="https://cdn.tailwindcss.com"></script></head><body class="bg-gray-50">${markup}</body></html>`
}

describe('PartnerReportBView (Stage 2 gating)', () => {
  it('PENDING dto: never asserts a final debtor/creditor', () => {
    const dto = baseDto()
    const html = renderToStaticMarkup(<PartnerReportBView dto={dto} />)
    expect(html).toContain('data-certification="PENDING_RECONCILIATION"')
    expect(html).toContain('not certified')
    expect(html).not.toMatch(/owes\s+Jacob\s+&euro;|owes Jacob €/)
    expect(html).toContain('Unresolved / Pending')
    // Stage 2 additions render
    expect(html).toContain('Runtime classification summary')
    expect(html).toContain('current account')
    try { fs.writeFileSync('/tmp/prb_render_pending.html', wrap('Partner Report B — Stage 2 (PENDING)', html)) } catch { /* best effort */ }
  })

  it('CERTIFIED dto: asserts the debtor/creditor headline', () => {
    const dto = baseDto()
    const certified: PartnerReportB = {
      ...dto,
      equalization: {
        ...dto.equalization,
        epYossi: -2000, epJacob: 2000, symmetryResidual: 0,
        headline: { debtor: 'Yossi', creditor: 'Jacob', amountEur: 2000, certificationStatus: 'CERTIFIED', canAssertDebtorCreditor: true, blockingReasons: [] },
        unresolvedCount: 0,
      },
      unresolved: [],
    }
    const html = renderToStaticMarkup(<PartnerReportBView dto={certified} />)
    expect(html).toContain('data-certification="CERTIFIED"')
    expect(html).toMatch(/Yossi owes Jacob/)
    try { fs.writeFileSync('/tmp/prb_render_certified.html', wrap('Partner Report B — CERTIFIED sample', html)) } catch { /* best effort */ }
  })

  it('CERTIFIED status but canAssertDebtorCreditor=false: does NOT render a debtor/creditor sentence (gate not bypassable)', () => {
    const dto = baseDto()
    const bypass: PartnerReportB = {
      ...dto,
      equalization: {
        ...dto.equalization,
        epYossi: -2000, epJacob: 2000, symmetryResidual: 0,
        headline: { debtor: 'Yossi', creditor: 'Jacob', amountEur: 2000, certificationStatus: 'CERTIFIED', canAssertDebtorCreditor: false, blockingReasons: [] },
        unresolvedCount: 0,
      },
      unresolved: [],
    }
    const html = renderToStaticMarkup(<PartnerReportBView dto={bypass} />)
    expect(html).not.toMatch(/Yossi owes Jacob/)
    expect(html).toContain('not certified')
  })
})
