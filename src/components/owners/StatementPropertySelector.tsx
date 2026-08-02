/**
 * StatementPropertySelector — Server-validated property dropdown for multi-property owners.
 *
 * 'use client' — uses navigation for property selection.
 *
 * HB7 compliance:
 * - The property list comes from the SERVER (resolveStatementTarget).
 * - The browser does NOT define the authorized set.
 * - Selection navigates via URL searchParam (?property=X).
 * - The server re-validates on the next page load.
 *
 * Two modes:
 * - Full page: when no property is selected yet (multi-property owner lands on /statement)
 * - Compact: inline dropdown when a property is already selected (shown in header)
 *
 * @see orchestrateStatementRequest — HB7 property validation
 * @see VS1_PHASE1_REVISED.md — approved plan
 */

'use client'

import { useRouter } from 'next/navigation'

interface StatementPropertySelectorProps {
  /** Owner display name */
  ownerName: string
  /** Server-authorized property list (from resolveStatementTarget) */
  properties: readonly string[]
  /** Base URL for navigation (e.g. /owners/avi/statement) */
  baseUrl: string
  /** Currently selected property (if any) */
  currentProperty?: string
  /** Compact mode — inline dropdown vs full-page selector */
  compact?: boolean
}

export function StatementPropertySelector({
  ownerName,
  properties,
  baseUrl,
  currentProperty,
  compact = false,
}: StatementPropertySelectorProps) {
  const router = useRouter()

  function handleSelect(property: string) {
    router.push(`${baseUrl}?property=${encodeURIComponent(property)}`)
  }

  // ── Compact mode: inline dropdown ──────────────────────────────────────────
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <label htmlFor="property-select" className="text-xs text-gray-500">
          Property:
        </label>
        <select
          id="property-select"
          value={currentProperty ?? ''}
          onChange={e => handleSelect(e.target.value)}
          className="text-sm border border-gray-300 rounded px-2 py-1 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {properties.map(prop => (
            <option key={prop} value={prop}>
              {prop}
            </option>
          ))}
        </select>
      </div>
    )
  }

  // ── Full page mode: property selection card ────────────────────────────────
  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">
          Select Property
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          {ownerName} has {properties.length} properties. Select one to view the statement.
        </p>
        <div className="space-y-2">
          {properties.map(prop => (
            <button
              key={prop}
              type="button"
              onClick={() => handleSelect(prop)}
              className="w-full text-left px-4 py-3 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors text-sm text-gray-800"
            >
              {prop}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
