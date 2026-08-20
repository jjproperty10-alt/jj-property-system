/**
 * JJ Property 10 - Report mode + protected-field authorization boundary (G5)
 *
 * Two mutually exclusive rendering modes:
 *   - 'owner_client' : what an owner/client may see. Purchase excluded; every
 *                      JJ-internal field (actual cost, margin, evidence, payer/
 *                      payee, raw amounts, internal notes) is stripped.
 *   - 'jj_internal'  : full internal view (margin/evidence). Authorized JJ staff
 *                      ONLY.
 *
 * SERVER-SIDE BOUNDARY - fail closed:
 *   `resolveReportMode` must be called on the server with the role resolved by
 *   the existing report authorization (reportAuthorization.ts). It returns
 *   'jj_internal' ONLY when an authorized role explicitly requests it; every
 *   other case (no role, unknown role, owner/partner role, absent request,
 *   malformed request) collapses to 'owner_client'. A client can never elevate
 *   itself by asking, because the role comes from the server session, not the
 *   request body.
 *
 * This module is pure policy (no I/O). It does not change accounting truth; it
 * only decides visibility. It composes with - and never weakens - the server
 * authorization and the compile-time client-safe DTO (clientRow.ts).
 */

export type ReportMode = 'owner_client' | 'jj_internal'

/** All modes; 'owner_client' first = the safe default. */
export const REPORT_MODES: readonly ReportMode[] = ['owner_client', 'jj_internal'] as const

/** The default, least-privilege mode. */
export const DEFAULT_REPORT_MODE: ReportMode = 'owner_client'

/**
 * Roles permitted to enter JJ Internal mode. Mirrors the JJ-staff authority in
 * reportAuthorization.ts: 'superadmin' is JJ staff; 'partner' is an owner/client
 * and is NEVER allowed internal visibility.
 */
export const INTERNAL_MODE_ROLES: readonly string[] = ['superadmin'] as const

/**
 * Fields that are JJ-internal and MUST NOT appear in owner_client output. These
 * are the economic-internal and evidence fields; the list is a superset of the
 * client-safe DTO's forbidden set so the two boundaries reinforce each other.
 */
export const PROTECTED_INTERNAL_FIELDS: readonly string[] = [
  'actual_cost',
  'amount_eur',
  'client_charge',
  'margin',
  'jj_margin',
  'payer',
  'payee',
  'evidence',
  'evidence_url',
  'description',
  'notes',
  'k_note',
  'memo',
  'internal_notes',
  'supplier_notes',
  'staff_notes',
  'classification',
] as const

const PROTECTED_SET = new Set<string>(PROTECTED_INTERNAL_FIELDS)

/** True when the role may use JJ Internal mode at all. */
export function canUseInternalMode(role: unknown): boolean {
  return typeof role === 'string' && INTERNAL_MODE_ROLES.includes(role)
}

/** Type guard for a well-formed mode request value. */
export function isReportMode(value: unknown): value is ReportMode {
  return value === 'owner_client' || value === 'jj_internal'
}

export interface ResolveReportModeInput {
  /** The mode requested by the caller (query param / UI). Any raw value. */
  requestedMode?: unknown
  /** The role resolved SERVER-SIDE by report authorization. */
  role?: unknown
}

/**
 * Resolve the effective, authorized report mode. Fails closed to 'owner_client'
 * unless an authorized role explicitly and validly requests 'jj_internal'.
 */
export function resolveReportMode(input: ResolveReportModeInput = {}): ReportMode {
  const wantsInternal = input.requestedMode === 'jj_internal'
  if (wantsInternal && canUseInternalMode(input.role)) return 'jj_internal'
  return DEFAULT_REPORT_MODE
}

/** Purchase (JJ acquisition) is visible only in JJ Internal mode. */
export function isPurchaseVisible(mode: ReportMode): boolean {
  return mode === 'jj_internal'
}

/** Internal margin / evidence are visible only in JJ Internal mode. */
export function isInternalFieldVisible(field: string, mode: ReportMode): boolean {
  if (mode === 'jj_internal') return true
  return !PROTECTED_SET.has(field)
}

/** True when a field is a protected JJ-internal field (regardless of mode). */
export function isProtectedField(field: string): boolean {
  return PROTECTED_SET.has(field)
}

/**
 * Project a record for the given mode. In owner_client mode every protected
 * field is removed (structurally absent, not nulled) so it cannot leak through
 * serialization. In jj_internal mode the record passes through unchanged. Never
 * mutates the input.
 */
export function projectForMode<T extends Record<string, unknown>>(
  record: T,
  mode: ReportMode,
): Partial<T> {
  if (mode === 'jj_internal') return { ...record }
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(record)) {
    if (!PROTECTED_SET.has(key)) out[key] = record[key]
  }
  return out as Partial<T>
}

/**
 * Assert (for tests / defensive server checks) that an owner_client payload
 * carries no protected field. Returns the offending keys (empty = clean).
 */
export function findProtectedLeaks(record: Record<string, unknown>): string[] {
  return Object.keys(record).filter(k => PROTECTED_SET.has(k))
}
