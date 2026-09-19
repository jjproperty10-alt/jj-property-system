/**
 * @page /assistant
 * @description Staff-only JJ Assistant chat. Drafts and cash preview.
 * Execute is never automatic; confirmation button only.
 */

import 'server-only'
import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { resolveFrameUser } from '@/lib/nav/resolveFrameUser'
import { listAssistantProperties } from '@/lib/ops/assistant/opsConversationActions'
import { listClientSettlementEntities } from '@/lib/ops/assistant/clientCashSettlementActions'
import { AssistantChat } from '@/components/ops/AssistantChat'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'JJ — Assistant',
}

export default async function AssistantPage({
  searchParams,
}: {
  searchParams?: { c?: string }
}) {
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    if (auth.error === 'NO_SESSION') {
      redirect('/login')
    }
    notFound()
  }

  const frame = await resolveFrameUser()
  const catalog = await listAssistantProperties()
  const entities = await listClientSettlementEntities()
  const conversationId = typeof searchParams?.c === 'string' && searchParams.c.trim()
    ? searchParams.c.trim()
    : null

  return (
    <AssistantChat
      staffPayerName={frame?.name ?? ''}
      catalog={catalog.ok ? catalog.properties : []}
      entities={entities.ok ? entities.entities : []}
      initialConversationId={conversationId}
    />
  )
}
