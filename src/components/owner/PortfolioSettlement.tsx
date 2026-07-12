/**
 * PortfolioSettlement — net settlement table across all portfolio properties
 * Phase 2-B — 2026-07-13
 *
 * Shows each property's owner-adjusted balance with a sign prefix,
 * then the net portfolio total at the bottom.
 * Each row links to the property detail page.
 */

import Link from 'next/link'
import type { PropertySettlementDTO, SettlementDirection } from '@/lib/ownership/types'

const EUR = (n: number) =>
  new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)

function directionColor(d: SettlementDirection) {
  return d === 'payable_to_owner'
    ? 'text-green-700'
    : d === 'payable_to_jj'
    ? 'text-red-700'
    : 'text-gray-500'
}

function directionLabel(d: SettlementDirection) {
  return d === 'payable_to_owner'
    ? 'receivable'
    : d === 'payable_to_jj'
    ? 'payable'
    : 'settled'
}

function signPrefix(d: SettlementDirection) {
  return d === 'payable_to_owner' ? '+' : d === 'payable_to_jj' ? '−' : ''
}

interface Props {
  settlements: PropertySettlementDTO[]
  ownerName: string
  finalNetBalance: number
  finalDirection: SettlementDirection
}

export function PortfolioSettlement({
  settlements,
  ownerName,
  finalNetBalance,
  finalDirection,
}: Props) {
  const netColor = directionColor(finalDirection)
  const netLabel =
    finalDirection === 'payable_to_owner'
      ? 'JJ owes you'
      : finalDirection === 'payable_to_jj'
      ? 'You owe JJ'
      : 'Fully settled'

  const ownerSlug = encodeURIComponent(ownerName)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
        <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
          Portfolio Settlement
        </div>
      </div>

      {/* Property rows */}
      <div className="divide-y divide-gray-100">
        {settlements.map(s => {
          const color = directionColor(s.direction)
          const label = directionLabel(s.direction)
          const prefix = signPrefix(s.direction)
          const propertySlug = encodeURIComponent(s.propertyName)

          return (
            <Link
              key={s.propertyName}
              href={`/owner/${ownerSlug}/${propertySlug}`}
              className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors group"
            >
              <div>
                <div className="text-sm font-medium text-gray-800 group-hover:text-[#1e3a5f] transition-colors">
                  {s.propertyName}
                </div>
                {s.hasOwnershipRecords && (
                  <div className="text-[10px] text-gray-400">
                    {s.ownershipPct}% share
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className={`font-mono text-sm font-bold ${color}`}>
                  {prefix}
                  {EUR(Math.abs(s.ownerAdjustedBalance))}
                </div>
                <div className={`text-[10px] ${color}`}>{label}</div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Net balance row */}
      <div className="px-5 py-4 bg-gray-50 border-t-2 border-gray-200 flex items-center justify-between">
        <span className="text-sm font-bold text-gray-700">Net Portfolio Balance</span>
        <div className="text-right">
          <div className={`font-mono text-lg font-bold ${netColor}`}>
            {signPrefix(finalDirection)}
            {EUR(Math.abs(finalNetBalance))}
          </div>
          <div className={`text-[10px] font-medium ${netColor}`}>{netLabel}</div>
        </div>
      </div>
    </div>
  )
  }
