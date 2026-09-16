/**
 * Server read helper for certified ledger rows.
 * Queries public.v_certified_ledger_transactions (predicate enforced in SQL).
 * Fail-closed: any read error or null payload throws — never silently include all rows.
 */
import { CERTIFIED_LEDGER_VIEW, CertifiedLedgerUnavailableError } from './certifiedLedger'

export interface CertifiedLedgerQuery {
  readonly select: string
  readonly propertyNames?: readonly string[]
  readonly categories?: readonly string[]
  readonly subcategory?: string
  readonly dateGte?: string
  readonly dateLte?: string
  readonly eq?: Readonly<Record<string, string>>
}

type LedgerFrom = { from: (relation: string) => unknown }

export async function fetchCertifiedLedgerRows(
  sb: LedgerFrom,
  query: CertifiedLedgerQuery,
): Promise<Record<string, unknown>[]> {
  if (query.propertyNames && query.propertyNames.length === 0) return []

  const root = sb.from(CERTIFIED_LEDGER_VIEW) as {
    select: (cols: string) => unknown
  }
  let q = root.select(query.select) as {
    in: (col: string, vals: readonly string[]) => unknown
    eq: (col: string, val: string) => unknown
    gte: (col: string, val: string) => unknown
    lte: (col: string, val: string) => unknown
  }
  if (query.propertyNames) q = q.in('property_name', query.propertyNames) as typeof q
  if (query.categories) q = q.in('category', query.categories) as typeof q
  if (query.subcategory) q = q.eq('subcategory', query.subcategory) as typeof q
  if (query.dateGte) q = q.gte('date', query.dateGte) as typeof q
  if (query.dateLte) q = q.lte('date', query.dateLte) as typeof q
  if (query.eq) {
    for (const [col, val] of Object.entries(query.eq)) {
      q = q.eq(col, val) as typeof q
    }
  }

  const result = await (q as unknown as Promise<{ data: unknown; error: { message?: string } | null }>)
  if (result.error || result.data == null) {
    throw new CertifiedLedgerUnavailableError(
      'LEDGER_SOURCE_UNAVAILABLE',
      result.error?.message ?? 'null certified ledger payload',
    )
  }
  if (!Array.isArray(result.data)) {
    throw new CertifiedLedgerUnavailableError('LEDGER_SOURCE_UNAVAILABLE', 'certified ledger payload is not an array')
  }
  return result.data as Record<string, unknown>[]
}
