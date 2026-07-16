import type { PortfolioSummary } from '@/lib/lifecycle/partnerStatementTypes'
import { MoneyValue, SectionHeader } from '@/components/ds'

interface Props {
  portfolio: PortfolioSummary
}

/**
 * PartnerPortfolioSection
 *
 * Portfolio summary across all authorized properties for this investor.
 * Only shown when investor has 2+ properties (guarded by PartnerReport).
 *
 * NULL totals rendered as "—" by MoneyValue (P-ARCH-1).
 * Settlement fields (direction, netSettlementEur) remain stub until RC2:
 *   - direction: 'unknown' — NOT inferred
 *   - netSettlementEur: null — NOT included in totals arithmetic
 *   - No "settled" / "payable" / "receivable" label is rendered for unknown direction
 *
 * E2: Migrated to MoneyValue (null handling + dir="ltr") and SectionHeader.
 * PortfolioRow inline component removed — replaced by jj-label + MoneyValue.
 */
export function PartnerPortfolioSection({ portfolio }: Props) {
  const hasUnknown =
    portfolio.totalCapitalPaidEur === null || portfolio.totalCapitalRemainingEur === null

  const propertyWord = portfolio.totalPropertiesCount === 1 ? 'property' : 'properties'

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <SectionHeader
        title={`Portfolio Summary \u2014 ${portfolio.totalPropertiesCount} ${propertyWord}`}
        className="mb-4"
      />

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <div className="jj-label mb-0.5">Total Agreed Valuation</div>
          <MoneyValue amount={portfolio.totalAgreedValuationEur} size="sm" />
        </div>
        <div>
          <div className="jj-label mb-0.5">Total Capital Paid</div>
          <MoneyValue
            amount={portfolio.totalCapitalPaidEur}
            size="sm"
            className={portfolio.totalCapitalPaidEur !== null ? 'text-green-700 font-semibold' : ''}
          />
        </div>
        <div>
          <div className="jj-label mb-0.5">Total Remaining</div>
          <MoneyValue
            amount={portfolio.totalCapitalRemainingEur}
            size="sm"
            className={
              portfolio.totalCapitalRemainingEur !== null && portfolio.totalCapitalRemainingEur > 0
                ? 'text-amber-700 font-semibold'
                : portfolio.totalCapitalRemainingEur !== null
                  ? 'text-green-700 font-semibold'
                  : ''
            }
          />
        </div>
        <div>
          <div className="jj-label mb-0.5">Net Settlement</div>
          {/* direction: 'unknown' — NOT rendered as balanced/payable/receivable */}
          <div className="text-gray-400 text-xs italic">Pending Settlement Engine</div>
        </div>
      </div>

      {hasUnknown && (
        <p className="mt-3 text-[10px] text-gray-400 italic">
          * Some totals are unavailable — capital amounts for one or more properties are not yet confirmed.
        </p>
      )}
    </div>
  )
}
