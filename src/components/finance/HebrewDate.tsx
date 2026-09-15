/**
 * Deterministic Hebrew date rendering for the Avi partner report.
 *
 * Root cause of wrong order (“14 2026 בספטמבר” / “2026 בספטמבר 14”):
 * wrapping a single Intl.DateTimeFormat('he-IL') string in dir="ltr" lets the
 * browser reorder day / Hebrew-month / year. Do NOT:
 *   - reverse() the string
 *   - reverse characters (bidi-override on Hebrew text)
 *   - wrap the whole mixed date in one LTR node
 *
 * Fix: RTL sentence/date container; day and year are separate LTR isolates;
 * Hebrew month is a plain RTL segment. DOM order is always day → month → year.
 */
import type { ReactNode, CSSProperties } from 'react'

type AviReportLang = 'en' | 'he'

/** Months with leading ב־ for use after a day number (“14 בספטמבר 2026”). */
export const HEBREW_MONTH_WITH_BE: readonly string[] = Object.freeze([
  '',
  'בינואר',
  'בפברואר',
  'במרץ',
  'באפריל',
  'במאי',
  'ביוני',
  'ביולי',
  'באוגוסט',
  'בספטמבר',
  'באוקטובר',
  'בנובמבר',
  'בדצמבר',
])

/** Standalone month names for month/year expense lines (“ספטמבר 2026”). */
export const HEBREW_MONTH_STANDALONE: readonly string[] = Object.freeze([
  '',
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
])

export type AviDateParts = {
  readonly year: number
  readonly month: number
  readonly day: number
}

export function parseAviIsoDate(iso: string): AviDateParts | null {
  const parts = iso.split('-')
  if (parts.length < 2) return null
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = parts.length >= 3 ? Number(parts[2]) : 1
  if (!year || !month || month < 1 || month > 12) return null
  if (parts.length >= 3 && (!day || day < 1 || day > 31)) return null
  return { year, month, day: parts.length >= 3 ? day : 0 }
}

/** Plain text “14 בספטמבר 2026” — day + ב־month + year. For tests & EN fallbacks. */
export function formatHebrewFullDateText(iso: string): string {
  const p = parseAviIsoDate(iso)
  if (!p || !p.day) return iso
  return `${p.day} ${HEBREW_MONTH_WITH_BE[p.month]} ${p.year}`
}

/** Plain text “ספטמבר 2026”. */
export function formatHebrewMonthYearText(monthKey: string): string {
  const p = parseAviIsoDate(monthKey.length === 7 ? `${monthKey}-01` : monthKey)
  if (!p) return monthKey
  return `${HEBREW_MONTH_STANDALONE[p.month]} ${p.year}`
}

export function formatHebrewGeneratedSentenceText(iso: string): string {
  return `הופק ב־${formatHebrewFullDateText(iso)}`
}

export function formatHebrewCutoffSentenceText(iso: string): string {
  return `עסקאות בספר עד ${formatHebrewFullDateText(iso)}`
}

/** Incorrect visible sequences that must never appear in Hebrew output. */
export const HEBREW_DATE_FORBIDDEN_SEQUENCES = [
  '14 2026 בספטמבר',
  'באוגוסט 29 2026',
  '16 2024 ביוני',
  '10 2024 באוקטובר',
  '16 2024 בנובמבר',
  '10 2025 ביולי',
  '2026 בספטמבר 14',
  '2026 באוגוסט 29',
  '2024 ביוני 16',
  '2024 באוקטובר 10',
  '2024 בנובמבר 16',
  '2025 ביולי 10',
  // Character-reversed months (bidi-override failure mode)
  'רבמטפסב',
  'טסוגואב',
  'ינויב',
] as const

const numStyle: CSSProperties = {
  unicodeBidi: 'isolate',
  whiteSpace: 'nowrap',
}

const monthStyle: CSSProperties = {
  unicodeBidi: 'isolate',
  whiteSpace: 'nowrap',
}

function SegmentDay({ day }: { day: number }) {
  return (
    <span className="avi-he-date-day" data-avi-he-seg="day" dir="ltr" style={numStyle}>
      {day}
    </span>
  )
}

function SegmentMonth({ label }: { label: string }) {
  return (
    <span className="avi-he-date-month" data-avi-he-seg="month" dir="rtl" style={monthStyle}>
      {label}
    </span>
  )
}

