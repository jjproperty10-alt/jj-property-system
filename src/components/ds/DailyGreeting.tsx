import React from 'react'

export type TimeOfDay = 'morning' | 'midday' | 'afternoon' | 'evening' | 'night'

interface DailyGreetingProps {
  ownerName: string
  /**
   * One short sentence from live data.
   * Examples: "Business is healthy." | "Two decisions are waiting." | "Everything was handled overnight."
   * If empty — renders nothing. Silence is better than a generic line.
   * Rule: never show the same sentence two days in a row.
   */
  message: string
  timeOfDay: TimeOfDay
  className?: string
}

const SALUTATIONS: Record<TimeOfDay, string> = {
  morning: 'Good morning',
  midday: 'Good afternoon',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
  night: 'Good night',
}

/**
 * DailyGreeting — Layer 1, Position 1 on the home screen.
 *
 * Sets the tone for the owner's entire session. One salutation, one sentence.
 * Appears once per day on first load. If message is unavailable, renders nothing.
 *
 * E3 Experience Layer — E3-A1
 */
export function DailyGreeting({
  ownerName,
  message,
  timeOfDay,
  className = '',
}: DailyGreetingProps) {
  if (!message) return null

  return (
    <div className={`space-y-1.5 ${className}`} data-testid="daily-greeting">
      <p className="jj-label text-gray-400">
        {SALUTATIONS[timeOfDay]}, {ownerName}
      </p>
      <p className="text-base text-gray-700 leading-relaxed">{message}</p>
    </div>
  )
}
