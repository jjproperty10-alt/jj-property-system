/**
 * JJ Property 10 - Client Financial Timeline UI (G3)
 *
 * Client-safe, presentational timeline. Renders the columnar timeline with
 * category / property / direction filters and a separated STR / LTR /
 * Settlement summary. Consumes ONLY ClientTimelineRowWithProperty and the
 * view-model in `@/lib/report/clientTimelineView` - it never receives an
 * RC3AccountRow, so it is structurally incapable of reading payer/payee,
 * actual cost, margin, evidence, or raw description. Lives under
 * client-report-rc3 so check:whitelist enforces that guarantee.
 *
 * Presentation only: no accounting logic, no data fetching. Mount it with rows
 * from `buildClientTimeline(reports)`.
 */
'use client'

import React, { useMemo, useState } from 'react'
import type { ClientTimelineRowWithProperty, ClientTimelineCategory, TimelineDirection } from '@/lib/report/timelineCategory'
import { TIMELINE_CATEGORIES } from '@/lib/report/timelineCategory'
import {
  filterTimeline,
  categoryTotals,
  timelineSummary,
  timelineProperties,
  toTimelineColumns,
  type TimelineFilter,
} from '@/lib/report/clientTimelineView'

export interface ClientFinancialTimelineProps {
  rows: ClientTimelineRowWithProperty[]
  /** Optional heading; defaults to a neutral English label (G4 will localise). */
  title?: string
  /** Optional currency formatter; defaults to plain fixed-2. */
  formatAmount?: (n: number) => string
}

const DIRECTIONS: { key: TimelineDirection; label: string }[] = [
  { key: 'in', label: 'In' },
  { key: 'out', label: 'Out' },
  { key: 'settlement', label: 'Settlement/Transfer' },
]

function defaultFormat(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value]
}

export function ClientFinancialTimeline({
  rows,
  title = 'Financial Timeline',
  formatAmount = defaultFormat,
}: ClientFinancialTimelineProps) {
  const [cats, setCats] = useState<ClientTimelineCategory[]>([])
  const [props, setProps] = useState<string[]>([])
  const [dirs, setDirs] = useState<TimelineDirection[]>([])

  const allProperties = useMemo(() => timelineProperties(rows), [rows])

  const filter: TimelineFilter = useMemo(
    () => ({ categories: cats, properties: props, directions: dirs }),
    [cats, props, dirs],
  )
  const filtered = useMemo(() => filterTimeline(rows, filter), [rows, filter])
  const columns = useMemo(() => filtered.map(toTimelineColumns), [filtered])
  const perCategory = useMemo(() => categoryTotals(filtered), [filtered])
  const summary = useMemo(() => timelineSummary(filtered), [filtered])

  return (
    <section className="client-financial-timeline" aria-label={title}>
      <header className="cft-header">
        <h3 className="cft-title">{title}</h3>
      </header>

      <div className="cft-filters" role="group" aria-label="Timeline filters">
        <div className="cft-filter-row">
          {TIMELINE_CATEGORIES.map(c => (
            <button
              key={c}
              type="button"
              aria-pressed={cats.includes(c)}
              className={cats.includes(c) ? 'cft-chip cft-chip--on' : 'cft-chip'}
              onClick={() => setCats(prev => toggle(prev, c))}
            >
              {c}
            </button>
          ))}
        </div>
        {allProperties.length > 1 && (
          <div className="cft-filter-row">
            {allProperties.map(p => (
              <button
                key={p}
                type="button"
                aria-pressed={props.includes(p)}
                className={props.includes(p) ? 'cft-chip cft-chip--on' : 'cft-chip'}
                onClick={() => setProps(prev => toggle(prev, p))}
              >
                {p}
              </button>
            ))}
          </div>
        )}
        <div className="cft-filter-row">
          {DIRECTIONS.map(d => (
            <button
              key={d.key}
              type="button"
              aria-pressed={dirs.includes(d.key)}
              className={dirs.includes(d.key) ? 'cft-chip cft-chip--on' : 'cft-chip'}
              onClick={() => setDirs(prev => toggle(prev, d.key))}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <table className="cft-table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            {allProperties.length > 1 && <th scope="col">Property</th>}
            <th scope="col">Category</th>
            <th scope="col">Detail</th>
            <th scope="col" className="cft-num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {columns.length === 0 ? (
            <tr>
              <td className="cft-empty" colSpan={allProperties.length > 1 ? 5 : 4}>
                No timeline movements for the current filters.
              </td>
            </tr>
          ) : (
            columns.map((row, i) => (
              <tr key={`${row.date}-${i}`} className={`cft-dir-${row.direction}`}>
                <td>{row.date}</td>
                {allProperties.length > 1 && <td>{row.property}</td>}
                <td>{row.category}</td>
                <td>{row.subcategory}</td>
                <td className="cft-num">{formatAmount(row.signedAmount)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <footer className="cft-summary">
        <ul className="cft-category-totals">
          {perCategory.map(c => (
            <li key={c.category} className="cft-cat-total">
              <span className="cft-cat-name">{c.category}</span>
              <span className="cft-cat-in">+{formatAmount(c.inflow)}</span>
              <span className="cft-cat-out">-{formatAmount(c.outflow)}</span>
              <span className="cft-cat-net">{formatAmount(c.net)}</span>
              <span className="cft-cat-count">{c.count}</span>
            </li>
          ))}
        </ul>
        <dl className="cft-grand">
          <div><dt>Operating in</dt><dd>{formatAmount(summary.operatingIn)}</dd></div>
          <div><dt>Operating out</dt><dd>{formatAmount(summary.operatingOut)}</dd></div>
          <div><dt>Operating net</dt><dd>{formatAmount(summary.operatingNet)}</dd></div>
          <div className="cft-grand--settlement"><dt>Settlement/Transfer</dt><dd>{formatAmount(summary.settlement)}</dd></div>
        </dl>
      </footer>
    </section>
  )
}

export default ClientFinancialTimeline
