'use client'

/**
 * TenantChargeCard — Per-charge summary card for JJ staff.
 *
 * P5 LTR Operations — Tenant Charges
 *
 * Shows:
 *   - Charge type, tenant, description
 *   - Charge amount + status badge
 *   - Actual cost + margin (JJ internal — NEVER visible to owners/clients)
 *   - Economic date, deposit linkage
 *   - Settlement progress (settled / charged)
 *
 * DS compliance:
 *   - StatusBadge for charge status
 *   - P-ARCH-1: null → em dash
 *
 * Three-event separation:
 *   This card renders a Tenant Charge.
 *   It is NOT an owner expense. It is NOT a tenant payment.
 *
 * Visibility:
 *   - margin, actualCostEur → JJ internal ONLY. Never shown to owner/client.
 *   - chargeAmountEur, settledAmountEur, status → visible to all roles.
 */

import { StatusBadge } from '@/components/ds'
import type { TenantChargeObligationDTO } from '@/lib/owners/ownerWorkspaceTypes'
import type { StatusToken } from '@/lib/ds/tokens'

// ─── Display mappings ───────────────────────────────────────────────────────

const CHARGE_TYPE_LABELS: Record<string, string> = {
  damage: 'Damage',
  penalty: 'Penalty',
  cleaning: 'Cleaning',
  key_replacement: 'Key Replacement',
  utility_arrears: 'Utility Arrears',
  other: 'Other',
}

const CHARGE_STATUS_MAP: Record<string, { token: StatusToken; label: string }> = {
  pending: { token: 'pending', label: 'Pending' },
  billed: { token: 'confirmed', label: 'Billed' },
  partial: { token: 'attention', label: 'Partial' },
  settled: { token: 'completed', label: 'Settled' },
  disputed: { token: 'critical', label: 'Disputed' },
  waived: { token: 'unknown', label: 'Waived' },
  reversed: { token: 'unknown', label: 'Reversed' },
}

// ─── Format helpers ─────────────────────────────────────────────────────────

function formatEur(value: number | null): string {
  if (value == null) return '—'
  return `€${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Props ──────────────────────────────────────────────────────────────────

export interface TenantChargeCardProps {
  charge: TenantChargeObligationDTO
  onUpdateStatus?: (chargeId: string) => void
}

// ─── Component ──────────────────────────────────────────────────────────────

export function TenantChargeCard({ charge, onUpdateStatus }: TenantChargeCardProps) {
  const statusInfo = CHARGE_STATUS_MAP[charge.status] ?? {
    token: 'unknown' as StatusToken,
    label: charge.status,
  }

  const typeLabel = CHARGE_TYPE_LABELS[charge.chargeType] ?? charge.chargeType
  const outstanding = charge.chargeAmountEur - charge.settledAmountEur

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-4 space-y-3">
      {/* Header: type + tenant + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">
              {typeLabel}
            </span>
            <StatusBadge status={statusInfo.token} label={statusInfo.label} />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Tenant: {charge.tenantName}
          </p>
        </div>
        <span className="text-sm font-bold text-gray-900 shrink-0">
          {formatEur(charge.chargeAmountEur)}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-700">{charge.description}</p>

      {/* Financial details — JJ internal (margin visible to staff only) */}
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-gray-500">Actual Cost</p>
          <p className="text-gray-900 font-medium">
            {formatEur(charge.actualCostEur)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Margin</p>
          <p className={`font-medium ${
            charge.marginEur != null && charge.marginEur < 0
              ? 'text-red-600'
              : 'text-gray-900'
          }`}>
            {formatEur(charge.marginEur)}
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
        <span>Date: {charge.economicDate}</span>
        {charge.deductibleFromDeposit && (
          <StatusBadge status="confirmed" label="Deposit Deductible" />
        )}
        {charge.sourceEvidence && (
          <span className="truncate max-w-[140px]" title={charge.sourceEvidence}>
            Evidence: {charge.sourceEvidence}
          </span>
        )}
      </div>

      {/* Settlement progress */}
      {charge.settledAmountEur > 0 && (
        <div className="text-xs text-gray-500">
          Settled: {formatEur(charge.settledAmountEur)} / {formatEur(charge.chargeAmountEur)}
        </div>
      )}

      {/* Action */}
      {onUpdateStatus && charge.status !== 'settled' && charge.status !== 'reversed' && (
        <button
          type="button"
          onClick={() => onUpdateStatus(charge.id)}
          className="w-full mt-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
        >
          Update Status
        </button>
      )}
    </div>
  )
}
