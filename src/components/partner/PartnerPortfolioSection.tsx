import type { PortfolioSummary } from '@/lib/lifecycle/partnerStatementTypes'

const eur = (n: number | null): string =>
  n === null
    ? '—'
    : new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

interface Props { portfolio: PortfolioSummary }

/**
 * PartnerPortfolioSection — PR D: Modern Visual Polish
 *
 * Standalone card (rendered outside per-property articles in PartnerReport).
 * Visual changes from PR C:
 * - Subtle gray header strip with section label
 * - KPI tiles in a responsive grid matching PartnerCapitalSection style
 * - Net Settlement shown as "Pending Settlement Engine" chip — direction NOT inferred
 * - Unknown total note preserved (P-ARCH-1)
 * - tabular-nums on all amounts
 *
 * Business logic UNCHANGED:
 * - Only shown when investor has 2+ properties (guarded by PartnerReport)
 * - NULL totals rendered as "—" (P-ARCH-1)
 * - direction: 'unknown' — NOT rendered as balanced/payable/receivable
 * - netSettlementEur: null — NOT shown (Settlement Engine pending)
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
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">
              Net Settlement
            </div>
            {/* direction: 'unknown' — NOT rendered as balanced/payable/receivable */}
            <div className="text-xs text-gray-400 italic">Pending Settlement Engine</div>
          </div>
        </div>

        {hasUnknownCapital && (
          <p className="mt-4 text-[10px] text-gray-400 italic">
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
      <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">{label}</div>
      <div className={valueClass}>{value}</div>
    </div>
  )
}
