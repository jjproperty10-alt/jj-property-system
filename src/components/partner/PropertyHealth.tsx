import React from 'react'
import { HealthSignal } from '@/components/ds'
import type { BusinessHealthStatus } from '@/components/ds'

interface PropertyHealthProps {
  status: BusinessHealthStatus
  /** One line of explanation below the signal. null/undefined/empty → omit. */
  explanation?: string | null
  className?: string
}

/**
 * PropertyHealth — Section 3 of the Partner Report Story.
 *
 * Answers: "Is there anything wrong with my property right now?"
 * One status signal. One optional explanation line. Nothing more.
 *
 * Rules (from spec):
 * - Only one line of explanation below the signal
 * - Status flows in as a prop (derived server-side by deriveHealthStatus)
 * - Red (urgent) used sparingly — only when action is genuinely required
 *
 * Partner Report Story — PR-R2
 */
export function PropertyHealth({ status, explanation, className = '' }: PropertyHealthProps) {
  return (
    <div
      className={`space-y-1 ${className}`}
      data-testid="property-health"
    >
      <p className="jj-label text-xs uppercase tracking-widest text-gray-400">
        Property Status
      </p>
      <HealthSignal status={status} />
      {explanation != null && explanation !== '' && (
        <p
          className="text-sm text-gray-600"
          data-testid="property-health-explanation"
        >
          {explanation}
        </p>
      )}
    </div>
  )
}

/**
 * deriveHealthStatus — compute a BusinessHealthStatus from available settlement data.
 *
 * Called server-side (PartnerReport page.tsx) — never computed in the UI.
 * Status must always flow through component props.
 *
 * RC1 logic:
 *   - hasOpenAlerts = true   → 'urgent'
 *   - currentBalanceEur < −100 (overdue balance threshold) → 'attention'
 *   - else (including null balance = unknown) → 'healthy'
 *
 * RC2: this logic moves into the Settlement Engine + persistent alert system.
 *
 * @param settlement  SettlementStatement from PartnerFacingStatementDTO
 * @param hasOpenAlerts  true when unresolved alerts exist for this property
 */
export function deriveHealthStatus(
  settlement: { currentBalanceEur: number | null },
  hasOpenAlerts = false,
): BusinessHealthStatus {
  if (hasOpenAlerts) return 'urgent'
  if (settlement.currentBalanceEur !== null && settlement.currentBalanceEur < -100) {
    return 'attention'
  }
  return 'healthy'
}
