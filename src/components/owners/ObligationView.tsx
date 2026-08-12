'use client'

/**
 * ObligationView — Tenant utility obligation list with settlement status.
 *
 * P4 LTR Operations — Utilities / Sub-Meters
 *
 * Shows:
 *   - Utility type, period, tenant name
 *   - Consumption × rate = obligation amount
 *   - Settlement status + settled amount
 *
 * DS compliance:
 *   - MoneyValue for all monetary amounts
 *   - StatusBadge for obligation status
 *   - P-ARCH-1: null → em dash
 *   - Three-event separation: this shows Tenant Charge only
 */

import { MoneyValue, StatusBadge } from '@/components/ds'
import type { TenantUtilityObligationDTO } from '@/lib/owners/ownerWorkspaceTypes'
import type { StatusToken } from '@/lib/ds/tokens'

// ─── Display mappings ───────────────────────────────────────────────────────

const OBLIGATION_STATUS_MAP: Record<string, { token: StatusToken; label: string }> = {
  pending: { token: 'pending', label: 'Pending' },
  billed: { token: 'active', label: 'Billed' },
  partial: { token: 'attention', label: 'Partial' },
  settled: { token: 'completed', label: 'Settled' },
  disputed: { token: 'attention', label: 'Disputed' },
  reversed: { token: 'completed', label: 'Reversed' },
}

const UTILITY_TYPE_LABELS: Record<string, string> = {
  electricity: 'Electricity',
  water: 'Water',
  gas: 'Gas',
  internet: 'Internet',
  other: 'Other',
}

// ─── Props ──────────────────────────────────────────────────────────────────

export interface ObligationViewProps {
  obligations: readonly TenantUtilityObligationDTO[]
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ObligationView({ obligations }: ObligationViewProps) {
  if (obligations.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4 text-center">
        No utility obligations recorded yet.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {obligations.map((o) => {
        const statusInfo = OBLIGATION_STATUS_MAP[o.status] ?? {
          token: 'unknown' as StatusToken,
          label: o.status,
        }
        const typeLabel = UTILITY_TYPE_LABELS[o.utilityType] ?? o.utilityType
        const remaining = o.obligationAmountEur - o.settledAmountEur

        return (
          <div key={o.id} className="bg-white border border-gray-100 rounded-lg p-3 space-y-2">
            {/* Header: type + period + status */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{typeLabel}</span>
                  <StatusBadge status={statusInfo.token} label={statusInfo.label} />
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {o.periodStart} → {o.periodEnd}
                </p>
              </div>
              <div className="text-right shrink-0">
                <MoneyValue amount={o.obligationAmountEur} currency="EUR" size="sm" />
              </div>
            </div>

            {/* Calculation breakdown */}
            <div className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5">
              {formatNumber(o.consumption)} × €{formatNumber(o.ratePerUnitEur)}/unit = <MoneyValue amount={o.obligationAmountEur} currency="EUR" size="sm" />
            </div>

            {/* Tenant + settlement */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Tenant: {o.tenantName}</span>
              {o.settledAmountEur > 0 && (
                <span className="text-gray-600">
                  Settled: <MoneyValue amount={o.settledAmountEur} currency="EUR" size="sm" />
                  {remaining > 0 && (
                    <span className="text-red-600 ml-1">
                      (Remaining: <MoneyValue amount={remaining} currency="EUR" size="sm" />)
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 })
}
