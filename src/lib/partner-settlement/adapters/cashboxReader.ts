/**
 * @module partner-settlement/adapters/cashboxReader
 * @description READ-ONLY cashbox adapter.
 *
 * v_cashbox_audit = LEDGER/custody position (NOT verified available cash, 12b).
 * v_anastasia_clearing = cash custodian (Anastasia is a CASH_CUSTODIAN, not a partner).
 * No authoritative bank/physical reconciliation source exists today -> verified = null,
 * verificationStatus = LEDGER_ONLY.
 */

import 'server-only'
import { createServiceClient } from '@/lib/supabase'
import { computeCashVerification } from '../cashStatus'
import type { CashboxView } from '../partnerReportBTypes'

interface CashboxRow {
  cash_box_name: string
  balance: number | null
  total_received: number | null
  total_paid: number | null
}

export async function readCashboxes(): Promise<CashboxView[]> {
  const db = createServiceClient()
  const views: CashboxView[] = []

  const { data: boxes } = await db
    .from('v_cashbox_audit')
    .select('cash_box_name, balance, total_received, total_paid')

  for (const row of ((boxes as CashboxRow[]) ?? [])) {
    const ledger = row.balance ?? null
    const v = computeCashVerification(ledger, null)
    views.push({
      name: row.cash_box_name,
      kind: 'cash_holder',
      ledgerCashPosition: ledger,
      verifiedBankOrPhysicalCash: null,
      reconciliationDifference: v.reconciliationDifference,
      verificationStatus: v.verificationStatus,
      sourceRef: { system: 'v_cashbox_audit', ref: row.cash_box_name, note: 'ledger position; not verified cash' },
    })
  }

  // Anastasia — cash custodian (separate view)
  try {
    const { data: ana } = await db
      .from('v_anastasia_clearing')
      .select('cash_on_hand, anastasia_owes_jj, jj_owes_anastasia')
      .maybeSingle()
    if (ana) {
      const a = ana as { cash_on_hand: number | null }
      const ledger = a.cash_on_hand ?? null
      const v = computeCashVerification(ledger, null)
      views.push({
        name: 'Anastasia (custodian)',
        kind: 'custodian',
        ledgerCashPosition: ledger,
        verifiedBankOrPhysicalCash: null,
        reconciliationDifference: v.reconciliationDifference,
        verificationStatus: v.verificationStatus,
        sourceRef: { system: 'v_anastasia_clearing', note: 'cash custodian, not a partner' },
        note: 'Cash custodian — excluded from partner equalization',
      })
    }
  } catch {
    // view unavailable — skip; custodian remains unrepresented (not an error in Stage 1)
  }

  return views
}
