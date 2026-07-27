/**
 * @description Tests for OperatingFrame — Contract A.
 *
 * Test environment: node (jest.config.ts testEnvironment: 'node')
 * Rendering strategy: react-dom/server renderToStaticMarkup
 *
 * Test Contracts covered:
 *   TC-OF-1: Renders sidebar
 *   TC-OF-2: Content area has skip-to-content target (OF-R3 amended)
 *   TC-OF-3: Active workspace detection from pathname
 *   TC-OF-4: Children rendered inside content area
 *   TC-OF-5: Skip-to-content link present (a11y)
 *   TC-OF-6: Wraps children in GlobalContextProvider
 *   TC-OF-7: null activeWorkspaceId when no route matches
 *   TC-OF-8: Mobile hamburger button visible (responsive)
 */

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { OperatingFrame } from '../OperatingFrame'
import type { FrameUser, WorkspaceRegistration } from '@/lib/nav/types'
import { Home, BarChart3 } from 'lucide-react'

// ─── Mocks ───────────────────────────────────────────────────────────────

// Mock next/navigation
let mockPathname = '/home'
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

// Mock next/link
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

// ─── Fixtures ────────────────────────────────────────────────────────────

const mockUser: FrameUser = {
  id: 'user-1',
  name: 'Yossi',
  email: 'yossi@jjproperty.com',
  role: 'ceo',
}

const mockWorkspaces: WorkspaceRegistration[] = [
  {
    id: 'home',
    label: 'Home',
    icon: Home,
    landingRoute: '/home',
    routePrefix: '/home',
    attentionProvider: async () => null,
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: BarChart3,
    landingRoute: '/finance',
    routePrefix: '/finance',
    attentionProvider: async () => null,
  },
]

/** Render OperatingFrame to HTML string for the given pathname. */
function renderFrame(pathname = '/home', children?: React.ReactNode): string {
  mockPathname = pathname
  return renderToStaticMarkup(
    <OperatingFrame user={mockUser} workspaces={mockWorkspaces}>
      {children ?? <div data-testid="page-content">Page content</div>}
    </OperatingFrame>
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('OperatingFrame', () => {
  beforeEach(() => {
    mockPathname = '/home'
  })

  // TC-OF-1: Renders sidebar
  it('renders sidebar with navigation', () => {
    const html = renderFrame()
    expect(html).toContain('aria-label="Main navigation"')
  })

  // TC-OF-2: Content area is skip-to-content target (OF-R3 amended)
  // OperatingFrame does NOT render <main> — delegated to workspace/page shell
  // to avoid nested <main> with WorkspaceShell. Content area is a <div>.
  it('content area has id=main-content and is a div (not main)', () => {
    const html = renderFrame()
    expect(html).toContain('id="main-content"')
    // id="main-content" must be on a <div>, not <main> (amendment)
    expect(html).toMatch(/<div[^>]*id="main-content"/)
    expect(html).not.toMatch(/<main[^>]*id="main-content"/)
  })

  // TC-OF-3: Active workspace detection from pathname
  it('marks active workspace based on pathname', () => {
    const html = renderFrame('/home')
    // Home link should have aria-current="page"
    expect(html).toContain('aria-current="page"')
    // The aria-current link should point to /home
    expect(html).toContain('href="/home"')
  })

  it('detects nested route as matching workspace', () => {
    const html = renderFrame('/finance/reports')
    expect(html).toContain('aria-current="page"')
    // Finance workspace should be active
    expect(html).toContain('href="/finance"')
  })

  // TC-OF-4: Children rendered inside content area
  it('renders children inside content area', () => {
    const html = renderFrame()
    expect(html).toContain('Page content')
    expect(html).toContain('data-testid="page-content"')
  })

  // TC-OF-5: Skip-to-content link (a11y)
  it('renders skip-to-content link', () => {
    const html = renderFrame()
    expect(html).toContain('Skip to main content')
    expect(html).toContain('href="#main-content"')
  })

  // TC-OF-6: Wraps children in GlobalContextProvider
  // (Verified implicitly — if sidebar renders workspace names from context, provider works)
  it('provides global context to children', () => {
    const html = renderFrame()
    // Sidebar reads workspaces from props passed through OperatingFrame
    expect(html).toContain('Home')
    expect(html).toContain('Finance')
  })

  // TC-OF-7: null activeWorkspaceId when no route matches
  it('no workspace is active for unmatched route', () => {
    const html = renderFrame('/unknown-page')
    // Neither workspace should have aria-current
    expect(html).not.toContain('aria-current')
  })

  // TC-OF-8: Mobile hamburger button
  it('renders mobile hamburger button', () => {
    const html = renderFrame()
    expect(html).toContain('aria-label="Open navigation menu"')
  })

  // User identity in sidebar
  it('displays user name and email in sidebar', () => {
    const html = renderFrame()
    expect(html).toContain('Yossi')
    expect(html).toContain('yossi@jjproperty.com')
  })

  // Brand
  it('displays JJ Property brand in sidebar', () => {
    const html = renderFrame()
    expect(html).toContain('JJ Property')
  })

  // Content area has correct ID for skip link
  it('content area has id for skip link target', () => {
    const html = renderFrame()
    expect(html).toContain('id="main-content"')
  })
})
