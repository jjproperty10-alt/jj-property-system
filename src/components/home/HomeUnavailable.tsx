import React from 'react'

interface HomeUnavailableProps {
  className?: string
}

/**
 * HomeUnavailable — Position 3 on the Home screen when allClear === null.
 *
 * Rendered when we cannot determine the business state.
 * This is NOT an error state — it's an honest declaration of uncertainty.
 *
 * "Missing evidence must never become 'all clear'." (EX-2)
 *
 * Minimal and calm. Does not alarm. Does not fabricate "0 issues."
 *
 * E3 Experience Layer — PR #79
 */
export function HomeUnavailable({ className = '' }: HomeUnavailableProps) {
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-gray-50 px-6 py-5 ${className}`}
      data-testid="home-unavailable"
      role="status"
      aria-label="Business status is being checked"
    >
      <p className="text-sm text-gray-500">
        Checking business status&hellip;
      </p>
      <p className="mt-1 text-xs text-gray-400">
        Some information sources are temporarily unavailable.
      </p>
    </div>
  )
}
