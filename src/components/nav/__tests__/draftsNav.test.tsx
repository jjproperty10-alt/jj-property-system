/**
 * Focused navigation tests for Drafts / טיוטות under Transactions.
 *
 * Nested sidebar child — not a new RegisteredWorkspaceId (Nav Principle 9).
 * Staff OperatingFrame only; partner routes never receive this sidebar.
 */

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { OperatingFrame } from '../OperatingFrame'
import { getRegisteredWorkspaces, getAllWorkspaces } from '@/lib/nav/workspaceRegistry'
import type { FrameUser, WorkspaceNavItem } from '@/lib/nav/types'

let mockPathname = '/home'
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
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

const mockUser: FrameUser = {
  id: 'user-1',
  name: 'Yossi',
  email: 'yossi@jjproperty.com',
  role: 'ceo',
}

function firstMainNavHrefs(html: string): string[] {
  const nav = html.match(/aria-label="Main navigation"[\s\S]*?<\/nav>/)
  if (!nav) {
    throw new Error('Main navigation not found')
  }
  return Array.from(nav[0].matchAll(/href="([^"]+)"/g)).map((match) => match[1])
}

function renderFrame(pathname = '/home', workspaces = getRegisteredWorkspaces('ceo')): string {
  mockPathname = pathname
  return renderToStaticMarkup(
    <OperatingFrame user={mockUser} workspaces={workspaces}>
      <div>Page content</div>
    </OperatingFrame>
  )
}

describe('Drafts sidebar entry associated with Transactions', () => {
  beforeEach(() => {
    mockPathname = '/home'
  })

  it('points to /transactions/drafts immediately after Transactions', () => {
    const hrefs = firstMainNavHrefs(renderFrame('/home'))
    const tx = hrefs.indexOf('/transactions')
    expect(tx).toBeGreaterThan(-1)
    expect(hrefs[tx + 1]).toBe('/transactions/drafts')
  })

  it('shows English and Hebrew labels', () => {
    const html = renderFrame('/home')
    expect(html).toContain('Drafts')
    expect(html).toContain('טיוטות')
    expect(html).toMatch(/href="\/transactions\/drafts"[^>]*data-testid="nav-transactions-drafts"/)
  })

  it('marks Drafts current on /transactions/drafts', () => {
    const html = renderFrame('/transactions/drafts')
    expect(html).toMatch(/href="\/transactions\/drafts"[^>]*aria-current="page"/)
  })

  it('is visible to every staff FrameUser role that sees Transactions', () => {
    for (const role of ['ceo', 'finance', 'operations', 'staff'] as const) {
      const hrefs = firstMainNavHrefs(renderFrame('/home', getRegisteredWorkspaces(role)))
      expect(hrefs).toContain('/transactions')
      expect(hrefs).toContain('/transactions/drafts')
    }
  })

  it('is not registered as a separate workspace id', () => {
    expect(getAllWorkspaces().map((ws) => ws.id)).not.toContain('drafts')
  })

  it('is omitted when Transactions is not in the workspace list', () => {
    const withoutTransactions: WorkspaceNavItem[] = getRegisteredWorkspaces('ceo').filter(
      (ws) => ws.id !== 'transactions',
    )
    const hrefs = firstMainNavHrefs(renderFrame('/home', withoutTransactions))
    expect(hrefs).not.toContain('/transactions/drafts')
    expect(hrefs).not.toContain('/transactions')
  })
})
