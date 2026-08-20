/**
 * G4 - Canonical report-language resolution tests.
 * LOCKED: override > storedDefault > 'en'; invalid values never coerce; RTL for
 * Hebrew; the four surfaces resolve identically because they all call this.
 */
import {
  LANGS,
  FALLBACK_LANG,
  LANGUAGE_NATIVE_LABEL,
  isReportLanguage,
  parseLangParam,
  isRtl,
  langDir,
  otherLanguage,
  resolveReportLanguage,
  resolveLanguagePresentation,
} from '@/lib/report/languageResolution'

describe('G4 - language basics', () => {
  test('LANGS are en, he in display order', () => {
    expect(LANGS).toEqual(['en', 'he'])
  })
  test('fallback is English', () => {
    expect(FALLBACK_LANG).toBe('en')
  })
  test('native labels are the visible EN | HE names', () => {
    expect(LANGUAGE_NATIVE_LABEL.en).toBe('English')
    expect(LANGUAGE_NATIVE_LABEL.he).toBe('עברית')
  })
  test('isReportLanguage guards the union', () => {
    expect(isReportLanguage('en')).toBe(true)
    expect(isReportLanguage('he')).toBe(true)
    expect(isReportLanguage('fr')).toBe(false)
    expect(isReportLanguage(null)).toBe(false)
    expect(isReportLanguage(undefined)).toBe(false)
  })
})

describe('G4 - param parsing (never throws, never coerces)', () => {
  test('valid strings parse, case/space-insensitive', () => {
    expect(parseLangParam('he')).toBe('he')
    expect(parseLangParam('  EN ')).toBe('en')
  })
  test('invalid/absent -> null', () => {
    expect(parseLangParam('spanish')).toBeNull()
    expect(parseLangParam('')).toBeNull()
    expect(parseLangParam(null)).toBeNull()
    expect(parseLangParam(42)).toBeNull()
  })
})

describe('G4 - direction / RTL', () => {
  test('Hebrew is RTL, English is LTR', () => {
    expect(isRtl('he')).toBe(true)
    expect(isRtl('en')).toBe(false)
    expect(langDir('he')).toBe('rtl')
    expect(langDir('en')).toBe('ltr')
  })
  test('otherLanguage flips', () => {
    expect(otherLanguage('en')).toBe('he')
    expect(otherLanguage('he')).toBe('en')
  })
})

describe('G4 - resolution precedence: override > storedDefault > fallback', () => {
  test('override wins when valid', () => {
    expect(resolveReportLanguage({ override: 'he', storedDefault: 'en' })).toBe('he')
    expect(resolveReportLanguage({ override: 'en', storedDefault: 'he' })).toBe('en')
  })
  test('stored default applies when no valid override', () => {
    expect(resolveReportLanguage({ storedDefault: 'he' })).toBe('he')
    expect(resolveReportLanguage({ override: 'nonsense', storedDefault: 'he' })).toBe('he')
  })
  test('fallback to English when neither applies', () => {
    expect(resolveReportLanguage({})).toBe('en')
    expect(resolveReportLanguage({ override: 'xx', storedDefault: 'yy' })).toBe('en')
    expect(resolveReportLanguage()).toBe('en')
  })
  test('invalid override does NOT override a valid stored default (no coercion)', () => {
    expect(resolveReportLanguage({ override: '', storedDefault: 'he' })).toBe('he')
  })
})

describe('G4 - presentation bundle (single wiring for all surfaces)', () => {
  test('resolves lang + dir + isRtl consistently', () => {
    expect(resolveLanguagePresentation({ override: 'he' })).toEqual({ lang: 'he', dir: 'rtl', isRtl: true })
    expect(resolveLanguagePresentation({ storedDefault: 'en' })).toEqual({ lang: 'en', dir: 'ltr', isRtl: false })
    expect(resolveLanguagePresentation()).toEqual({ lang: 'en', dir: 'ltr', isRtl: false })
  })

  test('Workspace/Preview/PDF/Print parity: same inputs -> same language', () => {
    const input = { override: undefined, storedDefault: 'he' }
    const workspace = resolveReportLanguage(input)
    const preview = resolveReportLanguage(input)
    const pdf = resolveReportLanguage(input)
    const print = resolveReportLanguage(input)
    expect(new Set([workspace, preview, pdf, print]).size).toBe(1)
    expect(workspace).toBe('he')
  })
})
