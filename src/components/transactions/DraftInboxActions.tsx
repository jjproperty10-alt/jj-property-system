'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { AgentDraftInboxRow } from '@/lib/transactions/agentDraftActions'
import {
  approveAndPostAgentTransactionDraft,
  rejectAgentTransactionDraft,
} from '@/lib/transactions/agentDraftActions'

function money(value: string | null): string {
  if (value == null) return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function canMutate(status: string): boolean {
  return status === 'draft' || status === 'needs_review' || status === 'ready_for_approval'
}

export function DraftInboxActions({ draft }: { readonly draft: AgentDraftInboxRow }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState('')
  const [postedId, setPostedId] = useState(draft.posted_transaction_id)

  const posted = Boolean(postedId) || draft.status === 'posted'
  const disabled = pending || posted || !canMutate(draft.status)

  function runReject() {
    setError('')
    startTransition(async () => {
      const result = await rejectAgentTransactionDraft(draft.id)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  function runApprove() {
    setError('')
    startTransition(async () => {
      const result = await approveAndPostAgentTransactionDraft(draft.id)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setPostedId(result.postedTransactionId)
      setConfirmOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="space-y-1" data-testid={`draft-actions-${draft.id}`}>
      <div className="flex flex-wrap gap-1">
        <Link
          href={`/transactions/drafts/${draft.id}/edit`}
          className={`text-xs font-medium ${disabled ? 'pointer-events-none text-gray-300' : 'text-brand-600'}`}
        >
          Edit / עריכה
        </Link>
        <button
          type="button"
          disabled={disabled}
          onClick={runReject}
          className="text-xs font-medium text-red-700 disabled:text-gray-300"
        >
          Reject / דחייה
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setConfirmOpen(true)}
          className="text-xs font-medium text-brand-700 disabled:text-gray-300"
          data-testid={`approve-draft-${draft.id}`}
        >
          Approve / אשר
        </button>
      </div>
      {postedId && (
        <p className="text-[11px] text-gray-500" data-testid={`posted-tx-${draft.id}`}>
          Posted TX {postedId}
        </p>
      )}
      {error && <p className="text-[11px] text-red-600">{error}</p>}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Approve and post / אשר ופרסם</h2>
            <p className="mt-1 text-sm text-gray-500">This will create one ledger row. It cannot be undone by deleting.</p>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-gray-500">Date</dt><dd>{draft.date || '—'}</dd>
              <dt className="text-gray-500">Property</dt><dd>{draft.property || '—'}</dd>
              <dt className="text-gray-500">Category</dt><dd>{draft.category || '—'}</dd>
              <dt className="text-gray-500">Subcategory</dt><dd>{draft.subcategory || '—'}</dd>
              <dt className="text-gray-500">Description</dt><dd className="break-words">{draft.description || '—'}</dd>
              <dt className="text-gray-500">Payer</dt><dd>{draft.payer || '—'}</dd>
              <dt className="text-gray-500">Payee</dt><dd>{draft.payee || '—'}</dd>
              <dt className="text-gray-500">Amount</dt><dd>{money(draft.amount_eur)}</dd>
              <dt className="text-gray-500">Client Charge</dt><dd>{money(draft.client_charge)}</dd>
            </dl>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-secondary text-sm" onClick={() => setConfirmOpen(false)} disabled={pending}>
                Cancel / ביטול
              </button>
              <button
                type="button"
                className="btn-primary text-sm"
                onClick={runApprove}
                disabled={pending}
                data-testid={`confirm-approve-${draft.id}`}
              >
                Confirm post / אשר פרסום
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
