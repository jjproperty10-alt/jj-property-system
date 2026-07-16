import type { PortfolioSummary } from '@/lib/lifecycle/partnerStatementTypes'

const eur = (n: number | null): string =>
  n === null
    ? '—'
    : new Intl.NumberFormat('en-IE', {
        style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
      }).format(n)

interface Props {
  portfolio: PortfolioSummary
}

/**
 * PartnerPortfolioSection
 *
 * Portfolio summary across all authorized properties for this investor.
 * Only shown when investor has 2+ properties (guarded by PartnerReport).
 *
 * NULL totals rendered as "—" per P-ARCH-1.
 * Settlement fields (direction, netSettlementEur) remain stub until RC2:
 *   - direction: 'unknown' — NOT inferred
 *   - netSettlementEur: null — NOT included in totals arithmetic
 *   - No "settled" / "payable" / "receivable" label is rendered for unknown direction
 */
export function PartnerPortfolioSection({ portfolio }: Props) {
  const hasUnknown =
    portfolio.totalCapitalPaidEur === null || portfolio.totalCapitalRemainingEur === null

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
        Portfolio Summary — {portfolio.totalPropertiesCount}{' '}
        {portfolio.totalPropertiesCount === 1 ? 'property' : 'properties'}
      </h3>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <PortfolioRow label="Total Agreed Valuation" value={eur(portfolio.totalAgreedValuationEur)} />
        <PortfolioRow
          label="Total Capital Paid"
          value={eur(portfolio.totalCapitalPaidEur)}
          valueClassName="text-green-700 font-semibold"
        />
        <PortfolioRow
          label="Total Remaining"
          value={eur(portfolio.totalCapitalRemainingEur)}
          valueClassName={
            portfolio.totalCapitalRemainingEur !== null && portfolio.totalCapitalRemainingEur > 0
              ? 'text-amber-700 font-semibold'
              : 'text-green-700 font-semibold'
          }
        />
        <div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Net Settlement</div>
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

function PortfolioRow({
  label,
  value,
  valueClassName = 'text-gray-900',
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  const isUnknown = value === '—'
  return (
    <div>
      <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{label}</div>
      <div className={isUnknown ? 'text-gray-400 italic text-xs' : valueClassName}>{value}</div>
    </div>
  )
}
