/**
 * @module executive/executiveBriefService
 * @description Executive Brief Service — queries real Supabase data,
 * produces ExecutiveBriefDTO.
 *
 * SECURITY:
 * - Uses createServiceClient() for lifecycle/pms schemas (RLS deny-all).
 * - Server-side only. NEVER import on the client.
 * - READ-ONLY. Never writes to any table.
 *
 * AUTHORIZATION:
 * ✅ RESOLVED via DAL v0.1 (ADR-003, 22 July 2026).
 *
 * The authorized entry point is getAuthorizedExecutiveBrief().
 * It resolves the authenticated principal, evaluates DAL access
 * (Awareness + View), and only runs providers after authorization succeeds.
 *
 * getExecutiveBrief() remains as the INTERNAL data function.
 * It must NEVER be called directly from a route handler.
 * All route handlers must use getAuthorizedExecutiveBrief().
 *
 * SEMANTIC BOUNDARY:
 * Providers surface OBSERVABLE FACTS from the database. They do NOT interpret
 * business meaning. The Chief of Staff groups, orders, and presents — it does
 * not decide whether a fact is healthy, risky, or actionable.
 *
 * Each provider documents:
 *   - Observable fact: what the query returns
 *   - Approved business meaning: citation to CLAUDE.md, ADR, or Yossi decision
 *   - If no approved meaning exists: item is monitor-only, no recommendation
 *
 * PROVIDERS:
 * Simple async functions — not a plugin framework.
 * "No universal engine overbuild."
 *
 * @see chiefOfStaffAssembly.ts — prioritization and grouping
 * @see executiveBriefTypes.ts — DTO contract
 * @see executiveBriefDeclaration.ts — DAL declaration for this decision
 * @see ADR-003_DECISION_ACCESS_LAYER.md — constitutional authorization framework
 */

import { createServiceClient } from '@/lib/supabase'
import { assembleExecutiveBrief } from './chiefOfStaffAssembly'
import { evaluateDecisionAccess } from '../dal/evaluateAccess'
import { resolvePrincipal } from '../dal/resolvePrincipal'
import { EXECUTIVE_BRIEF_DECLARATION } from './executiveBriefDeclaration'
import type {
  ExecutiveBriefDTO,
  ExecutiveBriefCandidate,
  ProviderResult,
  EvidenceReference,
  DataFreshness,
} from './executiveBriefTypes'
import type { EffectiveDecisionAccess } from '../dal/types'

// ─── Authorized result type ───────────────────────────────────────────────

export type AuthorizedBriefResult =
  | { readonly ok: true; readonly dto: ExecutiveBriefDTO; readonly access: EffectiveDecisionAccess }
  | { readonly ok: false; readonly error: AuthorizedBriefError; readonly access: EffectiveDecisionAccess | null }

export type AuthorizedBriefError =
  | 'NO_SESSION'
  | 'NO_ROLE'
  | 'ROLE_INACTIVE'
  | 'ACCESS_DENIED'

// ─── Helpers ───────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString()
}

function evidence(
  sourceId: string,
  sourceType: string,
  description: string,
  freshness: DataFreshness = 'live',
): EvidenceReference {
  return { sourceId, sourceType, description, queriedAt: now(), freshness }
}

function safeProvider(
  providerId: string,
  sourceType: string,
  fn: () => Promise<ExecutiveBriefCandidate[]>,
): Promise<ProviderResult> {
  return fn()
    .then(candidates => ({
      providerId,
      sourceType,
      freshness: 'live' as DataFreshness,
      candidates,
      error: null,
    }))
    .catch(err => ({
      providerId,
      sourceType,
      freshness: 'unavailable' as DataFreshness,
      candidates: [],
      error: err instanceof Error ? err.message : String(err),
    }))
}

// ─── Provider: Verification Tasks (Chief Knowledge Officer) ────────────────
//
// Observable fact: lifecycle.verification_tasks rows with status pending/evidence_found.
// Approved business meaning: M9-D (CLAUDE.md §13.8) — these tasks were created by
//   generate_verification_tasks() for dates with date_confidence='pending_verification'.
//   Yossi approved the task model (13 July 2026). Each task represents a date that
//   requires a source document to confirm.
// CEO action: YES — Yossi must provide source documents or confirm dates.
// Priority rule: decisionRequired=true. rawPriority 55 (high) when high-priority tasks
//   exist, 35 (normal) otherwise. Based on M9-D priority assignments (CLAUDE.md §13.8).
//

