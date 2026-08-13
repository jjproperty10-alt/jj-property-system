'use server'

/**
 * ownerLtrStatementActions — Server Actions for Owner LTR Statement.
 *
 * P8 LTR Operations — Owner LTR Statement Integration
 *
 * Security boundary:
 *   Browser → Server Action → authenticateStatementUser() → fetchOwnerLtrStatement()
 *   → P1–P5 adapters + RC3 engine (all service_role only)
 *
 * This is a READ-ONLY server action. It composes data from existing authorities
 * and returns the unified OwnerLtrStatementDTO. No writes.
 *
 * Architecture:
 *   ownerLtrStatementActions → ownerLtrStatementAdapter → {
 *     P1 (rentPositionAdapter),
 *     P2 (managementFeeAdapter),
 *     P3 (depositAdapter),
 *     P5 (tenantChargeAdapter),
 *     RC3 (fetchRC3Report)
 *   }
 *
 * Constitutional:
 *   P-ARCH-1: NULL = Unknown (no placeholders)
 *   P-ARCH-6: Owner NEVER sees JJ margin, internal payer/payee, partner settlement,
 *             deposit custodian
 *   P-LEDGER-6: owner-facing amounts = COALESCE(client_charge, amount_eur)
 *   Spec Section 13.2: "The Owner LTR Statement does NOT build a second calculation engine"
 *
 * FORBIDDEN:
 *   - Writing to any table
 *   - Financial calculations beyond balance arithmetic
 *   - Exposing internal JJ data to owner view
 */

import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { isValidUUID } from '@/lib/owners/validation'
import { fetchOwnerLtrStatement } from './ownerLtrStatementAdapter'
import type { OwnerLtrStatementDTO } from './ownerWorkspaceTypes'

// ─── Constants ────────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// ─── Fetch Owner LTR Statement ───────────────────────────────────────────────

export interface FetchOwnerLtrStatementInput {
  propertyId: string
  propertyName: string
  ownerName: string
  rentalContractId: string
  periodStart: string
  periodEnd: string
}

export async function fetchOwnerLtrStatementAction(
  input: FetchOwnerLtrStatementInput,
): Promise<
  | { ok: true; statement: OwnerLtrStatementDTO }
  | { ok: false; error: string }
> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  // ── Validate ──────────────────────────────────────────────────────────────

  if (!input.propertyId || !isValidUUID(input.propertyId)) {
    return { ok: false, error: 'Invalid property ID' }
  }
  if (!input.rentalContractId || !isValidUUID(input.rentalContractId)) {
    return { ok: false, error: 'Invalid rental contract ID' }
  }
  if (!input.propertyName || input.propertyName.trim().length === 0) {
    return { ok: false, error: 'Property name is required' }
  }
  if (!input.ownerName || input.ownerName.trim().length === 0) {
    return { ok: false, error: 'Owner name is required' }
  }
  if (!input.periodStart || !ISO_DATE_RE.test(input.periodStart)) {
    return { ok: false, error: 'Period start is required (YYYY-MM-DD)' }
  }
  if (!input.periodEnd || !ISO_DATE_RE.test(input.periodEnd)) {
    return { ok: false, error: 'Period end is required (YYYY-MM-DD)' }
  }
  if (input.periodStart > input.periodEnd) {
    return { ok: false, error: 'Period start must be before period end' }
  }

  // ── Fetch statement ───────────────────────────────────────────────────────

  try {
    const statement = await fetchOwnerLtrStatement({
      propertyId: input.propertyId,
      propertyName: input.propertyName.trim(),
      ownerName: input.ownerName.trim(),
      rentalContractId: input.rentalContractId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    })

    return { ok: true, statement }
  } catch (err) {
    console.error('[ownerLtrStatementActions] fetchOwnerLtrStatementAction failed:', err)
    return { ok: false, error: 'Failed to generate statement. Please try again.' }
  }
}
