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
  TX,
  VM1_CANONICAL_CLASSIFICATION,
  aviGoldenPresentIds,
} from './aviGoldenFixture'
import {
  AVI_VM1_CHARGES,
  AVI_VM1_LAYER_INPUTS,
  AVI_VM1_OWNERS,
  AVI_VM1_PREMIUM,
  AVI_VM1_PURCHASE_EXPENSE_ROWS,
  AVI_VM1_RENOVATION_FUNDING_PAYMENT_IDS,
  AVI_VM1_REQUIRED_CONTROLS,
  AVI_VM1_REQUIRED_PURCHASE_EXPENSE_PAYMENTS,
} from '@/lib/partner-settlement/external-partner/externalPartnerAviConfig'

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

/**
 * The production Avi configuration, run against the 202-row canonical evidence.
 * Amounts are imported from the config rather than restated so the fixture
 * cannot certify an identity the product no longer uses.
 */
export function approvedComposeInputFromCanonicalEvidence(): ComposeAviReportInput {
  return {
    owners: AVI_VM1_OWNERS,
    charges: AVI_VM1_CHARGES,
    premium: AVI_VM1_PREMIUM,
    evidence: VM1_CANONICAL_CLASSIFICATION,
    requiredControls: AVI_VM1_REQUIRED_CONTROLS,
    controlInput: {
      evidence: VM1_CANONICAL_CLASSIFICATION,
      expectedEvidence: VM1_CANONICAL_CLASSIFICATION,
      purchaseExpenseRows: [...AVI_VM1_PURCHASE_EXPENSE_ROWS],
      requiredPurchaseExpensePayments: [...AVI_VM1_REQUIRED_PURCHASE_EXPENSE_PAYMENTS],
      purchaseExpensesAuthoritativeEur: AVI_VM1_REQUIRED_CONTROLS.deal_expenses,
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
    layerInputs: AVI_VM1_LAYER_INPUTS,
    renovationFundingPaymentIds: AVI_VM1_RENOVATION_FUNDING_PAYMENT_IDS,
  }
}