async function gatherVerificationTasks(): Promise<ExecutiveBriefCandidate[]> {
  const db = createServiceClient()

  const { data, error } = await db
    .schema('lifecycle')
    .from('verification_tasks')
    .select('id, entity_name, property_name, field_name, reason, priority, status')
    .in('status', ['pending', 'evidence_found'])

  if (error || !data) return []

  type TaskRow = {
    id: string
    entity_name: string
    property_name: string
    field_name: string
    reason: string
    priority: string
    status: string
  }

  const tasks = data as TaskRow[]
  if (tasks.length === 0) return []

  const highCount = tasks.filter(t => t.priority === 'high').length
  const mediumCount = tasks.filter(t => t.priority === 'medium').length

  return [
    {
      providerId: 'verification-tasks',
      executiveOwner: 'chief-knowledge',
      strategicAsset: 'Organizational Intelligence',
      category: 'critical-decisions',
      title: `${tasks.length} investment dates awaiting source documents`,
      explanation: `${highCount} high-priority and ${mediumCount} medium-priority verification tasks are open. These dates were flagged during M9-D as pending_verification. Source documents (contracts, bank statements, notary records) are needed to confirm or correct them.`,
      rawPriority: highCount > 0 ? 55 : 35,
      status: 'open',
      recommendedAction: 'Provide source documents for pending verification tasks',
      decisionRequired: true,
      dueAt: null,
      confidence: 'confirmed',
      impact: null, // No approved rule defines the business impact of unverified dates
      evidence: [
        evidence(
          'lifecycle.verification_tasks',
          'lifecycle_table',
          `${tasks.length} tasks: ${highCount} high, ${mediumCount} medium priority`,
        ),
      ],
      sourceFreshness: 'live',
      route: null,
    },
  ]
}

// ─── Provider: Cashbox Positions (CFO) ────────────────────────────────────
//
// Observable fact: v_cashbox_audit returns total_received, total_paid, balance
//   per cashbox (Yossi, Jacob, JJ).
// Approved business meaning: NONE for sign interpretation.
//   CLAUDE.md §5 documents the balances but does NOT define negative as risk.
//   Sign may represent settlement direction, not financial health.
//   Partner Capital Rule (§4) says Yossi ≠ Jacob ≠ JJ — identity matters, but
//   no approved rule says negative = problem.
// CEO action: NO — no approved action exists for cashbox sign.
// Decision: Surface as monitor-only neutral observation. No recommendation.
//   No financial-attention category. No risk language.
//

async function gatherCashboxPositions(): Promise<ExecutiveBriefCandidate[]> {
  const db = createServiceClient()

  const { data, error } = await db.from('v_cashbox_audit').select('*')

  if (error || !data) return []

  type CashboxRow = {
    cashbox: string
    total_received: number
    total_paid: number
    balance: number
  }

  const rows = data as CashboxRow[]
  if (rows.length === 0) return []

  // Single neutral observation — no risk interpretation
  return [
    {
      providerId: 'cashbox-positions',
      executiveOwner: 'cfo',
      strategicAsset: 'Financial Reality',
      category: 'trust-signals',
      title: `Partner capital positions: ${rows.length} cashboxes`,
      explanation: rows
        .map(
          r =>
            `${r.cashbox}: €${r.balance.toLocaleString('en', { minimumFractionDigits: 2 })}`,
        )
        .join(' · '),
      rawPriority: 10, // monitor — no approved business meaning for this data
      status: 'monitoring',
      recommendedAction: null, // No approved action
      decisionRequired: false,
      dueAt: null,
      confidence: 'confirmed',
      impact: null, // No approved rule defines impact
      evidence: [
        evidence(
          'v_cashbox_audit',
          'public_view',
          `${rows.length} cashboxes: ${rows.map(r => `${r.cashbox}=${r.balance}`).join(', ')}`,
        ),
      ],
      sourceFreshness: 'live',
      route: null,
    },
  ]
}

// ─── Provider: PMS Connection Status (COO) ────────────────────────────────
//
// Observable fact: pms.connections last_synced_at timestamp and status field.
// Approved business meaning: NONE for sync cadence expectations.
//   No authoritative document defines expected sync frequency, acceptable delay,
//   or staleness thresholds.
// CEO action: NO — no approved threshold exists.
// Decision: Surface connection status as neutral observation only.
//   Report last sync time as a fact. No invented staleness classification.
//   No recommendation language.
//

async function gatherPmsStatus(): Promise<ExecutiveBriefCandidate[]> {
  const db = createServiceClient()

  const { data, error } = await db
    .schema('pms')
    .from('connections')
    .select('provider, status, last_synced_at')
    .limit(10)

  if (error || !data) return []

  type ConnectionRow = {
    provider: string
    status: string
    last_synced_at: string | null
  }

  const connections = data as ConnectionRow[]
  if (connections.length === 0) return []

  const candidates: ExecutiveBriefCandidate[] = []

  for (const conn of connections) {
    const lastSync = conn.last_synced_at ? new Date(conn.last_synced_at) : null
    const lastSyncLabel = lastSync
      ? lastSync.toISOString().slice(0, 16).replace('T', ' ')
      : 'never'

    candidates.push({
      providerId: `pms-connection-${conn.provider}`,
      executiveOwner: 'coo',
      strategicAsset: 'Operational Excellence',
      category: 'trust-signals',
      title: `${conn.provider}: status=${conn.status}, last sync ${lastSyncLabel}`,
      explanation: `PMS connection to ${conn.provider} reports status "${conn.status}".${lastSync ? ` Last successful sync: ${lastSyncLabel} UTC.` : ' No sync recorded.'}`,
      rawPriority: 5, // monitor — no approved sync cadence contract exists
      status: 'monitoring',
      recommendedAction: null, // No approved threshold → no recommendation
      decisionRequired: false,
      dueAt: null,
      confidence: 'confirmed',
      impact: null,
      evidence: [
        evidence(
          'pms.connections',
          'pms_table',
          `${conn.provider}: status=${conn.status}, last_synced_at=${conn.last_synced_at ?? 'null'}`,
        ),
      ],
      sourceFreshness: 'live',
      route: '/admin/pms',
    })
  }

  return candidates
}

