/**
 * @description Tests for WorkspaceHeader — DS component.
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
import { render, screen } from '@testing-library/react'
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

describe('WorkspaceHeader', () => {
  // TC-WH-1: title renders as <h1>
  it('renders title as <h1>', () => {
    render(<WorkspaceHeader title="Dashboard" />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Dashboard')
  })

  // TC-WH-2: subtitle renders when provided
  it('renders subtitle when provided', () => {
    render(<WorkspaceHeader title="Properties" subtitle="All managed properties" />)
    expect(screen.getByText('All managed properties')).toBeInTheDocument()
  })

  it('does not render subtitle when null (P-ARCH-1)', () => {
    const { container } = render(<WorkspaceHeader title="Properties" subtitle={null} />)
    // Only the title text should exist, no <p> for subtitle
    const paragraphs = container.querySelectorAll('p')
    expect(paragraphs.length).toBe(0)
  })

  it('does not render subtitle when omitted', () => {
    const { container } = render(<WorkspaceHeader title="Properties" />)
    const paragraphs = container.querySelectorAll('p')
    expect(paragraphs.length).toBe(0)
  })

  // TC-WH-3: backRoute renders Link
  it('renders back button with correct href', () => {
    render(<WorkspaceHeader title="Property Details" backRoute="/owners" />)
    const backLink = screen.getByLabelText('Go back')
    expect(backLink).toHaveAttribute('href', '/owners')
  })

  it('does not render back button when backRoute is null', () => {
    render(<WorkspaceHeader title="Dashboard" backRoute={null} />)
    expect(screen.queryByLabelText('Go back')).not.toBeInTheDocument()
  })

  it('does not render back button when backRoute is omitted', () => {
    render(<WorkspaceHeader title="Dashboard" />)
    expect(screen.queryByLabelText('Go back')).not.toBeInTheDocument()
  })

  // TC-WH-4: actions slot
  it('renders actions when provided', () => {
    render(
      <WorkspaceHeader
        title="Finance"
        actions={<button>Export</button>}
      />
    )
    expect(screen.getByText('Export')).toBeInTheDocument()
  })

  it('does not render actions slot when null', () => {
    const { container } = render(
      <WorkspaceHeader title="Finance" actions={null} />
    )
    // The actions wrapper div should not be present
    const header = container.firstChild as HTMLElement
    // Should only have the title area, no actions div
    expect(header.querySelectorAll('[class*="flex-shrink-0"]').length).toBe(0)
  })

  // TC-WH-5: no history.back() — deterministic navigation only
  // This is a structural test: we verify that the back button is a <a> (Link),
  // not a <button> with onClick={history.back}
  it('back navigation is a Link, not a button with history.back()', () => {
    render(<WorkspaceHeader title="Details" backRoute="/list" />)
    const backElement = screen.getByLabelText('Go back')
    expect(backElement.tagName).toBe('A')
    expect(backElement).toHaveAttribute('href', '/list')
  })

  // TC-WH-6: accessible back button
  it('back button has aria-label', () => {
    render(<WorkspaceHeader title="Details" backRoute="/list" />)
    expect(screen.getByLabelText('Go back')).toBeInTheDocument()
  })

  // Full composition
  it('renders all elements together', () => {
    render(
      <WorkspaceHeader
        title="Villa Mazotos"
        subtitle="Property overview"
        backRoute="/owners/avi"
        actions={<button>Edit</button>}
      />
    )

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Villa Mazotos')
    expect(screen.getByText('Property overview')).toBeInTheDocument()
    expect(screen.getByLabelText('Go back')).toHaveAttribute('href', '/owners/avi')
    expect(screen.getByText('Edit')).toBeInTheDocument()
  })
})
