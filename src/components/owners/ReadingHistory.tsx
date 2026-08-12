'use client'

/**
 * ReadingHistory — Chronological list of meter readings.
 *
 * P4 LTR Operations — Utilities / Sub-Meters
 *
 * Shows:
 *   - Reading date, value, previous value, consumption
 *   - Recorded by
 *   - Photo evidence indicator
 *
 * DS compliance:
 *   - P-ARCH-1: null consumption → em dash (first reading)
 */

import type { MeterReadingDTO } from '@/lib/owners/ownerWorkspaceTypes'

// ─── Props ──────────────────────────────────────────────────────────────────

export interface ReadingHistoryProps {
  readings: readonly MeterReadingDTO[]
  unitOfMeasure?: string
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ReadingHistory({ readings, unitOfMeasure = 'kWh' }: ReadingHistoryProps) {
  if (readings.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4 text-center">
        No readings recorded yet.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
            <th className="pb-2 pr-3 font-medium">Date</th>
            <th className="pb-2 pr-3 font-medium text-right">Reading</th>
            <th className="pb-2 pr-3 font-medium text-right">Previous</th>
            <th className="pb-2 pr-3 font-medium text-right">Consumption</th>
            <th className="pb-2 font-medium">Recorded By</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {readings.map((r) => (
            <tr key={r.id} className="text-gray-900">
              <td className="py-2 pr-3 whitespace-nowrap">
                <span className="text-sm">{r.readingDate}</span>
                {r.photoEvidence && (
                  <span className="ml-1 text-xs text-blue-500" title="Photo evidence attached">📷</span>
                )}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums font-medium">
                {formatNumber(r.readingValue)} {unitOfMeasure}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-gray-500">
                {r.previousValue != null ? formatNumber(r.previousValue) : '—'}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {r.consumption != null ? (
                  <span className="font-medium">{formatNumber(r.consumption)} {unitOfMeasure}</span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="py-2 text-gray-600 text-xs">
                {r.recordedBy ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}
