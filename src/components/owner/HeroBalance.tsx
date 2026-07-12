/**
 * HeroBalance — Net portfolio balance hero card
 * Used on /owner/[owner] Portfolio Dashboard
 * Phase 2-B — 2026-07-13
 */

import type { OwnerPortfolioSettlementDTO } from '@/lib/ownership/types'

const EUR = (n: number) =>
  new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)

interface Props {
  dto: OwnerPortfolioSettlementDTO
}

export function HeroBalance({ dto }: Props) {
  const {
    finalNetBalance,
    finalDirection,
    totalOwnerCredits,
    totalOwnerDebts,
    selectedOwner,
    properties,
  } = dto

  const isReceivable = finalDirection === 'payable_to_owner'
  const isSettled = finalDirection === 'settled'

  const heroBg = isReceivable ? 'bg-green-800' : isSettled ? 'bg-slate-600' : 'bg-red-900'
  const amtColor = isReceivable
    ? 'text-green-300'
    : isSettled
    ? 'text-white'
    : 'text-red-300'
  const dirLabel = isReceivable
    ? 'JJ owes you'
    : isSettled
    ? 'Fully settled'
    : 'You owe JJ'

  return (
    <div className="bg-gradient-to-br from-[#1a3354] to-[#0d1f36] rounded-2xl p-6 text-white shadow-2xl mb-6">
      {/* Owner identity */}
      <div className="mb-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400 mb-1">
          Your Portfolio
        </div>
        <div className="text-2xl font-bold">{selectedOwner.name}</div>
        <div className="text-blue-300 text-sm mt-0.5">
          {properties.length}{' '}
          {properties.length === 1 ? 'property' : 'properties'}
        </div>
      </div>

      {/* Net balance hero */}
      <div
        className={`${heroBg} rounded-xl px-6 py-5 mb-5 flex items-center justify-between`}
      >
        <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
          Net Portfolio Balance
        </div>
        <div className="text-right">
          <div className={`text-4xl font-bold font-mono ${amtColor}`}>
            {EUR(Math.abs(finalNetBalance))}
          </div>
          <div className={`text-xs font-semibold mt-1 ${amtColor}`}>{dirLabel}</div>
        </div>
      </div>

      {/* Supporting stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-3">
          <div className="text-[9px] font-bold text-green-300/80 uppercase tracking-wide mb-2">
            Receivable
          </div>
          <div className="text-lg font-bold font-mono text-white/90">
            {EUR(totalOwnerCredits)}
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-3">
          <div className="text-[9px] font-bold text-red-300/80 uppercase tracking-wide mb-2">
            Payable
          </div>
          <div className="text-lg font-bold font-mono text-white/90">
            {EUR(totalOwnerDebts)}
          </div>
        </div>
      </div>
    </div>
  )
    }
