/**
 * @page /finance/decision/[partner]/[period]
 * @description Finance Decision Page — First Vertical Slice.
 *
 * Server Component: fetches position + decision evaluation server-side.
 * Passes pre-computed data to client UI components.
 *
 * URL format:
 *   /finance/decision/Jacob/2026-07        → July 2026 / approve_withdrawal
 *   /finance/decision/Yossi/2026-06        → June 2026 / approve_withdrawal
 *
 * Period parsing: [period] = YYYY-MM → first/last day of that month
 *
 * Auth: requires jj_staff (server-side, via require_jj_staff function in Supabase).
 * For PR #1 demo: auth check is documented but minimally enforced (JHKA principle —
 * architecture proven before auth hardening).
 *
 * ADR-005: evaluateDecision() produces NO log entry.
 *          logDecision() is called only on Server Action execution.
 */

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { computeFinancialPosition } from '@/lib/finance/computeFinancialPosition'
import { evaluateDecision } from '@/lib/finance/evaluateDecision'
import { logDecision } from '@/lib/finance/logDecision'
import { FinancialPositionCard } from '@/components/finance/FinancialPositionCard'
import { ClaimBreakdown } from '@/components/finance/ClaimBreakdown'
import { DecisionCard } from '@/components/finance/DecisionCard'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse YYYY-MM into first/last day of that month */
function parsePeriod(period: string): { periodStart: Date; periodEnd: Date; label: string } | null {
  const match = period.match(/^(\d{4})-(\d{2})$/)
  if (!match) return null
  const year = parseInt(match[1], 10)
  const month = parseInt(match[2], 10)
  if (month < 1 || month > 12) return null
  const periodStart = new Date(year, month - 1, 1)
  const periodEnd = new Date(year, month, 0) // Last day of month
  const label = periodStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  return { periodStart, periodEnd, label }
}

/** Capitalize first letter */
function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ── Server Action — logDecision on execute ───────────────────────────────────

async function executeDecision(
  partner: string,
  entityType: string,
  periodStart: Date,
  periodEnd: Date,
  decisionType: string,
  override: boolean,
  overrideReason?: string,
): Promise<void> {
  'use server'

  // Get current staff session for decidedBy
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Re-compute position + evaluate decision at execution time
  const [position, decision] = await Promise.all([
    computeFinancialPosition({
      entityId: capitalize(partner),
      entityType,
      periodStart,
      periodEnd,
      decisionType,
    }),
    evaluateDecision({
      decisionType,
      entityId: capitalize(partner),
      entityType,
      periodStart,
      periodEnd,
    }),
  ])

  // Override is not available in PR #1.
  // Dual-approval override (requester + DAL.Approve second approver) is implemented in RC2.
  // Reject here so the UI cannot trigger an override execution path.
  if (override) {
    throw new Error(
      'Override requires dual approval — not available in PR #1. ' +
      'A second approver with DAL.Approve must authorize the override. ' +
      'This feature is implemented in RC2.',
    )
  }

  // Only log if allPass — no override path in PR #1
  if (!decision.allPass) {
    throw new Error('Decision is blocked. Resolve all required claims before executing.')
  }

  await logDecision({
    decisionType,
    entityId: capitalize(partner),
    entityType,
    periodStart,
    periodEnd,
    decidedBy: user.id,              // server-derived from cookie session — not client input
    claims: decision.claims,
    position,
    override,
    overrideReason,
    // Note: override=true is rejected above before this call is reached.
    // overrideApprovedBy is not a parameter — deferred to RC2 with dual-approval enforcement.
  })
}

// ── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: { partner: string; period: string }
}

export default async function FinanceDecisionPage({ params }: PageProps) {
  const { partner, period } = await params

  // Parse period
  const parsed = parsePeriod(period)
  if (!parsed) {
    return (
      <div className="p-8 text-red-600">
        Invalid period format. Use YYYY-MM (e.g., 2026-07).
      </div>
    )
  }
  const { periodStart, periodEnd, label: periodLabel } = parsed

  const entityId = capitalize(partner)
  const entityType = 'partner'
  const decisionType = 'approve_withdrawal'

  // Compute position + decision evaluation in parallel (server-side)
  const [position, decision] = await Promise.all([
    computeFinancialPosition({
      entityId,
      entityType,
      periodStart,
      periodEnd,
      decisionType,
    }),
    evaluateDecision({
      decisionType,
      entityId,
      entityType,
      periodStart,
      periodEnd,
    }),
  ])

  // Bind Server Action for this specific partner/period
  const handleExecute = async (params: { override: boolean; overrideReason?: string }) => {
    'use server'
    await executeDecision(
      partner,
      entityType,
      periodStart,
      periodEnd,
      decisionType,
      params.override,
      params.overrideReason,
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="max-w-3xl mx-auto">
          <nav className="text-xs text-gray-400 mb-2">
            Finance / Decision
          </nav>
          <h1 className="text-xl font-bold text-gray-900">
            {entityId} — {periodLabel}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Decision: {decisionType.replace(/_/g, ' ')}
          </p>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-6">

        {/* 1. Decision outcome — top of page (most actionable) */}
        <DecisionCard
          decision={decision}
          entityLabel={entityId}
          period={periodLabel}
          onExecute={handleExecute}
        />

        {/* 2. Financial position */}
        <FinancialPositionCard position={position} />

        {/* 3. Claims breakdown */}
        <ClaimBreakdown claims={position.claims} />

        {/* 4. Footer — audit note */}
        <p className="text-xs text-gray-400 text-center pb-4">
          Position computed {new Date(position.computedAt).toLocaleString('en-GB')}.
          Decision evaluations are not stored — only Executed decisions create an audit log entry.
        </p>
      </div>
    </div>
  )
}
