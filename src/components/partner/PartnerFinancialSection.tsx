import type { FinancialStatement, SettlementStatement } from '@/lib/lifecycle/partnerStatementTypes'

const eur = (n: number) =>
  new Intl.NumberFormat('en-IE', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n)

interface Props {
  financial: FinancialStatement
  settlement: SettlementStatement
}

/**
 * PartnerFinancialSection
 *
 * Renders RC3 financial data (platform income, expenses, BPO, balance).
 * Skips info/reference rows — those are internal classification markers only.
 * No business logic — all values pre-computed by fetchRC3Report().
 *
 * currentBalanceEur is null until Settlement Engine (RC2).
 * Rendered as "—". Direction is NOT inferred from null.
 */
export function PartnerFinancialSection({ financial, settlement }: Props) {
  const visibleSections = financial.accountSections.filter(
    (s) => s.rows.filter(visibleRow).length > 0 || s.closing_balance !== 0,
  )

  if (visibleSections.length === 0) return null

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Financial Report</h3>
        {(financial.fromDate || financial.toDate) && (
          <span className="text-[10px] text-gray-400">
            {financial.fromDate ?? 'all time'} → {financial.toDate ?? 'present'}
          </span>
        )}
      </div>

      <div className="space-y-6">
        {visibleSections.map((section) => {
          const rows = section.rows.filter(visibleRow)
          return (
            <div key={section.account_type}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-800">{section.account_label}</span>
                <span className={`text-sm font-bold ${section.closing_balance >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                  {eur(section.closing_balance)}
                </span>
              </div>

              {rows.length > 0 && (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-100">
                      <th className="text-left py-1 font-medium w-24">Date</th>
                      <th className="text-left py-1 font-medium">Description</th>
                      <th className="text-right py-1 font-medium w-20">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((row) => (
                      <tr key={row.id} className="text-gray-700 hover:bg-gray-50">
                        <td className="py-1.5 text-gray-400 align-top">{row.date}</td>
                        <td className="py-1.5 align-top pr-2">
                          <span className="font-medium">{row.display_label}</span>
                          {row.description && (
                            <span className="text-gray-400"> — {row.description}</span>
                          )}
                        </td>
                        <td className={`py-1.5 text-right align-top font-medium ${
                          row.balance_effect >= 0 ? 'text-green-600' : 'text-red-500'
                        }`}>
                          {eur(row.client_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
      </div>

      {/* Settlement balance — null until RC2; direction NOT inferred */}
      <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
        <span className="text-sm font-bold text-gray-700">Current Balance</span>
        <span className="text-sm font-bold text-gray-400">
          {settlement.currentBalanceEur !== null ? eur(settlement.currentBalanceEur) : '—'}
        </span>
      </div>
      {settlement.currentBalanceEur === null && (
        <p className="text-[10px] text-gray-400 italic mt-1">
          Final balance pending Settlement Engine.
        </p>
      )}
    </div>
  )
}

function visibleRow(row: { display_group: string }): boolean {
  return row.display_group !== 'info' && row.display_group !== 'reference'
}
