/**
 * SectionStatusBadge — INTERNAL-ONLY certification/status indicator.
 *
 * Hard rule: this badge must NEVER appear in client-facing output. It renders
 * only when `mode === 'internal'`; in any client-facing context it returns null,
 * so certification status, audit flags, and "not certified" language can never
 * leak into a client report or PDF. Presentation-only; no data fetching.
 */
import React from 'react'

export type SectionStatus = 'certified' | 'provisional' | 'under_review' | 'not_certified'
export type StatusMode = 'internal' | 'client'

export interface SectionStatusBadgeProps {
  status: SectionStatus
  /** Only 'internal' renders. Anything else (client-facing) renders nothing. */
  mode: StatusMode
  note?: string
}

const STYLE: Record<SectionStatus, { label: string; cls: string }> = {
  certified:     { label: 'Certified',     cls: 'bg-green-100 text-green-800 border-green-200' },
  provisional:   { label: 'Provisional',   cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  under_review:  { label: 'Under review',  cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  not_certified: { label: 'Not certified', cls: 'bg-red-100 text-red-800 border-red-200' },
}

export function SectionStatusBadge({ status, mode, note }: SectionStatusBadgeProps) {
  // Client-facing suppression — the whole point of this component.
  if (mode !== 'internal') return null

  const s = STYLE[status] ?? STYLE.provisional
  return (
    <span
      data-testid="section-status-badge"
      data-status={status}
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${s.cls}`}
      title={note}
    >
      <span aria-hidden="true" className="text-[9px] uppercase tracking-wider opacity-70">Internal</span>
      {s.label}
      {note ? <span className="font-normal opacity-80">· {note}</span> : null}
    </span>
  )
}

export default SectionStatusBadge
