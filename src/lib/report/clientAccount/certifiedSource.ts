/**
 * Pure mapping from the certified client settlement reader payload and raw ledger rows to a
 * CompositionInput. This is the universal source contract: every client enters the engine here.
 * Client-specific evidence (approved wording, certified supplements, linked historical rows)
 * arrives through ClientEvidenceOverrides supplied by the client's adapter — never from this file.
 */

import type { CertifiedClientSettlementAvailable, CertifiedClientSettlementDto } from '../../finance/certifiedClientSettlementTypes'
import { ClientAccountBlock } from './composeCertifiedAccount'
import type {
  CertifiedStrMonthlySection,
  CertifiedStrMonthlyUnavailable,
  CompositionInput,
  LedgerRow,
  ReportPeriod,
  ReportType,
} from './types'

/** Raw public.transactions row shape as returned by the service client (read-only). */
export interface RawTransactionRow {
  readonly id: string
  readonly date: string
  readonly property_name: string | null
  readonly category: string | null
  readonly subcategory: string | null
  readonly description: string | null
  readonly payer: string | null
  readonly payee: string | null
  readonly amount_eur: number | string
  readonly client_charge: number | string | null
  readonly review_status: string | null
  readonly is_deleted: boolean | null
}

export const TRANSACTION_COLUMNS = 'id,date,property_name,category,subcategory,description,payer,payee,amount_eur,client_charge,review_status,is_deleted'

function money(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Ledger row mapping. A non-numeric amount is a block, never a zero. */
export function toLedgerRow(row: RawTransactionRow): LedgerRow {
  const amount = money(row.amount_eur)
  if (amount == null) throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `transaction ${row.id}: amount is not numeric.`)
  const charge = row.client_charge == null || row.client_charge === '' ? null : money(row.client_charge)
  if (row.client_charge != null && row.client_charge !== '' && charge == null) {
    throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `transaction ${row.id}: client charge is not numeric.`)
  }
  return {
    id: row.id,
    date: String(row.date).slice(0, 10),
    propertyName: row.property_name,
    category: row.category,
    subcategory: row.subcategory,
    description: row.description,
    payer: row.payer,
    payee: row.payee,
    amountEur: amount,
    clientCharge: charge,
    reviewStatus: row.review_status,
    isDeleted: Boolean(row.is_deleted),
  }
}

/**
 * Client-specific evidence a report adapter may supply. Every field is optional and applies to
 * presentation or to certified supplements that the composer still reconciles to the cent.
 */
export interface ClientEvidenceOverrides {
  readonly linkedRowsByPropertyKey?: CompositionInput['linkedRowsByPropertyKey']
  readonly historicalSourceNamesByPropertyKey?: CompositionInput['historicalSourceNamesByPropertyKey']
  readonly strMonthsByPropertyKey?: CompositionInput['strMonthsByPropertyKey']
  readonly undatedChargeLabelByPropertyKey?: CompositionInput['undatedChargeLabelByPropertyKey']
  readonly purchaseSupplementsByPropertyKey?: CompositionInput['purchaseSupplementsByPropertyKey']
  readonly renovationNoteByPropertyKey?: CompositionInput['renovationNoteByPropertyKey']
  readonly creditLabels?: CompositionInput['creditLabels']
  readonly ownerRentMonthsByRowId?: CompositionInput['ownerRentMonthsByRowId']
  readonly descriptionByRowId?: CompositionInput['descriptionByRowId']
  readonly hebrewOwesForm?: CompositionInput['hebrewOwesForm']
  readonly displayGroups?: CompositionInput['displayGroups']
  readonly strLumpDescription?: string
}

export interface CertifiedCompositionRequest {
  readonly settlement: CertifiedClientSettlementDto
  readonly rows: readonly RawTransactionRow[]
  readonly clientDisplayName: string
  readonly reportTitle: string
  readonly reportLanguage?: 'he' | 'en'
  readonly reportType?: ReportType
  readonly period?: ReportPeriod
  readonly certifiedStrMonthlyByPropertyKey?: Readonly<Record<string, CertifiedStrMonthlySection | CertifiedStrMonthlyUnavailable>>
  readonly evidence?: ClientEvidenceOverrides
}

export type CertifiedCompositionResult =
  | { readonly status: 'ready'; readonly input: CompositionInput; readonly settlement: CertifiedClientSettlementAvailable }
  | { readonly status: 'blocked'; readonly code: 'NO_CERTIFIED_SOURCE' | 'BLOCKED_ACCOUNTING'; readonly reason: string }

