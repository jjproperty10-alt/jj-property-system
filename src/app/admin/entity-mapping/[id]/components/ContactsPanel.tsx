'use client'

// ============================================================
// JJ PROPERTY 10 — Contacts Panel
// Panel 4: View and manage contacts linked to this property.
// Links stored in contact_properties (v1.0 table) — soft delete only.
// ============================================================

import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, X, Search, AlertTriangle, User } from 'lucide-react'
import {
  getContactLinks, removeContactLink,
  addContactLink, searchContacts,
  ContactLink, Contact
} from '@/lib/entity-registry'

const ROLE_OPTIONS = [
  'owner', 'agent', 'manager', 'tenant', 'lawyer', 'accountant',
  'contractor', 'referral', 'other',
]

const STATUS_OPTIONS = ['confirmed', 'likely', 'needs_review']

interface Props {
  canonicalName: string
}

export default function ContactsPanel({ canonicalName }: Props) {
  const [links,   setLinks]   = useState<ContactLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const [showAdd,  setShowAdd]  = useState(false)
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState<Contact[]>([])
  const [selected, setSelected] = useState<Contact | null>(null)
  const [role,     setRole]     = useState('owner')
  const [status,   setStatus]   = useState('confirmed')
  const [saving,   setSaving]   = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setLinks(await getContactLinks(canonicalName)) }
    catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }, [canonicalName])

  useEffect(() => { load() }, [load])

  // Search debounce
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      try {
        const r = await searchContacts(query)
        setResults(r)
      } catch { /* ignore */ }
    }, 300)
  }, [query])

  async function handleAdd() {
    if (!selected) return
    setSaving(true); setError(null)
    try {
      await addContactLink(selected.id, canonicalName, role, status)
      setShowAdd(false); setQuery(''); setResults([]); setSelected(null)
      setRole('owner'); setStatus('confirmed')
      await load()
    } catch (e) { setError(String(e)) }
    finally { setSaving(false) }
  }

  async function handleRemove(linkId: string) {
    setRemoving(linkId); setError(null)
    try {
      await removeContactLink(linkId)
      await load()
    } catch (e) { setError(String(e)) }
    finally { setRemoving(null) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Contacts</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {loading ? '…' : `${links.length} linked contact${links.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setError(null) }}
          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          <Plus className="h-3.5 w-3.5" /> Link Contact
        </button>
      </div>

      <div className="px-5 py-4 space-y-3">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {/* Add form */}
        {showAdd && (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
            {/* Contact search */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Search Contact</label>
              {selected ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-white border border-blue-300 rounded text-sm">
                  <User className="h-4 w-4 text-gray-400" />
                  <span className="flex-1 font-medium text-gray-800">{selected.name}</span>
                  {selected.type && <span className="text-xs text-gray-400">{selected.type}</span>}
                  <button onClick={() => { setSelected(null); setQuery('') }} className="text-gray-400 hover:text-red-500">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Type contact name…"
                    autoFocus
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {results.length > 0 && (
                    <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded shadow-md max-h-48 overflow-y-auto">
                      {results.map(c => (
                        <button
                          key={c.id}
                          onClick={() => { setSelected(c); setQuery(c.name); setResults([]) }}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center gap-2 text-sm"
                        >
                          <User className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                          <span>{c.name}</span>
                          {c.type && <span className="text-xs text-gray-400">({c.type})</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {query.length >= 2 && results.length === 0 && (
                    <p className="absolute top-full mt-1 text-xs text-gray-400 px-3 py-2 bg-white border border-gray-100 rounded shadow">
                      No contacts found for "{query}"
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Role + Status */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {ROLE_OPTIONS.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s} className="capitalize">{s.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={!selected || saving}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded font-medium"
              >
                {saving ? 'Linking…' : 'Link Contact'}
              </button>
              <button
                onClick={() => { setShowAdd(false); setQuery(''); setResults([]); setSelected(null); setError(null) }}
                className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Contacts list */}
        {!loading && links.length === 0 && !showAdd && (
          <p className="text-sm text-gray-400">No contacts linked yet.</p>
        )}

        {links.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-2 text-left font-medium">Name</th>
                <th className="pb-2 text-left font-medium">Type</th>
                <th className="pb-2 text-left font-medium">Role</th>
                <th className="pb-2 text-left font-medium">Status</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {links.map(link => (
                <tr key={link.id} className="hover:bg-gray-50">
                  <td className="py-2 font-medium text-gray-800">
                    {link.contact?.name ?? <span className="text-gray-400 italic">Unknown</span>}
                  </td>
                  <td className="py-2 text-gray-500 capitalize text-xs">
                    {link.contact?.type ?? '—'}
                  </td>
                  <td className="py-2 text-gray-500 capitalize text-xs">
                    {link.relationship_role ?? '—'}
                  </td>
                  <td className="py-2 text-xs">
                    <span className={`px-2 py-0.5 rounded font-medium ${
                      link.confirmation_status === 'confirmed' ? 'bg-green-100 text-green-700'
                      : link.confirmation_status === 'likely'  ? 'bg-blue-100 text-blue-700'
                      : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {(link.confirmation_status ?? 'unknown').replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => handleRemove(link.id)}
                      disabled={removing === link.id}
                      title="Remove link"
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

        {link_notes_present(links) && (
          <div className="space-y-1">
            {links.filter(l => l.notes).map(l => (
              <div key={l.id + '_note'} className="text-xs text-gray-400 bg-gray-50 rounded px-3 py-1.5">
                <span className="font-medium text-gray-600">{l.contact?.name}:</span> {l.notes}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function link_notes_present(links: ContactLink[]) {
  return links.some(l => l.notes)
}
