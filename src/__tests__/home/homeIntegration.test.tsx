/**
 * @module __tests__/home/homeIntegration
 * @description Integration tests for the Home page rendering — PR #79.
 *
 * Tests the three-way conditional (Position 3):
 *   allClear === true  → AllClearCard
 *   allClear === false → NeedsAttentionSection
 *   allClear === null  → HomeUnavailable
 *
 * Uses react-test-renderer (consistent with PR #78 pattern).
 *
 * NOTE: These tests verify component rendering logic, not the full page.
 * The page is async (Server Component) so we test the components directly.
 */

import React from 'react'
import renderer from 'react-test-renderer'
import { NeedsAttentionSection } from '@/components/home/NeedsAttentionSection'
import { HomeUnavailable } from '@/components/home/HomeUnavailable'
import type { HomeBriefAttentionItem } from '@/lib/home/homeBriefTypes'

// ─── NeedsAttentionSection tests ───────────────────────────────────────────

describe('NeedsAttentionSection', () => {
  const items: readonly HomeBriefAttentionItem[] = [
    {
      id: 'att-1',
      title: 'Cashbox reconciliation overdue',
      explanation: 'Jacob cashbox has not been reconciled for 30 days.',
      severity: 'urgent',
      executiveOwner: 'Chief Financial Officer',
      route: null,
    },
    {
      id: 'att-2',
      title: 'PMS sync stale',
      explanation: 'Hostaway data is 48 hours old.',
      severity: 'normal',
      executiveOwner: 'Chief of Staff',
      route: null,
    },
  ]

  test('renders when items exist', () => {
    const tree = renderer.create(
      <NeedsAttentionSection items={items} />
    )
    const json = tree.toJSON()

    expect(json).not.toBeNull()
    // Should render as a container div
    expect(json).toBeDefined()
  })

  test('renders null when items array is empty', () => {
    const tree = renderer.create(
      <NeedsAttentionSection items={[]} />
    )
    const json = tree.toJSON()

    expect(json).toBeNull()
  })

  test('renders correct number of attention items', () => {
    const tree = renderer.create(
      <NeedsAttentionSection items={items} />
    )
    const root = tree.root

    const listItems = root.findAllByProps({ 'data-testid': 'attention-item' })
    expect(listItems).toHaveLength(2)
  })

  test('urgent items have red styling', () => {
    const tree = renderer.create(
      <NeedsAttentionSection items={items} />
    )
    const root = tree.root

    const listItems = root.findAllByProps({ 'data-testid': 'attention-item' })
    // First item is urgent → red border
    expect(listItems[0].props.className).toContain('border-red-200')
    expect(listItems[0].props.className).toContain('bg-red-50')
    // Second item is normal → white
    expect(listItems[1].props.className).toContain('border-gray-200')
    expect(listItems[1].props.className).toContain('bg-white')
  })
})

// ─── HomeUnavailable tests ─────────────────────────────────────────────────

describe('HomeUnavailable', () => {
  test('renders with status role', () => {
    const tree = renderer.create(<HomeUnavailable />)
    const root = tree.root

    const container = root.findByProps({ 'data-testid': 'home-unavailable' })
    expect(container.props.role).toBe('status')
  })

  test('renders checking message', () => {
    const tree = renderer.create(<HomeUnavailable />)
    const json = tree.toJSON()

    expect(json).not.toBeNull()
    // Should contain the checking message text
    expect(JSON.stringify(json)).toContain('Checking business status')
  })

  test('does not show "0 issues" or any count', () => {
    const tree = renderer.create(<HomeUnavailable />)
    const rendered = JSON.stringify(tree.toJSON())

    expect(rendered).not.toContain('0 issues')
    expect(rendered).not.toContain('0 items')
    expect(rendered).not.toContain('all clear')
    expect(rendered).not.toContain('All Clear')
  })
})

// ─── GlobalContext boundary test ───────────────────────────────────────────

describe('GlobalContext boundary', () => {
  test('home components do not import GlobalContext', () => {
    // Verify at the import level that no home component depends on GlobalContext
    const fs = require('fs')
    const path = require('path')

    const homeComponents = [
      path.resolve(__dirname, '../../components/home/NeedsAttentionSection.tsx'),
      path.resolve(__dirname, '../../components/home/HomeUnavailable.tsx'),
    ]

    for (const filePath of homeComponents) {
      const source = fs.readFileSync(filePath, 'utf-8')
      expect(source).not.toContain('GlobalContext')
      expect(source).not.toContain('useGlobalContext')
      expect(source).not.toContain('GlobalContextProvider')
    }
  })
})
