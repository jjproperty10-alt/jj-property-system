/**
 * @description Tests for WorkspaceHeader — DS component.
 *
 * Test environment: node (jest.config.ts testEnvironment: 'node')
 * Rendering strategy: react-dom/server renderToStaticMarkup
 *
 * Test Contracts covered:
 *   TC-WH-1: title renders as <h1>
 *   TC-WH-2: subtitle renders when provided, absent when null
 *   TC-WH-3: backRoute renders Link with href, absent when null
 *   TC-WH-4: actions slot renders when provided, absent when null
 *   TC-WH-5: no history.back() — deterministic navigation only
 *   TC-WH-6: accessible back button (aria-label)
 */

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WorkspaceHeader } from '../WorkspaceHeader'

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

/** Render a React element to HTML string. */
function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element)
}

describe('WorkspaceHeader', () => {
  // TC-WH-1: title renders as <h1>
  it('renders title as <h1>', () => {
    const html = render(<WorkspaceHeader title="Dashboard" />)
    expect(html).toMatch(/<h1[^>]*>Dashboard<\/h1>/)
  })

  // TC-WH-2: subtitle renders when provided
  it('renders subtitle when provided', () => {
    const html = render(<WorkspaceHeader title="Properties" subtitle="All managed properties" />)
    expect(html).toContain('All managed properties')
  })

  it('does not render subtitle when null (P-ARCH-1)', () => {
    const html = render(<WorkspaceHeader title="Properties" subtitle={null} />)
    // No <p> tag should be present (subtitle is the only <p> in this component)
    // Use regex to avoid matching <path> from SVG icons
    expect(html).not.toMatch(/<p[\s>]/)
  })

  it('does not render subtitle when omitted', () => {
    const html = render(<WorkspaceHeader title="Properties" />)
    expect(html).not.toMatch(/<p[\s>]/)
  })

  // TC-WH-3: backRoute renders Link
  it('renders back button with correct href', () => {
    const html = render(<WorkspaceHeader title="Property Details" backRoute="/owners" />)
    expect(html).toContain('href="/owners"')
    expect(html).toContain('aria-label="Go back"')
  })

  it('does not render back button when backRoute is null', () => {
    const html = render(<WorkspaceHeader title="Dashboard" backRoute={null} />)
    expect(html).not.toContain('aria-label="Go back"')
  })

  it('does not render back button when backRoute is omitted', () => {
    const html = render(<WorkspaceHeader title="Dashboard" />)
    expect(html).not.toContain('aria-label="Go back"')
  })

  // TC-WH-4: actions slot
  it('renders actions when provided', () => {
    const html = render(
      <WorkspaceHeader
        title="Finance"
        actions={<button>Export</button>}
      />
    )
    expect(html).toContain('Export')
  })

  it('does not render actions slot when null', () => {
    const html = render(
      <WorkspaceHeader title="Finance" actions={null} />
    )
    // No actions wrapper should be rendered
    expect(html).not.toContain('Export')
  })

  // TC-WH-5: no history.back() — deterministic navigation only
  // This is a structural test: we verify that the back button is a <a> (Link),
  // not a <button> with onClick={history.back}
  it('back navigation is a Link (a tag), not a button with history.back()', () => {
    const html = render(<WorkspaceHeader title="Details" backRoute="/list" />)
    // The back element should be an <a> tag with href, not a <button>
    expect(html).toContain('href="/list"')
    expect(html).toContain('aria-label="Go back"')
    // Verify it's an <a> tag (our mocked Link renders <a>)
    expect(html).toMatch(/<a[^>]*aria-label="Go back"/)
  })

  // TC-WH-6: accessible back button
  it('back button has aria-label', () => {
    const html = render(<WorkspaceHeader title="Details" backRoute="/list" />)
    expect(html).toContain('aria-label="Go back"')
  })

  // Full composition
  it('renders all elements together', () => {
    const html = render(
      <WorkspaceHeader
        title="Villa Mazotos"
        subtitle="Property overview"
        backRoute="/owners/avi"
        actions={<button>Edit</button>}
      />
    )

    expect(html).toMatch(/<h1[^>]*>Villa Mazotos<\/h1>/)
    expect(html).toContain('Property overview')
    expect(html).toContain('href="/owners/avi"')
    expect(html).toContain('Edit')
  })
})
