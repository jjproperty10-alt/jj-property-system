'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { User, Phone, Mail, Plus, Trash2, Building2 } from 'lucide-react'

type Contact = {
  id: string
  name: string
  type: string
  email: string | null
  phone: string | null
  property_name: string | null
  notes: string | null
  created_at: string
}

const TYPE_COLORS: Record<string, string> = {
  tenant:   'bg-blue-100 text-blue-700',
  owner:    'bg-green-100 text-green-700',
  supplier: 'bg-orange-100 text-orange-700',
  lawyer:   'bg-purple-100 text-purple-700',
  agent:    'bg-pink-100 text-pink-700',
  other:    'bg-gray-100 text-gray-600',
}

const CONTACT_TYPES = ['tenant','owner','supplier','lawyer','agent','other']

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all')
  const [search, setSearch]     = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [form, setForm]         = useState({
    name: '', type: 'tenant', email: '', phone: '', property_name: '', notes: ''
  })

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('contacts').select('*').order('name')
    setContacts((data ?? []) as Contact[])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    await supabase.from('contacts').insert([{
      name: form.name,
      type: form.type,
      email: form.email || null,
      phone: form.phone || null,
      property_name: form.property_name || null,
      notes: form.notes || null,
    }])
    setForm({ name: '', type: 'tenant', email: '', phone: '', property_name: '', notes: '' })
    setShowForm(false)
    setSaving(false)
    load()
  }

  async function remove(id: string) {
    if (!confirm('Delete this contact?')) return
    await supabase.from('contacts').delete().eq('id', id)
    load()
  }

  const filtered = contacts.filter(c => {
    const matchType   = filter === 'all' || c.type === filter
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone ?? '').includes(search) || (c.email ?? '').toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-sm text-gray-500 mt-0.5">{contacts.length} contacts</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={15} /> New Contact
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">New Contact</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Name *</label>
              <input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Full name" />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                {CONTACT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Property</label>
              <input className="input" value={form.property_name} onChange={e => setForm({...form, property_name: e.target.value})} placeholder="Property name" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+357..." />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="email@..." />
            </div>
            <div>
              <label className="label">Notes</label>
              <input className="input" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Optional notes" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={save} disabled={saving || !form.name} className="btn-primary text-sm">
              {saving ? 'Saving...' : 'Save Contact'}
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, phone, email..." className="input w-64" />
        {['all', ...CONTACT_TYPES].map(t => (
          <button key={t} onClick={() => setFilter(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
              filter === t ? 'bg-brand-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {t === 'all' ? 'All' : t}
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-gray-400">Loading...</div>}

      {!loading && filtered.length === 0 && (
        <div className="card p-12 text-center">
          <User size={36} className="text-gray-300 mx-auto mb-3" />
          <div className="text-gray-500">No contacts yet.</div>
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm mt-4 inline-flex items-center gap-2">
            <Plus size={14} /> Add First Contact
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {filtered.map(c => (
          <div key={c.id} className="card p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-semibold text-gray-900">{c.name}</div>
                <span className={`badge text-xs mt-1 ${TYPE_COLORS[c.type] ?? 'bg-gray-100 text-gray-600'}`}>
                  {c.type}
                </span>
              </div>
              <button onClick={() => remove(c.id)} className="text-gray-300 hover:text-red-400 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
            <div className="space-y-1.5 mt-3 text-xs">
              {c.phone && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Phone size={11} className="text-gray-400" />
                  <a href={`tel:${c.phone}`} className="hover:text-brand-600">{c.phone}</a>
                </div>
              )}
              {c.email && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Mail size={11} className="text-gray-400" />
                  <a href={`mailto:${c.email}`} className="hover:text-brand-600 truncate">{c.email}</a>
                </div>
              )}
              {c.property_name && (
                <div className="flex items-center gap-2 text-gray-500">
                  <Building2 size={11} className="text-gray-400" />
                  {c.property_name}
                </div>
              )}
            </div>
            {c.notes && <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400">{c.notes}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
