/**
 * Client report adapter contract. An adapter names the client and its scope and may attach
 * approved presentation evidence. It never carries amounts, balances or transaction ids as
 * literals — every figure comes from the certified source at load time.
 */

import type { CertifiedClientSettlementAvailable } from '../../../finance/certifiedClientSettlementTypes'
import type { ClientEvidenceOverrides, RawTransactionRow } from '../certifiedSource'
import type { ReportPeriod, ReportType } from '../types'

export type ClientIdentity =
  | { readonly kind: 'entity'; readonly entityId: string }
  | { readonly kind: 'canonicalName'; readonly canonicalNames: readonly string[] }
  | { readonly kind: 'property'; readonly propertyName: string }

export interface AdapterEvidenceContext {
  readonly settlement: CertifiedClientSettlementAvailable
  readonly rows: readonly RawTransactionRow[]
  /** Rows loaded for `linkedRowPropertyNames`, keyed by property name. */
  readonly linkedRows: Readonly<Record<string, readonly RawTransactionRow[]>>
}

export interface ClientReportAdapter {
  readonly clientSlug: string
  readonly clientDisplayName: string
  readonly reportTitle: string
  readonly reportLanguage: 'he' | 'en'
  readonly reportType: ReportType
  readonly asOf: string
  /** Required for period_account; must end on asOf. */
  readonly period?: ReportPeriod
  readonly identity: ClientIdentity
  /** Monthly STR scope; omitted → the STR credit stays a single certified amount. */
  readonly strMonthly?: ReportPeriod
  /** Additional property names whose rows are read only as linked evidence (never as accounts). */
  readonly linkedRowPropertyNames?: readonly string[]
  /** Approved client-specific presentation evidence, derived from the loaded certified data. */
  readonly evidence?: (context: AdapterEvidenceContext) => ClientEvidenceOverrides
}
