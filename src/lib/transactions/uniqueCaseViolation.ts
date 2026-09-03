/**
 * Detect Postgres unique_violation (23505) from Supabase/PostgREST errors
 * and build a clear user-facing message for M1 correction concurrency.
 */

export function isPostgresUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: string; message?: string }
  if (e.code === '23505') return true
  const msg = (e.message ?? '').toLowerCase()
  return (
    msg.includes('uq_correction_cases_one_nonterminal_per_tx') ||
    msg.includes('statements.uq_correction_cases_one_nonterminal_per_tx') ||
    (msg.includes('duplicate key') && msg.includes('correction_cases')) ||
    msg.includes('unique_violation')
  )
}

export function uniqueNonterminalCaseMessage(existingCaseId?: string | null): string {
  const idPart = existingCaseId ? ` Existing case: ${existingCaseId}.` : ''
  return (
    'A non-terminal correction case already exists for this transaction ' +
    '(open, under_review, or approved). Resume that case or resolve it before opening another.' +
    idPart
  )
}
