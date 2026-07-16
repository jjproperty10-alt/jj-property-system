import React from 'react'

export type BusinessHealthStatus = 'healthy' | 'attention' | 'urgent'

interface HealthSignalProps {
  status: BusinessHealthStatus
  className?: string
}

const STATUS_CONFIG: Record<
  BusinessHealthStatus,
  { dot: string; label: string; text: string; ariaLabel: string }
> = {
  healthy: {
    dot: 'bg-green-400',
    label: 'text-green-700',
    text: 'Healthy',
    ariaLabel: 'Business status: healthy — no issues detected',
  },
  attention: {
    dot: 'bg-amber-400',
    label: 'text-amber-700',
    text: 'Needs attention',
    ariaLabel: 'Business status: needs attention — some items require your decision',
  },
  urgent: {
    dot: 'bg-red-400',
    label: 'text-red-700',
    text: 'Urgent',
    ariaLabel: 'Business status: urgent — immediate action required',
  },
}

/**
 * HealthSignal — Layer 1, Position 2 on the home screen.
 *
 * The fastest possible answer to "is something broken right now?"
 * One colored dot. One word. Zero interpretation required.
 *
 * Red is used sparingly — Rule 10. When it appears, owners know it's real.
 * Dot pulses unless motion-reduce is active.
 *
 * E3 Experience Layer — E3-A1
 */
export function HealthSignal({ status, className = '' }: HealthSignalProps) {
  const config = STATUS_CONFIG[status]

  return (
    <div
      className={`flex items-center gap-2 ${className}`}
      data-testid="health-signal"
      role="status"
      aria-label={config.ariaLabel}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${config.dot} animate-pulse motion-reduce:animate-none`}
        aria-hidden="true"
      />
      <span className={`jj-label ${config.label}`}>{config.text}</span>
    </div>
  )
}