/** Property names the certification covers; rows outside them never enter the composition. */
export function certifiedPropertyNames(settlement: CertifiedClientSettlementAvailable): string[] {
  const names: string[] = []
  for (const line of settlement.propertyLines) if (!names.includes(line.propertyName)) names.push(line.propertyName)
  return names
}

/**
 * Build the composition input. An unavailable certification is a blocked result with its reason,
 * not an empty account.
 */
export function compositionFromCertifiedSettlement(request: CertifiedCompositionRequest): CertifiedCompositionResult {
  const { settlement } = request
  if (settlement.unavailable) {
    return { status: 'blocked', code: 'NO_CERTIFIED_SOURCE', reason: settlement.reason }
  }
  if (settlement.propertyLines.length === 0) {
    return { status: 'blocked', code: 'BLOCKED_ACCOUNTING', reason: 'certification has no property lines' }
  }
  const names = new Set(certifiedPropertyNames(settlement))
  let rows: LedgerRow[]
  try {
    rows = request.rows
      .filter((row) => row.property_name != null && names.has(row.property_name))
      .map(toLedgerRow)
  } catch (err) {
    return { status: 'blocked', code: 'BLOCKED_ACCOUNTING', reason: err instanceof Error ? err.message : String(err) }
  }
  const evidence = request.evidence || {}
  const input: CompositionInput = {
    asOf: settlement.asOf,
    clientId: settlement.entityId,
    clientDisplayName: request.clientDisplayName,
    reportTitle: request.reportTitle,
    reportLanguage: request.reportLanguage || 'he',
    reportType: request.reportType || 'full_account',
    period: request.period,
    currency: 'EUR',
    openingDueToJj: settlement.openingDueToJj,
    closingDueToJj: settlement.closingDueToJj,
    cashAllocationSignedTotal: settlement.cashAllocationSignedTotal,
    lines: settlement.propertyLines.map((line) => ({
      lineOrder: line.lineOrder,
      propertyKey: line.propertyKey,
      propertyName: line.propertyName,
      amountDueToJj: line.amountDueToJj,
      evidenceRef: line.evidenceRef,
      metadata: line.metadata || {},
    })),
    ...(settlement.ownerLevelObligations && settlement.ownerLevelObligations.length > 0
      ? {
          ownerLevelObligations: settlement.ownerLevelObligations.map((line) => ({
            id: line.id,
            effectiveDate: line.effectiveDate,
            amountDueToJj: line.amountDueToJj,
          })),
        }
      : {}),
    // The certified reader returns only events applied by the certification, in EUR.
    credits: settlement.fifoCredits.map((credit) => ({
      id: credit.eventId,
      sourceTransactionId: credit.sourceTransactionId,
      eventType: credit.eventType,
      amount: credit.settlementAmount,
      effectiveDate: credit.effectiveDate,
      currency: 'EUR' as const,
      evidenceStatus: 'certified' as const,
      inclusion: 'included' as const,
    })),
    // A cash execution already allocated against the obligations consumes its transaction; a FIFO
    // payment event pointing at the same transaction would count it twice.
    consumedSourceTransactionIds: settlement.cashExecutions.map((execution) => execution.transactionId),
    rows,
    linkedRowsByPropertyKey: evidence.linkedRowsByPropertyKey,
    strMonthsByPropertyKey: evidence.strMonthsByPropertyKey,
    certifiedStrMonthlyByPropertyKey: request.certifiedStrMonthlyByPropertyKey,
    undatedChargeLabelByPropertyKey: evidence.undatedChargeLabelByPropertyKey,
    creditLabels: evidence.creditLabels,
    ownerRentMonthsByRowId: evidence.ownerRentMonthsByRowId,
    descriptionByRowId: evidence.descriptionByRowId,
    displayGroups: evidence.displayGroups,
    hebrewOwesForm: evidence.hebrewOwesForm,
    historicalSourceNamesByPropertyKey: evidence.historicalSourceNamesByPropertyKey,
    purchaseSupplementsByPropertyKey: evidence.purchaseSupplementsByPropertyKey,
    strLumpDescription: evidence.strLumpDescription,
    renovationNoteByPropertyKey: evidence.renovationNoteByPropertyKey,
  }
  return { status: 'ready', input, settlement }
}
