/**
 * Attention Service — one normalized attention/alert contract from REAL signals.
 *
 * Wiring Agent (2026-08-16), Phase 3. READ-ONLY. server-only. Never mock.
 *
 * Replaces the empty, non-canonical public.alerts table as the surfacing layer.
 * Each provider reads a real source; a provider failure yields [] (partial data is honest).
 *
 * Providers wired (real data present):
 *   - lifecycle.verification_tasks         → REPORTING   (dates awaiting source docs)
 *   - pms.sync_errors                      → STR_RECONCILIATION (Hostaway sync failures)
 *   - revintel.v_portfolio_summary.stale_warning → REVENUE_INTELLIGENCE (market snapshot stale)
 *
 * Providers reserved (no data yet / pending source): LTR arrears, missing meter data,
 * identity/mapping conflicts (currently 0 unresolved), owner report blockers.
 * They are intentionally absent, not mocked.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'

export type AttentionSeverity = 'CRITICAL' | 'ATTENTION' | 'PENDING' | 'INFO'
export type AttentionCategory =
  | 'FINANCIAL'
  | 'STR_RECONCILIATION'
  | 'IDENTITY'
  | 'LTR'
  | 'OPERATIONS'
  | 'REVENUE_INTELLIGENCE'
  | 'REPORTING'

export interface AttentionItemDTO {
  readonly id: string
  readonly canonicalOwnerId: string | null
  readonly canonicalPropertyId: string | null
  readonly propertyName: string | null
  readonly category: AttentionCategory
  readonly severity: AttentionSeverity
  readonly businessTitle: string
  readonly businessDescription: string
  readonly amountEur: string | null
  readonly currency: 'EUR' | null
  readonly source: string
  readonly sourceReference: string
  readonly createdAt: string | null
  readonly status: string
  readonly actionType: string | null
  readonly actionTarget: string | null
}

type Provider = () => Promise<AttentionItemDTO[]>

async function safe(fn: Provider): Promise<AttentionItemDTO[]> {
  try {
    return await fn()
  } catch (err) {
    console.error('[attention] provider failed:', err)
    return []
  }
}

// ── Provider: verification tasks (REPORTING) ────────────────────────────────
function verificationTasks(db: ReturnType<typeof createServiceClient>): Provider {
  return async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('lifecycle')
      .from('verification_tasks')
      .select('id, entity_name, property_name, field_name, reason, priority, status')
      .in('status', ['pending', 'evidence_found'])
    if (error) throw error
    type T = { id: string; entity_name: string | null; property_name: string | null; field_name: string | null; reason: string | null; priority: string | null; status: string }
    return ((data ?? []) as T[]).map(t => ({
      id: `vtask:${t.id}`,
      canonicalOwnerId: null,
      canonicalPropertyId: null,
      propertyName: t.property_name ?? null,
      category: 'REPORTING' as const,
      severity: (t.priority === 'high' ? 'ATTENTION' : 'PENDING') as AttentionSeverity,
      businessTitle: `Verification needed: ${t.field_name ?? 'date'}${t.property_name ? ` — ${t.property_name}` : ''}`,
      businessDescription: t.reason ?? 'Source document required to confirm a pending value.',
      amountEur: null,
      currency: null,
      source: 'lifecycle.verification_tasks',
      sourceReference: t.id,
      createdAt: null,
      status: t.status,
      actionType: 'PROVIDE_EVIDENCE',
      actionTarget: null,
    }))
  }
}

// ── Provider: PMS sync errors (STR_RECONCILIATION) ──────────────────────────
function pmsSyncErrors(db: ReturnType<typeof createServiceClient>): Provider {
  return async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('pms')
      .from('sync_errors')
      .select('id, entity, external_id, error_code, message, retry_count, status, created_at')
      .neq('status', 'resolved')
    if (error) throw error
    type E = { id: string; entity: string | null; external_id: string | null; error_code: string | null; message: string | null; retry_count: number | null; status: string; created_at: string | null }
    return ((data ?? []) as E[]).map(e => ({
      id: `syncerr:${e.id}`,
      canonicalOwnerId: null,
      canonicalPropertyId: null,
      propertyName: null,
      category: 'STR_RECONCILIATION' as const,
      severity: ((e.retry_count ?? 0) >= 3 ? 'CRITICAL' : 'ATTENTION') as AttentionSeverity,
      businessTitle: `Hostaway sync error (${e.error_code ?? 'unknown'})`,
      businessDescription: e.message ?? `Sync failure on ${e.entity ?? 'entity'} ${e.external_id ?? ''}`.trim(),
      amountEur: null,
      currency: null,
      source: 'pms.sync_errors',
      sourceReference: e.id,
      createdAt: e.created_at ?? null,
      status: e.status,
      actionType: 'REVIEW_SYNC',
      actionTarget: e.external_id ?? null,
    }))
  }
}

// ── Provider: Revenue Intelligence stale market snapshot (REVENUE_INTELLIGENCE) ──
function riStaleWarnings(db: ReturnType<typeof createServiceClient>): Provider {
  return async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('revintel')
      .from('v_portfolio_summary')
      .select('jj_property_name, external_id, stale_warning, market_status')
      .not('stale_warning', 'is', null)
    if (error) throw error
    type P = { jj_property_name: string | null; external_id: string | null; stale_warning: string | null; market_status: string | null }
    return ((data ?? []) as P[])
      .filter(p => (p.stale_warning ?? '').trim().length > 0)
      .map((p, i) => ({
        id: `ri-stale:${p.external_id ?? i}`,
        canonicalOwnerId: null,
        canonicalPropertyId: null,
        propertyName: p.jj_property_name ?? null,
        category: 'REVENUE_INTELLIGENCE' as const,
        severity: 'INFO' as AttentionSeverity,
        businessTitle: `Market data stale${p.jj_property_name ? ` — ${p.jj_property_name}` : ''}`,
        businessDescription: p.stale_warning as string,
        amountEur: null,
        currency: null,
        source: 'revintel.v_portfolio_summary',
        sourceReference: p.external_id ?? (p.jj_property_name ?? 'unknown'),
        createdAt: null,
        status: p.market_status ?? 'open',
        actionType: 'REFRESH_MARKET',
        actionTarget: p.external_id ?? null,
      }))
  }
}

const SEVERITY_ORDER: Record<AttentionSeverity, number> = { CRITICAL: 0, ATTENTION: 1, PENDING: 2, INFO: 3 }

/**
 * Normalized attention feed from real signals. Never mock; [] when quiet.
 * Optionally filter to a canonical property (matched by name where the source carries one).
 */
export async function getAttentionItems(opts: { propertyName?: string } = {}): Promise<readonly AttentionItemDTO[]> {
  let db: ReturnType<typeof createServiceClient>
  try {
    db = createServiceClient()
  } catch (err) {
    console.error('[attention] createServiceClient failed:', err)
    return []
  }

  const batches = await Promise.all([
    safe(verificationTasks(db)),
    safe(pmsSyncErrors(db)),
    safe(riStaleWarnings(db)),
  ])

  let items = batches.flat()
  if (opts.propertyName) {
    const name = opts.propertyName.toLowerCase()
    items = items.filter(i => (i.propertyName ?? '').toLowerCase() === name)
  }

  items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
  return Object.freeze(items)
}
