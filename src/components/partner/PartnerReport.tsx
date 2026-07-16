import type { PartnerFacingStatementDTO } from '@/lib/lifecycle/partnerStatementTypes'
import { PartnerCapitalSection } from './PartnerCapitalSection'
import { PartnerFinancialSection } from './PartnerFinancialSection'
import { PartnerTimelineSection } from './PartnerTimelineSection'
import { PartnerPortfolioSection } from './PartnerPortfolioSection'

interface Props {
  dto: PartnerFacingStatementDTO
}

/**
 * PartnerReport — main render component for /partner/[slug]
 *
 * Server Component — no client hooks, no business logic.
 * Receives a fully-resolved PartnerFacingStatementDTO from the page route.
 * Delegates all section rendering to sub-components.
 *
 * The UI never calculates business truth:
 *   - capitalStatus  ← resolveCapitalStatus() in partnerStatementService
 *   - balances       ← RC3 views via fetchRC3Report()
 *   - portfolio      ← buildPortfolioSummary()
 *   - settlement     ← stub (null) until Settlement Engine (RC2)
 *
 * P-ARCH-6: No jj_* fields are present on the DTO — enforced by type shape.
 */
export function PartnerReport({ dto }: Props) {
  const { investor, properties, portfolio, meta, actions, localization } = dto

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1e3a5f] text-white px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300 mb-0.5">
            JJ Property 10
          </div>
          <h1 className="text-lg font-bold">Partner Statement</h1>
          <p className="text-sm text-blue-200 mt-0.5">{investor.canonicalName}</p>
          {meta.viewMode === 'admin' && (
            <span className="mt-1 inline-block text-[10px] bg-amber-400 text-amber-900 font-bold px-2 py-0.5 rounded uppercase tracking-wide">
              Admin View
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-10">

        {properties.map((prop) => (
          <section key={prop.propertyName} className="space-y-4">
            <div className="border-b border-gray-200 pb-2">
              <h2 className="text-base font-bold text-gray-900">{prop.propertyName}</h2>
              {prop.ownership.currentOwnershipPct !== null && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {prop.ownership.currentOwnershipPct}% ownership
                  {prop.ownership.effectiveFrom && (
                    <span className="ml-1">
                      since {new Date(prop.ownership.effectiveFrom).toLocaleDateString('en-IE')}
                    </span>
                  )}
                </p>
              )}
            </div>

            <PartnerCapitalSection capital={prop.capital} />

            {prop.financial && (
              <PartnerFinancialSection financial={prop.financial} />
            )}

            <PartnerTimelineSection timeline={prop.timeline} />
          </section>
        ))}

        {/* Portfolio summary — only when 2+ properties */}
        {properties.length > 1 && (
          <PartnerPortfolioSection portfolio={portfolio} />
        )}

        {/* Export actions — disabled until Settlement Engine (RC2) */}
        {(actions.canExportCsv || actions.canGeneratePdf) && (
          <div className="flex gap-3 pt-2">
            {actions.canGeneratePdf && (
              <button
                className="px-4 py-2 text-sm border border-gray-300 rounded text-gray-600 bg-white
                           disabled:opacity-40 disabled:cursor-not-allowed"
                disabled
                title="Available after Settlement Engine (RC2)"
              >
                Download PDF
              </button>
            )}
            {actions.canExportCsv && (
              <button
                className="px-4 py-2 text-sm border border-gray-300 rounded text-gray-600 bg-white
                           disabled:opacity-40 disabled:cursor-not-allowed"
                disabled
                title="Available after Settlement Engine (RC2)"
              >
                Export CSV
              </button>
            )}
          </div>
        )}

        <footer className="text-xs text-gray-400 text-center border-t border-gray-100 pt-4">
          Generated {new Date(localization.generatedAt).toLocaleDateString('en-IE', {
            day: 'numeric', month: 'long', year: 'numeric',
          })}
          {' · '}{localization.currency}
        </footer>
      </div>
    </div>
  )
}
