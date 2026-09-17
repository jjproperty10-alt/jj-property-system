import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { OperatingFrame } from '../OperatingFrame'
import { getRegisteredWorkspaces, getAllWorkspaces } from '@/lib/nav/workspaceRegistry'
import type { FrameUser } from '@/lib/nav/types'
import fs from 'fs'
import path from 'path'

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
  if (!nav) throw new Error('Main navigation not found')
  return Array.from(nav[0].matchAll(/href="([^"]+)"/g)).map((match) => match[1])
}

function renderFrame(pathname = '/home', role: FrameUser['role'] = 'ceo'): string {
  mockPathname = pathname
  return renderToStaticMarkup(
    <OperatingFrame user={{ ...mockUser, role }} workspaces={getRegisteredWorkspaces(role)}>
      <div>Page content</div>
    </OperatingFrame>
  )
}

describe('JJ Assistant sidebar item', () => {
  it('registers /assistant after Home for every staff role', () => {
    const ids = getAllWorkspaces().map((w) => w.id)
    expect(ids).toContain('assistant')
    expect(ids.indexOf('assistant')).toBe(ids.indexOf('home') + 1)
    for (const role of ['ceo', 'finance', 'operations', 'staff'] as const) {
      const hrefs = firstMainNavHrefs(renderFrame('/home', role))
      expect(hrefs).toContain('/assistant')
    }
  })

  it('shows English and Hebrew labels and sparkles test id', () => {
    const html = renderFrame('/assistant')
    expect(html).toContain('JJ Assistant')
    expect(html).toContain('העוזר שלי')
    expect(html).toContain('data-testid="nav-assistant"')
    expect(html).toMatch(/href="\/assistant"[^>]*aria-current="page"/)
  })

  it('is omitted from partner routes', () => {
    const partnerDir = path.join(__dirname, '..', '..', '..', 'app', 'partner')
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name)
        return entry.isDirectory() ? walk(full) : [full]
      })
    const blob = walk(partnerDir).map((f) => fs.readFileSync(f, 'utf8')).join('\n')
    expect(blob).not.toContain('/assistant')
    expect(blob).not.toContain('JJ Assistant')
  })
})
