import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DraftInboxActions } from '@/components/transactions/DraftInboxActions'
import type { AgentDraftInboxRow } from '@/lib/transactions/agentDraftActions'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}))

jest.mock('next/link', () => {
  return function MockLink({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode
    href: string
    [key: string]: unknown
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  }
})

jest.mock('@/lib/transactions/agentDraftActions', () => ({
  approveAndPostAgentTransactionDraft: jest.fn(),
  rejectAgentTransactionDraft: jest.fn(),
}))

const base: AgentDraftInboxRow = {
  id: 'draft-1',
  date: '2026-08-31',
  property: 'Liron and Alon',
  category: 'Management',
  subcategory: 'Tenant Payment',
  description: 'תשלום לחודש אוגוסט השלמה',
  payer: 'Tenant',
  payee: 'Yossi',
  amount_eur: '550.00',
  client_charge: null,
  notes: null,
  status: 'draft',
  created_at: '2026-09-16T20:53:16.517073+00:00',
  posted_transaction_id: null,
}

describe('DraftInboxActions', () => {
  it('shows bilingual edit / reject / approve actions for an open draft', () => {
    const html = renderToStaticMarkup(<DraftInboxActions draft={base} />)
    expect(html).toContain('Edit / עריכה')
    expect(html).toContain('Reject / דחייה')
    expect(html).toContain('Approve / אשר')
    expect(html).toContain('/transactions/drafts/draft-1/edit')
    expect(html).not.toContain('Posted TX')
  })

  it('disables posting after the draft is posted and shows the transaction id', () => {
    const html = renderToStaticMarkup(
      <DraftInboxActions
        draft={{
          ...base,
          status: 'posted',
          posted_transaction_id: 'tx-posted-1',
        }}
      />,
    )
    expect(html).toContain('Posted TX tx-posted-1')
    expect(html).toContain('disabled')
    expect(html).toContain('pointer-events-none')
  })
})
