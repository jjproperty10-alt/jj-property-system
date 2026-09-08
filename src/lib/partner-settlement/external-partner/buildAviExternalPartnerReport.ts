/**
 * @module partner-settlement/external-partner/buildAviExternalPartnerReport
 * @description Server-only orchestrator that fetches Villa Mazotos transactions
 * and composes the certified Avi External Partner report DTO.
 *
 * Read-only. No mutations. No Partner B, RC3, lifecycle, or PDF dependency.
 */

import 'server-only'
import { fetchVillaMazotosTransactionsForExternalPartner } from './externalPartnerTransactionsSource'
import { composeExternalPartnerAviReport } from './externalPartnerAviService'
import { VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT } from './externalPartnerSnapshot'
import {
  AVI_VM1_OWNERS,
  AVI_VM1_CHARGES,
  AVI_VM1_PREMIUM,
  AVI_VM1_REQUIRED_CONTROLS,
  AVI_VM1_LAYER_INPUTS,
  AVI_VM1_ATTRIBUTED_AMOUNT_CONTROLS,
  AVI_VM1_RENOVATION_FUNDING_PAYMENT_IDS,
  buildAviVm1ControlInput,
} from './externalPartnerAviConfig'
import type { ExternalPartnerAviReport } from './externalPartnerAviReportTypes'

export async function buildAviExternalPartnerReport(): Promise<ExternalPartnerAviReport> {
  const fetchResult = await fetchVillaMazotosTransactionsForExternalPartner()

  if (fetchResult.status === 'failed') {
    return {
      status: 'failed',
      property: 'Villa Mazotos',
      controlStatus: {
        reconciliationPassed: false,
        settlementComputed: false,
        attributionOk: false,
        failures: [`data_source_failed: ${fetchResult.reason}`],
      },
      failures: [`data_source_failed: ${fetchResult.reason}`],
    }
  }

  const rows = fetchResult.rows
  const presentIds = rows.map((r) => r.id)
  const evidence = {
    classificationArtifact: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.classificationArtifact,
    sha256: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.sha256,
    rowCount: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.approvedRowCount,
    version: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.version,
  }

  return composeExternalPartnerAviReport({
    owners: AVI_VM1_OWNERS,
    charges: AVI_VM1_CHARGES,
    premium: AVI_VM1_PREMIUM,
    evidence,
    requiredControls: AVI_VM1_REQUIRED_CONTROLS,
    controlInput: buildAviVm1ControlInput(evidence, presentIds),
    expectedAttributedAmounts: [...AVI_VM1_ATTRIBUTED_AMOUNT_CONTROLS],
    transactionRows: rows,
    layerInputs: AVI_VM1_LAYER_INPUTS,
    renovationFundingPaymentIds: AVI_VM1_RENOVATION_FUNDING_PAYMENT_IDS,
  })
}
