/**
 * @module partner-settlement/external-partner/externalPartnerAviService
 * @description Read-only service/DTO composer for the JJ staff External Partner
 * report for Avi, property_name='Villa Mazotos'.
 *
 * Uses Commit 1 formulas, 2A (reader), and 2B (attribution). A Certified Avi
 * report must match the single approved identity (paid €280,600, credits
 * €19,640.34, obligation €300,620.84, net −€380.50). Pre-Hostaway formula
 * inputs (−€18,900.84) fail closed and never attach partners, layers, or print copy.
 *
 * Not imported by routes. No UI, PDF, Partner B, RC3, or lifecycle dependency.
 */

import {
  composeExternalPartnerSettlement,
  composeExternalPartnerLayerComponents,
} from './compose'
import {
  composeExternalPartnerBilledActivity,
} from './billedActivity'
import { composeExternalPartnerDealExpense } from './dealExpense'
import { reconcileExternalPartnerControls } from './controlReconciliation'
import {
  applyAviFundingAttribution,
  attributedAviPaymentIdSet,
} from './externalPartnerAttribution'
import type {
  ExternalPartnerAttributedAmountControl,
  ExternalPartnerCorrectionLineageEntry,
} from './externalPartnerAttribution'
import {
  readExternalPartnerTransactionViews,
} from './externalPartnerReader'
import { VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT } from './externalPartnerSnapshot'
import type { RawExternalPartnerTransaction } from './externalPartnerReadTypes'
import type { ExternalPartnerControlInput } from './controlReconciliation'
import type {
  ExternalPartnerSettlementInput,
  ExternalPartnerOwner,
  ExternalPartnerEvidence,
} from './types'
import type {
  ExternalPartnerAviReport,
  AviReportPartnerSummary,
  AviReportPartnerPayment,
  AviReportSnapshotMeta,
  AviReportControlStatus,
} from './externalPartnerAviReportTypes'
import {
  formatAviIsOwed,
  formatAviOwes,
  projectAviExpenseCompleteness,
  projectAviVisibleAcquisition,
  projectAviVisibleExpenseTotals,
  projectAviVisibleExpenses,
  projectAviVisibleLayers,
  projectAviVisiblePayments,
} from './externalPartnerAviVisible'
import { composeAviAirbnbCredits } from './hostawayPrintedNto'
import { aviCertifiedIdentityFailures } from './aviCertifiedIdentity'

export interface ComposeAviReportInput {
  readonly owners: readonly ExternalPartnerOwner[]
  readonly charges: ExternalPartnerSettlementInput['charges']
  readonly premium: ExternalPartnerSettlementInput['premium']
  readonly evidence: ExternalPartnerEvidence
  readonly requiredControls: ExternalPartnerSettlementInput['requiredControls']
  readonly controlInput: ExternalPartnerControlInput
  readonly expectedAttributedAmounts: readonly ExternalPartnerAttributedAmountControl[]
  readonly correctionLineage?: readonly ExternalPartnerCorrectionLineageEntry[]
  readonly transactionRows: readonly RawExternalPartnerTransaction[]
  readonly layerInputs: {
    readonly renovation: { clientCharge: number; actualCost: number; jjProfit: number; aviFunding: number }
    readonly airbnb: { clientCharge: number; actualCost: number; jjProfit: number; aviCredit: number }
    readonly management: { clientCharge: number; actualCost: number; jjProfit: number }
    readonly dealExpense: { total: number; aviPayment: number; jacobConduit: number }
  }
}

function buildSnapshotMeta(): AviReportSnapshotMeta {
  return {
    propertyName: 'Villa Mazotos',
    cutoffDate: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.cutoffDate,
    approvedRowCount: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.approvedRowCount,
    version: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.version,
    sha256: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.sha256,
  }
}

function failedReport(
  controlStatus: AviReportControlStatus,
  failures: readonly string[],
): ExternalPartnerAviReport {
  return {
    status: 'failed',
    property: 'Villa Mazotos',
    controlStatus,
    failures,
  }
}

