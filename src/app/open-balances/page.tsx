/**
 * Open Balances — canonical money position.
 *
 * Wiring Agent (2026-08-16): retired the dependency on the missing `v_open_balances`
 * view (which made this page render empty). Now a Server Component consuming the
 * canonical getMoneyPosition() service (certified v_money_position). No client-side
 * financial assembly; no mock data.
 *
 * Scope v1: client counterparties (see moneyPositionService / discovery doc).
 */

import { getMoneyPosition, type MoneyDirectionSummaryDTO } from '@/lib/money/moneyPositionService'

export const dynamic = 'force-dynamic'

const EUR = (n: string | number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(Number(n) || 0)

function DirectionCard({
  title, accent, summary,
}: { title: string; accent: string; summary: MoneyDirectionSummaryDTO }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-gray-600">{title}</div>
        <div className="text-xs text-gray-400">{summary.count} items · {summary.counterparties} counterparties</div>
      </div>
      <div className={`text-3xl font-bold ${accent}`}>{EUR(summary.total)}</div>
      {summary.byCounterpartyType.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
          {summary.byCounterpartyType.map(b => (
            <span key={b.counterpartyType} className="badge bg-gray-100 text-gray-600">
              {b.counterpartyType}: {EUR(b.total)}
            </span>
          ))}
        </div>
      )}
      {summary.partialCertified.count > 0 && (
        <div className="mt-1 text-xs text-amber-600">
          ⚠ {summary.partialCertified.count} partial-certified · {EUR(summary.partialCertified.amountEur)}
        </div>
      )}
      <div className="mt-4 space-y-2">
        {summary.lines.map(l => (
          <div key={l.moneyPositionId} className="flex items-center justify-between border-t border-gray-100 pt-2">
            <div>
              <div className="font-medium text-gray-900">{l.counterpartyName ?? l.counterpartyCanonicalId ?? '—'}</div>
              <div className="text-xs text-gray-400">
                {l.settlementStatus}{l.confidenceStatus ? ` · ${l.confidenceStatus}` : ''}
              </div>
            </div>
            <div className={`font-semibold ${accent}`}>{EUR(l.openAmountEur)}</div>
          </div>
        ))}
        {summary.lines.length === 0 && (
          <div className="text-sm text-gray-400">None open.</div>
        )}
      </div>
    </div>
  )
}

export default async function OpenBalancesPage() {
  const money = await getMoneyPosition()

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Open Balances</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Canonical money position — clients{money.asOfDate ? ` · as of ${money.asOfDate}` : ''}
          {money.sourceUnavailable && <span className="text-red-500 font-medium ml-2">· source unavailable</span>}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <DirectionCard title="חייבים ל-JJ · Receivable to JJ" accent="text-green-700" summary={money.receivableToJJ} />
        <DirectionCard title="JJ חייבת · Payable by JJ" accent="text-orange-700" summary={money.payableByJJ} />
      </div>

      <p className="text-xs text-gray-400 mt-6">
        Source: certified v_counterparty_position (net of actual payments/transfers/approved offsets).
        Partner/supplier/employee obligations are not yet included (pending a ratified certified source).
      </p>
    </div>
  )
}