// ─── Internal data function ───────────────────────────────────────────────

/**
 * Produce the Executive Brief by querying available data sources.
 *
 * ⚠️ INTERNAL ONLY — do NOT call from route handlers.
 * Route handlers must use getAuthorizedExecutiveBrief() which enforces DAL.
 *
 * PROVIDERS ACTIVE IN M0:
 *   1. Verification Tasks — approved business meaning (M9-D). CEO action required.
 *   2. Cashbox Positions — observable fact only. No approved risk interpretation.
 *   3. PMS Connection Status — observable fact only. No approved sync cadence.
 *
 * PROVIDERS REMOVED (Gate 4 — unapproved semantics):
 *   - Data Quality (NULL property_name) — removed. 391 NULL rows include legitimate
 *     company-level transactions (JJ, Transfer categories) that don't belong to a
 *     property. Raw count ≠ executive alert. Requires categorization before surfacing.
 *   - Governance (Ownership freeze) — removed. A correctly frozen ownership layer is
 *     governance state, not an alert. No action is required from the CEO unless the
 *     closure package is ready for review — and that readiness is not queryable.
 *   - Duplicate status — removed. Confirmed duplicates properly excluded are completed
 *     work, not an active issue. This belongs in Admin Console, not CEO Office.
 *   - PMS reservation count — removed. A fact ("589 reservations tracked") without
 *     business context is not worth interrupting the CEO.
 *
 * Each provider is wrapped in safeProvider() — a provider failure produces
 * an 'unavailable' result, NOT a crash. Partial data is honest data.
 */
export async function getExecutiveBrief(): Promise<ExecutiveBriefDTO> {
  const results = await Promise.all([
    safeProvider('verification-tasks', 'lifecycle_table', gatherVerificationTasks),
    safeProvider('cashbox', 'public_view', gatherCashboxPositions),
    safeProvider('pms-status', 'pms_table', gatherPmsStatus),
  ])

  return assembleExecutiveBrief(results)
}

// ─── Authorized Public API ────────────────────────────────────────────────

/**
 * DAL-authorized entry point for the Executive Brief.
 *
 * Authorization chain:
 *   1. Resolve authenticated principal (two-client pattern)
 *   2. Evaluate DAL access (Awareness + View) against EXECUTIVE_BRIEF_DECLARATION
 *   3. Only after ALLOW: run providers and return DTO
 *   4. On DENY: return error with access metadata (audit trail)
 *
 * SECURITY INVARIANTS:
 * - No service-role query executes before DAL authorization succeeds.
 * - Unauthenticated users receive NO_SESSION (no data exposed).
 * - Authenticated users without superadmin role receive ACCESS_DENIED.
 * - Every result includes the EffectiveDecisionAccess for audit (DAL-7).
 *
 * This is the ONLY authorized entry point for Server Components
 * rendering the Executive Brief. Using getExecutiveBrief() directly
 * from a Server Component bypasses the authorization boundary.
 *
 * @see ADR-003_DECISION_ACCESS_LAYER.md — DAL v0.1
 * @see executiveBriefDeclaration.ts — decision classification
 */
export async function getAuthorizedExecutiveBrief(): Promise<AuthorizedBriefResult> {
  // ── Step 1: Resolve principal ─────────────────────────────────────────
  const principalResult = await resolvePrincipal()

  if (!principalResult.ok) {
    return { ok: false, error: principalResult.error, access: null }
  }

  // ── Step 2: Evaluate DAL access ───────────────────────────────────────
  const access = evaluateDecisionAccess(
    principalResult.principal,
    EXECUTIVE_BRIEF_DECLARATION,
  )

  // ── Step 3: Check Awareness + View ────────────────────────────────────
  // For M0: both awareness and view are required for full rendering.
  // If neither is granted, deny completely.
  if (!access.awareness && !access.view) {
    return { ok: false, error: 'ACCESS_DENIED', access }
  }

  // If only awareness (no view), deny — M0 does not have a neutral
  // existence signal UI. This is a product decision, not a security one.
  if (!access.view) {
    return { ok: false, error: 'ACCESS_DENIED', access }
  }

  // ── Step 4: Run providers (ONLY after authorization) ──────────────────
  const dto = await getExecutiveBrief()

  return { ok: true, dto, access }
}
