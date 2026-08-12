'use client'

/**
 * BrokerageCard — Per-brokerage obligation summary card for JJ staff.
 *
 * P6 LTR Operations — Brokerage Obligations
 *
 * Shows:
 *   - Tenant name, broker name, brokerage applicability
 *   - Calculation type + charge amount + status badge
 *   - Settlement progress (settled / charged)
 *   - Payer/payee, evidence, new tenant indicator
 *
 * DS compliance:
 *   - StatusBadge for brokerage status
 *   - P-ARCH-1: null → em dash
 *
 * Business rule:
 *   One brokerage per lease (one card per rental_contract_id).
 *   No recurrence on renewal. No brokerage on rent change.
 *
 * Visibility:
 *   JJ staff only — never visible to owners/clients.
 */

import { StatusBadge } from '@/components/ds'
import type { BrokerageObligationDTO } from '@/lib/owners/ownerWorkspaceTypes'
import type { StatusToken } from '@/lib/ds/tokens'

// ─── Display mappings ───────────────────────────────────────────────────────

const CALC_TYPE_LABELS: Record<string, string> = {
  one_month_rent: 'One Month Rent',
  fixed_amount: 'Fixed Amount',
  percentage: 'Percentage',
}

const BROKERAGE_STATUS_MAP: Record<string, { token: StatusToken; label: string }> = {
  pending: { token: 'pending', label: 'Pending' },
  billed: { token: 'confirmed', label: 'Billed' },
  settled: { token: 'completed', label: 'Settled' },
  waived: { token: 'unknown', label: 'Waived' },
  reversed: { token: 'unknown', label: 'Reversed' },
}

// ─── Format helpers ─────────────────────────────────────────────────────────

function formatEur(value: number | null): string {
  if (value == null) return '—'
  return `€${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Props ──────────────────────────────────────────────────────────────────

export interface BrokerageCardProps {
  brokerage: BrokerageObligationDTO
  onUpdateStatus?: (brokerageId: string) => void
}

// ─── Component ──────────────────────────────────────────────────────────────

export function BrokerageCard({ brokerage, onUpdateStatus }: BrokerageCardProps) {
  const statusInfo = BROKERAGE_STATUS_MAP[brokerage.status] ?? {
    token: 'unknown' as StatusToken,
    label: brokerage.status,
  }

  const calcLabel = CALC_TYPE_LABELS[brokerage.calculationType] ?? brokerage.calculationType
  const outstanding = brokerage.chargeAmountEur - brokerage.settledAmountEur

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-4 space-y-3">
      {/* Header: tenant + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">
              Brokerage
            </span>
            <StatusBadge status={statusInfo.token} label={statusInfo.label} />
            {!brokerage.brokerageApplicable && (
              <StatusBadge status="unknown" label="N/A" />
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Tenant: {brokerage.tenantName}
            {brokerage.isNewTenant && (
              <span className="ml-1 text-blue-600 font-medium">(New)</span>
            )}
          </p>
        </div>
        <span className="text-sm font-bold text-gray-900 shrink-0">
          {formatEur(brokerage.chargeAmountEur)}
        </span>
      </div>

      {/* Broker + calculation details */}
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-gray-500">Broker</p>
          <p className="text-gray-900 font-medium">
            {brokerage.brokerName ?? '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Calculation</p>
          <p className="text-gray-900 font-medium">
            {calcLabel}
            {brokerage.calculationType === 'percentage' && brokerage.percentageRate != null && (
              <span className="text-gray-500 ml-1">({brokerage.percentageRate}%)</span>
            )}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Outstanding</p>
          <p className={`font-medium ${outstanding > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
            {formatEur(outstanding)}
          </p>
        </div>
      </div>

      {/* Metadata row */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span>Date: {brokerage.chargeDate}</span>
        <span>Payer: {brokerage.payer}</span>
        <span>Payee: {brokerage.payee}</span>
        {brokerage.governingEvidence && (
          <span className="truncate max-w-[140px]" title={brokerage.governingEvidence}>
            Evidence: {brokerage.governingEvidence}
          </span>
        )}
      </div>

      {/* Settlement progress */}
      {brokerage.settledAmountEur > 0 && (
        <div className="text-xs text-gray-500">
          Settled: {formatEur(brokerage.settledAmountEur)} / {formatEur(brokerage.chargeAmountEur)}
        </div>
      )}

      {/* Notes */}
      {brokerage.notes && (
        <p className="text-xs text-gray-500 italic">{brokerage.notes}</p>
      )}

      {/* Action */}
      {onUpdateStatus && brokerage.status !== 'settled' && brokerage.status !== 'reversed' && (
        <button
          type="button"
          onClick={() => onUpdateStatus(brokerage.id)}
          className="w-full mt-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
        >
          Update Status
        </button>
      )}
    </div>
  )
}
