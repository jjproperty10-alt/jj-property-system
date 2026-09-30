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
import { listAssistantProperties, listAssistantPropertyAliases } from '@/lib/ops/assistant/opsConversationActions'
import {
  listClientSettlementEntities,
  listPartnerFundingActors,
} from '@/lib/ops/assistant/clientCashSettlementActions'
import { AssistantChat } from '@/components/ops/AssistantChat'
import { resolveProperty } from '@/lib/ops/assistant/transactionDraftCollector'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'JJ — Assistant',
}

export default async function AssistantPage({
  searchParams,
}: {
  searchParams?: { c?: string; property?: string }
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
  const aliasList = await listAssistantPropertyAliases()
  const entities = await listClientSettlementEntities()
  const partners = await listPartnerFundingActors()
  const conversationId = typeof searchParams?.c === 'string' && searchParams.c.trim()
    ? searchParams.c.trim()
    : null
  const properties = catalog.ok ? catalog.properties : []
  const aliases = aliasList.ok ? aliasList.aliases : []
  const propertyQuery = typeof searchParams?.property === 'string' ? searchParams.property.trim() : ''
  const resolvedProperty = !conversationId && propertyQuery
    ? resolveProperty(propertyQuery, properties, aliases)
    : null
  const suggestedPropertyName = resolvedProperty?.kind === 'unique' ? resolvedProperty.entry.name : null

  return (
    <AssistantChat
      staffPayerName={frame?.name ?? ''}
      catalog={properties}
      aliases={aliases}
      entities={entities.ok ? entities.entities : []}
      partners={partners.ok ? partners.actors : []}
      initialConversationId={conversationId}
      suggestedPropertyName={suggestedPropertyName}
    />
  )
}
