/**
 * Server-only universal loader: certified settlement + ledger rows + certified monthly STR →
 * gated ClientAccountReport. Read-only. Every missing prerequisite is a blocked result.
 */

import 'server-only'

import { readCertifiedClientSettlement, resolveCertifiedSettlementEntityFromProperty } from '@/lib/finance/certifiedClientSettlementAdapter'
import { createServiceClient } from '@/lib/supabase'
import { buildClientAccountReport, type ClientAccountReport } from './buildClientAccountReport'
import { admitCertifiedStrMonthly } from './certifiedStrMonthly'
import { certifiedPropertyNames, compositionFromCertifiedSettlement, TRANSACTION_COLUMNS, type RawTransactionRow } from './certifiedSource'
import { ClientAccountBlock } from './composeCertifiedAccount'
import { loadCertifiedStrMonthlySection } from './loadCertifiedStrMonthly'
import type { ClientIdentity, ClientReportAdapter } from './adapters/types'
import type { CertifiedStrMonthlySection, CertifiedStrMonthlyUnavailable } from './types'

export type ClientAccountLoadResult =
  | { readonly status: 'ready'; readonly report: ClientAccountReport; readonly certificationId: string }
  | { readonly status: 'blocked'; readonly code: string; readonly reason: string }

const PAGE = 500

// The service client is untyped for the lifecycle schema; the loader only issues read queries.
// eslint-disable-next-line
type Db = any

async function resolveEntityId(sb: Db, identity: ClientIdentity): Promise<{ entityId: string } | { blocked: string }> {
  if (identity.kind === 'entity') return { entityId: identity.entityId }
  if (identity.kind === 'property') {
    const resolved = await resolveCertifiedSettlementEntityFromProperty(identity.propertyName)
    if (resolved.status !== 'resolved') return { blocked: `entity resolution from property: ${resolved.status}` }
    return { entityId: resolved.entityId }
  }
  const { data, error } = await sb
    .schema('lifecycle')
    .from('entity_identity')
    .select('id,canonical_name,status')
    .in('canonical_name', identity.canonicalNames)
    .eq('status', 'active')
  if (error) return { blocked: `entity identity source unavailable: ${error.message}` }
  const ids: string[] = []
  for (const row of (data || []) as { id: string }[]) if (!ids.includes(row.id)) ids.push(row.id)
  if (ids.length === 0) return { blocked: 'client entity not found' }
  if (ids.length > 1) return { blocked: 'client entity is ambiguous' }
  return { entityId: ids[0] }
}

/**
 * Deterministic ledger order (owner decision 2026-09-27): primary key `date` ascending (economic/display date),
 * tie-breaker `id` ascending (stable unique row id). Same-date rows therefore always render in the same order
 * regardless of insertion order or storage; this affects display order only — never amounts, categories,
 * descriptions or accounting effect.
 */
async function readRows(sb: Db, propertyNames: readonly string[], asOf: string): Promise<RawTransactionRow[]> {
  if (propertyNames.length === 0) return []
  const pulled: RawTransactionRow[] = []
  for (let from = 0; ; from += PAGE) {
    const page = await sb
      .from('transactions')
      .select(TRANSACTION_COLUMNS)
      .in('property_name', propertyNames)
      .lte('date', asOf)
      .order('date')
      .order('id')
      .range(from, from + PAGE - 1)
    if (page.error) throw new ClientAccountBlock('BLOCKED_ACCOUNTING', `ledger read failed: ${page.error.message}`)
    const rows = (page.data || []) as RawTransactionRow[]
    pulled.push(...rows)
    if (rows.length < PAGE) break
  }
  return pulled
}

export async function loadClientAccountReport(adapter: ClientReportAdapter): Promise<ClientAccountLoadResult> {
  try {
    const sb = createServiceClient()
    const entity = await resolveEntityId(sb, adapter.identity)
    if ('blocked' in entity) return { status: 'blocked', code: 'NO_CLIENT_IDENTITY', reason: entity.blocked }

    const settlement = await readCertifiedClientSettlement(entity.entityId, adapter.asOf)
    if (settlement.unavailable) return { status: 'blocked', code: 'NO_CERTIFIED_SOURCE', reason: settlement.reason }

    const names = certifiedPropertyNames(settlement)
    const rows = await readRows(sb, names, adapter.asOf)
    const linkedRows: Record<string, RawTransactionRow[]> = {}
    for (const name of adapter.linkedRowPropertyNames || []) {
      if (names.includes(name)) return { status: 'blocked', code: 'BLOCKED_ACCOUNTING', reason: `linked evidence property ${name} is also a certified account` }
      linkedRows[name] = await readRows(sb, [name], adapter.asOf)
    }

    let monthly: Record<string, CertifiedStrMonthlySection | CertifiedStrMonthlyUnavailable> | undefined
    if (adapter.strMonthly) {
      monthly = {}
      const seen = new Set<string>()
      for (const line of settlement.propertyLines) {
        const scope = {
          entityId: entity.entityId,
          propertyId: line.propertyKey,
          propertyName: line.propertyName,
          periodStart: adapter.strMonthly.start,
          periodEnd: adapter.strMonthly.end,
        }
        if (seen.has(line.propertyKey)) {
          monthly[line.propertyKey] = admitCertifiedStrMonthly(null, scope)
          continue
        }
        seen.add(line.propertyKey)
        monthly[line.propertyKey] = await loadCertifiedStrMonthlySection(scope)
      }
    }

    const evidence = adapter.evidence ? adapter.evidence({ settlement, rows, linkedRows }) : undefined
    const composition = compositionFromCertifiedSettlement({
      settlement,
      rows,
      clientDisplayName: adapter.clientDisplayName,
      reportTitle: adapter.reportTitle,
      reportLanguage: adapter.reportLanguage,
      reportType: adapter.reportType,
      period: adapter.period,
      certifiedStrMonthlyByPropertyKey: monthly,
      evidence,
    })
    if (composition.status === 'blocked') return { status: 'blocked', code: composition.code, reason: composition.reason }

    const report = buildClientAccountReport(composition.input)
    return { status: 'ready', report, certificationId: settlement.certificationId }
  } catch (err) {
    if (err instanceof ClientAccountBlock) return { status: 'blocked', code: err.code, reason: err.message }
    return { status: 'blocked', code: 'SOURCE_UNAVAILABLE', reason: err instanceof Error ? err.message : String(err) }
  }
}
