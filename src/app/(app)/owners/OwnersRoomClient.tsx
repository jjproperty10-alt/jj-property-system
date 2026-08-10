'use client'

/**
 * OwnersRoomClient — Client-side Owners Room with search, filter, and controls.
 *
 * PR #3 P1 Enhancement. Uses existing DS tokens/styles locally.
 * No new DS primitives created. No DS amendment required.
 *
 * Search: client-side filter over owner name and property names.
 * Filter: config health state filter.
 * +Add Client: disabled button with next-step indication (wizard = PR #4).
 * Config Health badge: per-card, using StatusBadge DS component.
 * Associated Property count: deduplicated, from managedProperties.
 */

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { StatusBadge } from '@/components/ds'
import type { OwnersRoomDTO, OwnerRoomItemDTO, ConfigHealthState } from '@/lib/owners/ownerWorkspaceTypes'

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

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

const HEALTH_BADGE_MAP: Record<ConfigHealthState, { status: 'active' | 'pending' | 'attention' | 'unknown'; label: string }> = {
  complete: { status: 'active', label: 'Complete' },
  pending_verification: { status: 'pending', label: 'Pending' },
  needs_review: { status: 'attention', label: 'Review' },
  incomplete: { status: 'unknown', label: 'Incomplete' },
}

const HEALTH_FILTER_OPTIONS: { value: ConfigHealthState | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'incomplete', label: 'Incomplete' },
  { value: 'needs_review', label: 'Needs Review' },
  { value: 'pending_verification', label: 'Pending' },
  { value: 'complete', label: 'Complete' },
]

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export function OwnersRoomClient({ room }: { room: OwnersRoomDTO }) {
  const [search, setSearch] = useState('')
  const [healthFilter, setHealthFilter] = useState<ConfigHealthState | 'all'>('all')

  const filtered = useMemo(() => {
    let items = room.items

    // Search: match against name or any property name
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      items = items.filter(item =>
        item.identity.name.toLowerCase().includes(q) ||
        item.identity.properties.some(p => p.toLowerCase().includes(q))
      )
    }

    // Filter by config health
    if (healthFilter !== 'all') {
      items = items.filter(item => item.configHealth.state === healthFilter)
    }

    return items
  }, [room.items, search, healthFilter])

  const groups = {
    today: filtered.filter(i => i.priorityGroup === 'today'),
    this_week: filtered.filter(i => i.priorityGroup === 'this_week'),
    rest: filtered.filter(i => i.priorityGroup === 'rest'),
  }

  const isFiltered = search.trim() !== '' || healthFilter !== 'all'

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">

      {/* Controls row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search owners or properties..."
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 pl-9 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 transition-colors"
            aria-label="Search owners"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Health filter */}
        <select
          value={healthFilter}
          onChange={e => setHealthFilter(e.target.value as ConfigHealthState | 'all')}
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          aria-label="Filter by configuration health"
        >
          {HEALTH_FILTER_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

      </div>

      {/* Summary */}
      <p className="text-sm text-gray-500">
        {isFiltered ? `${filtered.length} of ${room.summary.totalOwners}` : room.summary.totalOwners} owners
        {room.summary.actionRequired > 0 && (
          <span className="text-amber-600 font-medium">
            {' '}&middot; {room.summary.actionRequired} need action
          </span>
        )}
        {room.summary.openCorrections > 0 && (
          <span className="text-red-600 font-medium">
            {' '}&middot; {room.summary.openCorrections} open corrections
          </span>
        )}
        {' '}&middot; {room.summary.readyToSend} ready to send
      </p>

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

      {/* Empty — no results */}
      {filtered.length === 0 && isFiltered && (
        <div className="text-center py-12 text-gray-400">
          <p className="font-medium">No owners match your search</p>
          <p className="text-sm mt-1">Try a different name or clear your filters.</p>
        </div>
      )}

      {/* Empty — no owners at all */}
      {room.items.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🏠</p>
          <p className="font-medium">No owners found</p>
          <p className="text-sm mt-1">Owner data is derived from the identity registry.</p>
        </div>
      )}
    </div>
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
  const healthBadge = HEALTH_BADGE_MAP[item.configHealth.state]

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

        {/* Name + property + property count */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
              {item.identity.name}
            </span>
            <span aria-hidden>{item.identity.flag}</span>
            {/* Config Health badge */}
            <StatusBadge status={healthBadge.status} label={healthBadge.label} />
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {item.identity.primaryProperty && (
              <span className="text-xs text-gray-500 truncate">{item.identity.primaryProperty}</span>
            )}
            {item.associatedPropertyCount > 0 && (
              <span className="text-xs text-gray-400">
                {item.associatedPropertyCount === 1
                  ? '1 property'
                  : `${item.associatedPropertyCount} properties`}
              </span>
            )}
          </div>
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
