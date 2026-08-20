/**
 * JJ Property 10 - Client Financial Timeline view-model (G3)
 *
 * Pure, deterministic presentation layer on top of the client-safe timeline
 * rows produced by `buildClientTimeline` (timelineCategory.ts). Handles column
 * projection, filtering (category / property / direction), and per-category
 * totals. Presentation/composition only: no accounting recompute, no internal
 * field touched. Consumes ClientTimelineRowWithProperty exclusively, so it is
 * structurally incapable of leaking payer/payee, actual cost, margin, evidence,
 * or raw description.
 *
 * LOCKED rules honoured here:
 *  - Purchase is already excluded upstream; nothing re-introduces it.
 *  - STR (Airbnb/STR) and LTR (Management/LTR) stay SEPARATE totals - never merged.
 *  - Settlement/Transfer is a distinct MOVEMENT bucket, not an operating category,
 *    and is summed separately from operating in/out.
 *  - Unknown is never coerced: an empty timeline yields empty output, not zeros
 *    masquerading as data.
 */
import type {
  ClientTimelineRow,
  ClientTimelineRowWithProperty,
  ClientTimelineCategory,
  TimelineDirection,
} from './timelineCategory'
import { TIMELINE_CATEGORIES } from './timelineCategory'

/** The client-safe column shape rendered by the timeline UI. Order = display order. */
export interface ClientTimelineColumns {
  date: string
  property: string
  category: ClientTimelineCategory
  subcategory: string
  /** Signed for display convenience: in => +amount, out => -amount, settlement => -amount. */
  signedAmount: number
  /** Absolute amount as stored on the client-safe row. */
  amount: number
  direction: TimelineDirection
}

/** Filter selection for the timeline. Empty/undefined set = no filtering on that axis. */
export interface TimelineFilter {
  categories?: ClientTimelineCategory[]
  properties?: string[]
  directions?: TimelineDirection[]
}

/** Per-category rollup. STR and LTR are distinct categories, so they never merge. */
export interface CategoryTotal {
  category: ClientTimelineCategory
  inflow: number
  outflow: number
  /** inflow - outflow for operating categories; for Settlement/Transfer this is the movement total. */
  net: number
  count: number
}

/** Grand summary of a (possibly filtered) timeline. */
export interface TimelineSummary {
  /** Operating inflow (direction === 'in'), excludes settlement movements. */
  operatingIn: number
  /** Operating outflow (direction === 'out'), excludes settlement movements. */
  operatingOut: number
  /** Settlement/Transfer movement total (direction === 'settlement'), kept separate. */
  settlement: number
  /** operatingIn - operatingOut. Settlement is deliberately NOT folded in. */
  operatingNet: number
  rowCount: number
}

const DIRECTION_SIGN: Record<TimelineDirection, number> = {
  in: 1,
  out: -1,
  settlement: -1,
}

/** Project a timeline row to its client-safe display columns. */
export function toTimelineColumns(row: ClientTimelineRowWithProperty): ClientTimelineColumns {
  return {
    date: row.date,
    property: row.property,
    category: row.category,
    subcategory: row.subcategory,
    signedAmount: DIRECTION_SIGN[row.direction] * row.amount,
    amount: row.amount,
    direction: row.direction,
  }
}

/**
 * Filter timeline rows by category / property / direction. A missing or empty
 * axis is treated as "no restriction". Ordering of the input is preserved
 * (buildClientTimeline already sorts by date), so filtering is stable.
 */
export function filterTimeline<T extends ClientTimelineRow & { property?: string }>(
  rows: T[],
  filter?: TimelineFilter,
): T[] {
  if (!filter) return rows.slice()
  const cats = filter.categories && filter.categories.length ? new Set(filter.categories) : null
  const props = filter.properties && filter.properties.length ? new Set(filter.properties) : null
  const dirs = filter.directions && filter.directions.length ? new Set(filter.directions) : null
  return rows.filter(r => {
    if (cats && !cats.has(r.category)) return false
    if (props && !props.has((r as { property?: string }).property ?? '')) return false
    if (dirs && !dirs.has(r.direction)) return false
    return true
  })
}

/** Distinct properties present in the timeline, in first-seen order (stable). */
export function timelineProperties(rows: ClientTimelineRowWithProperty[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of rows) {
    if (!seen.has(r.property)) {
      seen.add(r.property)
      out.push(r.property)
    }
  }
  return out
}

/**
 * Per-category rollups, one entry per category that actually occurs, in the
 * canonical TIMELINE_CATEGORIES order. STR and LTR remain separate rows.
 * Settlement/Transfer amounts land in their own category row only.
 */
export function categoryTotals(rows: ClientTimelineRow[]): CategoryTotal[] {
  const acc = new Map<ClientTimelineCategory, CategoryTotal>()
  for (const r of rows) {
    let c = acc.get(r.category)
    if (!c) {
      c = { category: r.category, inflow: 0, outflow: 0, net: 0, count: 0 }
      acc.set(r.category, c)
    }
    if (r.direction === 'in') c.inflow += r.amount
    else c.outflow += r.amount // 'out' and 'settlement' both reduce
    c.count += 1
  }
  const out: CategoryTotal[] = []
  for (const category of TIMELINE_CATEGORIES) {
    const c = acc.get(category)
    if (c) {
      c.net = c.inflow - c.outflow
      out.push(c)
    }
  }
  return out
}

/**
 * Grand summary. Operating in/out excludes settlement movements; settlement is
 * summed separately and never folded into operatingNet, preserving the locked
 * "Payment/Transfer = real movement, not an operating category" rule.
 */
export function timelineSummary(rows: ClientTimelineRow[]): TimelineSummary {
  let operatingIn = 0
  let operatingOut = 0
  let settlement = 0
  for (const r of rows) {
    if (r.direction === 'in') operatingIn += r.amount
    else if (r.direction === 'out') operatingOut += r.amount
    else settlement += r.amount
  }
  return {
    operatingIn,
    operatingOut,
    settlement,
    operatingNet: operatingIn - operatingOut,
    rowCount: rows.length,
  }
}
