/**
 * OwnershipStructure — Partnership breakdown panel on Property Detail page
 * Phase 2-B — 2026-07-13
 *
 * Shows all confirmed, date-effective partners with their ownership percentages.
 * Highlights the current viewer's row.
 * Renders nothing if there are no partnership records (direct ownership).
 */

import type { OwnershipStructureRow } from '@/lib/ownership/types'

interface Props {
  allPartners: OwnershipStructureRow[]
  selectedOwner: string
}

export function OwnershipStructure({ allPartners, selectedOwner }: Props) {
  if (allPartners.length === 0) return null

  const totalPct = allPartners.reduce((s, p) => s + p.ownershipPct, 0)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm mb-4">
      <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-3">
        Ownership Structure
      </div>

      <div className="space-y-2">
        {allPartners.map(partner => {
          const isYou =
            partner.partnerName.toLowerCase() === selectedOwner.toLowerCase()
          return (
            <div
              key={partner.partnerName}
              className={`flex items-center justify-between py-2 rounded-lg px-3 ${
                isYou
                  ? 'bg-blue-50 border border-blue-100'
                  : 'bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm font-medium ${
                    isYou ? 'text-[#1e3a5f]' : 'text-gray-700'
                  }`}
                >
                  {partner.partnerName}
                </span>
                {isYou && (
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
                    You
                  </span>
                )}
              </div>
              <span
                className={`font-mono text-sm font-bold ${
                  isYou ? 'text-[#1e3a5f]' : 'text-gray-600'
                }`}
              >
                {partner.ownershipPct}%
              </span>
            </div>
          )
        })}
      </div>

      {/* Total — sanity check */}
      {Math.abs(totalPct - 100) > 0.5 && (
        <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-amber-600">
          ⚠ Total ownership: {totalPct}% (pending reconciliation)
        </div>
      )}
    </div>
  )
      }
