/**
 * JJ Property 10 - Canonical report-language resolution (G4)
 *
 * Single source of truth for "which language does this render use, and which way
 * does it read". Workspace, Preview, PDF and Print MUST all resolve language
 * through `resolveReportLanguage` so the four surfaces never disagree.
 *
 * Precedence (highest first):
 *   1. override      - an explicit per-view choice (the EN | HE toggle, or the
 *                      ?lang= query param). Wins when present and valid.
 *   2. storedDefault - the persisted owner preference
 *                      (ReportPresentationConfigDTO.language).
 *   3. FALLBACK      - 'en'.
 *
 * Presentation only. This never writes to the DB and never changes financial
 * truth; it only decides label language and layout direction. `Lang` here is the
 * same 'en' | 'he' union as ReportLanguage in ownerWorkspaceTypes.
 */
import type { Lang } from './labels'

export type { Lang }

/** All supported languages, in display order. */
export const LANGS: readonly Lang[] = ['en', 'he'] as const

/** Layout direction for a language. */
export type LangDir = 'ltr' | 'rtl'

/** The system fallback when neither an override nor a stored default applies. */
export const FALLBACK_LANG: Lang = 'en'

/** Native name of each language, as shown in the visible toggle. */
export const LANGUAGE_NATIVE_LABEL: Record<Lang, string> = {
  en: 'English',
  he: 'עברית',
}

/** Type guard: is the value one of the supported languages? */
export function isReportLanguage(value: unknown): value is Lang {
  return value === 'en' || value === 'he'
}

/**
 * Parse a raw override value (e.g. a `?lang=` query param or toggle value) into a
 * Lang, or null when absent/invalid. Never throws.
 */
export function parseLangParam(raw: unknown): Lang | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim().toLowerCase()
  return isReportLanguage(v) ? v : null
}

/** True when the language reads right-to-left. */
export function isRtl(lang: Lang): boolean {
  return lang === 'he'
}

/** Layout direction for a language ('rtl' for Hebrew, else 'ltr'). */
export function langDir(lang: Lang): LangDir {
  return isRtl(lang) ? 'rtl' : 'ltr'
}

/** The other language - used to label the toggle's target ("switch to ..."). */
export function otherLanguage(lang: Lang): Lang {
  return lang === 'en' ? 'he' : 'en'
}

export interface ResolveLanguageInput {
  /** Explicit per-view choice (toggle / query param). May be any raw value. */
  override?: unknown
  /** Persisted owner default (ReportPresentationConfigDTO.language). */
  storedDefault?: unknown
}

/**
 * Resolve the effective render language by precedence: override > storedDefault >
 * FALLBACK. Invalid values at any level are ignored (not coerced), so a garbage
 * override falls through to the stored default rather than forcing a language.
 */
export function resolveReportLanguage(input: ResolveLanguageInput = {}): Lang {
  const ov = parseLangParam(input.override)
  if (ov) return ov
  if (isReportLanguage(input.storedDefault)) return input.storedDefault
  return FALLBACK_LANG
}

/**
 * Convenience: resolve language AND its layout direction together, so callers
 * wire a single object into their surface. `isRtl` matches
 * ReportPresentationConfigDTO.isRtl (kept explicit for rendering).
 */
export function resolveLanguagePresentation(input: ResolveLanguageInput = {}): {
  lang: Lang
  dir: LangDir
  isRtl: boolean
} {
  const lang = resolveReportLanguage(input)
  return { lang, dir: langDir(lang), isRtl: isRtl(lang) }
}
