/**
 * G3 - Client Financial Timeline view-model tests.
 * LOCKED: STR (Airbnb/STR) and LTR (Management/LTR) stay separate; Settlement/
 * Transfer is summed separately and NEVER folded into operating net; filtering
 * is stable and non-coercive; Purchase never re-appears.
 */
import {
  toTimelineColumns,
  filterTimeline,
  categoryTotals,
  timelineSummary,
  timelineProperties,
} from '@/lib/report/clientTimelineView'
import type { ClientTimelineRowWithProperty } from '@/lib/report/timelineCategory'

function r(o: Partial<ClientTimelineRowWithProperty>): ClientTimelineRowWithProperty {
  return {
    id: o.id ?? 'x',
    date: o.date ?? '2026-01-01',
    category: o.category ?? 'Management/LTR',
    subcategory: o.subcategory ?? 'Rent',
    description: o.subcategory ?? 'Rent',
    amount: o.amount ?? 100,
    direction: o.direction ?? 'in',
    property: o.property ?? 'Villa A',
  }
}

const SAMPLE: ClientTimelineRowWithProperty[] = [
  r({ id: '1', date: '2026-01-01', category: 'Airbnb/STR', amount: 400, direction: 'in', property: 'Flat B' }),
  r({ id: '2', date: '2026-01-03', category: 'Management/LTR', amount: 1000, direction: 'in', property: 'Villa A' }),
  r({ id: '3', date: '2026-01-05', category: 'Renovation', amount: 250, direction: 'out', property: 'Villa A' }),
  r({ id: '4', date: '2026-01-07', category: 'Settlement/Transfer', amount: 900, direction: 'settlement', property: 'Villa A' }),
]

describe('G3 - timeline columns', () => {
  test('signedAmount: in positive, out negative, settlement negative', () => {
    expect(toTimelineColumns(r({ direction: 'in', amount: 100 })).signedAmount).toBe(100)
    expect(toTimelineColumns(r({ direction: 'out', amount: 100 })).signedAmount).toBe(-100)
    expect(toTimelineColumns(r({ direction: 'settlement', amount: 100 })).signedAmount).toBe(-100)
  })

  test('columns are client-safe: exactly the display fields, nothing else', () => {
    const c = toTimelineColumns(r({}))
    expect(Object.keys(c).sort()).toEqual(
      ['amount', 'category', 'date', 'direction', 'property', 'signedAmount', 'subcategory'].sort(),
    )
  })
})

describe('G3 - filtering', () => {
  test('no filter returns a copy of all rows (stable order)', () => {
    const out = filterTimeline(SAMPLE)
    expect(out.map(x => x.id)).toEqual(['1', '2', '3', '4'])
    expect(out).not.toBe(SAMPLE)
  })

  test('category filter keeps STR and LTR separable', () => {
    expect(filterTimeline(SAMPLE, { categories: ['Airbnb/STR'] }).map(x => x.id)).toEqual(['1'])
    expect(filterTimeline(SAMPLE, { categories: ['Management/LTR'] }).map(x => x.id)).toEqual(['2'])
  })

  test('property and direction filters compose', () => {
    expect(
      filterTimeline(SAMPLE, { properties: ['Villa A'], directions: ['in'] }).map(x => x.id),
    ).toEqual(['2'])
  })

  test('empty filter axes impose no restriction', () => {
    expect(filterTimeline(SAMPLE, { categories: [], properties: [], directions: [] }).length).toBe(4)
  })
})

describe('G3 - properties', () => {
  test('distinct properties in first-seen order', () => {
    expect(timelineProperties(SAMPLE)).toEqual(['Flat B', 'Villa A'])
  })
})

describe('G3 - category totals', () => {
  test('one row per present category, in canonical order, STR != LTR', () => {
    const totals = categoryTotals(SAMPLE)
    expect(totals.map(t => t.category)).toEqual(['Renovation', 'Management/LTR', 'Airbnb/STR', 'Settlement/Transfer'])
    const str = totals.find(t => t.category === 'Airbnb/STR')!
    const ltr = totals.find(t => t.category === 'Management/LTR')!
    expect(str.inflow).toBe(400)
    expect(ltr.inflow).toBe(1000)
    expect(str.inflow).not.toBe(ltr.inflow)
  })

  test('outflow and net computed per category', () => {
    const reno = categoryTotals(SAMPLE).find(t => t.category === 'Renovation')!
    expect(reno.outflow).toBe(250)
    expect(reno.net).toBe(-250)
  })

  test('empty input yields empty totals (no zero-coercion)', () => {
    expect(categoryTotals([])).toEqual([])
  })
})

describe('G3 - grand summary', () => {
  test('settlement is summed separately and NOT folded into operating net', () => {
    const s = timelineSummary(SAMPLE)
    expect(s.operatingIn).toBe(1400) // 400 STR + 1000 LTR
    expect(s.operatingOut).toBe(250) // renovation
    expect(s.operatingNet).toBe(1150) // 1400 - 250, settlement excluded
    expect(s.settlement).toBe(900)
    expect(s.rowCount).toBe(4)
  })

  test('operatingNet ignores settlement even when settlement dominates', () => {
    const rows = [
      r({ direction: 'in', amount: 100, category: 'Management/LTR' }),
      r({ direction: 'settlement', amount: 5000, category: 'Settlement/Transfer' }),
    ]
    const s = timelineSummary(rows)
    expect(s.operatingNet).toBe(100)
    expect(s.settlement).toBe(5000)
  })
})