function SegmentYear({ year }: { year: number }) {
  return (
    <span className="avi-he-date-year" data-avi-he-seg="year" dir="ltr" style={numStyle}>
      {year}
    </span>
  )
}

/** Full Hebrew date: day + ב־month + year as separate visual segments. */
export function HebrewFullDate({
  iso,
  className,
}: {
  iso: string
  className?: string
}): ReactNode {
  const p = parseAviIsoDate(iso)
  if (!p || !p.day) return <span className={className}>{iso}</span>
  return (
    <span
      className={['avi-he-date', 'avi-he-date-full', className].filter(Boolean).join(' ')}
      data-avi-he-date="full"
      data-avi-he-date-text={formatHebrewFullDateText(iso)}
      dir="rtl"
    >
      <SegmentDay day={p.day} />
      {'\u00a0'}
      <SegmentMonth label={HEBREW_MONTH_WITH_BE[p.month]!} />
      {'\u00a0'}
      <SegmentYear year={p.year} />
    </span>
  )
}

/** Month + year only (expenses): “ספטמבר 2026”. */
export function HebrewMonthYear({
  month,
  className,
}: {
  month: string
  className?: string
}): ReactNode {
  const key = month.length >= 7 ? month.slice(0, 7) : month
  const p = parseAviIsoDate(`${key}-01`)
  if (!p) return <span className={className}>{month}</span>
  return (
    <span
      className={['avi-he-date', 'avi-he-date-month-year', className].filter(Boolean).join(' ')}
      data-avi-he-date="month-year"
      data-avi-he-date-text={formatHebrewMonthYearText(key)}
      dir="rtl"
    >
      <SegmentMonth label={HEBREW_MONTH_STANDALONE[p.month]!} />
      {'\u00a0'}
      <SegmentYear year={p.year} />
    </span>
  )
}

/** “הופק ב־14 בספטמבר 2026” */
export function HebrewGeneratedSentence({
  iso,
  className,
}: {
  iso: string
  className?: string
}): ReactNode {
  const p = parseAviIsoDate(iso)
  if (!p || !p.day) {
    return <span className={className}>{formatHebrewGeneratedSentenceText(iso)}</span>
  }
  return (
    <span
      className={['avi-he-generated', className].filter(Boolean).join(' ')}
      data-testid="avi-he-generated-date"
      data-avi-he-sentence={formatHebrewGeneratedSentenceText(iso)}
      dir="rtl"
    >
      <span data-avi-he-prefix="generated">הופק ב־</span>
      <SegmentDay day={p.day} />
      {'\u00a0'}
      <SegmentMonth label={HEBREW_MONTH_WITH_BE[p.month]!} />
      {'\u00a0'}
      <SegmentYear year={p.year} />
    </span>
  )
}

/** “עסקאות בספר עד 29 באוגוסט 2026” */
export function HebrewCutoffSentence({
  iso,
  className,
}: {
  iso: string
  className?: string
}): ReactNode {
  const p = parseAviIsoDate(iso)
  if (!p || !p.day) {
    return <span className={className}>{formatHebrewCutoffSentenceText(iso)}</span>
  }
  return (
    <span
      className={['avi-he-cutoff', className].filter(Boolean).join(' ')}
      data-testid="avi-he-cutoff-date"
      data-avi-he-sentence={formatHebrewCutoffSentenceText(iso)}
      dir="rtl"
    >
      <span data-avi-he-prefix="cutoff">עסקאות בספר עד{' '}</span>
      <SegmentDay day={p.day} />
      {'\u00a0'}
      <SegmentMonth label={HEBREW_MONTH_WITH_BE[p.month]!} />
      {'\u00a0'}
      <SegmentYear year={p.year} />
    </span>
  )
}

/** Lang-aware date cell for tables (EN string or HE segmented). */
export function AviReportDate({
  iso,
  lang,
  mode = 'full',
}: {
  iso: string
  lang: AviReportLang
  mode?: 'full' | 'month'
}): ReactNode {
  if (lang === 'he') {
    return mode === 'month' ? <HebrewMonthYear month={iso} /> : <HebrewFullDate iso={iso} />
  }
  if (mode === 'month') {
    const [y, m] = iso.split('-').map(Number)
    if (!y || !m) return iso
    return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(
      new Date(y, m - 1, 1),
    )
  }
  const p = parseAviIsoDate(iso)
  if (!p || !p.day) return iso
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(p.year, p.month - 1, p.day))
}
