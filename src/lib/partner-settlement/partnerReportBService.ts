/**
 * @module partner-settlement/partnerReportBService
 * @description READ-ONLY Stage 1 orchestrator. Assembles PartnerReportB from the
 * read adapters, builds the UNRESOLVED/PENDING queue, and gates the headline.
 *
 * Stage 1 NEVER surfaces a certified consolidated Yossi<->Jacob result: the
 * equalization is not computed (classification/ownership/profit incomplete), so the
 * gate returns PENDING_RECONCILIATION and no debtor/creditor is asserted.
 * No writes. Server-only.
 */

import 'server-only'
import { createServiceClient } from '@/lib/supabase'
import { readCashboxes } from './adapters/cashboxReader'
import { readReceivables } from './adapters/receivablesReader'
import { readOwnership } from './adapters/ownershipReader'
import { readProperties } from './adapters/propertyReader'
import { readPropertyAccounts } from './adapters/accountReaders'
import { evaluateHeadlineGate } from './headlineGate'
import type {
  PartnerReportB, PropertyView, UnresolvedItem, CashboxView, JjPosition,
  PartnerCurrentAccount, EqualizationView, OwnershipShare,
} from './partnerReportBTypes'

export interface BuildOptions {
  readonly periodStart: string
  readonly periodEnd: string
  readonly generatedAt: string // pass in (no Date.now in pure paths); route supplies it
  readonly maxProperties?: number
}

export async function buildPartnerReportB(opts: BuildOptions): Promise<PartnerReportB> {
  const { periodStart, periodEnd, generatedAt } = opts

  const [cashboxes, receivables, ownershipByProp, properties] = await Promise.all([
    readCashboxes(),
    readReceivables(),
    readOwnership(),
    readProperties(),
  ])

  const unresolved: UnresolvedItem[] = []
  const propertyViews: PropertyView[] = []

  const propList = opts.maxProperties ? properties.slice(0, opts.maxProperties) : properties
  for (const p of propList) {
    const accounts = await readPropertyAccounts(p.reportingName, periodStart, periodEnd)
    const own = ownershipByProp.get(p.reportingName)
    const shares: readonly OwnershipShare[] = own?.shares ?? []
    const propUnresolved: UnresolvedItem[] = []

    if (!own || own.pending || shares.length === 0) {
      propUnresolved.push({
        kind: 'OWNERSHIP_PENDING',
        ref: p.reportingName,
        reason: shares.length === 0
          ? 'no confirmed ownership_period rows'
          : 'ownership pending_verification / missing effective dates',
        sourceRef: { system: 'lifecycle.ownership_period', ref: p.reportingName },
      })
    }
    for (const a of accounts) propUnresolved.push(...a.unresolved)

    propertyViews.push({
      propertyName: p.reportingName,
      relationshipType: p.relationshipType,
      ownership: shares,
      accounts,
      unresolved: propUnresolved,
      status: 'PENDING',
    })
    unresolved.push(...propUnresolved)
  }

  // Receivables scope caveat (12c)
  unresolved.push({
    kind: 'MONEY_POSITION_SCOPE_PARTIAL',
    ref: 'v_money_position',
    reason: `receivables/payables authoritative only for covered scope: [${receivables.coveredCounterpartyTypes.join(', ') || 'n/a'}]; partner accounts / suppliers / forward commitments not fully covered`,
    sourceRef: { system: 'v_money_position' },
  })
  // Forward commitments have no certified source (11k blocker 6)
  unresolved.push({
    kind: 'FORWARD_COMMITMENT_SOURCE_MISSING',
    ref: 'forward-commitments',
    reason: 'no certified source for future rent payable / forward receivables',
  })
  // Cash unverified (12b)
  if (cashboxes.some(c => c.verificationStatus === 'LEDGER_ONLY')) {
    unresolved.push({
      kind: 'CASH_UNVERIFIED',
      ref: 'cashboxes',
      reason: 'ledger positions not reconciled to bank/physical count',
      sourceRef: { system: 'v_cashbox_audit' },
    })
  }

  // JJ position (economic profit PENDING — v_jj_company_pl not the authoritative partner-profit basis; unwired)
  const jjPosition = await buildJjPosition(cashboxes, receivables)

  // Partner current accounts — Stage 1: ledger figures only, not certified
  const partnerCurrentAccounts: PartnerCurrentAccount[] = ['Yossi', 'Jacob'].map(party => {
    const box = cashboxes.find(c => c.name.toLowerCase() === party.toLowerCase())
    return {
      party,
      ledgerBalanceEur: box?.ledgerCashPosition ?? null,
      status: 'PENDING',
      explain: box
        ? [{ label: `${party} ledger cash`, amountEur: box.ledgerCashPosition, tracesTo: [box.sourceRef] }]
        : [],
    }
  })

  // Equalization — NOT computed in Stage 1; gate blocks the headline
  const gate = evaluateHeadlineGate({
    unresolvedItems: unresolved,
    ownershipPending: propertyViews.some(pv => pv.unresolved.some(u => u.kind === 'OWNERSHIP_PENDING')),
    accountProfitPending: unresolved.some(u => u.kind === 'ACCOUNT_PROFIT_PENDING'),
    ownerBalanceUnreconciled: true, // 3 differing owner-balance sources (11k blocker 3)
    cashUnverified: true,
    moneyPositionPartial: true,
    symmetryResidualEur: null, // equalization not computed in Stage 1
  })

  const equalization: EqualizationView = {
    epYossi: null,
    epJacob: null,
    symmetryResidual: null,
    headline: {
      debtor: null,
      creditor: null,
      amountEur: null,
      certificationStatus: gate.certificationStatus,
      blockingReasons: gate.blockingReasons,
    },
    certifiedSubtotalEur: null,
    unresolvedCount: unresolved.length,
    unresolvedAmountEur: null,
    components: [],
  }

  return {
    meta: {
      schemaVersion: 'PartnerReportB/stage1',
      periodStart, periodEnd, generatedAt, currency: 'EUR', stage: 1,
    },
    properties: propertyViews,
    cashboxes,
    jjPosition,
    partnerCurrentAccounts,
    equalization,
    opening: { value: null, status: 'PENDING_RECONCILIATION' },
    closing: { value: null, status: 'PENDING_RECONCILIATION' },
    unresolved,
    explain: [],
  }
}

async function buildJjPosition(
  cashboxes: readonly CashboxView[],
  receivables: { receivableToJjEur: number | null; payableByJjEur: number | null },
): Promise<JjPosition> {
  const db = createServiceClient()
  let economicProfit: number | null = null
  try {
    const { data } = await db.from('v_jj_company_pl').select('net_company_pl').maybeSingle()
    economicProfit = (data as { net_company_pl: number | null } | null)?.net_company_pl ?? null
  } catch {
    economicProfit = null
  }
  const jjBox = cashboxes.find(c => c.name.toLowerCase() === 'jj')
  return {
    economicProfit,
    economicProfitStatus: 'PENDING', // v_jj_company_pl not the authoritative partner-profit basis (unwired)
    actualCashLedger: jjBox?.ledgerCashPosition ?? null,
    cashVerificationStatus: jjBox?.verificationStatus ?? 'LEDGER_ONLY',
    receivables: receivables.receivableToJjEur,
    payables: receivables.payableByJjEur,
    receivablesScope: 'PARTIAL',
    sourceRefs: [
      { system: 'v_jj_company_pl' },
      { system: 'v_cashbox_audit', ref: 'JJ' },
      { system: 'v_money_position' },
    ],
  }
}
