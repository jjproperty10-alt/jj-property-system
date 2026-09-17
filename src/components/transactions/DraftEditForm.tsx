'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { AgentDraftInboxRow } from '@/lib/transactions/agentDraftActions'
import { updateAgentTransactionDraft } from '@/lib/transactions/agentDraftActions'
import { CATEGORIES, CATEGORY_SUBCATEGORIES, type Category } from '@/types'

export function DraftEditForm({ draft }: { readonly draft: AgentDraftInboxRow }) {
  const router = useRouter()
  const [date, setDate] = useState(draft.date)
  const [propertyName, setPropertyName] = useState(draft.property)
  const [category, setCategory] = useState<Category | string>(draft.category)
  const [subcategory, setSubcategory] = useState(draft.subcategory)
  const [description, setDescription] = useState(draft.description ?? '')
  const [payer, setPayer] = useState(draft.payer ?? '')
  const [payee, setPayee] = useState(draft.payee ?? '')
  const [amount, setAmount] = useState(draft.amount_eur ?? '')
  const [clientCharge, setClientCharge] = useState(draft.client_charge ?? '')
  const [notes, setNotes] = useState(draft.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const subcategories = CATEGORY_SUBCATEGORIES[category as Category] ?? []

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const result = await updateAgentTransactionDraft({
      id: draft.id,
      date,
      property_name: propertyName,
      category: String(category),
      subcategory,
      description,
      notes,
      payer,
      payee,
      amount_eur: amount,
      client_charge: clientCharge,
      idempotency_key: draft.id,
    })
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.push('/transactions/drafts')
    router.refresh()
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit draft / עריכת טיוטה</h1>
          <p className="text-sm text-gray-500 mt-0.5">Draft only. This never posts to accounts.</p>
        </div>
        <Link href="/transactions/drafts" className="btn-secondary text-sm">Back</Link>
      </div>
      {error && <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <form onSubmit={onSubmit} className="card space-y-4 p-6" data-testid="draft-edit-form">
        <label className="block text-sm">Date
          <input className="input mt-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="block text-sm">Property
          <input className="input mt-1" value={propertyName} onChange={(e) => setPropertyName(e.target.value)} />
        </label>
        <label className="block text-sm">Category
          <select className="input mt-1" value={category} onChange={(e) => { setCategory(e.target.value); setSubcategory('') }}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="block text-sm">Subcategory
          <select className="input mt-1" value={subcategory} onChange={(e) => setSubcategory(e.target.value)} required>
            <option value="">— select —</option>
            {subcategories.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="block text-sm">Description
          <input className="input mt-1" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="block text-sm">Payer
          <input className="input mt-1" value={payer} onChange={(e) => setPayer(e.target.value)} />
        </label>
        <label className="block text-sm">Payee
          <input className="input mt-1" value={payee} onChange={(e) => setPayee(e.target.value)} />
        </label>
        <label className="block text-sm">Amount
          <input className="input mt-1" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="block text-sm">Client Charge
          <input className="input mt-1" value={clientCharge} onChange={(e) => setClientCharge(e.target.value)} />
        </label>
        <label className="block text-sm">Notes
          <input className="input mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button type="submit" className="btn-primary text-sm" disabled={saving}>
          {saving ? 'Saving…' : 'Save draft / שמור טיוטה'}
        </button>
      </form>
    </div>
  )
}
