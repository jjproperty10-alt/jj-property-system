'use client'

/**
 * UtilityMeterCard — Per-meter summary with latest reading and schedule.
 *
 * P4 LTR Operations — Utilities / Sub-Meters
 *
 * Shows:
 *   - Meter identifier, utility type, unit of measure
 *   - Active/inactive status badge
 *   - Last reading date + value
 *   - Next reading due (with overdue indicator)
 *   - Reading interval
 *
 * DS compliance:
 *   - StatusBadge for meter status + overdue
 *   - P-ARCH-1: null → em dash
 */

import { StatusBadge } from '@/components/ds'
import type { UtilityMeterDTO } from '@/lib/owners/ownerWorkspaceTypes'
import type { StatusToken } from '@/lib/ds/tokens'

// ─── Display mappings ───────────────────────────────────────────────────────

const UTILITY_TYPE_LABELS: Record<string, string> = {
  electricity: 'Electricity',
  water: 'Water',
  gas: 'Gas',
  internet: 'Internet',
  other: 'Other',
}

const METER_STATUS_MAP: Record<string, { token: StatusToken; label: string }> = {
  active: { token: 'active', label: 'Active' },
  inactive: { token: 'completed', label: 'Inactive' },
}

// ─── Props ──────────────────────────────────────────────────────────────────

export interface UtilityMeterCardProps {
  meter: UtilityMeterDTO
  onRecordReading?: (meterId: string) => void
}

// ─── Component ──────────────────────────────────────────────────────────────

export function UtilityMeterCard({ meter, onRecordReading }: UtilityMeterCardProps) {
  const statusInfo = METER_STATUS_MAP[meter.status] ?? {
    token: 'unknown' as StatusToken,
    label: meter.status,
  }

  const typeLabel = UTILITY_TYPE_LABELS[meter.utilityType] ?? meter.utilityType

  const isOverdue = meter.nextReadingDue != null && meter.nextReadingDue < new Date().toISOString().slice(0, 10)

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-4 space-y-3">
      {/* Header: type + identifier + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">
              {typeLabel}
            </span>
            <StatusBadge status={statusInfo.token} label={statusInfo.label} />
          </div>
          {meter.meterIdentifier && (
            <p className="text-xs text-gray-500 mt-0.5">
              Meter: {meter.meterIdentifier}
            </p>
          )}
        </div>
        <span className="text-xs text-gray-400 shrink-0">
          {meter.unitOfMeasure}
        </span>
      </div>

      {/* Reading info */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-gray-500">Last Reading</p>
          <p className="text-gray-900 font-medium">
            {meter.lastReadingDate ?? '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Next Due</p>
          <div className="flex items-center gap-1.5">
            <p className={`font-medium ${isOverdue ? 'text-red-600' : 'text-gray-900'}`}>
              {meter.nextReadingDue ?? '—'}
            </p>
            {isOverdue && (
              <StatusBadge status="attention" label="Overdue" />
            )}
          </div>
        </div>
      </div>

      {/* Interval */}
      <p className="text-xs text-gray-500">
        Reading interval: every {meter.readingIntervalMonths} month{meter.readingIntervalMonths !== 1 ? 's' : ''}
      </p>

      {/* Action */}
      {meter.status === 'active' && onRecordReading && (
        <button
          type="button"
          onClick={() => onRecordReading(meter.id)}
          className="w-full mt-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
        >
          Record Reading
        </button>
      )}
    </div>
  )
}
