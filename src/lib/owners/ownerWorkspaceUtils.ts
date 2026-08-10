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

import type { OwnerIdentityDTO, ConfigHealthDTO, ConfigHealthState } from './ownerWorkspaceTypes'
import type { CanonicalEntityIdentityDTO, ManagementRelationshipDTO } from '../identity/identityTypes'

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
 * Returns null for unknown or null input — caller falls back to heuristic.
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
  // Country → flag: canonical country overrides name-based heuristic
  const resolvedFlag = countryToFlag(canonicalCountry) ?? detectOwnerFlag(name)
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

// ─────────────────────────────────────────────────────────────
// Associated Properties — deduplicated count (Blueprint 9.5a)
// ─────────────────────────────────────────────────────────────

/**
 * Deduplicate properties by property_name (Phase A transition —
 * property_id UUID doesn't exist yet on transactions).
 *
 * PR #3 source: managedProperties[] only.
 * This is association visibility, NOT ownership truth.
 */
export function deduplicatePropertyNames(
  managedProperties: readonly ManagementRelationshipDTO[],
): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const rel of managedProperties) {
    const key = rel.propertyName.toLowerCase().trim()
    if (!seen.has(key)) {
      seen.add(key)
      result.push(rel.propertyName)
    }
  }
  return result
}

// ─────────────────────────────────────────────────────────────
// Configuration Health (Blueprint 9.5)
// ─────────────────────────────────────────────────────────────

/**
 * Compute Configuration Health from currently available evidence.
 *
 * Yossi-approved PR #3 rules:
 * 1. pending_verification present → Pending Verification
 * 2. missing canonical name, both contacts missing, or no active association → Incomplete
 * 3. universal checks pass but full P0 relationship-aware completeness
 *    cannot currently be proven → Needs Review
 * 4. Complete only if all applicable P0 requirements can be proven
 *    from authoritative sources
 *
 * Currently provable: identity fields + active managed relationships.
 * NOT provable yet: Service Engagement, Commercial Terms, Reporting Config.
 * Therefore: Managed Clients can reach at most Needs Review until P2+ tables exist.
 *
 * Never infer missing configuration. No DB writes.
 */
export function computeConfigHealth(
  identity: CanonicalEntityIdentityDTO,
  managedProperties: readonly ManagementRelationshipDTO[],
): ConfigHealthDTO {
  const missing: string[] = []

  // ── Universal requirements ──

  const hasName = !!identity.displayName?.trim()
  if (!hasName) missing.push('name')

  const hasEmail = !!identity.contactEmail?.trim()
  const hasPhone = !!identity.contactPhone?.trim()
  if (!hasEmail && !hasPhone) missing.push('contact')

  const activeRelationships = managedProperties.filter(
    r => !r.validTo // no end date = currently active
  )
  const hasActiveAssociation = activeRelationships.length > 0
  if (!hasActiveAssociation) missing.push('active relationship')

  // ── If universal requirements are missing → Incomplete ──
  if (missing.length > 0) {
    return {
      state: 'incomplete',
      missingCount: missing.length,
      label: `${missing.length} item${missing.length > 1 ? 's' : ''} missing`,
    }
  }

  // ── Check for pending_verification ──
  const hasPendingVerification = activeRelationships.some(
    r => r.verificationStatus === 'pending_verification'
  )
  if (hasPendingVerification) {
    return {
      state: 'pending_verification',
      missingCount: 0,
      label: 'Pending verification',
    }
  }

  // ── Universal checks pass. Can we prove full P0 completeness? ──
  // PR #3 scope: Service Engagement, Commercial Terms, Reporting Config
  // tables do not exist yet. We cannot prove relationship-aware completeness
  // for Managed Clients. Conservative: Needs Review.
  // Complete would require all applicable P0 requirements provable.
  // Since we only have identity + relationships, no owner can reach Complete yet.
  return {
    state: 'needs_review',
    missingCount: 0,
    label: 'Needs review',
  }
}
