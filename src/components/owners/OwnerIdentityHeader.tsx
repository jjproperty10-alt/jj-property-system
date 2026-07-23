/**
 * OwnerIdentityHeader — persistent header for Owner Workspace.
 *
 * SERVER COMPONENT — no 'use client' directive.
 * Tab interactivity is delegated to <OwnerTabNavClient>.
 *
 * Shows:
 * - Owner name, flag, initials avatar, primary property
 * - Statement status badge
 * - Current period
 * - Open correction count
 * - Back navigation to Owners Room
 * - Tab navigation (client sub-component)
 */

import Link from 'next/link'
import { OwnerTabNavClient } from './OwnerTabNavClient'
import type { TabDef } from '@/components/ds'
import type { OwnerIdentityDTO, StatementStatus } from '@/lib/owners/ownerWorkspaceTypes'

const STATUS_CONFIG: Record<StatementStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  sent: { label: 'Sent', className: 'bg-green-100 text-green-800 border-green-200' },
  viewed: { label: 'Viewed', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  action_required: { label: 'Action Required', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  awaiting_payment: { label: 'Awaiting Payment', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  closed: { label: 'Closed', className: 'bg-gray-100 text-gray-600 border-gray-200' },
}

export interface OwnerIdentityHeaderProps {
  identity: OwnerIdentityDTO
  statementStatus: StatementStatus
  periodLabel: string
  openCorrectionCount: number
  tabs: TabDef[]
  activeTab: string
  /** Base URL for tab changes — tab id appended as ?tab= */
  tabBaseUrl: string
}

export function OwnerIdentityHeader({
  identity,
  statementStatus,
  periodLabel,
  openCorrectionCount,
  tabs,
  activeTab,
  tabBaseUrl,
}: OwnerIdentityHeaderProps) {
  const statusCfg = STATUS_CONFIG[statementStatus]

  return (
    <div>
      {/* Identity row */}
      <div className="flex items-center gap-3 py-3">

        {/* Back */}
        <Link
          href="/owners"
          className="text-gray-400 hover:text-gray-700 p-1 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Back to Owners Room"
        >
          ←
        </Link>

        {/* Avatar */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
          style={{ background: identity.avatarColor }}
          aria-hidden
        >
          {identity.initials}
        </div>

        {/* Name + property */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-gray-900 truncate">{identity.name}</h1>
            <span aria-hidden>{identity.flag}</span>
          </div>
          {identity.primaryProperty && (
            <p className="text-xs text-gray-500 truncate">{identity.primaryProperty}</p>
          )}
        </div>

        {/* Period */}
        <span className="text-xs text-gray-500 hidden sm:block">{periodLabel}</span>

        {/* Status badge */}
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${statusCfg.className}`}
          aria-label={`Statement status: ${statusCfg.label}`}
        >
          {statusCfg.label}
        </span>

        {/* Correction count */}
        {openCorrectionCount > 0 && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-xs text-amber-700 font-medium"
            aria-label={`${openCorrectionCount} open correction case${openCorrectionCount !== 1 ? 's' : ''}`}
          >
            ⚠ {openCorrectionCount} correction{openCorrectionCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Tab navigation — client component handles URL routing */}
      <OwnerTabNavClient
        tabs={tabs}
        activeTab={activeTab}
        tabBaseUrl={tabBaseUrl}
      />
    </div>
  )
}
