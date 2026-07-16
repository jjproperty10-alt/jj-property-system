import type { FinancialStatement, SettlementStatement } from '@/lib/lifecycle/partnerStatementTypes'

const eur = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

interface Props {
  financial: FinancialStatement
  settlement: SettlementStatement
}

/**
 * PartnerFinancialSection — PR D: Modern Visual Polish
 *
 * Business logic UNCHANGED from PR C. Only visual changes:
 * - No outer card wrapper (section lives inside article divide-y stack)
 * - Tables wrapped in a subtle rounded bg-gray-50 container
 * - Settlement balance row more prominent
 * - tabular-nums on amounts and dates
 * - Improved color hierarchy for positive/negative values
 *
 * Returns null when visibleSections is empty (same as before).
 * Settlement currentBalanceEur = null until RC2 — NOT inferred (P-ARCH-1).
 */
export function PartnerFinancialSection({ financial, settlement }: Props) {
  const visibleSections = financial.accountSections.filter(
    (s) => s.rows.filter(visibleRow).length > 0 || s.closing_balance !== 0,
  )

  if (visibleSections.length === 0) return null

  return (
    <section className="px-6 py-6">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Financial</h3>
        {(financial.fromDate || financial.toDate) && (
          <span className="text-[10px] text-gray-400 tabular-nums">
            {financial.fromDate ?? 'all time'} → {financial.toDate ?? 'present'}
          </span>
        )}
      </div>

      <div className="mt-4 space-y-6">
        {visibleSections.map((section) => {
          const rows = section.rows.filter(visibleRow)
          const isPositive = section.closing_balance >= 0
          return (
            <div key={section.account_type}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-800">{section.account_label}</span>
                <span className={`text-sm font-bold tabular-nums ${isPositive ? 'text-blue-700' : 'text-red-600'}`}>
                  {eur(section.closing_balance)}
                </span>
              </div>

              {rows.length > 0 && (
                <div className="rounded-lg bg-gray-50 border border-gray-100 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200 text-[10px] text-gray-400 uppercase tracking-wide">
                        <th className="text-left px-3 py-2 font-semibold w-24">Date</th>
                        <th className="text-left px-3 py-2 font-semibold">Description</th>
                        <th className="text-right px-3 py-2 font-semibold w-24">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((row) => (
                        <tr key={row.id} className="hover:bg-white/70 transition-colors">
                          <td className="px-3 py-2 text-gray-400 align-top tabular-nums whitespace-nowrap">
                            {row.date}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <span className="font-medium text-gray-700">{row.display_label}</span>
                            {row.description && (
                              <span className="text-gray-400 ml-1">— {row.description}</span>
                            )}
                          </td>
                          <td className={`px-3 py-2 text-right align-top font-semibold tabular-nums ${
                            row.balance_effect >= 0 ? 'text-emerald-600' : 'text-red-500'
                          }`}>
                            {eur(row.client_amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Settlement balance — null until Settlement Engine (RC2) */}
      <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
        <span className="text-sm font-bold text-gray-700">Current Balance</span>
        <div className="text-right">
          <span className={`text-sm font-bold tabular-nums ${
            settlement.currentBalanceEur !== null ? 'text-gray-900' : 'text-gray-400'
          }`}>
            {settlement.currentBalanceEur !== null ? eur(settlement.currentBalanceEur) : '—'}
          </span>
          {settlement.currentBalanceEur === null && (
            <p className="text-[10px] text-gray-400 italic mt-0.5">Pending Settlement Engine</p>
          )}
        </div>
      </div>
    </section>
  )
}

function visibleRow(row: { display_group: string }): boolean {
  return row.display_group !== 'info' && row.display_group !== 'reference'
}
