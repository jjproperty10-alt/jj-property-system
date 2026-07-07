// audit_property_status.ts
// Single source of truth for all property section status logic.
// Imported by both the detail page and the properties list page.
// Copy to: src/lib/propertyStatus.ts

export type StatusColor = 'green' | 'yellow' | 'orange' | 'red' | 'gray' | 'blue'

export interface SectionStatus {
  label: string
  color: StatusColor
}

// Minimum shape required for status calculations.
// Both Summary (detail) and P (list) satisfy this interface.
export interface StatusSummary {
  purchase_contract: number
  purchase_paid_to_seller: number
  purchase_expenses_only: number
  sale_contract: number
  sale_received: number
  third_party_payment: number
  sale_costs: number
  renovation_contract: number
  renovation_extras_charge: number
  renovation_extras_cost: number
  renovation_received: number
  renovation_costs: number
  renovation_actual_cost?: number  // P0-B: actual cost = base + extras; optional for backwards compat
  management_income: number
  management_expenses: number
  management_fees: number
  airbnb_platform_income: number
  airbnb_expenses: number
}

export interface StatusOwner {
  owner_type: string
  entry_valuation?: number | null
}

// Internal helper — safe number coerce
function n(v: number | null | undefined): number {
  return Number(v) || 0
}

// ── STATUS_COLORS ─────────────────────────────────────────────────────────────
// Maps color key → Tailwind CSS classes used for dots, text, and badges.
export const STATUS_COLORS: Record<StatusColor, { dot: string; text: string; badge: string }> = {
  green:  { dot: 'bg-green-500',  text: 'text-green-600',  badge: 'bg-green-100 text-green-700' },
  yellow: { dot: 'bg-yellow-400', text: 'text-amber-600',  badge: 'bg-yellow-100 text-yellow-700' },
  orange: { dot: 'bg-orange-500', text: 'text-orange-600', badge: 'bg-orange-100 text-orange-700' },
  red:    { dot: 'bg-red-500',    text: 'text-red-600',    badge: 'bg-red-100 text-red-700' },
  gray:   { dot: 'bg-gray-300',   text: 'text-gray-400',   badge: 'bg-gray-100 text-gray-500' },
  blue:   { dot: 'bg-blue-500',   text: 'text-blue-600',   badge: 'bg-blue-100 text-blue-700' },
}

// ── Health Score ──────────────────────────────────────────────────────────────
// Operational completeness score 0–100. NOT financial.
// Each applicable (non-gray) section contributes:
//   green=100, yellow=60, orange=30, red=0, blue=50
// Score = average of applicable sections. Gray sections excluded.
export type HealthTier = 'Excellent' | 'Good' | 'Needs attention' | 'High attention' | 'Critical'

export interface HealthScore {
  score: number
  tier: HealthTier
}

const HEALTH_POINTS: Record<StatusColor, number | null> = {
  green:  100,
  yellow: 60,
  orange: 30,
  red:    0,
  blue:   50,
  gray:   null,  // not applicable — excluded from average
}

export function computeHealth(statuses: SectionStatus[]): HealthScore {
  const applicable = statuses.filter(s => s.color !== 'gray')
  if (applicable.length === 0) return { score: 0, tier: 'Critical' }

  const total = applicable.reduce((sum, s) => sum + (HEALTH_POINTS[s.color] ?? 0), 0)
  const score = Math.round(total / applicable.length)

  let tier: HealthTier
  if (score >= 90)      tier = 'Excellent'
  else if (score >= 75) tier = 'Good'
  else if (score >= 50) tier = 'Needs attention'
  else if (score >= 25) tier = 'High attention'
  else                  tier = 'Critical'

  return { score, tier }
}

export function healthBarColor(score: number): string {
  if (score >= 75) return '#639922'
  if (score >= 50) return '#ef9f27'
  if (score >= 25) return '#c4600a'
  return '#e24b4a'
}

export function healthTextClass(score: number): string {
  if (score >= 75) return 'text-green-600'
  if (score >= 50) return 'text-amber-600'
  if (score >= 25) return 'text-orange-600'
  return 'text-red-600'
}

// ── Priority Engine ────────────────────────────────────────────────────────────
// Aggregates signals that need action. NOT just P&L.
// Points:  red status = +3,  orange = +2,  yellow = +1
// Critical ≥ 6 | High 4–5 | Medium 2–3 | Low 0–1
export type Priority = 'Critical' | 'High' | 'Medium' | 'Low'

export const PRIORITY_BADGE: Record<Priority, string> = {
  Critical: 'bg-red-100 text-red-700',
  High:     'bg-orange-100 text-orange-700',
  Medium:   'bg-amber-100 text-amber-700',
  Low:      'bg-green-100 text-green-700',
}

export function computePriority(statuses: SectionStatus[]): Priority {
  let points = 0
  for (const s of statuses) {
    if (s.color === 'red')    points += 3
    else if (s.color === 'orange') points += 2
    else if (s.color === 'yellow') points += 1
  }
  if (points >= 6) return 'Critical'
  if (points >= 4) return 'High'
  if (points >= 2) return 'Medium'
  return 'Low'
}

