/**
 * @page /transactions/drafts/[id]/edit
 * Draft-only edit. Never writes public.transactions.
 */

import 'server-only'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { getAgentTransactionDraft } from '@/lib/transactions/agentDraftActions'
import { DraftEditForm } from '@/components/transactions/DraftEditForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'JJ — Edit Transaction Draft',
}

export default async function EditTransactionDraftPage({
  params,
}: {
  params: { id: string }
}) {
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    if (auth.error === 'NO_SESSION') redirect('/login')
    notFound()
  }

  const loaded = await getAgentTransactionDraft(params.id)
  if (!loaded.ok) notFound()
  if (loaded.draft.status === 'posted' || loaded.draft.status === 'rejected') {
    redirect('/transactions/drafts')
  }

  return <DraftEditForm draft={loaded.draft} />
}
