/**
 * Identity input helpers — pure, client-safe, no DB access.
 *
 * Shared shape/normalization logic used by the canonical resolvers.
 * Kept pure so it is unit-testable without a database (Jest / ts-jest, node env).
 *
 * The authoritative resolution logic lives in the DB (registry.resolve_property /
 * registry.resolve_party, exposed via public.resolve_*_canonical). These helpers
 * only classify/normalize the caller's input.
 */

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/** True when the trimmed input has canonical UUID shape. No fuzzy matching. */
export function isUuidLike(input: string | null | undefined): boolean {
  if (input == null) return false
  return UUID_RE.test(input.trim())
}

/** Blank / whitespace-only guard (fail-closed callers return not_found on true). */
export function isBlankInput(input: string | null | undefined): boolean {
  return input == null || input.trim().length === 0
}

/** Deterministic name normalization: trim + lowercase. Exact-equality only. */
export function normalizeIdentityName(input: string | null | undefined): string {
  return (input ?? '').trim().toLowerCase()
}
