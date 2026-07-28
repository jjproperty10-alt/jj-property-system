import type { Metadata } from 'next'
import { DailyGreeting, HealthSignal, AllClearCard, PageShell, WorkspaceHeader } from '@/components/ds'
import { getHomeBrief } from '@/lib/home/homeService'
import { getAuthorizedExecutiveBrief } from '@/lib/executive/executiveBriefService'
import { ExecutiveBrief } from '@/components/executive'
import { NeedsAttentionSection } from '@/components/home/NeedsAttentionSection'
import { HomeUnavailable } from '@/components/home/HomeUnavailable'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'JJ — Home',
}

/**
 * Home page — the owner's 60-second morning briefing.
 *
 * PR #79 — Reference Case #2: Home with Real Business Information.
 *
 * Every fact on this screen traces to an authoritative provider.
 * No position shows hardcoded data. No position fabricates a count.
 * Positions with no authoritative source show nothing — not zero.
 *
 * Eliminates one anxiety per section, in order of urgency:
 *   Position 1: Am I okay? (DailyGreeting — from brief state)
 *   Position 2: Is something broken? (HealthSignal — from brief state)
 *   Position 3: What needs me? (AllClearCard | NeedsAttentionSection | HomeUnavailable)
 *   Position 4: Executive Brief — Chief of Staff MVP (M0)
 *   Position 5: What should I do first? (Quick Action [E3-A4 — future])
 *   Position 6: What happened in detail? (Recent Activity [E3-A4 — future])
 *
 * Authority Map:
 *   ownerName       → Auth Identity (getHomeBrief resolves from auth)
 *   timeOfDay       → Server clock
 *   health          → Derived from ExecutiveBriefDTO.summary
 *   allClear        → Derived from ExecutiveBriefDTO.summary + evidence coverage
 *   greetingMessage → Derived from ExecutiveBriefDTO.summary
 *   attentionItems  → Derived from ExecutiveBriefDTO.sections
 *   Executive Brief → ExecutiveBriefDTO (DAL-protected, rendered directly)
 *
 * AUTHORIZATION:
 *   Executive Brief is DAL-protected via getAuthorizedExecutiveBrief().
 *   Home Brief derives from the same brief — inherits DAL authorization.
 *
 * NAV-1 Composition (Tree B — Single-Section Page):
 *   OperatingFrame → PageShell → <main> → WorkspaceHeader → content
 *
 * @see PR79_GATE0_AND_DESIGN_PACKAGE.md — Gate 0 + Design Package
 * @see ADR-003_DECISION_ACCESS_LAYER.md — DAL v0.1
 * @see NAV-1_PHASE4_COMPOSITION_RULES.md — Tree B
 */
export default async function HomePage() {
  // Home Brief and Executive Brief share the same DAL-protected pipeline.
  // getHomeBrief calls getAuthorizedExecutiveBrief internally, so we
  // call getAuthorizedExecutiveBrief separately only for Position 4
  // (the full Executive Brief rendering).
  const [homeBrief, briefResult] = await Promise.all([
    getHomeBrief('Yossi'),
    getAuthorizedExecutiveBrief(),
  ])

  return (
    <PageShell>
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <WorkspaceHeader title="Home" />

        {/* Position 1 — Am I okay?
         * greetingMessage is null when indeterminate → DailyGreeting returns null (silence).
         */}
        <DailyGreeting
          ownerName={homeBrief.ownerName}
          message={homeBrief.greetingMessage ?? ''}
          timeOfDay={homeBrief.timeOfDay}
        />

        {/* Position 2 — Business Status
         * health is null when indeterminate → HealthSignal not rendered (silence > noise).
         */}
        {homeBrief.health !== null && (
          <div>
            <p className="jj-label mb-2 text-gray-400">Business Status</p>
            <HealthSignal status={homeBrief.health} />
          </div>
        )}

        {/* Position 3 — What needs me? (Emotional Resolution)
         *
         * allClear truth table:
         *   true  → AllClearCard (you're done — the best possible state)
         *   false → NeedsAttentionSection (items exist)
         *   null  → HomeUnavailable (can't determine — silence > false certainty)
         */}
        {homeBrief.allClear === true && (
          <AllClearCard
            headline={homeBrief.allClearHeadline ?? 'Nothing needs your attention right now.'}
            lines={[...homeBrief.allClearLines]}
          />
        )}
        {homeBrief.allClear === false && (
          <NeedsAttentionSection items={homeBrief.needsAttentionItems} />
        )}
        {homeBrief.allClear === null && (
          <HomeUnavailable />
        )}

        {/* Position 4 — Executive Brief (Chief of Staff MVP)
         * DAL-protected: only rendered when getAuthorizedExecutiveBrief() returns ok.
         * If the authenticated user lacks VIEW permission, this section is omitted.
         * No partial data, no error message — the section simply doesn't exist
         * for unauthorized users (fail-closed, no information leakage).
         */}
        {briefResult.ok && <ExecutiveBrief dto={briefResult.dto} />}

        {/*
         * Position 5 — Quick Action: E3-A4 (future — no authority exists yet)
         * Position 6 — Recent Activity: E3-A4 (future — no authority exists yet)
         */}

      </main>
    </PageShell>
  )
}
