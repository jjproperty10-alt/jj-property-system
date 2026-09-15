/**
 * Test-only: load the approved 202-row classification as compose input rows.
 * Production buildAviExternalPartnerReport reads live transactions, not this file.
 */
import * as fs from 'fs'
import * as path from 'path'
import type { ComposeAviReportInput } from '@/lib/partner-settlement/external-partner'
import type { RawExternalPartnerTransaction } from '@/lib/partner-settlement/external-partner'
import {
  AMOUNTS,
  AVI_OWNERS,
  PURCHASE_EXPENSE_ROWS,
  REQUIRED_PURCHASE_EXPENSE_PAYMENTS,
  TX,
  VM1_CANONICAL_CLASSIFICATION,
  aviGoldenPresentIds,
} from './aviGoldenFixture'

const APPROVED = {
  airbnbCharge: 14727.53,
  airbnbCost: 13133.53,
  jjAirbnbProfit: 1594,
  management: 0,
  income: 39280.67,
  aviCredit: 19640.34,
} as const

export function loadCanonicalVm1RawTransactions(): RawExternalPartnerTransaction[] {
  const csvPath = path.join(process.cwd(), VM1_CANONICAL_CLASSIFICATION.classificationArtifact)
  const text = fs.readFileSync(csvPath, 'utf8').replace(/\r\n/g, '\n')
  const lines = text.trim().split('\n')
  const header = lines[0].split(',')
  const idx = (name: string) => header.indexOf(name)
  return lines.slice(1).map((line) => {
    const cols = line.split(',')
    return {
      id: cols[idx('txn_id')],
      date: cols[idx('date')],
      property_name: 'Villa Mazotos',
      category: cols[idx('category')] || null,
      subcategory: cols[idx('subcategory')] || null,
      description: null,
      payer: cols[idx('payer')] || null,
      payee: cols[idx('payee')] || null,
      amount_eur: Number(cols[idx('amount_eur')]),
      client_charge: Number(cols[idx('client_charge')]),
      notes: null,
      k_note: null,
      is_deleted: false,
      review_status: 'active',
    }
  })
}

/** Same approved identity as aviApprovedPrintedNto, with 202-row evidence rows. */
export function approvedComposeInputFromCanonicalEvidence(): ComposeAviReportInput {
  return {
    owners: AVI_OWNERS,
    charges: [
      { key: 'purchase_cost', label: 'Purchase cost', total: AMOUNTS.purchaseContract },
      { key: 'deal_expenses', label: 'Deal expenses', total: AMOUNTS.purchaseExpenses },
      { key: 'renovation', label: 'Renovation', total: AMOUNTS.renovation, jjProfit: 0 },
      {
        key: 'airbnb',
        label: 'Airbnb',
        total: APPROVED.airbnbCharge,
        jjProfit: APPROVED.jjAirbnbProfit,
        income: APPROVED.income,
      },
      { key: 'management', label: 'Management', total: APPROVED.management, jjProfit: 0 },
    ],
    premium: { totalEur: AMOUNTS.aviPremium, paidBy: 'Avi', receivedBy: { Yossi: AMOUNTS.aviPremium } },
    evidence: VM1_CANONICAL_CLASSIFICATION,
    requiredControls: {
      purchase_cost: AMOUNTS.purchaseContract,
      deal_expenses: AMOUNTS.purchaseExpenses,
      renovation: AMOUNTS.renovation,
      airbnb: APPROVED.airbnbCharge,
      management: APPROVED.management,
      premium: AMOUNTS.aviPremium,
    },
    controlInput: {
      evidence: VM1_CANONICAL_CLASSIFICATION,
      expectedEvidence: VM1_CANONICAL_CLASSIFICATION,
      purchaseExpenseRows: [...PURCHASE_EXPENSE_ROWS],
      requiredPurchaseExpensePayments: [...REQUIRED_PURCHASE_EXPENSE_PAYMENTS],
      purchaseExpensesAuthoritativeEur: AMOUNTS.purchaseExpenses,
      renovationTotalEur: AMOUNTS.renovation,
      renovationAuthoritativeEur: AMOUNTS.renovation,
      presentIds: aviGoldenPresentIds(),
      mustIncludeOnce: [TX.germanWorkerOnce],
      mustExclude: [TX.germanWorkerDeletedDuplicate],
    },
    expectedAttributedAmounts: [
      { id: TX.aviToJacob, amountEur: AMOUNTS.aviToJacob },
      { id: TX.aviReno5000, amountEur: AMOUNTS.aviReno5000 },
      { id: TX.aviReno20000, amountEur: AMOUNTS.aviReno20000 },
    ],
    transactionRows: loadCanonicalVm1RawTransactions(),
    layerInputs: {
      renovation: {
        clientCharge: AMOUNTS.renovation,
        actualCost: AMOUNTS.renovation,
        jjProfit: 0,
        aviFunding: AMOUNTS.aviRenoFinancing,
      },
      airbnb: {
        clientCharge: APPROVED.airbnbCharge,
        actualCost: APPROVED.airbnbCost,
        jjProfit: APPROVED.jjAirbnbProfit,
        aviCredit: APPROVED.aviCredit,
      },
      management: {
        clientCharge: APPROVED.management,
        actualCost: APPROVED.management,
        jjProfit: 0,
      },
      dealExpense: {
        total: AMOUNTS.purchaseExpenses,
        aviPayment: AMOUNTS.aviToJacob,
        jacobConduit: AMOUNTS.aviToJacob,
      },
    },
  }
}
