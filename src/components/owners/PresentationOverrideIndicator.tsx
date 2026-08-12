'use client'

/**
 * PresentationOverrideIndicator — Visual indicator for statement presentation overrides.
 *
 * P5 LTR Operations — Billing Presentation Metadata
 *
 * Shows the current presentation status of a charge/transaction
 * on the owner's statement. NEVER changes financial truth.
 *
 * Presentation invariant (proven):
 *   Changing an override changes ONLY when the item appears on a statement.
 *   It does NOT change: the debt owed, the economic date, the transaction
 *   amount, or any row in public.transactions.
 *
 * DS compliance:
 *   - StatusBadge for presentation status
 *   - P-ARCH-1: null → em dash
 */

import { StatusBadge } from '@/components/ds'
import type { PresentationStatus } from '@/lib/owners/ownerWorkspaceTypes'
import type { StatusToken } from '@/lib/ds/tokens'

// ─── Display mappings ───────────────────────────────────────────────────────

const PRESENTATION_STATUS_MAP: Record<PresentationStatus, { token: StatusToken; label: string; description: string }> = {
  include_now: {
    token: 'active',
    label: 'Include Now',
    description: 'Appears on the current or next statement.',
  },
  next_statement: {
    token: 'pending',
    label: 'Next Statement',
    description: 'Deferred to the next statement cycle.',
  },
  defer_until_date: {
    token: 'attention',
    label: 'Deferred',
    description: 'Deferred until a specific date.',
  },
  internal_only: {
    token: 'unknown',
    label: 'Internal Only',
    description: 'Never shown on owner statements.',
  },
}

// ─── Props ──────────────────────────────────────────────────────────────────

export interface PresentationOverrideIndicatorProps {
  presentationStatus: PresentationStatus
  deferUntilDate?: string | null
  overrideReason?: string | null
  compact?: boolean
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PresentationOverrideIndicator({
  presentationStatus,
  deferUntilDate,
  overrideReason,
  compact = false,
}: PresentationOverrideIndicatorProps) {
  const info = PRESENTATION_STATUS_MAP[presentationStatus] ?? {
    token: 'unknown' as StatusToken,
    label: presentationStatus,
    description: '',
  }

  if (compact) {
    return <StatusBadge status={info.token} label={info.label} />
  }

  return (
    <div className="bg-gray-50 border border-gray-100 rounded-md p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-700">Statement Visibility</span>
        <StatusBadge status={info.token} label={info.label} />
      </div>
      <p className="text-xs text-gray-500">{info.description}</p>
      {presentationStatus === 'defer_until_date' && deferUntilDate && (
        <p className="text-xs text-gray-500">
          Show after: {deferUntilDate}
        </p>
      )}
      {overrideReason && (
        <p className="text-xs text-gray-500 italic">
          Reason: {overrideReason}
        </p>
      )}
    </div>
  )
}
