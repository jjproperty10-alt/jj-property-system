'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CheckCircle, AlertCircle } from 'lucide-react'

type FormState = {
  property_id: string
  tenant_name: string
  start_date: string
  end_date: string
  monthly_rent: string
  deposit: string
  payment_day: string
  management_fee_type: 'fixed' | 'percentage'
  management_fee_value: string
  notes: string
}

const INITIAL: FormState = {
  property_id: '',
  tenant_name: '',
  start_date: '',
  end_date: '',
  monthly_rent: '',
  deposit: '',
  payment_day: '1',
  management_fee_type: 'percentage',
  management_fee_value: '10',
  notes: '',
}

export default function NewContractPage() {
  const router = useRouter()
  const [form, setForm]           = useState<FormState>(INITIAL)
  const [properties, setProperties] = useState<{ id: string; name: string; nickname: string | null }[]>([])
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    supabase
      .from('properties')
      .select('id, name, nickname')
      .in('status', ['Rent', 'Rent&Sale'])
      .order('name')
      .then(({ data }) => setProperties(data ?? []))
  }, [])

  function set(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const monthlyRent = parseFloat(form.monthly_rent) || 0
  const feeValue = parseFloat(form.management_fee_value) || 0
  const mgmtFee = form.management_fee_type === 'percentage' ? (monthlyRent * feeValue / 100) : feeValue
  const netToOwner = monthlyRent - mgmtFee

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.property_id || !form.tenant_name || !form.start_date || !form.monthly_rent) {
      setError('Property, Tenant, Start Date and Monthly Rent are required.')
      return
    }
    setSaving(true)
    const { error: err } = await supabase.from('rental_contracts').insert([{
      property_id:          form.property_id,
      tenant_name:          form.tenant_name,
      start_date:           form.start_date,
      end_date:             form.end_date || null,
      monthly_rent:         monthlyRent,
      deposit:              parseFloat(form.deposit) || 0,
      payment_day:          parseInt(form.payment_day) || 1,
      management_fee_type:  form.management_fee_type,
      management_fee_value: feeValue,
      status:               'active',
      notes:                form.notes || null,
    }])
    setSaving(false)
    if (err) { setError(err.message); return }
    setSaved(true)
    setTimeout(() => router.push('/contracts'), 1500)
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">New Rental Contract</h1>
        <p className="text-sm text-gray-500 mt-0.5">Add a long-term rental agreement</p>
      </div>

      {saved && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 mb-6 text-sm">
          <CheckCircle size={16} /> Contract saved! Redirecting...
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-6 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {/* Property */}
        <div>
          <label className="label">Property *</label>
          <select value={form.property_id} onChange={e => set('property_id', e.target.value)} className="input" required>
            <option value="">— Select property —</option>
            {properties.map(p => (
              <option key={p.id} value={p.id}>{p.name}{p.nickname ? ` (${p.nickname})` : ''}</option>
            ))}
          </select>
        </div>

        {/* Tenant */}
        <div>
          <label className="label">Tenant Name *</label>
          <input type="text" value={form.tenant_name} onChange={e => set('tenant_name', e.target.value)}
            placeholder="Full name..." className="input" required />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Start Date *</label>
            <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} className="input" required />
          </div>
          <div>
            <label className="label">End Date</label>
            <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} className="input" />
          </div>
        </div>

        {/* Rent + Deposit */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Monthly Rent (EUR) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
              <input type="number" step="0.01" value={form.monthly_rent}
                onChange={e => set('monthly_rent', e.target.value)} placeholder="0.00" className="input pl-7" required />
            </div>
          </div>
          <div>
            <label className="label">Deposit (EUR)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
              <input type="number" step="0.01" value={form.deposit}
                onChange={e => set('deposit', e.target.value)} placeholder="0.00" className="input pl-7" />
            </div>
          </div>
        </div>

        {/* Payment Day */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Payment Day of Month</label>
            <select value={form.payment_day} onChange={e => set('payment_day', e.target.value)} className="input">
              {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Management Fee */}
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Management Fee</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Fee Type</label>
              <select value={form.management_fee_type}
                onChange={e => set('management_fee_type', e.target.value as 'fixed' | 'percentage')}
                className="input">
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount (€)</option>
              </select>
            </div>
            <div>
              <label className="label">
                {form.management_fee_type === 'percentage' ? 'Percentage (%)' : 'Amount (EUR)'}
              </label>
              <input type="number" step="0.01" value={form.management_fee_value}
                onChange={e => set('management_fee_value', e.target.value)} className="input" />
            </div>
          </div>

          {/* Live calculation */}
          {monthlyRent > 0 && (
            <div className="flex gap-6 text-sm pt-1 border-t border-gray-200">
              <div><span className="text-gray-500">Monthly Rent:</span> <span className="font-semibold">€{monthlyRent.toFixed(0)}</span></div>
              <div><span className="text-gray-500">Mgmt Fee:</span> <span className="font-semibold text-orange-600">€{mgmtFee.toFixed(0)}</span></div>
              <div><span className="text-gray-500">To Owner:</span> <span className="font-semibold text-green-600">€{netToOwner.toFixed(0)}</span></div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="label">Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            rows={2} placeholder="Optional notes..." className="input resize-none" />
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={() => router.push('/contracts')} className="btn-secondary text-sm">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary text-sm min-w-[120px]">
            {saving ? 'Saving...' : 'Save Contract'}
          </button>
        </div>
      </form>
    </div>
  )
}
