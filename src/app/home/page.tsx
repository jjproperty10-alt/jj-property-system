import type { Metadata } from 'next'
import { DailyGreeting, HealthSignal, AllClearCard, PageShell } from '@/components/ds'
import { getHomeScreenState } from '@/lib/home/homeService'
import { getAuthorizedExecutiveBrief } from '@/lib/executive/executiveBriefService'
import { ExecutiveBrief } from '@/components/executive'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'JJ — Home',
}

/**
 * Home page — the owner's 60-second morning briefing.
 *
 * Eliminates one anxiety per section, in order of urgency:
 *   Position 1: Am I okay? (DailyGreeting)
 *   Position 2: Is something broken? (HealthSignal)
 *   Position 3: What needs me? (AllClearCard | NeedsAttentionSection [E3-A2])
 *   Position 4: Executive Brief — Chief of Staff MVP (M0)
 *   Position 5: What should I do first? (Quick Action [E3-A4])
 *   Position 6: What happened in detail? (Recent Activity [E3-A4])
 *
 * 5-Second Test: Clear, Calm, In Control, Informed, Assisted.
 *
 * E3 Experience Layer — E3-A1 (Positions 1, 2, 3 when count=0)
 *
 * AUTHORIZATION:
 * Executive Brief is DAL-protected via getAuthorizedExecutiveBrief().
 * - Authenticated superadmin → full brief rendered
 * - Authenticated non-superadmin → brief section omitted (no data leak)
 * - Unauthenticated → handled by middleware redirect before this runs
 *
 * @see ADR-003_DECISION_ACCESS_LAYER.md — DAL v0.1
 */
export default async function HomePage() {
  const [state, briefResult] = await Promise.all([
    getHomeScreenState(),
    getAuthorizedExecutiveBrief(),
  ])

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">

        {/* Position 1 — Am I okay? */}
        <DailyGreeting
          ownerName={state.ownerName}
          message={state.greeting}
          timeOfDay={state.timeOfDay}
        />

        {/* Position 2 — Business Status */}
        <div>
          <p className="jj-label mb-2 text-gray-400">Business Status</p>
          <HealthSignal status={state.health} />
        </div>

        {/* Position 3 — What needs me? (Emotional Resolution) */}
        {state.needsAttentionCount === 0 ? (
          /* You're done — the best possible state */
          <AllClearCard
            headline="Nothing needs you right now."
            lines={state.allClearLines}
            emoji={state.allClearEmoji}
          />
        ) : (
          /*
           * Items need the owner's decision.
           * E3-A2: Replace this placeholder with <NeedsAttentionSection />.
           */
          <div
            className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800"
            data-e3-slot="needs-attention-placeholder"
          >
            {state.needsAttentionCount} item
            {state.needsAttentionCount !== 1 ? 's need' : ' needs'} your decision —{' '}
            <span className="text-xs text-amber-600 italic">NeedsAttentionSection (E3-A2)</span>
          </div>
        )}

        {/* Position 4 — Executive Brief (Chief of Staff MVP)
         * DAL-protected: only rendered when getAuthorizedExecutiveBrief() returns ok.
         * If the authenticated user lacks VIEW permission, this section is omitted.
         * No partial data, no error message — the section simply doesn't exist
         * for unauthorized users (fail-closed, no information leakage).
         */}
        {briefResult.ok && <ExecutiveBrief dto={briefResult.dto} />}

        {/*
         * Position 5 — Quick Action: E3-A4
         * Position 6 — Recent Activity: E3-A4
         */}

      </div>
    </PageShell>
  )
}
