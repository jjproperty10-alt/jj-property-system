import type { PortfolioSummary } from '@/lib/lifecycle/partnerStatementTypes'

const eur = (n: number | null): string =>
  n === null
    ? '—'
    : new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

interface Props { portfolio: PortfolioSummary }

/**
 * PartnerPortfolioSection — PR D v2: RTL-safe + a11y pass
 *
 * Changes from PR D v1:
 * - dir="ltr" on all financial value divs in KPI tiles
 * - text-[10px] text-gray-400 labels upgraded to text-xs text-gray-600
 * - "Pending Settlement Engine" text upgraded to text-gray-500
 * - Unknown capital note upgraded to text-xs text-gray-500
 * - Business logic unchanged
 */
export function PartnerPortfolioSection({ portfolio }: Props) {
  const hasUnknownCapital =
    portfolio.totalCapitalPaidEur === null || portfolio.totalCapitalRemainingEur === null

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200/80 bg-white shadow-sm">
      {/* Header strip */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/80">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">
          Portfolio Summary · {portfolio.totalPropertiesCount}{' '}
          {portfolio.totalPropertiesCount === 1 ? 'property' : 'properties'}
        </h2>
      </div>

      {/* KPI tiles */}
      <div className="px-6 py-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <PortfolioTile
            label="Agreed Valuation"
            value={eur(portfolio.totalAgreedValuationEur)}
          />
          <PortfolioTile
            label="Total Paid"
            value={eur(portfolio.totalCapitalPaidEur)}
            valueClass={
              portfolio.totalCapitalPaidEur !== null
                ? 'text-lg font-bold text-emerald-600 tabular-nums'
                : 'text-base text-gray-400 italic'
            }
          />
          <PortfolioTile
            label="Total Remaining"
            value={eur(portfolio.totalCapitalRemainingEur)}
            valueClass={
              portfolio.totalCapitalRemainingEur !== null
                ? portfolio.totalCapitalRemainingEur > 0
                  ? 'text-lg font-bold text-amber-600 tabular-nums'
                  : 'text-lg font-bold text-emerald-600 tabular-nums'
                : 'text-base text-gray-400 italic'
            }
          />

          {/* Net Settlement — stub until Settlement Engine (RC2) */}
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-1">
              Net Settlement
            </div>
            {/* direction: 'unknown' — NOT rendered as balanced/payable/receivable */}
            <div className="text-xs text-gray-500 italic">Pending Settlement Engine</div>
          </div>
        </div>

        {hasUnknownCapital && (
          <p className="mt-4 text-xs text-gray-500 italic">
            * Some totals unavailable — capital amounts for one or more properties are not yet confirmed.
          </p>
        )}
      </div>
    </div>
  )
}

function PortfolioTile({
  label,
  value,
  valueClass = 'text-lg font-bold text-gray-900 tabular-nums',
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-1">{label}</div>
      <div className={valueClass} dir="ltr">{value}</div>
    </div>
  )
}
