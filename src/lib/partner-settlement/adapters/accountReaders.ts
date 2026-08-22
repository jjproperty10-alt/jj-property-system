/**
 * @module partner-settlement/adapters/accountReaders
 * @description READ-ONLY per-account reader. Reuses the certified RC3 engine
 * (fetchRC3Report) unchanged — no re-derivation of P&L (11c / 12).
 *
 * Stage 1 honesty:
 *  - income/expenses come from the certified RC3 sections.
 *  - economic PROFIT is left null and flagged ACCOUNT_PROFIT_PENDING (profit authority
 *    wiring — v_client_property_ledger / v_jj_profit_distributions — is Stage 2/3).
 *  - Airbnb is flagged for STR reconciliation (certified STR engine owns economics; 12e).
 *  - Purchase is cost/investment only, never profit (12d).
 *  - Partner/ownership splits are null (PENDING) — computed only in Stage 3.
 *  - Cash attribution by party is Stage 2/3 (needs transaction grouping) -> null here.
 */

import 'server-only'
import { fetchRC3Report } from '@/lib/report/fetchReport'
import type { AccountType, AccountView, UnresolvedItem, ExplainNode } from '../partnerReportBTypes'

/** Minimal shape we read from an RC3 account section (decoupled from engine internals). */
interface Rc3SectionLike {
  account_type: string
  account_label?: string | null
  balance_convention?: string | null
  total_income?: number | null
  total_expenses?: number | null
  closing_balance?: number | null
  contract_baseline?: number | null
}

const RC3_TO_ACCOUNT: Record<string, AccountType> = {
  rental: 'management',
  airbnb: 'airbnb',
  renovation: 'renovation',
  sale: 'sale',
  purchase: 'purchase',
}

const CLIENT_DEBT = new Set(['renovation', 'sale', 'purchase'])

export async function readPropertyAccounts(reportingName: string, fromDate?: string, toDate?: string): Promise<AccountView[]> {
  let report: { accounts?: Rc3SectionLike[] } | null = null
  try {
    report = (await fetchRC3Report({ reportingName, fromDate, toDate })) as unknown as { accounts?: Rc3SectionLike[] }
  } catch {
    return []
  }
  const sections = report?.accounts ?? []
  const views: AccountView[] = []

  for (const s of sections) {
    const accountType = RC3_TO_ACCOUNT[s.account_type]
    if (!accountType) continue // JJ/General/Transfer are not owner-facing RC3 accounts

    const income = s.total_income ?? null
    const expenses = s.total_expenses ?? null
    const closing = s.closing_balance ?? null
    const isClientDebt = CLIENT_DEBT.has(s.account_type)
    const src = { system: `v_rc3_${s.account_type}`, ref: reportingName }

    const unresolved: UnresolvedItem[] = [{
      kind: 'ACCOUNT_PROFIT_PENDING',
      ref: `${reportingName} / ${accountType}`,
      reason: 'economic profit authority not wired (Stage 2/3)',
      sourceRef: src,
    }]
    if (accountType === 'airbnb') {
      unresolved.push({
        kind: 'ACCOUNT_PROFIT_PENDING',
        ref: `${reportingName} / airbnb`,
        reason: 'STR economics owned by certified STR engine; RC3 airbnb is legacy fallback — reconcile (12e)',
        sourceRef: { system: 'ownerStrStatementService', ref: reportingName },
      })
    }

    const explain: ExplainNode[] = [
      { label: 'income', amountEur: income, tracesTo: [src] },
      { label: 'expenses', amountEur: expenses, tracesTo: [src] },
      { label: 'closing_balance', amountEur: closing, tracesTo: [src] },
    ]

    views.push({
      accountType,
      economic: {
        income,
        expenses,
        profitOrLoss: null, // Stage 1: profit authority pending (never guessed)
        status: accountType === 'airbnb' ? 'PARTIAL' : accountType === 'purchase' ? 'CERTIFIED' : 'CERTIFIED',
        sourceRef: src,
      },
      cash: { received: null, paid: null, byParty: [], sourceRef: { system: 'public.transactions', note: 'per-party cash attribution: Stage 2/3' } },
      rights: {
        contractValue: isClientDebt ? (s.contract_baseline ?? null) : null,
        received: isClientDebt ? (expenses ?? null) : null, // client_debt: expenses = client payments received
        receivable: isClientDebt ? closing : null,
        payables: null,
        commitments: null, // no certified forward-commitment source (11k blocker 6)
        status: isClientDebt ? 'CERTIFIED' : 'PARTIAL',
        sourceRef: src,
      },
      ownerEntitlement: !isClientDebt ? closing : null, // owner_credit closing = JJ owes owner
      externalShare: null,
      jjShare: null,
      partnerShares: { yossi: null, jacob: null },
      residualToRollUp: null,
      unresolved,
      explain,
      status: 'PENDING', // consolidated account certification pending Stage 3
    })
  }

  return views
}