export function composeExternalPartnerAviReport(
  input: ComposeAviReportInput,
): ExternalPartnerAviReport {
  const allFailures: string[] = []

  const attribution = applyAviFundingAttribution(input.transactionRows, {
    expectedAttributedAmounts: input.expectedAttributedAmounts,
    correctionLineage: input.correctionLineage,
  })
  const attributionOk = attribution.status === 'ok'
  if (!attributionOk) {
    allFailures.push(...attribution.failures)
  }

  const controlResult = reconcileExternalPartnerControls({
    ...input.controlInput,
    expectedAttributedAmounts: input.expectedAttributedAmounts,
    attributedFundingRows: input.transactionRows,
    correctionLineage: input.correctionLineage,
  })
  const reconciliationPassed = controlResult.status === 'passed'
  if (!reconciliationPassed) {
    allFailures.push(...controlResult.failures.filter((f) => !allFailures.includes(f)))
  }

  const paidAvi = attributionOk ? attribution.paidEurAvi : Number.NaN
  const settlement = composeExternalPartnerSettlement({
    property: 'Villa Mazotos',
    cutoffDate: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.cutoffDate,
    owners: input.owners,
    charges: input.charges,
    premium: input.premium,
    paid: { Avi: paidAvi },
    fundingAttribution: attribution,
    evidence: input.evidence,
    requiredControls: input.requiredControls,
    settlePartners: ['Avi'],
  })
  const settlementComputed = settlement.status === 'computed'
  if (!settlementComputed && settlement.status === 'failed') {
    for (const r of settlement.failureReasons) {
      if (!allFailures.includes(r)) allFailures.push(r)
    }
  }

  const controlStatus: AviReportControlStatus = {
    reconciliationPassed,
    settlementComputed,
    attributionOk,
    failures: allFailures,
  }

  if (!attributionOk || !reconciliationPassed || !settlementComputed) {
    return failedReport(controlStatus, allFailures)
  }

  const aviShare = settlement.status === 'computed'
    ? settlement.shares.find((s) => s.partner === 'Avi')
    : undefined
  if (!aviShare) {
    return failedReport(controlStatus, ['avi_share_missing_after_compute'])
  }

  const identityFailures = aviCertifiedIdentityFailures({
    paidEur: aviShare.paidEur,
    creditsEur: aviShare.credits.totalEur,
    obligationEur: aviShare.obligation.totalEur,
    netEur: aviShare.netEur,
  })
  if (identityFailures.length > 0) {
    const failures = [...allFailures, ...identityFailures]
    return failedReport({ ...controlStatus, failures }, failures)
  }

  const li = input.layerInputs
  const renovation = composeExternalPartnerBilledActivity({
    kind: 'renovation',
    clientCharge: li.renovation.clientCharge,
    actualCost: li.renovation.actualCost,
    distributableJjProfit: li.renovation.jjProfit,
    funding: { Avi: li.renovation.aviFunding, Yossi: null, Jacob: null },
    owners: input.owners,
  })
  const airbnb = composeExternalPartnerBilledActivity({
    kind: 'airbnb',
    clientCharge: li.airbnb.clientCharge,
    actualCost: li.airbnb.actualCost,
    distributableJjProfit: li.airbnb.jjProfit,
    funding: { Avi: li.airbnb.aviCredit, Yossi: null, Jacob: null },
    owners: input.owners,
  })
  const management = composeExternalPartnerBilledActivity({
    kind: 'management',
    clientCharge: li.management.clientCharge,
    actualCost: li.management.actualCost,
    distributableJjProfit: li.management.jjProfit,
    funding: { Avi: 0, Yossi: null, Jacob: null },
    owners: input.owners,
  })
  const dealExpense = composeExternalPartnerDealExpense({
    totalDealExpenses: li.dealExpense.total,
    owners: input.owners,
    paymentsTowardExpenses: { Avi: li.dealExpense.aviPayment },
    conduitReceipts: { Jacob: li.dealExpense.jacobConduit },
  })
  const components = composeExternalPartnerLayerComponents('Avi', {
    renovation, airbnb, management, dealExpense,
  })
  if ('status' in components) {
    return failedReport(controlStatus, [...allFailures, ...components.failureReasons])
  }

  const acquisition = projectAviVisibleAcquisition(aviShare)
  if ('status' in acquisition) {
    return failedReport(controlStatus, [...allFailures, acquisition.reason])
  }

  const layers = projectAviVisibleLayers(
    acquisition,
    renovation,
    airbnb,
    management,
    dealExpense,
  )

  const partners: AviReportPartnerSummary[] = input.owners.map((o) => {
    if (o.partner === 'Avi') {
      const semanticNet = aviShare.direction === 'to_pay'
        ? formatAviOwes(aviShare.netEur)
        : aviShare.direction === 'to_refund'
          ? formatAviIsOwed(aviShare.netEur)
          : 'Settled'
      return {
        partner: 'Avi',
        ownershipPct: o.ownershipPct,
        isJjPrincipal: false,
        status: 'CERTIFIED' as const,
        paidEur: aviShare.paidEur,
        creditsEur: aviShare.credits.totalEur,
        obligationEur: aviShare.obligation.totalEur,
        netEur: aviShare.netEur,
        direction: aviShare.direction,
        semanticNet,
      }
    }
    return {
      partner: o.partner,
      ownershipPct: o.ownershipPct,
      isJjPrincipal: o.isJjPrincipal,
      status: 'PROVISIONAL' as const,
      paidEur: null,
      creditsEur: null,
      obligationEur: null,
      netEur: null,
      direction: null,
      semanticNet: null,
    }
  })

  const overlay = attributedAviPaymentIdSet(attribution)
  const views = readExternalPartnerTransactionViews(input.transactionRows, {
    attributedAviPaymentIds: overlay,
  })

  const partnerPayments: AviReportPartnerPayment[] = projectAviVisiblePayments(
    views.partnerVisible.payments.map((p) => ({
      id: p.id,
      date: p.date,
      amountEur: p.amountEur,
      label: 'Partner funding' as const,
      payer: 'Avi' as const,
    })),
  )
  const paymentIds = new Set(partnerPayments.map((p) => p.id))
  const partnerExpenses = projectAviVisibleExpenses(
    views.internal.rows,
    paymentIds,
    aviShare.ownershipPct,
  )
  const visibleExpenseTotals = projectAviVisibleExpenseTotals(layers, partnerExpenses)
  if ('status' in visibleExpenseTotals) {
    return failedReport(controlStatus, [...allFailures, visibleExpenseTotals.reason])
  }
  const expenseCompleteness = projectAviExpenseCompleteness(layers, partnerExpenses)

  return {
    status: 'certified',
    property: 'Villa Mazotos',
    snapshot: buildSnapshotMeta(),
    controlStatus,
    partners,
    acquisition,
    layers,
    visibleExpenseTotals,
    expenseCompleteness,
    partnerPayments,
    partnerExpenses,
    airbnbCredits: composeAviAirbnbCredits(),
  }
}
