/**
 * Focused navigation tests for the Partner Reports sidebar item.
 *
 * Proves:
 *   - it renders immediately below Finance
 *   - href is the index page, not the Avi report itself
 *   - bilingual label (English title + Hebrew sub-label)
 *   - active on the index page AND on the nested /avi report, and Finance is
 *     NOT active there (longest-prefix match)
 *   - visible to ceo + finance only; omitted for operations + staff
 *   - existing items and Settings are untouched
 */

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { OperatingFrame } from '../OperatingFrame'
import { getRegisteredWorkspaces, getAllWorkspaces } from '@/lib/nav/workspaceRegistry'
import type { FrameUser } from '@/lib/nav/types'

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

const INDEX_ROUTE = '/finance/external-partner'
const AVI_ROUTE = '/finance/external-partner/avi'

function firstMainNavHrefs(html: string): string[] {
  const nav = html.match(/aria-label="Main navigation"[\s\S]*?<\/nav>/)
  if (!nav) {
    throw new Error('Main navigation not found')
  }
  return Array.from(nav[0].matchAll(/href="([^"]+)"/g)).map((match) => match[1])
}

function renderFrame(pathname = '/home'): string {
  mockPathname = pathname
  return renderToStaticMarkup(
    <OperatingFrame user={mockUser} workspaces={getRegisteredWorkspaces('ceo')}>
      <div>Page content</div>
    </OperatingFrame>
  )
}

describe('Partner Reports sidebar item', () => {
  beforeEach(() => {
    mockPathname = '/home'
  })

  it('is registered immediately below Finance', () => {
    const ids = getAllWorkspaces().map((ws) => ws.id)
    expect(ids.indexOf('partnerReports')).toBe(ids.indexOf('finance') + 1)
  })

  it('points at the index page, not directly at the Avi report', () => {
    const ws = getAllWorkspaces().find((item) => item.id === 'partnerReports')
    expect(ws).toBeDefined()
    expect(ws?.label).toBe('Partner Reports')
    expect(ws?.labelHe).toBe('דוחות שותפים')
    expect(ws?.landingRoute).toBe(INDEX_ROUTE)
    expect(ws?.routePrefix).toBe(INDEX_ROUTE)
    expect(ws?.landingRoute).not.toBe(AVI_ROUTE)
  })

  it('renders immediately after Finance in the sidebar', () => {
    const hrefs = firstMainNavHrefs(renderFrame('/home'))
    expect(hrefs.indexOf(INDEX_ROUTE)).toBe(hrefs.indexOf('/finance') + 1)
  })

  it('shows the English title with the Hebrew sub-label', () => {
    const html = renderFrame('/home')
    expect(html).toContain('Partner Reports')
    expect(html).toContain('דוחות שותפים')
  })

  it('is active on the index page and Finance is not', () => {
    const html = renderFrame(INDEX_ROUTE)
    expect(html).toMatch(
      new RegExp(`href="${INDEX_ROUTE}"[^>]*aria-current="page"`)
    )
    expect(html).not.toMatch(/href="\/finance"[^>]*aria-current="page"/)
  })

  it('stays active on the nested /avi report and Finance is not', () => {
    const html = renderFrame(AVI_ROUTE)
    expect(html).toMatch(
      new RegExp(`href="${INDEX_ROUTE}"[^>]*aria-current="page"`)
    )
    expect(html).not.toMatch(/href="\/finance"[^>]*aria-current="page"/)
  })

  it('stays active on the nested PDF route', () => {
    const html = renderFrame(`${AVI_ROUTE}/pdf`)
    expect(html).toMatch(
      new RegExp(`href="${INDEX_ROUTE}"[^>]*aria-current="page"`)
    )
  })

  it('leaves Finance active on /finance itself', () => {
    const html = renderFrame('/finance')
    expect(html).toMatch(/href="\/finance"[^>]*aria-current="page"/)
    expect(html).not.toMatch(
      new RegExp(`href="${INDEX_ROUTE}"[^>]*aria-current="page"`)
    )
  })

  it('follows Finance visibility (ceo + finance; not operations or staff)', () => {
    expect(getRegisteredWorkspaces('ceo').some((ws) => ws.id === 'partnerReports')).toBe(true)
    expect(getRegisteredWorkspaces('finance').some((ws) => ws.id === 'partnerReports')).toBe(true)
    expect(getRegisteredWorkspaces('operations').some((ws) => ws.id === 'partnerReports')).toBe(false)
    expect(getRegisteredWorkspaces('staff').some((ws) => ws.id === 'partnerReports')).toBe(false)
  })

  it('does not add Avi to Owners and does not touch Client Reports', () => {
    const hrefs = firstMainNavHrefs(renderFrame('/home'))
    expect(hrefs).toEqual([
      '/home',
      '/ceo',
      '/owners',
      '/client-report-rc3',
      '/finance',
      INDEX_ROUTE,
      '/transactions',
      '/validation',
    ])
    const clientReports = getAllWorkspaces().find((ws) => ws.id === 'clientReports')
    expect(clientReports?.label).toBe('Client Reports')
    expect(clientReports?.labelHe).toBe('דוחות לקוחות')
    expect(clientReports?.landingRoute).toBe('/client-report-rc3')
    expect(clientReports?.routePrefix).toBe('/client-report-rc3')

    const owners = getAllWorkspaces().find((ws) => ws.id === 'owners')
    expect(owners?.label).toBe('Owners')
    expect(owners?.landingRoute).toBe('/owners')
    expect(owners?.routePrefix).toBe('/owners')

    // Neither pre-existing item gains or loses a role.
    for (const id of ['owners', 'clientReports'] as const) {
      expect(getRegisteredWorkspaces('ceo').some((ws) => ws.id === id)).toBe(true)
      expect(getRegisteredWorkspaces('finance').some((ws) => ws.id === id)).toBe(true)
      expect(getRegisteredWorkspaces('operations').some((ws) => ws.id === id)).toBe(false)
      expect(getRegisteredWorkspaces('staff').some((ws) => ws.id === id)).toBe(false)
    }
  })

  it('keeps existing workspace items and the Settings utility', () => {
    const html = renderFrame('/home')
    expect(html).toContain('Home')
    expect(html).toContain('Company')
    expect(html).toContain('Owners')
    expect(html).toContain('Client Reports')
    expect(html).toContain('Finance')
    expect(html).toContain('href="/settings"')
    expect(firstMainNavHrefs(html)).not.toContain('/settings')
  })
})
