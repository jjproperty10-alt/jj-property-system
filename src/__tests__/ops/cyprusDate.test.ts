import {
  extractDate,
  formatHebrewReviewDate,
  nicosiaShift,
  nicosiaToday,
  parseCyprusDate,
} from '@/lib/ops/assistant/cyprusDate'

const NOW = new Date('2026-09-17T10:00:00+03:00')

describe('Cyprus-local date parser', () => {
  it('parses day-first numeric forms to 2026-08-31', () => {
    expect(parseCyprusDate('31.8.26', NOW)).toEqual({ ok: true, iso: '2026-08-31' })
    expect(parseCyprusDate('31.08.26', NOW)).toEqual({ ok: true, iso: '2026-08-31' })
    expect(parseCyprusDate('31/8/26', NOW)).toEqual({ ok: true, iso: '2026-08-31' })
    expect(parseCyprusDate('31/08/2026', NOW)).toEqual({ ok: true, iso: '2026-08-31' })
    expect(parseCyprusDate('31-8-2026', NOW)).toEqual({ ok: true, iso: '2026-08-31' })
    expect(parseCyprusDate('31-8-26', NOW)).toEqual({ ok: true, iso: '2026-08-31' })
    expect(parseCyprusDate('2026-08-31', NOW)).toEqual({ ok: true, iso: '2026-08-31' })
  })

  it('extracts בתאריך and speech prefixes', () => {
    expect(extractDate('שולם שכירות לירון אלון 700 בתאריך 31.8.26', NOW)).toBe('2026-08-31')
    expect(extractDate('ב־31.8.26', NOW)).toBe('2026-08-31')
    expect(extractDate('ב 31.8.26', NOW)).toBe('2026-08-31')
    expect(extractDate('בתאריך ה־31.8', NOW)).toBe('2026-08-31')
    expect(extractDate('בסוף אוגוסט', NOW)).toBe('2026-08-31')
    expect(extractDate('בראשון לספטמבר', NOW)).toBe('2026-09-01')
  })

  it('rejects impossible dates and does not fall back to today', () => {
    const invalid = parseCyprusDate('31.2.26', NOW)
    expect(invalid).toEqual({ ok: false, reason: 'invalid', raw: '31.2.26' })
    expect(extractDate('בתאריך 31.2.26', NOW)).toBeNull()
    expect(nicosiaToday(NOW)).toBe('2026-09-17')
  })

  it('maps היום/אתמול/שלשום/מחר in Europe/Nicosia', () => {
    expect(extractDate('היום', NOW)).toBe('2026-09-17')
    expect(extractDate('אתמול', NOW)).toBe('2026-09-16')
    expect(extractDate('שלשום', NOW)).toBe('2026-09-15')
    expect(extractDate('מחר', NOW)).toBe('2026-09-18')
    expect(nicosiaShift(-1, NOW)).toBe('2026-09-16')
    expect(nicosiaToday(new Date('2026-09-17T00:30:00+03:00'))).toBe('2026-09-17')
  })

  it('formats review dates as DD/MM/YYYY', () => {
    expect(formatHebrewReviewDate('2026-08-31')).toBe('31/08/2026')
  })
})
