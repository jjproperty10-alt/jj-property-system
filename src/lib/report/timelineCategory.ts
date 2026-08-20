/**
 * JJ Property 10 — Client-facing Financial Timeline categorization (G3)
 *
 * Pure, deterministic mapping from an enriched RC3 row to the client-safe
 * timeline shape. Presentation/composition only — no accounting recompute, no
 * accounting field modified.
 *
 * LOCKED rules:
 *  - Client-facing categories: Sale, Renovation, Management/LTR, Airbnb/STR.
 *  - Settlement/Transfer is a distinct MOVEMENT (not an operating category).
 *  - Purchase = JJ acquisition → NEVER appears in the owner/client timeline.
 *  - STR (Airbnb) and LTR (Management/rental) are separate categories.
 *  - No internal fields (payer/payee, actual cost, margin, evidence,
 *    classification) are exposed — this consumes the client-safe row only.
 */
import type { ClientDisplayRow } from './clientRow'

export type ClientTimelineCategory =
  | 'Sale'
  | 'Renovation'
  | 'Management/LTR'
  | 'Airbnb/STR'
  | 'Settlement/Transfer'

export type TimelineDirection = 'in' | 'out' | 'settlement'

export interface ClientTimelineRow {
  id: string
  date: string
  category: ClientTimelineCategory
  /** Client-safe subcategory label (from display_label). */
  subcategory: string
  /** Client-safe description (same source as subcategory; never raw description). */
  description: string
  amount: number
  direction: TimelineDirection
}

/** Account types that are JJ-internal and excluded from the client timeline. */
const EXCLUDED_ACCOUNT_TYPES = new Set<string>(['purchase'])

const ACCOUNT_CATEGORY: Record<string, ClientTimelineCategory> = {
  sale: 'Sale',
  renovation: 'Renovation',
  rental: 'Management/LTR',
  airbnb: 'Airbnb/STR',
}

/**
 * Resolve the client-facing category for a row. Returns null when the row must
 * NOT appear in the client timeline (Purchase, or an unmapped account type —
 * Unknown is never silently forced into a category).
 */
export function resolveTimelineCategory(row: ClientDisplayRow): ClientTimelineCategory | null {
  if (EXCLUDED_ACCOUNT_TYPES.has(row.account_type)) return null
  // A payment/transfer to owner (BPO) is a settlement movement, regardless of
  // which operating account it sits under.
  if (row.display_group === 'payment_out') return 'Settlement/Transfer'
  return ACCOUNT_CATEGORY[row.account_type] ?? null
}

/** Map the client-safe display group to a timeline direction. */
export function resolveDirection(row: ClientDisplayRow): TimelineDirection {
  if (row.display_group === 'payment_out') return 'settlement'
  if (row.display_group === 'income') return 'in'
  return 'out'
}

/**
 * Convert a client-safe row to a client timeline row, or null when the row is
 * not client-timeline-visible (Purchase / info / reference / unmapped).
 */
export function toClientTimelineRow(row: ClientDisplayRow): ClientTimelineRow | null {
  // info / reference rows are tracking-only and never shown as timeline movements
  if (row.display_group === 'info' || row.display_group === 'reference') return null
  const category = resolveTimelineCategory(row)
  if (category == null) return null
  const label = (row.display_label || '').trim()
  return {
    id: row.id,
    date: row.date,
    category,
    subcategory: label,
    description: label,
    amount: row.client_amount,
    direction: resolveDirection(row),
  }
}

/** Category filter set for the timeline UI (order is display order). */
export const TIMELINE_CATEGORIES: ClientTimelineCategory[] = [
  'Sale',
  'Renovation',
  'Management/LTR',
  'Airbnb/STR',
  'Settlement/Transfer',
]

/* ─── G3: build the categorized client timeline from RC3 reports ───────────── */
import type { RC3PropertyReport } from './types'
import { toClientRow } from './clientRow'
import { filterOwnerFacingSections } from './executiveSummary'

/** A client timeline row plus its property (the Property column). */
export type ClientTimelineRowWithProperty = ClientTimelineRow & { property: string }

/**
 * Build the client-facing Financial Timeline across one or many property reports.
 * Canonical, deterministic path: RC3 rows → client-safe row (toClientRow) →
 * timeline row (toClientTimelineRow). Purchase is excluded twice over
 * (filterOwnerFacingSections + resolveTimelineCategory). Rows are sorted by date.
 * No accounting recompute; amounts come straight from client_amount.
 */
export function buildClientTimeline(
  reports: RC3PropertyReport[],
): ClientTimelineRowWithProperty[] {
  const out: ClientTimelineRowWithProperty[] = []
  for (const rep of reports) {
    for (const section of filterOwnerFacingSections(rep.accounts)) {
      for (const row of section.rows) {
        const t = toClientTimelineRow(toClientRow(row))
        if (t) out.push({ ...t, property: rep.reporting_name })
      }
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}
