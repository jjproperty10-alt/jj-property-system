import React from 'react'

interface AllClearCardProps {
  /**
   * Primary declaration — the most important line.
   * E.g. "Nothing needs your attention right now."
   */
  headline: string
  /**
   * Supporting lines — reassurance details.
   * E.g. ["Everything important has been handled.", "AI completed today’s routine work."]
   */
  lines: string[]
  /**
   * Optional trailing emoji — warm and personal.
   * E.g. "☕" or "🌅"
   * Only include when it genuinely fits the moment.
   */
  emoji?: string
  className?: string
}

/**
 * AllClearCard — the most important positive state in the entire application.
 *
 * Rendered in Position 3 (Needs Attention slot) when needsAttentionCount === 0.
 * This is NOT an empty state. It is an active declaration: "You’re done."
 *
 * The owner earned this. The card acknowledges it with warmth.
 * Design: green tint, calm, never clinical.
 *
 * Emotional Resolution: 🟢 You’re done.
 * E3 Experience Layer — E3-A1
 */
export function AllClearCard({ headline, lines, emoji, className = '' }: AllClearCardProps) {
  return (
    <div
      className={`rounded-xl border border-green-200 bg-green-50 px-6 py-5 ${className}`}
      role="status"
      aria-label="All clear — nothing needs your attention"
      data-testid="all-clear-card"
    >
      <p className="text-sm font-semibold text-green-800">{headline}</p>

      {lines.length > 0 && (
        <ul className="mt-2 space-y-1" aria-label="Details">
          {lines.map((line, i) => (
            <li key={i} className="text-sm text-green-700">
              {line}
            </li>
          ))}
        </ul>
      )}

      {emoji && (
        <p className="mt-4 text-xl" aria-hidden="true">
          {emoji}
        </p>
      )}
    </div>
  )
}
