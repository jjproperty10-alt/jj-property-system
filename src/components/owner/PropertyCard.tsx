/**
 * PropertyCard — single property card on the Portfolio Dashboard
 * Phase 2-B — 2026-07-13
 *
 * Designed for scannability: one number, one status badge, one action.
 * All detail is deferred to the property page.
 */

import Link from 'next/link'
import type { PropertySettlementDTO } from '@/lib/ownership/types'

const EUR = (n: number) =>
  new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)

interface Props {
  settlement: PropertySettlementDTO
  ownerName: string
}

export function PropertyCard({ settlement, ownerName }: Props) {
  const { propertyName, ownershipPct, ownerAdjustedBalance, direction, hasOwnershipRecords } =
    settlement

  const isReceivable = direction === 'payable_to_owner'
  const isPayable = direction === 'payable_to_jj'

  const badgeBg = isReceivable
    ? 'bg-green-100 text-green-700'
    : isPayable
    ? 'bg-red-100 text-red-700'
    : 'bg-gray-100 text-gray-600'

  const badgeLabel = isReceivable ? '● Receivable' : isPayable ? '● Payable' : '● Settled'

  const amtColor = isReceivable
    ? 'text-green-700'
    : isPayable
    ? 'text-red-700'
    : 'text-gray-500'

  const propertySlug = encodeURIComponent(propertyName)
  const ownerSlug = encodeURIComponent(ownerName)

  return (
    <Link
      href={`/owner/${ownerSlug}/${propertySlug}`}
      className="block bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md hover:border-gray-300 transition-all group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-bold text-gray-900 group-hover:text-[#1e3a5f] transition-colors leading-tight">
            {propertyName}
          </div>
          {hasOwnershipRecords && (
            <div className="text-xs text-gray-500 mt-0.5">
              Partnership · {ownershipPct}% your share
            </div>
          )}
        </div>
        <span
          className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ms-2 ${badgeBg}`}
        >
          {badgeLabel}
        </span>
      </div>

      {/* Balance */}
      <div className="border-t border-gray-100 pt-3">
        <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">
          Your Balance
        </div>
        <div className={`text-xl font-bold font-mono ${amtColor}`}>
          {EUR(Math.abs(ownerAdjustedBalance))}
        </div>
      </div>

      {/* CTA */}
      <div className="mt-3 text-xs text-gray-400 group-hover:text-[#1e3a5f] transition-colors text-right">
        View details →
      </div>
    </Link>
  )
    }
