/**
 * Deterministic Cyprus-local date parsing for assistant intake.
 * Day-first numeric dates. Never maps an invalid explicit date to today.
 */

import { OPS_TIMEZONE } from '@/lib/ops/types'

export type CyprusDateResult =
  | { readonly ok: true; readonly iso: string }
  | { readonly ok: false; readonly reason: 'none' }
  | { readonly ok: false; readonly reason: 'invalid'; readonly raw: string }
  | { readonly ok: false; readonly reason: 'ambiguous'; readonly prompt: string }

const HE_MONTHS: readonly { readonly re: RegExp; readonly month: number }[] = [
  { re: /ינואר|january/i, month: 1 },
  { re: /פברואר|february/i, month: 2 },
  { re: /מרץ|march/i, month: 3 },
  { re: /אפריל|april/i, month: 4 },
  { re: /מאי|may/i, month: 5 },
  { re: /יוני|june/i, month: 6 },
  { re: /יולי|july/i, month: 7 },
  { re: /אוגוסט|august/i, month: 8 },
  { re: /ספטמבר|september/i, month: 9 },
  { re: /אוקטובר|october/i, month: 10 },
  { re: /נובמבר|november/i, month: 11 },
  { re: /דצמבר|december/i, month: 12 },
]

export function nicosiaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: OPS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function nicosiaParts(now: Date = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: OPS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  return {
    year: Number(parts.filter((p) => p.type === 'year')[0]?.value),
    month: Number(parts.filter((p) => p.type === 'month')[0]?.value),
    day: Number(parts.filter((p) => p.type === 'day')[0]?.value),
  }
}

export function nicosiaShift(days: number, now: Date = new Date()): string {
  const parts = nicosiaParts(now)
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day + days)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(utc))
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function toIso(year: number, month: number, day: number): string | null {
  if (!isRealCalendarDate(year, month, day)) return null
  return `${year}-${pad2(month)}-${pad2(day)}`
}

export function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const utc = new Date(Date.UTC(year, month - 1, day))
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day
}

export function expandYear(yearRaw: number): number {
  if (yearRaw >= 100) return yearRaw
  if (yearRaw >= 0 && yearRaw <= 79) return 2000 + yearRaw
  return 1900 + yearRaw
}

export function formatReviewDate(iso: string | undefined): string {
  return formatHebrewReviewDate(iso)
}

function formatDdMmYyyy(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso
  return `${m[3]}/${m[2]}/${m[1]}`
}

export function formatHebrewReviewDate(iso: string | undefined): string {
  if (!iso) return '—'
  return formatDdMmYyyy(iso)
}

const NUMERIC_DATE_RE =
  /(?:בתאריך|ב-?|ב\s+)?(?:ה-?)?(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/g
const ISO_DATE_RE = /(20\d{2}|19\d{2})-(\d{2})-(\d{2})/g

export function stripDateSpans(text: string): string {
  return text
    .replace(ISO_DATE_RE, ' ')
    .replace(NUMERIC_DATE_RE, ' ')
}

export function hasExplicitNumericDate(text: string): boolean {
  if (/(20\d{2}|19\d{2})-\d{2}-\d{2}/.test(text)) return true
  return /(?:בתאריך|ב-?|ב\s+)?(?:ה-?)?\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?/.test(text)
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function parseCyprusDate(text: string, now: Date = new Date()): CyprusDateResult {
  const raw = text.trim()
  if (!raw) return { ok: false, reason: 'none' }
  const normalized = raw.replace(/[־–—]/g, '-').replace(/ה-/g, 'ה-')

  const isoMatch = normalized.match(/(20\d{2}|19\d{2})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const year = Number(isoMatch[1])
    const month = Number(isoMatch[2])
    const day = Number(isoMatch[3])
    const iso = toIso(year, month, day)
    if (!iso) return { ok: false, reason: 'invalid', raw: isoMatch[0] }
    return { ok: true, iso }
  }

  const numeric = normalized.match(
    /(?:בתאריך|ב-?|ב\s+)?\s*(?:ה-?)?(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/,
  )
  if (numeric) {
    const day = Number(numeric[1])
    const month = Number(numeric[2])
    const yearToken = numeric[3]
    const year = yearToken ? expandYear(Number(yearToken)) : nicosiaParts(now).year
    const iso = toIso(year, month, day)
    if (!iso) return { ok: false, reason: 'invalid', raw: numeric[0] }
    return { ok: true, iso }
  }

  const endMonth = normalized.match(/ב?סוף\s+(\S+)/)
  if (endMonth) {
    const monthHit = monthFromName(endMonth[1])
    if (monthHit == null) {
      return { ok: false, reason: 'ambiguous', prompt: 'לאיזה תאריך התכוונת בסוף החודש?' }
    }
    const year = nicosiaParts(now).year
    const day = lastDayOfMonth(year, monthHit)
    const iso = toIso(year, monthHit, day)
    if (!iso) return { ok: false, reason: 'invalid', raw: endMonth[0] }
    return { ok: true, iso }
  }

  const firstOf = normalized.match(/בראשון\s+ל(\S+)/)
  if (firstOf) {
    const monthHit = monthFromName(firstOf[1])
    if (monthHit == null) {
      return { ok: false, reason: 'ambiguous', prompt: 'לאיזה חודש התכוונת בראשון?' }
    }
    const iso = toIso(nicosiaParts(now).year, monthHit, 1)
    if (!iso) return { ok: false, reason: 'invalid', raw: firstOf[0] }
    return { ok: true, iso }
  }

  if (/היום|\btoday\b/i.test(normalized)) return { ok: true, iso: nicosiaToday(now) }
  if (/אתמול|\byesterday\b/i.test(normalized)) return { ok: true, iso: nicosiaShift(-1, now) }
  if (/שלשום/i.test(normalized)) return { ok: true, iso: nicosiaShift(-2, now) }
  if (/מחר|\btomorrow\b/i.test(normalized)) return { ok: true, iso: nicosiaShift(1, now) }

  return { ok: false, reason: 'none' }
}

function monthFromName(token: string): number | null {
  const t = token.replace(/[.,]/g, '')
  for (let i = 0; i < HE_MONTHS.length; i += 1) {
    if (HE_MONTHS[i].re.test(t)) return HE_MONTHS[i].month
  }
  return null
}

export function extractDate(text: string, now: Date = new Date()): string | null {
  const parsed = parseCyprusDate(text, now)
  return parsed.ok ? parsed.iso : null
}
