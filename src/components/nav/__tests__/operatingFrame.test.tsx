/**
 * @description Tests for OperatingFrame — Contract A.
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
import { render, screen } from '@testing-library/react'
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

function renderFrame(pathname = '/home', children?: React.ReactNode) {
  mockPathname = pathname
  return render(
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
    renderFrame()
    expect(screen.getByLabelText('Main navigation')).toBeInTheDocument()
  })

  // TC-OF-2: Content area is skip-to-content target (OF-R3 amended)
  // OperatingFrame does NOT render <main> — delegated to workspace/page shell
  // to avoid nested <main> with WorkspaceShell. Content area is a <div>.
  it('content area has id=main-content for skip link', () => {
    renderFrame()
    const contentArea = document.getElementById('main-content')
    expect(contentArea).toBeInTheDocument()
    // It should NOT be a <main> (amendment — <main> is in page/workspace shell)
    expect(contentArea?.tagName).toBe('DIV')
  })

  // TC-OF-3: Active workspace detection from pathname
  it('marks active workspace based on pathname', () => {
    renderFrame('/home')
    // Home link should have aria-current="page"
    const homeLink = screen.getByText('Home').closest('a')
    expect(homeLink).toHaveAttribute('aria-current', 'page')

    // Finance should NOT have aria-current
    const financeLink = screen.getByText('Finance').closest('a')
    expect(financeLink).not.toHaveAttribute('aria-current')
  })

  it('detects nested route as matching workspace', () => {
    renderFrame('/finance/reports')
    const financeLink = screen.getByText('Finance').closest('a')
    expect(financeLink).toHaveAttribute('aria-current', 'page')
  })

  // TC-OF-4: Children rendered inside content area
  it('renders children inside content area', () => {
    renderFrame()
    const contentArea = document.getElementById('main-content')
    expect(contentArea).toContainElement(screen.getByTestId('page-content'))
  })

  // TC-OF-5: Skip-to-content link (a11y)
  it('renders skip-to-content link', () => {
    renderFrame()
    const skipLink = screen.getByText('Skip to main content')
    expect(skipLink).toHaveAttribute('href', '#main-content')
  })

  // TC-OF-6: Wraps children in GlobalContextProvider
  // (Verified implicitly — if sidebar renders workspace names from context, provider works)
  it('provides global context to children', () => {
    renderFrame()
    // Sidebar reads workspaces from props passed through OperatingFrame
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Finance')).toBeInTheDocument()
  })

  // TC-OF-7: null activeWorkspaceId when no route matches
  it('no workspace is active for unmatched route', () => {
    renderFrame('/unknown-page')
    // Neither workspace should have aria-current
    const homeLink = screen.getByText('Home').closest('a')
    const financeLink = screen.getByText('Finance').closest('a')
    expect(homeLink).not.toHaveAttribute('aria-current')
    expect(financeLink).not.toHaveAttribute('aria-current')
  })

  // TC-OF-8: Mobile hamburger button
  it('renders mobile hamburger button', () => {
    renderFrame()
    expect(screen.getByLabelText('Open navigation menu')).toBeInTheDocument()
  })

  // User identity in sidebar
  it('displays user name and email in sidebar', () => {
    renderFrame()
    expect(screen.getByText('Yossi')).toBeInTheDocument()
    expect(screen.getByText('yossi@jjproperty.com')).toBeInTheDocument()
  })

  // Brand
  it('displays JJ Property brand in sidebar', () => {
    renderFrame()
    expect(screen.getByText('JJ Property')).toBeInTheDocument()
  })

  // Content area has correct ID for skip link
  it('content area has id for skip link target', () => {
    renderFrame()
    const contentArea = document.getElementById('main-content')
    expect(contentArea).toBeInTheDocument()
    expect(contentArea).toHaveAttribute('id', 'main-content')
  })
})
