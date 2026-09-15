/**
 * Classify owner-level overlay fetch failures.
 *
 * not_deployed — migration/view/RPC missing (deployment compatibility; skip overlay)
 * blocked      — permission, timeout, malformed, unexpected (NEEDS REVIEW; never silent)
 */

export type OwnerLevelFetchStatus = 'ok' | 'not_deployed' | 'blocked'

export interface ClassifiedDbError {
  readonly kind: 'not_deployed' | 'blocked'
  readonly reason: string
  readonly code?: string
}

const NOT_DEPLOYED_CODES = new Set([
  '42P01', // undefined_table
  '3F000', // invalid_schema_name
  '42703', // undefined_column
  '42883', // undefined_function
  'PGRST002',
  'PGRST202',
  'PGRST204',
  'PGRST205',
])

const NOT_DEPLOYED_RE =
  /relation .* does not exist|could not find the table|schema cache|undefined_table|undefined_function|does not exist|PGRST205|PGRST202/i

const PERMISSION_RE = /42501|42503|PGRST301|permission denied|not authorized|row-level security|rls/i
const TIMEOUT_RE = /57014|ETIMEDOUT|timeout|timed out|fetch failed|network|ECONNRESET|ENOTFOUND/i
const MALFORMED_RE = /invalid input syntax|malformed|cannot parse|NaN|22P02/i

export function classifyOwnerLevelDbError(
  err: { code?: string | null; message?: string | null; details?: string | null; hint?: string | null } | null | undefined,
): ClassifiedDbError {
  if (!err) {
    return { kind: 'blocked', reason: 'unexpected database error (empty error object)' }
  }
  const code = err.code ? String(err.code) : undefined
  const msg = `${err.message ?? ''} ${err.details ?? ''} ${err.hint ?? ''}`.trim()
  if ((code && NOT_DEPLOYED_CODES.has(code)) || NOT_DEPLOYED_RE.test(msg)) {
    return { kind: 'not_deployed', reason: msg || 'owner-level relation not deployed', code }
  }
  if ((code && (code === '42501' || code === 'PGRST301')) || PERMISSION_RE.test(msg)) {
    return { kind: 'blocked', reason: msg || 'permission denied', code }
  }
  if ((code && code === '57014') || TIMEOUT_RE.test(msg)) {
    return { kind: 'blocked', reason: msg || 'database timeout or network error', code }
  }
  if ((code && code === '22P02') || MALFORMED_RE.test(msg)) {
    return { kind: 'blocked', reason: msg || 'malformed database data', code }
  }
  return { kind: 'blocked', reason: msg || 'unexpected database error', code }
}

export function parseOwnerLevelAmount(value: number | string | null | undefined): { ok: true; n: number } | { ok: false; reason: string } {
  if (value == null || value === '') {
    return { ok: false, reason: 'amount_eur missing' }
  }
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) {
    return { ok: false, reason: `amount_eur malformed: ${String(value)}` }
  }
  return { ok: true, n }
}
