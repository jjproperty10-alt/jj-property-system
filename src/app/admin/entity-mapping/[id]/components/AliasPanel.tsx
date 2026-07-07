'use client'

// ============================================================
// JJ PROPERTY 10 — Alias Panel
// Panel 2: Manage case variants and spelling aliases.
// Transactions are NEVER modified — aliases resolve at query time.
// ============================================================

import { useState } from 'react'
import { Plus, X, AlertTriangle, Info } from 'lucide-react'
import { EntityAlias, addAlias, deactivateAlias } from '@/lib/entity-registry'

const SOURCE_OPTIONS: { value: EntityAlias['source']; label: string }[] = [
  { value: 'case_variant', label: 'Case Variant (e.g. "villa mazotos 2")' },
  { value: 'typo',         label: 'Typo / Misspelling' },
  { value: 'historical',   label: 'Historical Name' },
  { value: 'manual',       label: 'Manual / Other' },
]

interface Props {
  entityId: string
  aliases: EntityAlias[]
  onChanged: () => void
}

export default function AliasPanel({ entityId, aliases, onChanged }: Props) {
  const [showAdd,    setShowAdd]    = useState(false)
  const [newAlias,   setNewAlias]   = useState('')
  const [newSource,  setNewSource]  = useState<EntityAlias['source']>('case_variant')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [deactiId,   setDeactiId]   = useState<string | null>(null)

  const activeAliases   = aliases.filter(a => a.is_active)
  const inactiveAliases = aliases.filter(a => !a.is_active)
  const [showInactive, setShowInactive] = useState(false)

  async function handleAdd() {
    const trimmed = newAlias.trim()
    if (!trimmed) { setError('Alias name cannot be empty.'); return }
    setSaving(true); setError(null)
    try {
      await addAlias(entityId, trimmed, newSource)
      setNewAlias('')
      setNewSource('case_variant')
      setShowAdd(false)
      onChanged()
    } catch (e) {
      const msg = String(e)
      if (msg.includes('unique') || msg.includes('duplicate')) {
        setError(`"${trimmed}" already exists as an alias or canonical name.`)
      } else {
        setError(msg)
      }
    } finally {
      setSaving(false) }
  }

  async function handleDeactivate(aliasId: string) {
    setDeactiId(aliasId); setError(null)
    try {
      await deactivateAlias(aliasId)
      onChanged()
    } catch (e) {
      setError(String(e))
    } finally {
      setDeactiId(null)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Aliases</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {activeAliases.length} active alias{activeAliases.length !== 1 ? 'es' : ''}
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setError(null) }}
          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          <Plus className="h-3.5 w-3.5" /> Add Alias
        </button>
      </div>

      <div className="px-5 py-4 space-y-3">
        <div className="flex items-start gap-2 p-3 bg-blue-50 rounded text-xs text-blue-700">
          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          Aliases allow transactions with variant spellings to resolve to this entity.
          Transactions are <strong>never modified</strong>.
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {/* Add form */}
        {showAdd && (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Alias Name</label>
              <input
                type="text"
                value={newAlias}
                onChange={e => setNewAlias(e.target.value)}
                placeholder="Exact string as it appears in transactions…"
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Source Type</label>
              <select
                value={newSource}
                onChange={e => setNewSource(e.target.value as EntityAlias['source'])}
                className="border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SOURCE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={saving}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs rounded font-medium"
              >
                {saving ? 'Adding…' : 'Add Alias'}
              </button>
              <button
                onClick={() => { setShowAdd(false); setNewAlias(''); setError(null) }}
                className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Active aliases */}
        {activeAliases.length === 0 && !showAdd ? (
          <p className="text-sm text-gray-400 py-2">No aliases yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-2 text-left font-medium">Alias Name</th>
                <th className="pb-2 text-left font-medium">Source</th>
                <th className="pb-2 text-left font-medium">Added</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {activeAliases.map(a => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="py-2 font-mono text-xs text-gray-800">{a.alias_name}</td>
                  <td className="py-2 text-xs text-gray-500 capitalize">{a.source.replace('_', ' ')}</td>
                  <td className="py-2 text-xs text-gray-400">{a.created_at.split('T')[0]}</td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => handleDeactivate(a.id)}
                      disabled={deactiId === a.id}
                      title="Deactivate alias"
                      className="text-gray-400 hover:text-red-500 disabled:opacity-40"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Inactive aliases toggle */}
        {inactiveAliases.length > 0 && (
          <div>
            <button
              onClick={() => setShowInactive(v => !v)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              {showInactive ? 'Hide' : 'Show'} {inactiveAliases.length} deactivated alias{inactiveAliases.length !== 1 ? 'es' : ''}
            </button>
            {showInactive && (
              <table className="w-full text-sm mt-2 opacity-50">
                <tbody className="divide-y divide-gray-50">
                  {inactiveAliases.map(a => (
                    <tr key={a.id}>
                      <td className="py-1.5 font-mono text-xs text-gray-500 line-through">{a.alias_name}</td>
                      <td className="py-1.5 text-xs text-gray-400 capitalize">{a.source.replace('_', ' ')}</td>
                      <td className="py-1.5 text-xs text-gray-400">deactivated</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
