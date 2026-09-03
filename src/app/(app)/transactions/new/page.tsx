'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  CATEGORY_SUBCATEGORIES, CATEGORIES, KNOWN_PAYERS,
  KNOWN_PAYEES, CATEGORY_COLORS, type Category,
} from '@/types'
import { format } from 'date-fns'
import { CheckCircle, AlertCircle, Zap } from 'lucide-react'

type FormState = {
  date: string
  property_name: string
  category: Category
  subcategory: string
  description: string
  payer: string
  payee: string
  amount_eur: string
  client_charge: string
  notes: string
}

const INITIAL: FormState = {
  date: format(new Date(), 'yyyy-MM-dd'),
  property_name: '',
  category: 'Management',
  subcategory: '',
  description: '',
  payer: '',
  payee: '',
  amount_eur: '',
  client_charge: '',
  notes: '',
}

export default function NewTransactionPage() {
  const router = useRouter()
  const [form, setForm]               = useState<FormState>(INITIAL)
  const [properties, setProperties]   = useState<string[]>([])
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [error, setError]             = useState('')
  const [startTime]                   = useState(Date.now())
  const amountRef                     = useRef<HTMLInputElement>(null)
  const [propFilter, setPropFilter]   = useState('')
  const [showPropDrop, setShowPropDrop] = useState(false)

  useEffect(() => {
    supabase
      .from('properties')
      .select('name')
      .order('name')
      .then(({ data }) => {
        if (data) setProperties(data.map(p => p.name))
      })
  }, [])

  function set(field: keyof FormState, value: string) {
    setForm(prev => ({
      ...prev,
      [field]: value,
      // Auto-reset subcategory when category changes
      ...(field === 'category' ? { subcategory: '' } : {}),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!form.date || !form.category || !form.subcategory) {
      setError('Date, Category, and Subcategory are required.')
      return
    }

    setSaving(true)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    // Find property ID
    let property_id: string | null = null
    if (form.property_name) {
      const { data } = await supabase
        .from('properties')
        .select('id')
        .eq('name', form.property_name)
        .single()
      property_id = data?.id ?? null
    }

    const payload = {
      date:          form.date,
      property_id,
      property_name: form.property_name || null,
      category:      form.category,
      subcategory:   form.subcategory,
      description:   form.description || null,
      payer:         form.payer || null,
      payee:         form.payee || null,
      amount_eur:    parseFloat(form.amount_eur) || 0,
      client_charge: form.client_charge ? parseFloat(form.client_charge) : null,
      notes:         form.notes || null,
    }

    const { error: insertError } = await supabase.from('transactions').insert([payload])

    setSaving(false)
    if (insertError) {
      setError(insertError.message)
    } else {
      setSaved(true)
      // Show success briefly, then reset for next entry
      setTimeout(() => {
        setSaved(false)
        setForm({ ...INITIAL, date: form.date, category: form.category })
        amountRef.current?.focus()
      }, 1500)
    }
  }

  const subcategories = CATEGORY_SUBCATEGORIES[form.category] ?? []
  const filteredProps = properties.filter(p =>
    p.toLowerCase().includes(propFilter.toLowerCase())
  )

  return (
    <div className="p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2">
            <Zap size={20} className="text-brand-500" />
            <h1 className="text-2xl font-bold text-gray-900">New Transaction</h1>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">Target: under 10 seconds per entry</p>
        </div>
        <button
          onClick={() => router.push('/transactions')}
          className="btn-secondary text-sm"
        >
          View all →
        </button>
      </div>

      {/* Success / Error banners */}
      {saved && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700
                        rounded-lg px-4 py-3 mb-6 text-sm font-medium">
          <CheckCircle size={16} />
          Transaction saved! Ready for next entry.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700
                        rounded-lg px-4 py-3 mb-6 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {/* Row 1: Date + Property */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Date *</label>
            <input
              type="date"
              value={form.date}
              onChange={e => set('date', e.target.value)}
              className="input"
              required
            />
          </div>
          <div className="relative">
            <label className="label">Property</label>
            <input
              type="text"
              value={propFilter || form.property_name}
              onChange={e => {
                setPropFilter(e.target.value)
                set('property_name', e.target.value)
                setShowPropDrop(true)
              }}
              onFocus={() => setShowPropDrop(true)}
              onBlur={() => setTimeout(() => setShowPropDrop(false), 150)}
              placeholder="Type to search..."
              className="input"
              autoComplete="off"
            />
            {showPropDrop && filteredProps.length > 0 && (
              <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border
                              border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredProps.slice(0, 12).map(p => (
                  <button
                    key={p}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    onMouseDown={() => {
                      set('property_name', p)
                      setPropFilter('')
                      setShowPropDrop(false)
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Category + Subcategory */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Category *</label>
            <select
              value={form.category}
              onChange={e => set('category', e.target.value as Category)}
              className="input"
              required
            >
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Subcategory *</label>
            <select
              value={form.subcategory}
              onChange={e => set('subcategory', e.target.value)}
              className="input"
              required
            >
              <option value="">— select —</option>
              {subcategories.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 3: Description */}
        <div>
          <label className="label">Description</label>
          <input
            type="text"
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Short description..."
            className="input"
          />
        </div>

        {/* Row 4: Payer + Payee */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Payer</label>
            <input
              type="text"
              value={form.payer}
              onChange={e => set('payer', e.target.value)}
              list="payers-list"
              placeholder="Who paid?"
              className="input"
            />
            <datalist id="payers-list">
              {KNOWN_PAYERS.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>
          <div>
            <label className="label">Payee</label>
            <input
              type="text"
              value={form.payee}
              onChange={e => set('payee', e.target.value)}
              list="payees-list"
              placeholder="Who received?"
              className="input"
            />
            <datalist id="payees-list">
              {KNOWN_PAYEES.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>
        </div>

        {/* Row 5: Amount + Client Charge */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Amount (EUR) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">
                €
              </span>
              <input
                ref={amountRef}
                type="number"
                step="0.01"
                min="0"
                value={form.amount_eur}
                onChange={e => set('amount_eur', e.target.value)}
                placeholder="0.00"
                className="input pl-7"
              />
            </div>
          </div>
          <div>
            <label className="label">Client Charge (EUR)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">
                €
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.client_charge}
                onChange={e => set('client_charge', e.target.value)}
                placeholder="0.00"
                className="input pl-7"
              />
            </div>
          </div>
        </div>

        {/* Row 6: Notes */}
        <div>
          <label className="label">Notes</label>
          <input
            type="text"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Optional..."
            className="input"
          />
        </div>

        {/* Category badge preview */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div className="flex items-center gap-2">
            {form.category && (
              <span className={`badge ${CATEGORY_COLORS[form.category]}`}>
                {form.category}
              </span>
            )}
            {form.subcategory && (
              <span className="badge bg-gray-100 text-gray-700">{form.subcategory}</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setForm(INITIAL)}
              className="btn-secondary text-sm"
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary text-sm min-w-[120px]"
            >
              {saving ? 'Saving...' : '⚡ Save Entry'}
            </button>
          </div>
        </div>
      </form>

      {/* Keyboard shortcut hint */}
      <p className="text-center text-xs text-gray-400 mt-4">
        Press Enter to save · Tab to navigate fields
      </p>
    </div>
  )
}
