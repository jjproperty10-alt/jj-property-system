/**
 * OwnerShareSection — "Your Share" hero section on the Property Detail page
 * Phase 2-B — 2026-07-13
 *
 * Shows the owner's percentage-adjusted view of the property.
 * This is the hero section — displayed before the Project View.
 *
 * Design rule (approved 2026-07-13):
 *   For external investors: Your Share is the primary view.
 *   Project View (100%) is secondary and collapsible.
 */

import type { OwnerAdjustedAccount, PropertySettlementDTO } from '@/lib/ownership/types'

const EUR = (n: number) =>
  new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(n)

const ACCOUNT_LABELS: Record<string, string> = {
  sale: 'Purchase',
  renovation: 'Renovation',
  rental: 'Rental',
  airbnb: 'Airbnb',
}

function AccountRow({ acc }: { acc: OwnerAdjustedAccount }) {
  const balance = acc.owner_closing_balance
  const isPositive =
    acc.balance_convention === 'owner_credit' ? balance > 0 : balance < 0
  const isZero = Math.abs(balance) < 0.005
  const balColor = isZero
    ? 'text-gray-500'
    : isPositive
    ? 'text-green-700'
    : 'text-red-700'

  const label = ACCOUNT_LABELS[acc.account_type] ?? acc.account_label

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-700">{label}</span>
      <div className="text-right">
        <div className={`font-mono text-sm font-semibold ${balColor}`}>
          {EUR(Math.abs(balance))}
        </div>
        {acc.owner_income > 0 && (
          <div className="text-[10px] text-gray-400">
            Income {EUR(acc.owner_income)}
          </div>
        )}
      </div>
    </div>
  )
}

interface Props {
  settlement: PropertySettlementDTO
}

export function OwnerShareSection({ settlement }: Props) {
  const {
    ownerAdjustedAccounts,
    ownerAdjustedBalance,
    direction,
    ownershipPct,
    hasOwnershipRecords,
  } = settlement

  const isReceivable = direction === 'payable_to_owner'
  const isPayable = direction === 'payable_to_jj'

  const heroColor = isReceivable
    ? 'text-green-700'
    : isPayable
    ? 'text-red-700'
    : 'text-gray-500'

  const dirLabel = isReceivable
    ? 'JJ owes you'
    : isPayable
    ? 'You owe JJ'
    : 'Fully settled'

  const ownershipLabel = hasOwnershipRecords
    ? `${ownershipPct}% ownership`
    : '100% — direct ownership'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm mb-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">
            Your Share
          </div>
          <div className="text-sm text-gray-500">{ownershipLabel}</div>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-bold font-mono ${heroColor}`}>
            {EUR(Math.abs(ownerAdjustedBalance))}
          </div>
          <div className={`text-xs font-medium mt-0.5 ${heroColor}`}>{dirLabel}</div>
        </div>
      </div>

      {/* Per-account rows */}
      {ownerAdjustedAccounts.length > 0 ? (
        <div className="divide-y divide-gray-100">
          {ownerAdjustedAccounts.map(acc => (
            <AccountRow key={acc.account_type} acc={acc} />
          ))}
        </div>
      ) : (
        <div className="text-sm text-gray-400 italic pt-2">
          No transactions in the selected period.
        </div>
      )}
    </div>
  )
}
