import type { CapitalStatement } from '@/lib/lifecycle/partnerStatementTypes'

const eur = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

interface Props { capital: CapitalStatement }

/**
 * PartnerCapitalSection — PR D v2: RTL-safe + a11y pass
 *
 * Changes from PR D v1:
 * - dir="ltr" on all financial values (amounts, dates, percentages) — RTL-safe
 * - text-[10px] text-gray-400 labels upgraded to text-xs text-gray-600 (WCAG contrast)
 * - motion-reduce:transition-none on progress bar
 * - No change to business logic or null handling
 */
export function PartnerCapitalSection({ capital }: Props) {
  const {
    capitalStatus,
    agreedEntryValuationEur,
    requiredCapitalEur,
    capitalPaidEur,
    capitalRemainingEur,
    payments,
  } = capital

  const paidPct =
    requiredCapitalEur !== null &&
    requiredCapitalEur > 0 &&
    capitalPaidEur !== null
      ? Math.min(100, Math.round((capitalPaidEur / requiredCapitalEur) * 100))
      : null

  return (
    <section className="px-6 py-6">
      <h3 className="text-xs font-bold uppercase tracking-widest text-gray-600">Capital</h3>

      {/* KPI tiles */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {agreedEntryValuationEur !== null && (
          <KpiTile label="Agreed Valuation" value={eur(agreedEntryValuationEur)} />
        )}
        {requiredCapitalEur !== null && (
          <KpiTile label="Required" value={eur(requiredCapitalEur)} />
        )}
        <KpiTile
          label="Paid"
          value={capitalPaidEur !== null ? eur(capitalPaidEur) : '—'}
          valueClass={
            capitalPaidEur !== null
              ? 'text-lg font-bold text-emerald-600'
              : 'text-base text-gray-400 italic'
          }
        />
        {capitalRemainingEur !== null && (
          <KpiTile
            label="Remaining"
            value={eur(capitalRemainingEur)}
            valueClass={
              capitalRemainingEur > 0
                ? 'text-lg font-bold text-amber-600'
                : 'text-lg font-bold text-emerald-600'
            }
          />
        )}
      </div>

      {/* Progress bar — only when both required and paid are known */}
      {paidPct !== null && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-600 mb-1.5">
            <span>Capital paid</span>
            <span className="font-semibold tabular-nums" dir="ltr">{paidPct}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all motion-reduce:transition-none ${
                paidPct === 100 ? 'bg-emerald-500' : 'bg-blue-600'
              }`}
              style={{ width: `${paidPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Pending confirmation note — capital_unknown with no payments */}
      {capitalStatus === 'capital_unknown' && payments.length === 0 && (
        <p className="mt-3 text-xs text-gray-500 italic">Capital details pending confirmation.</p>
      )}

      {/* Payment history */}
      {payments.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">
            Payment history
          </p>
          <div className="divide-y divide-gray-50">
            {payments.map((payment) => (
              <div key={payment.eventId} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs tabular-nums text-gray-500 shrink-0" dir="ltr">
                    {payment.effectiveDate
                      ? new Date(payment.effectiveDate).toLocaleDateString('en-IE', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })
                      : '—'}
                  </span>
                  {payment.payerName && (
                    <span className="text-xs text-gray-500 truncate">via {payment.payerName}</span>
                  )}
                  {payment.effectiveDateConfidence === 'pending_verification' && (
                    <span className="shrink-0 text-xs font-medium text-amber-600">
                      date unconfirmed
                    </span>
                  )}
                </div>
                <span className="shrink-0 ml-4 text-sm font-semibold text-gray-800 tabular-nums" dir="ltr">
                  {eur(payment.amountEur)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function KpiTile({
  label,
  value,
  valueClass = 'text-lg font-bold text-gray-900',
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-1">{label}</div>
      <div className={`tabular-nums ${valueClass}`} dir="ltr">{value}</div>
    </div>
  )
}
