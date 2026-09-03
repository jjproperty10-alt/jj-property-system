/**
 * Strict M1 proposed-value validation (fail closed — never silently coerce).
 */
import { CATEGORIES, CATEGORY_SUBCATEGORIES, type Category } from '@/types'
import { assertNoUnsupportedApplyFields, isM1EditableField } from './correctionFieldSupport'
import type { M1ProposedEditable } from './buildM1CorrectionPreview'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function validateM1Proposed(
  proposed: Record<string, unknown>,
): { ok: true; value: M1ProposedEditable } | { ok: false; error: string } {
  const gate = assertNoUnsupportedApplyFields(proposed)
  if (!gate.ok) {
    return {
      ok: false,
      error: `Unknown or unsupported proposed fields: ${gate.unsupported.join(', ')}`,
    }
  }

  const value: {
    date?: string
    category?: string
    subcategory?: string | null
    amount_eur?: number
    client_charge?: number | null
    description?: string | null
  } = {}

  if ('date' in proposed) {
    const date = proposed.date
    if (typeof date !== 'string' || !DATE_RE.test(date)) {
      return { ok: false, error: 'Invalid date — expected YYYY-MM-DD' }
    }
    const parsed = new Date(`${date}T00:00:00Z`)
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      return { ok: false, error: 'Invalid calendar date' }
    }
    value.date = date
  }

  if ('category' in proposed) {
    const category = proposed.category
    if (typeof category !== 'string' || !(CATEGORIES as readonly string[]).includes(category)) {
      return {
        ok: false,
        error: `Unsupported category "${String(category)}" — permitted: ${CATEGORIES.join(', ')}`,
      }
    }
    value.category = category
  }

  if ('subcategory' in proposed) {
    const sub = proposed.subcategory
    if (sub !== null && typeof sub !== 'string') {
      return { ok: false, error: 'subcategory must be a string or null' }
    }
    const categoryForSub =
      (value.category as Category | undefined) ??
      (typeof proposed.category === 'string' ? (proposed.category as Category) : undefined)
    if (categoryForSub && sub !== null && sub !== '') {
      const allowed = CATEGORY_SUBCATEGORIES[categoryForSub] ?? []
      if (!allowed.includes(sub)) {
        return {
          ok: false,
          error: `Unsupported subcategory "${sub}" for category "${categoryForSub}"`,
        }
      }
    }
    value.subcategory = sub === '' ? null : (sub as string | null)
  }

  if ('amount_eur' in proposed) {
    const amount = proposed.amount_eur
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      return { ok: false, error: 'amount_eur must be a finite number (Unknown != 0; no silent fallback)' }
    }
    value.amount_eur = amount
  }

  if ('client_charge' in proposed) {
    const charge = proposed.client_charge
    // Preserve null vs 0: null is allowed; 0 is a real number.
    if (charge !== null && (typeof charge !== 'number' || !Number.isFinite(charge))) {
      return {
        ok: false,
        error: 'client_charge must be null or a finite number (null and 0 are distinct)',
      }
    }
    value.client_charge = charge as number | null
  }

  if ('description' in proposed) {
    const description = proposed.description
    if (description !== null && typeof description !== 'string') {
      return { ok: false, error: 'description must be a string or null' }
    }
    value.description = description as string | null
  }

  // When category+subcategory both present, subcategory already checked.
  // When only subcategory present without category in proposed, caller must supply
  // category context separately (validateProposedAgainstCanonical).
  for (const key of Object.keys(proposed)) {
    if (!isM1EditableField(key)) {
      return { ok: false, error: `Unsupported field: ${key}` }
    }
  }

  return { ok: true, value: value as M1ProposedEditable }
}

/**
 * Validate proposed subcategory against the effective category
 * (proposed.category ?? canonical.category).
 */
export function validateSubcategoryAgainstCategory(
  category: string,
  subcategory: string | null | undefined,
): { ok: true } | { ok: false; error: string } {
  if (subcategory == null || subcategory === '') return { ok: true }
  if (!(CATEGORIES as readonly string[]).includes(category)) {
    return { ok: false, error: `Unsupported category "${category}"` }
  }
  const allowed = CATEGORY_SUBCATEGORIES[category as Category] ?? []
  if (!allowed.includes(subcategory)) {
    return {
      ok: false,
      error: `Unsupported subcategory "${subcategory}" for category "${category}"`,
    }
  }
  return { ok: true }
}
