/**
 * E2 Migration smoke tests
 *
 * Verifies that MoneyValue integration preserves P-ARCH-1 (null -> em-dash)
 * through the migrated partner report layer.
 *
 * Uses renderToStaticMarkup (Node environment, no jsdom).
 * Tests are intentionally narrow — full business logic is tested elsewhere.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MoneyValue } from '../../components/ds'
import { SectionHeader } from '../../components/ds'

function render(el: React.ReactElement): string {
  return renderToStaticMarkup(el)
}

describe('E2 — MoneyValue null preservation (P-ARCH-1)', () => {
  it('renders null amount as em-dash, not "0" or "null"', () => {
    const html = render(<MoneyValue amount={null} />)
    expect(html).toMatch(/\u2014|&#8212;/)
    expect(html).not.toMatch(/>0</)
    expect(html).not.toMatch(/>null</)
  })

  it('renders zero amount as "\u20ac0" not as em-dash', () => {
    const html = render(<MoneyValue amount={0} />)
    expect(html).not.toMatch(/&#8212;/)
    expect(html).toContain('0')
  })

  it('renders non-null amount with dir="ltr"', () => {
    const html = render(<MoneyValue amount={50000} />)
    expect(html).toContain('dir="ltr"')
  })

  it('null amount does NOT include dir="ltr" (em-dash is direction-neutral)', () => {
    const html = render(<MoneyValue amount={null} />)
    expect(html).not.toContain('dir="ltr"')
  })
})

describe('E2 — SectionHeader renders title', () => {
  it('renders h3 with the provided title', () => {
    const html = render(<SectionHeader title="Capital" />)
    expect(html).toContain('Capital')
  })

  it('renders action slot content', () => {
    const html = render(
      <SectionHeader title="Capital" action={<span data-testid="badge">Fully Paid</span>} />
    )
    expect(html).toContain('Fully Paid')
  })

  it('renders badge slot content inline with title', () => {
    const html = render(
      <SectionHeader title="Timeline" badge={<span>3 pending</span>} />
    )
    expect(html).toContain('3 pending')
    expect(html).toContain('Timeline')
  })
})

describe('E2 — MoneyValue size variants', () => {
  it('sm renders text-sm class', () => {
    const html = render(<MoneyValue amount={1000} size="sm" />)
    expect(html).toContain('text-sm')
  })

  it('lg renders text-xl class', () => {
    const html = render(<MoneyValue amount={1000} size="lg" />)
    expect(html).toContain('text-xl')
  })
})

describe('E2 — MoneyValue null with className (conditional coloring)', () => {
  it('null amount ignores conditional color className (uses gray italic instead)', () => {
    const html = render(<MoneyValue amount={null} className="text-green-700 font-semibold" />)
    // The null path renders its own gray italic style, not the conditional className color
    // The className is still applied to the span but gray-400 and italic are also present
    expect(html).toMatch(/&#8212;|\u2014/)
    expect(html).toContain('text-gray-400')
  })
})
