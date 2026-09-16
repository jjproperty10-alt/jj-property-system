/**
 * @page /transactions/drafts
 * @description Staff-only read-only draft inbox.
 *
 * Loads via public.list_agent_transaction_drafts on the session JWT.
 * Never writes public.transactions. No approve / post / delete.
 */

import 'server-only'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { listAgentTransactionDrafts } from '@/lib/transactions/agentDraftActions'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'JJ — Transaction Drafts',
}

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

function stamp(value: string): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

export default async function TransactionDraftsPage() {
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    if (auth.error === 'NO_SESSION') {
      redirect('/login')
    }
    notFound()
  }

  const listed = await listAgentTransactionDrafts()
  const drafts = listed.ok ? listed.drafts : []

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transaction Drafts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Read-only inbox. Drafts are not posted to accounts.</p>
        </div>
        <Link href="/transactions/new" className="btn-primary text-sm">
          New draft
        </Link>
      </div>

      {!listed.ok && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-6 text-sm">
          {listed.error}
        </div>
      )}

      {listed.ok && drafts.length === 0 && (
        <div className="card p-6 text-sm text-gray-600">
          No drafts yet.{' '}
          <Link href="/transactions/new" className="text-brand-600 font-medium">
            Create a draft
          </Link>
        </div>
      )}

      {listed.ok && drafts.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[960px] table-fixed text-sm" data-testid="drafts-inbox-table">
            <colgroup>
              <col className="w-[5.5rem]" />
              <col className="w-[6rem]" />
              <col className="w-[5.5rem]" />
              <col className="w-[6rem]" />
              <col className="w-[7rem]" />
              <col className="w-[4.25rem]" />
              <col className="w-[4.25rem]" />
              <col className="w-[5.75rem]" />
              <col className="w-[6rem]" />
              <col className="w-[4.25rem]" />
              <col className="w-[9.5rem]" />
            </colgroup>
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-2 py-2 font-medium overflow-hidden text-ellipsis whitespace-nowrap" title="Date">Date</th>
                <th className="px-2 py-2 font-medium overflow-hidden text-ellipsis whitespace-nowrap" title="Property">Property</th>
                <th className="px-2 py-2 font-medium overflow-hidden text-ellipsis whitespace-nowrap" title="Category">Category</th>
                <th className="px-2 py-2 font-medium overflow-hidden text-ellipsis whitespace-nowrap" title="Subcategory">Subcategory</th>
                <th className="px-2 py-2 font-medium overflow-hidden text-ellipsis whitespace-nowrap" title="Description">Description</th>
                <th className="px-2 py-2 font-medium overflow-hidden text-ellipsis whitespace-nowrap" title="Payer">Payer</th>
                <th className="px-2 py-2 font-medium overflow-hidden text-ellipsis whitespace-nowrap" title="Payee">Payee</th>
                <th className="px-2 py-2 font-medium text-right overflow-hidden text-ellipsis whitespace-nowrap" title="Amount">Amount</th>
                <th className="px-2 py-2 font-medium text-right overflow-hidden text-ellipsis whitespace-nowrap" title="Client charge">Client charge</th>
                <th className="px-2 py-2 font-medium overflow-hidden text-ellipsis whitespace-nowrap" title="Status">Status</th>
                <th className="px-2 py-2 font-medium overflow-hidden text-ellipsis whitespace-nowrap" title="Created" data-testid="col-created-header">Created</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((row, index) => (
                <tr key={`${row.created_at}-${row.date}-${index}`} className="border-t border-gray-100">
                  <td className="px-2 py-2 whitespace-nowrap overflow-hidden text-ellipsis" title={row.date || undefined}>{row.date || '—'}</td>
                  <td className="px-2 py-2 overflow-hidden">
                    <span className="block truncate" title={row.property || undefined}>{row.property || '—'}</span>
                  </td>
                  <td className="px-2 py-2 overflow-hidden">
                    <span className="block truncate" title={row.category || undefined}>{row.category || '—'}</span>
                  </td>
                  <td className="px-2 py-2 overflow-hidden">
                    <span className="block truncate" title={row.subcategory || undefined}>{row.subcategory || '—'}</span>
                  </td>
                  <td className="px-2 py-2 overflow-hidden">
                    <span className="block truncate" title={row.description || undefined}>{row.description ?? '—'}</span>
                  </td>
                  <td className="px-2 py-2 overflow-hidden">
                    <span className="block truncate" title={row.payer || undefined}>{row.payer ?? '—'}</span>
                  </td>
                  <td className="px-2 py-2 overflow-hidden">
                    <span className="block truncate" title={row.payee || undefined}>{row.payee ?? '—'}</span>
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">{money(row.amount_eur)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">{money(row.client_charge)}</td>
                  <td className="px-2 py-2 whitespace-nowrap overflow-hidden text-ellipsis" title={row.status || undefined}>{row.status || '—'}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-gray-500 tabular-nums" title={stamp(row.created_at)}>
                    {stamp(row.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
