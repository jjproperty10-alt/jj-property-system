/**
 * /owners — Owners Room
 *
 * The daily dispatch screen. JJ sees all active owners,
 * ordered by priority: who needs attention first?
 *
 * PR #3 — JJ Workspace Navigation + Owner Workspace Design System
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/ds'
import { getOwnersRoom } from '@/lib/owners/ownerWorkspaceService'
import type { OwnerRoomItemDTO } from '@/lib/owners/ownerWorkspaceTypes'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'JJ — Owners Room',
}

const STATUS_CONFIG = {
  draft: { label: 'Draft', dot: 'bg-blue-400' },
  sent: { label: 'Sent', dot: 'bg-green-400' },
  viewed: { label: 'Viewed', dot: 'bg-emerald-500' },
  action_required: { label: 'Action Required', dot: 'bg-amber-500' },
  awaiting_payment: { label: 'Awaiting Payment', dot: 'bg-orange-400' },
  closed: { label: 'Closed', dot: 'bg-gray-300' },
}

const BALANCE_CONFIG = {
  jj_owes_owner: { label: 'JJ owes owner', className: 'text-red-600' },
  owner_owes_jj: { label: 'Owner owes JJ', className: 'text-green-600' },
  balanced: { label: 'Balanced', className: 'text-gray-400' },
}

export default async function OwnersRoomPage() {
  const room = await getOwnersRoom()

  const groups = {
    today: room.items.filter(i => i.priorityGroup === 'today'),
    this_week: room.items.filter(i => i.priorityGroup === 'this_week'),
    rest: room.items.filter(i => i.priorityGroup === 'rest'),
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Owners Room</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {room.summary.totalOwners} owners ·{' '}
              {room.summary.actionRequired > 0 && (
                <span className="text-amber-600 font-medium">
                  {room.summary.actionRequired} need action ·{' '}
                </span>
              )}
              {room.summary.openCorrections > 0 && (
                <span className="text-red-600 font-medium">
                  {room.summary.openCorrections} open corrections ·{' '}
                </span>
              )}
              {room.summary.readyToSend} ready to send
            </p>
          </div>
          <Link
            href="/"
            className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
          >
            ← Home
          </Link>
        </div>

        {/* Today */}
        {groups.today.length > 0 && (
          <OwnerGroup label="Today — Needs attention" items={groups.today} />
        )}

        {/* This week */}
        {groups.this_week.length > 0 && (
          <OwnerGroup label="This week" items={groups.this_week} />
        )}

        {/* Rest */}
        {groups.rest.length > 0 && (
          <OwnerGroup label="All owners" items={groups.rest} />
        )}

        {/* Empty */}
        {room.items.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🏠</p>
            <p className="font-medium">No owners found</p>
            <p className="text-sm mt-1">Owner data is derived from the transactions database.</p>
          </div>
        )}
      </div>
    </PageShell>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function OwnerGroup({ label, items }: { label: string; items: OwnerRoomItemDTO[] }) {
  return (
    <section>
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{label}</h2>
      <ul className="space-y-2" role="list">
        {items.map(item => (
          <OwnerCard key={item.identity.id} item={item} />
        ))}
      </ul>
    </section>
  )
}

function OwnerCard({ item }: { item: OwnerRoomItemDTO }) {
  const statusCfg = STATUS_CONFIG[item.statementStatus]
  const balanceCfg = BALANCE_CONFIG[item.balanceDirection]

  return (
    <li>
      <Link
        href={`/owners/${item.identity.slug}`}
        className="flex items-center gap-4 border border-gray-200 rounded-lg px-4 py-3 bg-white hover:border-gray-300 hover:shadow-sm transition-all group"
        aria-label={`Open workspace for ${item.identity.name}`}
      >
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
          style={{ background: item.identity.avatarColor }}
          aria-hidden
        >
          {item.identity.initials}
        </div>

        {/* Name + property */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
              {item.identity.name}
            </span>
            <span aria-hidden>{item.identity.flag}</span>
          </div>
          {item.identity.primaryProperty && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{item.identity.primaryProperty}</p>
          )}
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`w-2 h-2 rounded-full ${statusCfg.dot}`} aria-hidden />
          <span className="text-xs text-gray-500 hidden sm:block">{statusCfg.label}</span>
        </div>

        {/* Balance */}
        {item.balanceEur != null && (
          <div className={`text-sm font-semibold flex-shrink-0 ${balanceCfg.className}`} dir="ltr">
            €{parseFloat(item.balanceEur).toLocaleString()}
          </div>
        )}

        {/* Correction badge */}
        {item.openCorrectionCount > 0 && (
          <span
            className="flex-shrink-0 text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded px-1.5 py-0.5 font-medium"
            aria-label={`${item.openCorrectionCount} open correction${item.openCorrectionCount !== 1 ? 's' : ''}`}
          >
            ⚠ {item.openCorrectionCount}
          </span>
        )}

        {/* Arrow */}
        <span aria-hidden className="text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0">
          →
        </span>
      </Link>
    </li>
  )
}