// ── 1. Purchase Status ────────────────────────────────────────────────────────
// Business question: "Has JJ fully invested capital to close the purchase?"
// Closed      (green)  — contract > 0, balance = 0 (fully paid)
// Partially paid (yellow) — some paid, balance remaining
// Waiting     (orange) — contract exists but nothing paid yet
// No data     (gray)   — no purchase data at all
export function purchaseStatus(s: StatusSummary): SectionStatus {
  const contract = n(s.purchase_contract)
  const paid     = n(s.purchase_paid_to_seller)
  const expenses = n(s.purchase_expenses_only)

  if (contract === 0 && paid === 0 && expenses === 0) {
    return { label: 'No data', color: 'gray' }
  }
  if (paid === 0 && expenses === 0) {
    return { label: 'Waiting', color: 'orange' }
  }
  const balance = contract - paid
  if (balance > 0) {
    return { label: 'Partially paid', color: 'yellow' }
  }
  return { label: 'Closed', color: 'green' }
}

// ── 2. Partner Entry Status ───────────────────────────────────────────────────
// Business question: "Has the partner brought their required capital in?"
// Capital complete   (green)  — future: when payment is tracked
// Waiting for capital (yellow) — entry valuation configured, payment not yet tracked
// Capital missing    (orange) — billable owners exist but entry valuation not set
// Not configured     (gray)   — no external/investor/client owners on this property
export function partnerStatus(owners: StatusOwner[]): SectionStatus {
  const billable = owners.filter(o =>
    ['investor', 'external', 'client'].includes(o.owner_type)
  )
  if (billable.length === 0) {
    return { label: 'Not configured', color: 'gray' }
  }
  const withValuation = billable.filter(o => n(o.entry_valuation) > 0)
  if (withValuation.length === 0) {
    return { label: 'Capital missing', color: 'orange' }
  }
  // Entry valuation set; payment tracking not yet connected
  return { label: 'Waiting for capital', color: 'yellow' }
}

// ── 3. Renovation Status ──────────────────────────────────────────────────────
// Business question: "Did JJ earn from this renovation? What does the client still owe?"
// Completed    (green)  — renovation done, profitable, no client debt
// Waiting client (orange) — client still owes money
// In progress  (yellow) — costs started but not complete
// Loss         (red)    — real profit is negative
// No activity  (gray)   — no renovation data
export function renovationStatus(s: StatusSummary): SectionStatus {
  // P0-B: use renovation_actual_cost (base + extras) when available; fall back to renovation_costs
  const costs    = n(s.renovation_actual_cost ?? s.renovation_costs)
  const received = n(s.renovation_received)
  const contract = n(s.renovation_contract)
  const extras   = n(s.renovation_extras_charge)
  const profit   = received - costs
  const owes     = extras - received

  if (costs === 0 && contract === 0 && received === 0) {
    return { label: 'No activity', color: 'gray' }
  }
  if (profit < 0) {
    return { label: 'Loss', color: 'red' }
  }
  if (owes > 0) {
    return { label: 'Waiting client', color: 'orange' }
  }
  if (costs > 0 && profit >= 0) {
    return { label: 'Completed', color: 'green' }
  }
  return { label: 'In progress', color: 'yellow' }
}

// ── 4. Airbnb Status ──────────────────────────────────────────────────────────
// Business question: "Is the Airbnb generating positive operating margin for JJ?"
// Active       (green) — income > 0 and result >= 0
// Loss         (red)   — income > 0 but result < 0
// No activity  (gray)  — no income recorded
export function airbnbStatus(s: StatusSummary): SectionStatus {
  const income = n(s.airbnb_platform_income)
  const result = income - n(s.airbnb_expenses)

  if (income === 0) {
    return { label: 'No activity', color: 'gray' }
  }
  if (result < 0) {
    return { label: 'Loss', color: 'red' }
  }
  return { label: 'Active', color: 'green' }
}

// ── 5. Management Status ──────────────────────────────────────────────────────
// Business question: "Is JJ collecting rent and keeping money from management?"
// Active       (green) — income > 0 and profit >= 0
// Loss         (red)   — income > 0 but profit < 0
// No activity  (gray)  — no income recorded
export function managementStatus(s: StatusSummary): SectionStatus {
  const income = n(s.management_income)
  const profit = income - n(s.management_expenses) - n(s.management_fees)

  if (income === 0) {
    return { label: 'No activity', color: 'gray' }
  }
  if (profit < 0) {
    return { label: 'Loss', color: 'red' }
  }
  return { label: 'Active', color: 'green' }
}

// ── 6. Sale Status ────────────────────────────────────────────────────────────
// Business question: "What is the total return from selling this property?"
// Sold         (green)  — sale contract exists, fully received
// Negotiation  (yellow) — partial payment received
// For sale     (blue)   — contract exists, nothing received yet
// Not for sale (gray)   — no sale contract
export function saleStatus(s: StatusSummary): SectionStatus {
  const contract      = n(s.sale_contract)
  const totalReceived = n(s.sale_received) + n(s.third_party_payment)

  if (contract === 0) {
    return { label: 'Not for sale', color: 'gray' }
  }
  if (totalReceived === 0) {
    return { label: 'For sale', color: 'blue' }
  }
  const balance = contract - totalReceived
  if (balance > 0) {
    return { label: 'Negotiation', color: 'yellow' }
  }
  return { label: 'Sold', color: 'green' }
}
