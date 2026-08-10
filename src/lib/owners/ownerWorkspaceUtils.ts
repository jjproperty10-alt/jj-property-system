/**
 * Owner Workspace — Pure Utilities
 * PR #3: JJ Workspace Navigation + Owner Workspace Design System
 *
 * Pure functions with no server-side dependencies, no database access,
 * and no side effects. Safe to import in both server and client contexts,
 * and in Jest tests.
 *
 * server-only boundary: NONE — intentionally client-safe.
 */

import type { OwnerIdentityDTO } from './ownerWorkspaceTypes'

// ─────────────────────────────────────────────────────────────
// Slug
// ─────────────────────────────────────────────────────────────

/**
 * Derive a URL-safe slug from an owner display name.
 *
 * Examples:
 *   "Avi Cohen"   → "avi-cohen"
 *   "Liron & Alon"→ "liron-alon"
 *   "אבי"         → (Hebrew chars preserved for slug)
 */
export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9א-ת\s-]/g, '')  // keep ASCII, Hebrew, spaces, hyphens
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// ─────────────────────────────────────────────────────────────
// Avatar
// ─────────────────────────────────────────────────────────────

/**
 * Avatar colors from the P0 design prototype — one per known owner group.
 * Keyed by leading slug prefix for quick lookup.
 */
const AVATAR_COLORS: Record<string, string> = {
  avi:    '#3b82f6',
  tamir:  '#8b5cf6',
  liron:  '#0ea5e9',
  oshrit: '#f59e0b',
  oren:   '#10b981',
  uriel:  '#ec4899',
  neer:   '#6366f1',
  efi:    '#14b8a6',
}

export function ownerAvatarColor(slug: string): string {
  const key = Object.keys(AVATAR_COLORS).find(k => slug.startsWith(k))
  return key ? AVATAR_COLORS[key] : '#64748b'
}

export function ownerInitials(name: string): string {
  return name
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}

// ─────────────────────────────────────────────────────────────
// Language / flag detection
// ─────────────────────────────────────────────────────────────

export function detectOwnerLanguage(name: string): 'he' | 'en' | 'ru' {
  if (/[א-ת]/.test(name)) return 'he'
  if (/[Ѐ-ӿ]/.test(name)) return 'ru'
  return 'en'
}

export function detectOwnerFlag(name: string): string {
  if (/[א-ת]/.test(name)) return '🇮🇱'
  if (/[Ѐ-ӿ]/.test(name)) return '🇺🇦'
  return '🌍'
}

// ─────────────────────────────────────────────────────────────
// Country → flag mapping
// ─────────────────────────────────────────────────────────────

const COUNTRY_FLAG_MAP: Record<string, string> = {
  CY: '🇨🇾', IL: '🇮🇱', UA: '🇺🇦', RU: '🇷🇺', GR: '🇬🇷',
  GB: '🇬🇧', US: '🇺🇸', DE: '🇩🇪', FR: '🇫🇷',
}

/**
 * Map an ISO 3166-1 alpha-2 country code to its flag emoji.
 * Returns null for unknown or null/undefined input. Caller decides fallback.
 */
export function countryToFlag(country: string | null | undefined): string | null {
  if (!country) return null
  return COUNTRY_FLAG_MAP[country.toUpperCase()] ?? null
}

// ─────────────────────────────────────────────────────────────
// Identity builder
// ─────────────────────────────────────────────────────────────

/**
 * Build an OwnerIdentityDTO from a name string and property list.
 *
 * Language/country precedence (P1 Identity Service Foundation):
 *   - canonicalLanguage (from lifecycle.entity_identity.preferred_language)
 *     overrides the heuristic when present.
 *   - canonicalCountry (from lifecycle.entity_identity.country)
 *     overrides the heuristic flag when present and mappable.
 *   - Heuristic (detectOwnerLanguage / detectOwnerFlag) is a display
 *     fallback only — never written to DB, never treated as canonical.
 *
 * Fixture boundary: `since` is always null until lifecycle.partner_entry
 * is wired — that is explicit P-ARCH-1 compliance (null, not 0).
 */
export function buildOwnerIdentity(
  id: string,
  name: string,
  properties: string[],
  /** Canonical preferred language from entity_identity. Overrides heuristic when present. */
  canonicalLanguage?: 'he' | 'en' | 'ru' | null,
  /** Canonical country code (ISO 3166-1 alpha-2) from entity_identity. Overrides flag heuristic when present. */
  canonicalCountry?: string | null,
): OwnerIdentityDTO {
  const slug = nameToSlug(name)
  // Canonical DB value takes precedence; heuristic is display fallback only
  const resolvedLanguage: 'he' | 'en' | 'ru' = canonicalLanguage ?? detectOwnerLanguage(name)
  // Country → flag: canonical country takes absolute precedence over name heuristic
  // If canonical country is present (non-null), it takes absolute precedence:
  // mapped → country flag, unmapped → neutral flag. Heuristic only when country is null/undefined.
  const resolvedFlag = canonicalCountry != null
    ? (countryToFlag(canonicalCountry) ?? '🏳️')
    : detectOwnerFlag(name)
  return {
    id,
    slug,
    name,
    preferredLanguage: resolvedLanguage,
    flag: resolvedFlag,
    initials: ownerInitials(name),
    avatarColor: ownerAvatarColor(slug),
    since: null,  // P-ARCH-1: null until lifecycle.partner_entry is wired
    primaryProperty: properties[0] ?? null,
    properties,
  }
}

// ─────────────────────────────────────────────────────────────
// Actor classification
// ─────────────────────────────────────────────────────────────

/**
 * System actors that are not owner identities.
 * These payer/payee values must not be treated as owner slugs.
 *
 * Partner Capital Rule: Yossi and Jacob are NOT system actors —
 * they appear as payer/payee in partner capital transactions.
 * This list deliberately excludes them.
 */
export const SYSTEM_ACTORS = new Set([
  'JJ',
  'Airbnb',
  'Anastasia',
  'Tenant',
  'Client',
  'Owner',
])

export function isSystemActor(name: string): boolean {
  return SYSTEM_ACTORS.has(name)
}
