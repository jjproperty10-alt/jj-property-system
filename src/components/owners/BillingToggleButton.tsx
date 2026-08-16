'use client'

/**
 * BillingToggleButton — Client component for Include/Exclude toggle.
 *
 * PR #166 Gap C+D: Actual workflow for billing state include/exclude.
 *
 * Server component (FinancialTab) renders this per-row when a draftLineId
 * exists. Click calls the server action, then refreshes via router.
 *
 * Constitutional:
 *   - Include/Exclude modifies billing state only, never payment state
 *   - Two independent lifecycles (billing + payment)
 */

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toggleDraftLineInclusionAction } from '@/lib/owners/billingActions'

interface BillingToggleButtonProps {
  /** UUID of the statement_draft_lines row */
  draftLineId: string
  /** Current inclusion state */
  currentlyIncluded: boolean
}

export function BillingToggleButton({ draftLineId, currentlyIncluded }: BillingToggleButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleToggle = () => {
    setError(null)
    startTransition(async () => {
      const result = await toggleDraftLineInclusionAction({
        lineId: draftLineId,
        includeInStatement: !currentlyIncluded,
      })
      if (result.ok) {
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        className={`text-[10px] font-medium px-1.5 py-0.5 rounded border transition-colors ${
          currentlyIncluded
            ? 'bg-white border-gray-300 text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600'
            : 'bg-white border-gray-300 text-gray-600 hover:bg-green-50 hover:border-green-300 hover:text-green-600'
        } ${isPending ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
        title={currentlyIncluded ? 'Exclude from statement' : 'Include in statement'}
      >
        {isPending ? '…' : currentlyIncluded ? 'Exclude' : 'Include'}
      </button>
      {error && <span className="text-[9px] text-red-500">{error}</span>}
    </span>
  )
}
