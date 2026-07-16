import React from 'react'

interface WelcomeHeaderProps {
  ownerName: string
  /**
   * Property name for single-property view.
   * null → shows "Portfolio Summary" heading instead.
   */
  propertyName: string | null
  /**
   * Human-readable period, e.g. "January 2026"
   */
  period: string
  className?: string
}

/**
 * WelcomeHeader — Section 1 of the Partner Report Story.
 *
 * The first thing an owner sees. Personal. Immediate.
 * Sets the tone: a human is talking to them, not a system.
 *
 * Rule: subtitle is always the same two sentences — not dynamic, not AI.
 * The stability of the subtitle builds trust across months.
 *
 * Partner Report Story — PR-R1
 */
export function WelcomeHeader({
  ownerName,
  propertyName,
  period,
  className = '',
}: WelcomeHeaderProps) {
  const reportTitle = propertyName
    ? `${propertyName} — ${period}`
    : `Portfolio Summary — ${period}`

  return (
    <div className={`space-y-3 ${className}`} data-testid="welcome-header">
      {/* Period context — peripheral, not the hero */}
      <p className="jj-label text-gray-400">{reportTitle}</p>

      {/* Personal greeting — the hero of Section 1 */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-gray-900">
          Hello {ownerName} 👋
        </h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          Here&apos;s a simple summary of how your investment performed this month.
        </p>
        <p className="text-sm text-gray-400">
          Everything below is based on verified transactions and approved records.
        </p>
      </div>
    </div>
  )
}
