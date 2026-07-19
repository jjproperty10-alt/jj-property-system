import type { PartnerFacingStatementDTO, PartnerPropertyStatement } from '@/lib/lifecycle/partnerStatementTypes'
import { PartnerCapitalSection } from './PartnerCapitalSection'
import { PartnerFinancialSection } from './PartnerFinancialSection'
import { PartnerTimelineSection } from './PartnerTimelineSection'
import { PartnerPortfolioSection } from './PartnerPortfolioSection'
import { SettlementCard } from './SettlementCard'
import { WelcomeHeader } from '@/components/partner/WelcomeHeader'
import { ExecutiveSummary } from '@/components/partner/ExecutiveSummary'
import { NeedsAttentionItems } from '@/components/ds/NeedsAttentionItems'


interface Props { dto: PartnerFacingStatementDTO }

/**
 * Deterministic deep-navy accent per property name.
 * Returns a CSS linear-gradient string (used in style prop, not Tailwind class,
 * to avoid build-time purge issues with dynamic values).
 */
function propertyAccent(name: string): string {
  const hash = name.split('').reduce((h, c) => Math.imul(h, 31) + c.charCodeAt(0), 0)
  const palettes = [
    ['#0f2d5e', '#071a3e'],
    ['#1a3a6b', '#0d2045'],
    ['#0e3055', '#06183a'],
    ['#1d3464', '#0a1c42'],
    ['#163058', '#091e3d'],
    ['#24396b', '#101f46'],
  ]
  const [from, to] = palettes[Math.abs(hash) % palettes.length]
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`
}

/**
 * Derive attention items from real DTO values (F3: no hardcoding).
 * Source: timeline.openVerificationTasks is fetched server-side from
 * lifecycle.verification_tasks by timelineService. Items ordered by
 * consequence severity — NeedsAttentionItems shows max 3.
 */
function deriveAttentionItems(prop: PartnerPropertyStatement): string[] {
  const items: string[] = []
  if (prop.timeline.openVerificationTasks > 0) {
    const n = prop.timeline.openVerificationTasks
    items.push(`${n} date${n === 1 ? '' : 's'} pending confirmation`)
  }
  if (prop.capital.capitalStatus === 'capital_unknown') {
    items.push('Investment amount to be verified')
  }
  return items
}

/**
 * PartnerReport — PR D: Modern Visual Polish
 *
 * R4 wiring (functional closure):
 * - F1: partnerStatementService uses direction='inflow' (DB constraint fix)
 * - F2: HighlightTimeline wired via PartnerTimelineSection (FR-001 compliant)
 * - F3: NeedsAttentionItems populated from real DTO values (server-side DB count)
 * - F4: SettlementCard outside {prop.financial && ...} guard — renders when financial===null
 *
 * P-ARCH-6: no jj_* fields. Discriminated union ensures PartnerFacingStatementDTO
 * is the only type accepted here.
 */
export function PartnerReport({ dto }: Props) {
  const { investor, properties, portfolio, actions, localization } = dto

  const formattedDate = new Date(localization.generatedAt).toLocaleDateString('en-IE', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <>
      {/* R1: Partner Report Story — Welcome + Executive Summary */}
      <WelcomeHeader
        ownerName={investor.canonicalName}
        propertyName={null}
        period={formattedDate}
        className="mb-6 max-w-4xl mx-auto px-4 sm:px-6 pt-6"
      />
      <ExecutiveSummary
        income={null}
        expenses={null}
        netResult={null}
        status={null}
        className="mb-6 max-w-4xl mx-auto px-4 sm:px-6"
      />
      {/* End R1 story sections — real DTO wiring in subsequent PRs */}
      <div className="min-h-screen bg-gray-50">


      {/* ── Master header ── */}
      <header style={{ background: 'linear-gradient(135deg, #071a3e 0%, #0f2d5e 50%, #1a3a6b 100%)' }}>
        <div className="max-w-4xl mx-auto px-6 py-10 sm:py-12">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-blue-300/70 mb-4">
            JJ Property 10 · Partner Statement
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
            {investor.canonicalName}
          </h1>
          <p className="mt-2 text-sm text-blue-300/60">{formattedDate}</p>
        </div>
      </header>

      {/* ── Properties ── */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {properties.map((prop) => {
          const attentionItems = deriveAttentionItems(prop)
          return (
            <article
              key={prop.propertyName}
              className="rounded-2xl overflow-hidden border border-gray-200/80 bg-white shadow-sm"
            >
              {/* Property gradient header */}
              <div style={{ background: propertyAccent(prop.propertyName) }} className="px-6 py-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-xl font-bold text-white leading-snug">{prop.propertyName}</h2>
                    {prop.ownership.currentOwnershipPct !== null && (
                      <p className="text-sm text-white/55 mt-1">
                        {prop.ownership.currentOwnershipPct}% ownership
                      </p>
                    )}
                  </div>
                  <OwnershipBadge status={prop.ownership.entryStatus} />
                </div>

                {/* Co-owner chips */}
                {prop.ownership.coOwners.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {prop.ownership.coOwners.map((co) => (
                      <span
                        key={co.name}
                        className="text-[10px] font-semibold text-white/55 bg-white/[0.08] px-2 py-0.5 rounded-full border border-white/10"
                      >
                        {co.name} · {co.ownershipPct}%
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Section stack — divide-y creates separators; null sections collapse cleanly */}
              <div className="divide-y divide-gray-100">
                <PartnerCapitalSection capital={prop.capital} />
                {prop.financial && (
                  <PartnerFinancialSection financial={prop.financial} />
                )}
                <PartnerTimelineSection timeline={prop.timeline} />
                {/* F4: SettlementCard outside financial guard — renders when financial===null */}
                <SettlementCard settlement={prop.settlement} className="px-6 py-6" />
                {/* F3: NeedsAttentionItems from real server-side DTO values */}
                {attentionItems.length > 0 && (
                  <NeedsAttentionItems items={attentionItems} className="px-6 py-6" />
                )}
              </div>
            </article>
          )
        })}

        {/* Portfolio summary (2+ properties only) */}
        {properties.length > 1 && <PartnerPortfolioSection portfolio={portfolio} />}

        {/* Export controls — disabled until RC2 */}
        {(actions.canExportCsv || actions.canGeneratePdf) && (
          <div className="flex gap-3">
            {actions.canGeneratePdf && (
              <button
                disabled
                title="Available after Settlement Engine (RC2)"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-400 font-medium cursor-not-allowed shadow-sm"
              >
                ↓ PDF
              </button>
            )}
            {actions.canExportCsv && (
              <button
                disabled
                title="Available after Settlement Engine (RC2)"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-400 font-medium cursor-not-allowed shadow-sm"
              >
                ↓ CSV
              </button>
            )}
          </div>
        )}

        <footer className="pb-4 pt-6 border-t border-gray-100 text-xs text-center text-gray-500">
          {localization.currency} · {formattedDate} · JJ Property 10
        </footer>
      </main>
    </div>
    </>
  )
}

function OwnershipBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    fully_paid:       { label: 'Fully Paid',     cls: 'bg-emerald-400/20 text-emerald-200 border border-emerald-400/30' },
    partially_paid:   { label: 'Partially Paid', cls: 'bg-amber-400/20 text-amber-200 border border-amber-400/30' },
    capital_unknown:  { label: 'Pending',         cls: 'bg-white/10 text-white/65 border border-white/20' },
    no_capital_event: { label: 'No Capital',      cls: 'bg-white/10 text-white/60 border border-white/20' },
    not_applicable:   { label: 'N/A',             cls: 'bg-white/10 text-white/55 border border-white/20' },
  }
  const v = map[status] ?? { label: status, cls: 'bg-white/10 text-white/65 border border-white/20' }
  return (
    <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${v.cls}`}>
      {v.label}
    </span>
  )
}
