import React from 'react'

interface BusinessStoryProps {
  /**
   * AI-generated narrative — 2–3 sentences about what happened this period.
   * Produced server-side (E3-A3 pattern). This component only renders.
   *
   * null / undefined / empty string → section is HIDDEN entirely.
   * Rule: silence > placeholder. Never show generic filler text.
   */
  story?: string | null
  className?: string
}

/**
 * BusinessStory — Section 4 of the Partner Report Story.
 *
 * The most important paragraph in the report.
 * Not a list of transactions — an explanation of what happened.
 *
 * Examples of what goes here:
 *   "This month occupancy increased by 18% compared to last month."
 *   "Maintenance costs were higher than usual due to air-conditioning repairs."
 *   "Income remained stable. The property had 3 bookings totalling 22 nights."
 *
 * Rules (from spec):
 * - AI-generated from transaction data (2–3 sentences max)
 * - If story is absent: section is COMPLETELY HIDDEN (not a loading state)
 * - Never generic. Must cite specific facts.
 * - Silence > placeholder — this section earns trust or disappears
 *
 * Partner Report Story — PR-R2
 */
export function BusinessStory({ story, className = '' }: BusinessStoryProps) {
  // Silence > placeholder. No story = no section.
  if (!story) return null

  return (
    <div
      className={`space-y-1 ${className}`}
      data-testid="business-story"
    >
      <p className="jj-label text-xs uppercase tracking-widest text-gray-400">
        Business Update
      </p>
      <p
        className="text-sm text-gray-700 leading-relaxed"
        data-testid="business-story-text"
      >
        {story}
      </p>
    </div>
  )
}
