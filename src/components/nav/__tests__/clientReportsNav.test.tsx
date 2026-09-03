/**
 * Focused navigation tests for the Client Reports sidebar item.
 *
 * Proves the registry item is rendered by OperatingFrame/Sidebar:
 *   - immediately after Owners
 *   - href is exactly /client-report-rc3
 *   - active on that path (and nested report paths)
 *   - existing Home / Company / Owners / Finance items stay intact
 *   - Settings remains a footer utility, not a workspace
 */

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { OperatingFrame } from '../OperatingFrame'
import { getRegisteredWorkspaces } from '@/lib/nav/workspaceRegistry'
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

describe('Client Reports sidebar item', () => {
  beforeEach(() => {
    mockPathname = '/home'
  })

  it('renders immediately after Owners with href /client-report-rc3', () => {
    const hrefs = firstMainNavHrefs(renderFrame('/home'))
    expect(hrefs).toEqual([
      '/home',
      '/ceo',
      '/owners',
      '/client-report-rc3',
      '/finance',
      '/transactions',
      '/validation',
    ])
  })

  it('shows English and Hebrew labels', () => {
    const html = renderFrame('/home')
    expect(html).toContain('Client Reports')
    expect(html).toContain('דוחות לקוחות')
  })

  it('marks Client Reports active on /client-report-rc3', () => {
    const html = renderFrame('/client-report-rc3')
    expect(html).toMatch(/href="\/client-report-rc3"[^>]*aria-current="page"/)
    expect(html).not.toMatch(/href="\/owners"[^>]*aria-current="page"/)
    expect(html).not.toMatch(/href="\/home"[^>]*aria-current="page"/)
    expect(html).not.toMatch(/href="\/finance"[^>]*aria-current="page"/)
  })

  it('marks Client Reports active on nested report paths', () => {
    const html = renderFrame('/client-report-rc3/pdf')
    expect(html).toMatch(/href="\/client-report-rc3"[^>]*aria-current="page"/)
  })

  it('keeps existing workspace items and Settings utility', () => {
    const html = renderFrame('/home')
    expect(html).toContain('Home')
    expect(html).toContain('Company')
    expect(html).toContain('Owners')
    expect(html).toContain('Finance')
    expect(html).toContain('href="/settings"')
    expect(html).toContain('Settings')
    expect(firstMainNavHrefs(html)).not.toContain('/settings')
  })
})
