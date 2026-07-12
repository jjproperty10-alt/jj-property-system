'use client'

/**
 * ProjectViewSection — 100% project figures, collapsible
 * Phase 2-B — 2026-07-13
 *
 * 'use client' required for collapse/expand state.
 *
 * Design rule (approved 2026-07-13):
 *   Collapsed by default for external investors — Your Share is the primary view.
 *   Project View provides context when the owner wants to see the full picture.
 */

import { useState } from 'react'
import type { RC3AccountSection } from '@/lib/report/types'

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

interface Props {
  projectAccounts: RC3AccountSection[]
}

export function ProjectViewSection({ projectAccounts }: Props) {
  const [open, setOpen] = useState(false)

  // Unified project balance — same convention as computeProjectBalance100 in settlementEngine
  const projectBalance100 = projectAccounts.reduce((sum, acc) => {
    return (
      sum +
      (acc.balance_convention === 'owner_credit'
        ? acc.closing_balance
        : -acc.closing_balance)
    )
  }, 0)

  return (
    <div className="bg-gray-50 rounded-2xl border border-gray-200 shadow-sm mb-4">
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-100 transition-colors rounded-2xl"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <div className="text-left">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">
            Project View
          </div>
          <div className="text-sm text-gray-500">
            100% — full project figures
          </div>
        </div>
        <span className="text-gray-400 text-sm ms-4">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-gray-200 px-5 py-4">
          <div className="space-y-0">
            {projectAccounts.map(acc => {
              const label = ACCOUNT_LABELS[acc.account_type] ?? acc.account_label
              const balColor =
                acc.closing_balance >= 0 ? 'text-green-700' : 'text-red-700'
              return (
                <div
                  key={acc.account_type}
                  className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0"
                >
                  <span className="text-sm text-gray-700">{label}</span>
                  <div className="text-right">
                    <div className={`font-mono text-sm font-semibold ${balColor}`}>
                      {EUR(Math.abs(acc.closing_balance))}
                    </div>
                    {acc.total_income > 0 && (
                      <div className="text-[10px] text-gray-400">
                        Income {EUR(acc.total_income)}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Project total */}
          <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500">
              Project Total (100%)
            </span>
            <span
              className={`font-mono text-sm font-bold ${
                projectBalance100 >= 0 ? 'text-green-700' : 'text-red-700'
              }`}
            >
              {EUR(Math.abs(projectBalance100))}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
