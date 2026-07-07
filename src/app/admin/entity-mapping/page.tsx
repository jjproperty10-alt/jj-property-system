'use client'

// ============================================================
// JJ PROPERTY 10 — Entity Mapping Admin — Registry Home
// File: src/app/admin/entity-mapping/page.tsx
// Route: /admin/entity-mapping
//
// Tab A: Unmapped Queue — property_name values with no entity
// Tab B: Entity Registry — browse + filter all 45 entities
//
// v1.0 dashboards NOT modified. Read/write to Phase 2 tables only.
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, CheckCircle, Search, RefreshCw,
  Building2, Tag, ArrowRight, Filter
} from 'lucide-react'
import {
  getUnmappedQueue, listEntities,
  ENTITY_TYPE_LABELS, ENTITY_TYPE_COLORS, STATUS_LABELS, STATUS_COLORS, EUR,
  UnmappedQueueItem, EntityRegistry, EntityType, ConfirmationStatus,
} from '@/lib/entity-registry'

// ─── Badge helpers ────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: EntityType }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ENTITY_TYPE_COLORS[type]}`}>
      {ENTITY_TYPE_LABELS[type]}
    </span>
  )
}

function StatusBadge({ status }: { status: ConfirmationStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

// ─── Unmapped Queue Tab ───────────────────────────────────────────────────────

function UnmappedQueueTab() {
  const [items, setItems] = useState<UnmappedQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setItems(await getUnmappedQueue()) }
    catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="py-12 text-center text-gray-400">Loading unmapped queue…</div>
  if (error)   return <div className="py-12 text-center text-red-500">{error}</div>

  if (items.length === 0) {
    return (
      <div className="py-16 text-center">
        <CheckCircle className="mx-auto h-12 w-12 text-green-400 mb-3" />
        <p className="text-lg font-medium text-gray-700">All property names resolved</p>
        <p className="text-sm text-gray-400 mt-1">Every transaction is linked to an entity.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {items.length} property name{items.length !== 1 ? 's' : ''} in transactions have no matching entity or alias.
        </p>
        <button onClick={load} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Property Name</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Transactions</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Total (€)</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Date Range</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Categories</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {items.map(item => (
              <tr key={item.property_name} className="hover:bg-amber-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-800 font-medium">
                  {item.property_name}
                </td>
                <td className="px-4 py-3 text-right text-gray-700">{item.tx_count}</td>
                <td className="px-4 py-3 text-right text-gray-700">{EUR(item.total_eur)}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {item.first_date} → {item.last_date}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{item.categories}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-gray-400">
        To resolve: open the Entity Detail page for the matching entity and add the property name as an alias under "Aliases".
        Transactions are never modified.
      </p>
    </div>
  )
}

// ─── Entity Registry Tab ──────────────────────────────────────────────────────

const ALL_TYPES: EntityType[] = [
  'client_property', 'partnership_property', 'jj_property',
  'jj_internal', 'person', 'transfer_account', 'special_case',
]

const ALL_STATUSES: ConfirmationStatus[] = ['confirmed', 'likely', 'needs_review', 'special_case']

function EntityRegistryTab() {
  const [entities, setEntities] = useState<EntityRegistry[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [search, setSearch]     = useState('')
  const [typeFilter, setTypeFilter]     = useState<EntityType[]>([])
  const [statusFilter, setStatusFilter] = useState<ConfirmationStatus[]>([])
  const [showInactive, setShowInactive] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      setEntities(await listEntities({
        is_active: showInactive ? undefined : true,
      }))
    }
    catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }, [showInactive])

  useEffect(() => { load() }, [load])

  const filtered = entities.filter(e => {
    if (typeFilter.length   && !typeFilter.includes(e.entity_type))           return false
    if (statusFilter.length && !statusFilter.includes(e.confirmation_status)) return false
    if (search && !e.canonical_name.toLowerCase().includes(search.toLowerCase()) &&
        !(e.display_name ?? '').toLowerCase().includes(search.toLowerCase()))  return false
    return true
  })

  function toggleType(t: EntityType) {
    setTypeFilter(f => f.includes(t) ? f.filter(x => x !== t) : [...f, t])
  }
  function toggleStatus(s: ConfirmationStatus) {
    setStatusFilter(f => f.includes(s) ? f.filter(x => x !== s) : [...f, s])
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search entities…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button onClick={load} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-lg">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
              className="rounded"
            />
            Show archived
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1 text-xs text-gray-500 mr-1">
            <Filter className="h-3 w-3" /> Type:
          </div>
          {ALL_TYPES.map(t => (
            <button
              key={t}
              onClick={() => toggleType(t)}
              className={`px-2 py-0.5 rounded text-xs font-medium border transition-opacity ${
                typeFilter.length === 0 || typeFilter.includes(t)
                  ? `${ENTITY_TYPE_COLORS[t]} border-transparent`
                  : 'bg-gray-50 text-gray-400 border-gray-200 opacity-50'
              }`}
            >
              {ENTITY_TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1 text-xs text-gray-500 mr-1">
            <Filter className="h-3 w-3" /> Status:
          </div>
          {ALL_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={`px-2 py-0.5 rounded text-xs font-medium border transition-opacity ${
                statusFilter.length === 0 || statusFilter.includes(s)
                  ? `${STATUS_COLORS[s]} border-transparent`
                  : 'bg-gray-50 text-gray-400 border-gray-200 opacity-50'
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="py-12 text-center text-gray-400">Loading entities…</div>}
      {error   && <div className="py-12 text-center text-red-500">{error}</div>}

      {!loading && !error && (
        <>
          <p className="text-sm text-gray-400 mb-2">{filtered.length} of {entities.length} entities</p>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Canonical Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Display Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filtered.map(e => (
                  <tr key={e.id} className={`hover:bg-blue-50 ${!e.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {e.canonical_name}
                      {!e.is_active && <span className="ml-2 text-xs text-gray-400">(archived)</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{e.display_name ?? '—'}</td>
                    <td className="px-4 py-3"><TypeBadge type={e.entity_type} /></td>
                    <td className="px-4 py-3"><StatusBadge status={e.confirmation_status} /></td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/entity-mapping/${e.id}`}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
                      >
                        Open <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      No entities match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EntityMappingPage() {
  const [tab, setTab] = useState<'queue' | 'registry'>('queue')
  const [queueCount, setQueueCount] = useState<number | null>(null)

  useEffect(() => {
    getUnmappedQueue().then(items => setQueueCount(items.length)).catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <Building2 className="h-5 w-5 text-gray-400" />
            <h1 className="text-xl font-semibold text-gray-900">Entity Mapping</h1>
          </div>
          <p className="text-sm text-gray-500">
            Classify properties, manage aliases, and configure partnership ownership.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          <button
            onClick={() => setTab('queue')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'queue'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
            Unmapped Queue
            {queueCount !== null && (
              <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                queueCount === 0
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              }`}>
                {queueCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('registry')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'registry'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Tag className="h-4 w-4" />
            Entity Registry
          </button>
        </div>

        {/* Tab content */}
        {tab === 'queue'    && <UnmappedQueueTab />}
        {tab === 'registry' && <EntityRegistryTab />}
      </div>
    </div>
  )
}
