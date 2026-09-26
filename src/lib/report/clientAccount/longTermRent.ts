/**
 * Long-term rent presentation.
 * A receipt is split across older open months only when a month-start series
 * proves the monthly amount and the open months are inside the payment month.
 * An additional certified receipt is never split.
 */

import { monthYearLabel, namedMonthIndex, type ReportLanguage } from './presentation'
import type { LedgerRow } from './types'

export type RentStatus = 'paid' | 'paid_late' | 'partial' | 'open'

export interface RentReceiptView {
  readonly description: string
  readonly rentalLabel: string
  readonly paymentLabel: string | null
  readonly status: RentStatus
  readonly amount: number
  readonly sourceIds: readonly string[]
  readonly traceSourceId: string
  readonly sortKey: number
  readonly allocationRule: 'oldest-open-month' | 'stated-period' | 'named-month' | null
}

const MONTH_TOKEN = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'
const RANGE_RE = new RegExp(`\\b(${MONTH_TOKEN})\\s*[–-]\\s*(${MONTH_TOKEN})\\s+(\\d{4})`, 'i')

function roundEur(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function sameRent(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.001
}

function monthIndex(token: string): number {
  const name = token.toLowerCase().slice(0, 3)
  return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(name)
}

function yearMonth(date: string): { year: number; month: number } {
  const [year, month] = date.slice(0, 10).split('-').map(Number)
  return { year, month }
}

function keyOf(year: number, month: number): number {
  return year * 12 + (month - 1)
}

function partsOf(key: number): { year: number; month: number } {
  return { year: Math.floor(key / 12), month: (key % 12) + 1 }
}

function isMonthStart(date: string): boolean {
  return Number(date.slice(8, 10)) <= 3
}

function rangeLabel(description: string, language: ReportLanguage): { label: string; startKey: number; endKey: number } | null {
  const match = description.match(RANGE_RE)
  if (!match) return null
  const start = monthIndex(match[1])
  const end = monthIndex(match[2])
  const year = Number(match[3])
  if (start < 0 || end < 0 || !year) return null
  const startLabel = monthYearLabel(year, start, language)
  const endLabel = monthYearLabel(year, end, language)
  return {
    label: `${startLabel.split(' ')[0]}–${endLabel}`,
    startKey: keyOf(year, start + 1),
    endKey: keyOf(year, end + 1),
  }
}

export function allocateRentReceipts(
  rows: readonly LedgerRow[],
  descriptions: ReadonlyMap<string, string>,
  language: ReportLanguage,
  doNotSplit: ReadonlySet<string>,
  ownerMonthsByRowId?: ReadonlyMap<string, readonly { year: number; month: number }[]>,
): RentReceiptView[] {
  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const monthStart = ordered.filter((row) => isMonthStart(row.date) && !rangeLabel(row.description || '', language))
  const counts = new Map<number, number>()
  for (const row of monthStart) {
    const key = roundEur(Math.abs(row.amountEur))
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  // forEach, not for-of: the repo target is ES5, and TypeScript then compiles
  // Map iteration into a length loop that never runs.
  let monthly = 0
  counts.forEach((count, amount) => {
    if (count >= 3 && (monthly === 0 || amount < monthly)) monthly = amount
  })
  const covered = new Set<number>()
  for (const row of monthStart) {
    if (monthly && roundEur(Math.abs(row.amountEur)) === monthly) covered.add(keyOf(yearMonth(row.date).year, yearMonth(row.date).month))
  }
  const views: RentReceiptView[] = []
  for (const row of ordered) {
    const payment = yearMonth(row.date)
    const paymentLabel = monthYearLabel(payment.year, payment.month - 1, language)
    const description = descriptions.get(row.id) || 'שכירות'
    const range = rangeLabel(row.description || '', language)
    if (range) {
      // A stated period is late only when the receipt month is after the period ends.
      // Payment inside the period, including its last month, is not evidence of a missed due date.
      const late = range.endKey < keyOf(payment.year, payment.month)
      views.push({
        description,
        rentalLabel: range.label,
        paymentLabel,
        status: late ? 'paid_late' : 'paid',
        amount: roundEur(Math.abs(row.amountEur)),
        sourceIds: [row.id],
        traceSourceId: row.id,
        sortKey: range.startKey,
        allocationRule: 'stated-period',
      })
      continue
    }
    const named = namedMonthIndex(row.description)
    if (named != null) {
      const namedYear = named > payment.month - 1 ? payment.year - 1 : payment.year
      const rentalLabel = monthYearLabel(namedYear, named, language)
      const late = keyOf(namedYear, named + 1) < keyOf(payment.year, payment.month)
      views.push({
        description,
        rentalLabel,
        paymentLabel: late ? paymentLabel : null,
        status: late ? 'paid_late' : 'paid',
        amount: roundEur(Math.abs(row.amountEur)),
        sourceIds: [row.id],
        traceSourceId: row.id,
        sortKey: keyOf(namedYear, named + 1),
        allocationRule: 'named-month',
      })
      continue
    }
    const amount = roundEur(Math.abs(row.amountEur))
    const assigned = ownerMonthsByRowId?.get(row.id)
    if (assigned && assigned.length > 0) {
      const slice = roundEur(amount / assigned.length)
      const slices = roundEur(slice * assigned.length)
      if (!sameRent(slices, amount)) {
        throw new Error(`BLOCKED_ACCOUNTING: rent receipt ${row.id} of ${amount} does not divide across the approved months.`)
      }
      assigned.forEach((part, index) => {
        const rentalKey = keyOf(part.year, part.month)
        const late = rentalKey < keyOf(payment.year, payment.month)
        views.push({
          description,
          rentalLabel: monthYearLabel(part.year, part.month - 1, language),
          paymentLabel: late ? paymentLabel : null,
          status: late ? 'paid_late' : 'paid',
          amount: slice,
          sourceIds: index === 0 ? [row.id] : [],
          traceSourceId: row.id,
          sortKey: rentalKey,
          allocationRule: 'oldest-open-month',
        })
      })
      continue
    }
    const multiple = monthly > 0 && amount > monthly && Math.abs(amount / monthly - Math.round(amount / monthly)) < 0.001 && !doNotSplit.has(row.id)
    if (multiple && !doNotSplit.has(row.id)) {
      const count = Math.round(amount / monthly)
      let start = Number.POSITIVE_INFINITY
      covered.forEach((key) => {
        if (key < start) start = key
      })
      const open: number[] = []
      for (let key = start; key <= keyOf(payment.year, payment.month); key += 1) {
        if (!covered.has(key)) open.push(key)
      }
      if (open.length < count) {
        throw new Error(`BLOCKED_ACCOUNTING: rent receipt ${row.id} of ${amount} has no proven open months to allocate.`)
      }
      open.slice(0, count).forEach((key, index) => {
        covered.add(key)
        const part = partsOf(key)
        const rentalLabel = monthYearLabel(part.year, part.month - 1, language)
        const late = key < keyOf(payment.year, payment.month)
        views.push({
          description,
          rentalLabel,
          paymentLabel: late ? paymentLabel : null,
          status: late ? 'paid_late' : 'paid',
          amount: monthly,
          sourceIds: index === 0 ? [row.id] : [],
          traceSourceId: row.id,
          sortKey: key,
          allocationRule: 'oldest-open-month',
        })
      })
      continue
    }
    views.push({
      description,
      rentalLabel: paymentLabel,
      paymentLabel: null,
      status: 'paid',
      amount,
      sourceIds: [row.id],
      traceSourceId: row.id,
      sortKey: keyOf(payment.year, payment.month),
      allocationRule: null,
    })
  }
  return views.sort((a, b) => a.sortKey - b.sortKey || a.traceSourceId.localeCompare(b.traceSourceId))
}

export function monthsAfterAllocatedSeries(views: readonly RentReceiptView[], asOf: string): { year: number; month: number }[] {
  if (!views.some((view) => view.allocationRule === 'oldest-open-month')) return []
  const last = views.reduce((max, view) => Math.max(max, view.sortKey), 0)
  const [year, month] = asOf.slice(0, 10).split('-').map(Number)
  const end = keyOf(year, month)
  const open: { year: number; month: number }[] = []
  for (let key = last + 1; key <= end; key += 1) open.push(partsOf(key))
  return open
}
