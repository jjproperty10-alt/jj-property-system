'use client'

// ============================================================
// JJ PROPERTY 10 — Identity Panel
// Panel 1: View and edit core entity metadata.
// canonical_name is READ-ONLY (must match transactions.property_name).
// ============================================================

import { useState } from 'react'
import { Edit2, Save, X, AlertTriangle } from 'lucide-react'
import { EntityRegistry, EntityType, ConfirmationStatus, ENTITY_TYPE_LABELS, updateEntity } from '@/lib/entity-registry'

const ENTITY_TYPES: EntityType[] = [
  'client_property', 'partnership_property', 'jj_property',
  'jj_internal', 'person', 'transfer_account', 'special_case',
]

const CONFIRMATION_STATUSES: ConfirmationStatus[] = [
  'confirmed', 'likely', 'needs_review', 'special_case',
]

interface Props {
  entity: EntityRegistry
  onSaved: () => void
}

export default function IdentityPanel({ entity, onSaved }: Props) {
  const [editing, setEditing] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [saved,   setSaved]   = useState(false)

  const [displayName,  setDisplayName]  = useState(entity.display_name ?? '')
  const [entityType,   setEntityType]   = useState<EntityType>(entity.entity_type)
  const [status,       setStatus]       = useState<ConfirmationStatus>(entity.confirmation_status)
  const [notes,        setNotes]        = useState(entity.notes ?? '')
  const [isActive,     setIsActive]     = useState(entity.is_active)

  const typeChanged   = entityType !== entity.entity_type
  const archiveWarn   = !isActive && entity.is_active

  function reset() {
    setDisplayName(entity.display_name ?? '')
    setEntityType(entity.entity_type)
    setStatus(entity.confirmation_status)
    setNotes(entity.notes ?? '')
    setIsActive(entity.is_active)
    setError(null)
    setEditing(false)
  }

  async function save() {
    setSaving(true); setError(null)
    try {
      await updateEntity(entity.id, {
        display_name: displayName.trim() || null,
        entity_type: entityType,
        confirmation_status: status,
        notes: notes.trim() || null,
        is_active: isActive,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      setEditing(false)
      onSaved()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">Identity</h2>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            <Edit2 className="h-3.5 w-3.5" /> Edit
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={reset} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200">
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1 text-xs text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-2 py-1 rounded"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mx-5 mt-3 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <div className="p-5 space-y-4">
        {/* Canonical name — always read-only */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Canonical Name
            <span className="ml-2 text-gray-400 font-normal">(read-only — must match transactions.property_name)</span>
          </label>
          <div className="font-mono text-sm bg-gray-50 border border-gray-200 rounded px-3 py-2 text-gray-800">
            {entity.canonical_name}
          </div>
        </div>

        {/* Display name */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Display Name</label>
          {editing ? (
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Friendly name shown in UI (optional)"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <div className="text-sm text-gray-700">{entity.display_name ?? <span className="text-gray-400">—</span>}</div>
          )}
        </div>

        {/* Entity type */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Entity Type</label>
          {editing ? (
            <>
              <select
                value={entityType}
                onChange={e => setEntityType(e.target.value as EntityType)}
                className="border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ENTITY_TYPES.map(t => (
                  <option key={t} value={t}>{ENTITY_TYPE_LABELS[t]}</option>
                ))}
              </select>
              {typeChanged && (
                <p className="mt-1.5 text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Changing entity type affects which reports include this entity.
                </p>
              )}
            </>
          ) : (
            <div className="text-sm text-gray-700">{ENTITY_TYPE_LABELS[entity.entity_type]}</div>
          )}
        </div>

        {/* Confirmation status */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Confirmation Status</label>
          {editing ? (
            <select
              value={status}
              onChange={e => setStatus(e.target.value as ConfirmationStatus)}
              className="border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CONFIRMATION_STATUSES.map(s => (
                <option key={s} value={s}>
                  {s === 'confirmed'    ? 'Confirmed'
                  : s === 'likely'     ? 'Likely'
                  : s === 'needs_review' ? 'Needs Review'
                  : 'Special Case'}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-sm text-gray-700 capitalize">{entity.confirmation_status.replace('_', ' ')}</div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
          {editing ? (
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Internal notes…"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          ) : (
            <div className="text-sm text-gray-700">{entity.notes ?? <span className="text-gray-400">—</span>}</div>
          )}
        </div>

        {/* Active toggle */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-gray-500">Active</label>
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => setIsActive(v => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  isActive ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                  isActive ? 'translate-x-4.5' : 'translate-x-0.5'
                }`} />
              </button>
              {archiveWarn && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Archived entities remain in transaction history but are excluded from all reports.
                </p>
              )}
            </>
          ) : (
            <span className={`text-sm ${entity.is_active ? 'text-green-600' : 'text-gray-400'}`}>
              {entity.is_active ? 'Yes' : 'Archived'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
