'use client'

/**
 * RentPositionCard — Per-contract rent position summary.
 *
 * P1 LTR Operations — Rent Terms + Expected Rent + FIFO Allocator
 *
 * Shows:
 *   - Tenant name, contract status, current monthly rent
 *   - Expected vs Received totals
 *   - Outstanding amount with overdue badge
 *   - Per-payee breakdown (who physically received the money)
 *
 * DS compliance:
 *   - MoneyValue for all monetary amounts
 *   - StatusBadge for contract status + overdue indicator
 *   - P-ARCH-1: null → em dash via MoneyValue
 *   - P-ARCH-2: per-payee breakdown preserves Yossi ≠ Jacob ≠ JJ ≠ Anastasia
 *   - P-LEDGER-1: Cash Reality breakdown (who received)
 */

import { MoneyValue, StatusBadge } from '@/components/ds'
import type { RentPositionDTO, RentalContractStatus } from '@/lib/owners/ownerWorkspaceTypes'
import type { StatusToken } from '@/lib/ds/tokens'

// ─── Display mappings ───────────────────────────────────────────────────────

const CONTRACT_STATUS_MAP: Record<RentalContractStatus, { token: StatusToken; label: string }> = {
  active: { token: 'active', label: 'Active' },
  draft: { token: 'pending', label: 'Draft' },
  expired: { token: 'completed', label: 'Expired' },
  terminated: { token: 'attention', label: 'Terminated' },
}

// ─── Props ──────────────────────────────────────────────────────────────────

export interface RentPositionCardProps {
  position: RentPositionDTO
}

// ─── Component ──────────────────────────────────────────────────────────────

export function RentPositionCard({ position }: RentPositionCardProps) {
  const statusInfo = CONTRACT_STATUS_MAP[position.contractStatus] ?? {
    token: 'unknown' as StatusToken,
    label: position.contractStatus,
  }

  const outstanding = parseFloat(position.outstandingEur)
  const hasOverdue = position.overdueCount > 0

  // Per-payee breakdown — only show payees with non-zero amounts
  const payeeBreakdown = buildPayeeBreakdown(position)

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-4 space-y-3">
      {/* Header: tenant + status + current rent */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-sm font-semibold text-gray-900 truncate">
            {position.tenantName}
          </span>
          <StatusBadge status={statusInfo.token} label={statusInfo.label} />
          {hasOverdue && (
            <StatusBadge status="critical" label={`${position.overdueCount} overdue`} />
          )}
        </div>
        {position.currentMonthlyRent != null && (
          <div className="text-right shrink-0">
            <span className="text-xs text-gray-400 block">Current rent</span>
            <MoneyValue amount={position.currentMonthlyRent} size="sm" className="font-semibold text-gray-900" />
            <span className="text-xs text-gray-400">/mo</span>
          </div>
        )}
      </div>

      {/* Contract period */}
      <div className="text-xs text-gray-500" dir="ltr">
        {formatDate(position.contractStart)}
        {' — '}
        {position.contractEnd ? formatDate(position.contractEnd) : 'Open-ended'}
        {position.latestObligationMonth && (
          <span className="text-gray-400 ml-2">
            · Obligations through {position.latestObligationMonth}
          </span>
        )}
      </div>

      {/* KPI row: Expected / Received / Outstanding */}
      <div className="grid grid-cols-3 gap-3 pt-1 border-t border-gray-50">
        <KpiCell
          label="Expected"
          amount={parseFloat(position.totalExpectedEur)}
          count={position.totalObligations}
          countLabel="months"
        />
        <KpiCell
          label="Received"
          amount={parseFloat(position.totalReceivedEur)}
          count={position.receivedCount}
          countLabel="months"
          className="text-emerald-700"
        />
        <KpiCell
          label="Outstanding"
          amount={outstanding}
          count={position.outstandingCount}
          countLabel="months"
          className={outstanding > 0 ? 'text-rose-700' : 'text-gray-700'}
        />
      </div>

      {/* Per-payee breakdown — only when there's received money */}
      {payeeBreakdown.length > 0 && (
        <div className="pt-2 border-t border-gray-50">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider block mb-1.5">
            Received by
          </span>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {payeeBreakdown.map(({ name, amount }) => (
              <div key={name} className="flex items-center gap-1.5">
                <span className="text-xs text-gray-600">{name}</span>
                <MoneyValue amount={amount} size="sm" className="text-gray-800 font-medium" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── KPI cell ────────────────────────────────────────────────────────────────

function KpiCell({
  label,
  amount,
  count,
  countLabel,
  className = 'text-gray-700',
}: {
  label: string
  amount: number
  count: number
  countLabel: string
  className?: string
}) {
  return (
    <div>
      <span className="text-xs text-gray-400 block">{label}</span>
      <MoneyValue amount={amount} size="sm" className={`font-semibold ${className}`} />
      <span className="text-xs text-gray-400 block">
        {count} {countLabel}
      </span>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildPayeeBreakdown(
  position: RentPositionDTO,
): { name: string; amount: number }[] {
  const entries: { name: string; amount: number }[] = []

  const jj = parseFloat(position.receivedByJjEur)
  const jacob = parseFloat(position.receivedByJacobEur)
  const yossi = parseFloat(position.receivedByYossiEur)
  const anastasia = parseFloat(position.receivedByAnastasiaEur)

  if (jj > 0) entries.push({ name: 'JJ', amount: jj })
  if (jacob > 0) entries.push({ name: 'Jacob', amount: jacob })
  if (yossi > 0) entries.push({ name: 'Yossi', amount: yossi })
  if (anastasia > 0) entries.push({ name: 'Anastasia', amount: anastasia })

  return entries
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}
