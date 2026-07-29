/**
 * StatementPreview — VS-1A Partner Workspace component for investor statement preview.
 *
 * Displays:
 *   1. Statement header (investor + property + period)
 *   2. Source-freshness gate status (R5: structured, with missing sources)
 *   3. Disposition reconciliation bar
 *   4. Source amount reconciliation (R2)
 *   5. Transaction disposition table (R1: full traceability)
 *   6. Financial totals
 *   7. Opening balance status (R6: NULL ≠ €0)
 *   8. Settlement status (R6: NOT_YET_COMPUTED)
 *   9. Finalization blockers
 *   10. "Finalize & Lock" button (always disabled, no "Send" label)
 *
 * Read-only. No mutations. "Finalize & Lock" button is always disabled in VS-1A.
 *
 * @see StatementBuilderOutput in @/lib/statements/types
 * @see EX-1: Anxiety Elimination — all numbers explain themselves
 * @see EX-4: Unknown ≠ Zero — NULL shown as "—" (em dash)
 * @see EX-5: The User Is Not an Accountant — plain language
 */

'use client'

import type { StatementBuilderOutput, TransactionDisposition } from '@/lib/statements/types'

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatEur(value: number | null): string {
  if (value === null) return '—'
  return `€${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function freshnessColor(status: string): string {
  switch (status) {
    case 'VERIFIED': return 'bg-green-50 border-green-200 text-green-800'
    case 'STALE': return 'bg-red-50 border-red-200 text-red-800'
    default: return 'bg-amber-50 border-amber-200 text-amber-800'
  }
}

function bucketColor(bucket: string): string {
  switch (bucket) {
    case 'BALANCE_AFFECTING': return 'text-blue-700 bg-blue-50'
    case 'INFORMATIONAL': return 'text-gray-600 bg-gray-50'
    case 'EXCLUDED': return 'text-gray-400 bg-gray-50'
    case 'UNRESOLVED': return 'text-red-700 bg-red-50'
    default: return 'text-gray-500'
  }
}

// ─── Component ──────────────────────────────────────────────────────────────────

interface Props {
  readonly output: StatementBuilderOutput
}

export function StatementPreview({ output }: Props) {
  const { disposition, freshness, openingBalance, settlement, finalizationBlockers } = output

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Investor Statement Preview
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {output.investorName} &middot; {output.propertyName}
            </p>
            <p className="text-sm text-gray-500">
              {formatDate(output.periodStart)} &mdash; {formatDate(output.periodEnd)}
            </p>
          </div>
          <div className="text-right">
            {output.ownershipPct !== null ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                {output.ownershipPct}% ownership
              </span>
            ) : (
              <span className="text-xs text-gray-400">Ownership: &mdash;</span>
            )}
          </div>
        </div>
      </div>

      {/* Source Freshness Gate (R5) */}
      <div className={`rounded-lg border p-4 ${freshnessColor(freshness.status)}`}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Source Freshness:</span>
          <span className="text-sm">{freshness.status}</span>
        </div>
        <p className="mt-1 text-xs">{freshness.message}</p>
        {freshness.missingSources.length > 0 && (
          <div className="mt-2">
            <span className="text-xs font-medium">Missing sources: </span>
            <span className="text-xs">{freshness.missingSources.join(', ')}</span>
          </div>
        )}
        {freshness.freshnessBlockerReason && (
          <p className="mt-1 text-xs opacity-75">{freshness.freshnessBlockerReason}</p>
        )}
      </div>

      {/* Reconciliation Bar */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Transaction Disposition</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{disposition.sourceRows}</div>
            <div className="text-xs text-gray-500">Total Rows</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-700">{disposition.balanceAffecting}</div>
            <div className="text-xs text-gray-500">Balance Affecting</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-500">{disposition.informational}</div>
            <div className="text-xs text-gray-500">Informational</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-400">{disposition.excluded}</div>
            <div className="text-xs text-gray-500">Excluded</div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold ${disposition.unresolved > 0 ? 'text-red-600' : 'text-gray-400'}`}>
              {disposition.unresolved}
            </div>
            <div className="text-xs text-gray-500">Unresolved</div>
          </div>
        </div>
        <div className={`text-xs px-3 py-1.5 rounded ${disposition.reconciled ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {disposition.reconciled
            ? `Reconciled: ${disposition.sourceRows} = ${disposition.balanceAffecting} + ${disposition.informational} + ${disposition.excluded} + ${disposition.unresolved}`
            : 'NOT RECONCILED — invariant broken'
          }
        </div>
        {/* R2: Source amounts */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div><span className="text-gray-500">amount_eur total: </span><span className="font-medium">{formatEur(disposition.sourceAmounts.totalAmountEur)}</span></div>
          <div><span className="text-gray-500">client_charge total: </span><span className="font-medium">{formatEur(disposition.sourceAmounts.totalClientChargeEur)}</span></div>
          <div><span className="text-gray-500">Markup rows: </span><span className="font-medium">{disposition.sourceAmounts.markupRowCount}</span></div>
          <div><span className="text-gray-500">Markup value: </span><span className="font-medium">{formatEur(disposition.sourceAmounts.totalMarkupEur)}</span></div>
        </div>
        {/* R3: Provenance */}
        <div className="mt-2 text-xs text-gray-400">
          Classifier: {disposition.provenance.classifierVersion} &middot;
          Source set: {disposition.provenance.sourceSetHash.slice(0, 12)}&hellip; &middot;
          Disposition: {disposition.provenance.aggregateDispositionHash.slice(0, 12)}&hellip;
        </div>
      </div>

      {/* Financial Totals */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Financial Summary (Balance-Affecting Only)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div><div className="text-xs text-gray-500">Income</div><div className="text-lg font-semibold text-green-700">{formatEur(disposition.totals.totalIncomeEur)}</div></div>
          <div><div className="text-xs text-gray-500">Expenses</div><div className="text-lg font-semibold text-red-700">{formatEur(disposition.totals.totalExpensesEur)}</div></div>
          <div><div className="text-xs text-gray-500">Paid to Owner</div><div className="text-lg font-semibold text-gray-700">{formatEur(disposition.totals.totalBpoEur)}</div></div>
          <div><div className="text-xs text-gray-500">Balance Contribution</div><div className="text-lg font-semibold text-gray-900">{formatEur(disposition.totals.closingBalanceContribution)}</div></div>
        </div>
      </div>

      {/* Opening Balance (R6) */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Opening Balance</h3>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
            openingBalance.status === 'CONFIRMED' ? 'bg-green-50 text-green-700'
            : openingBalance.status === 'NULL' ? 'bg-amber-50 text-amber-700'
            : 'bg-yellow-50 text-yellow-700'
          }`}>
            {openingBalance.status === 'NULL' ? 'PENDING_RECONCILIATION' : openingBalance.status}
          </span>
          <span className="text-sm text-gray-600">
            {openingBalance.valueEur !== null ? formatEur(openingBalance.valueEur) : 'Not yet determined'}
          </span>
        </div>
        {(openingBalance.status === 'NULL' || openingBalance.status === 'PENDING_RECONCILIATION') && (
          <p className="mt-2 text-xs text-gray-500">Opening balance must be reconciled and confirmed before this statement can be finalized.</p>
        )}
      </div>

      {/* Settlement (R6) */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Settlement</h3>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
            settlement.status === 'CONFIRMED' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {settlement.status.replace(/_/g, ' ')}
          </span>
          <span className="text-sm text-gray-600">
            {settlement.valueEur !== null ? formatEur(settlement.valueEur) : '—'}
          </span>
        </div>
      </div>

      {/* Transaction Table (R1) */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">All Transactions ({disposition.sourceRows})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subcategory</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payer</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Disposition</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">amount_eur</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">client_charge</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">client_amount</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance Effect</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {disposition.rows.map((row: TransactionDisposition) => (
                <tr key={row.transactionId} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">{formatDate(row.transactionDate)}</td>
                  <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{row.accountType}</td>
                  <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap">{row.subcategory ?? '—'}</td>
                  <td className="px-3 py-2 text-sm text-gray-700 max-w-[200px] truncate" title={row.description ?? ''}>{row.description ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{row.payer ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${bucketColor(row.bucket)}`}>
                      {row.bucket.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm text-right text-gray-600 whitespace-nowrap">{formatEur(row.amountEur)}</td>
                  <td className="px-3 py-2 text-sm text-right whitespace-nowrap">
                    {row.clientCharge !== null ? (
                      <span className={row.clientCharge !== row.amountEur ? 'text-amber-700 font-medium' : 'text-gray-600'}>{formatEur(row.clientCharge)}</span>
                    ) : (<span className="text-gray-400">{'—'}</span>)}
                  </td>
                  <td className="px-3 py-2 text-sm text-right text-gray-900 whitespace-nowrap font-medium">{formatEur(row.clientAmountEur)}</td>
                  <td className="px-3 py-2 text-sm text-right whitespace-nowrap">
                    {row.includedInArithmetic ? (
                      <span className={row.signedBalanceEffect >= 0 ? 'text-green-700' : 'text-red-700'}>{formatEur(row.signedBalanceEffect)}</span>
                    ) : (<span className="text-gray-400">{'—'}</span>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Finalization Gate */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Finalization Status</h3>
        {finalizationBlockers.length > 0 ? (
          <div className="space-y-2">
            {finalizationBlockers.map((blocker, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-amber-700">
                <span className="shrink-0 mt-0.5">&#x26A0;</span>
                <span>{blocker}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-green-700">All gates passed &mdash; ready to finalize.</p>
        )}
        <button
          disabled
          className="mt-4 px-4 py-2 rounded-md text-sm font-medium bg-gray-100 text-gray-400 cursor-not-allowed"
          title="VS-1A: production finalization not authorized"
        >
          Finalize &amp; Lock
        </button>
        <p className="mt-1 text-xs text-gray-400">VS-1A preview only &mdash; finalization requires explicit authorization.</p>
      </div>
    </div>
  )
}
