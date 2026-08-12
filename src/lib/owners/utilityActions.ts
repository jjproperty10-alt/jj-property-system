'use server'

/**
 * utilityActions — Server Actions for Utility Meter reading recording.
 *
 * P4 LTR Operations — Utilities / Sub-Meters
 *
 * Security boundary:
 *   Browser → Server Action → authenticateStatementUser() → createServiceClient()
 *   → SECURITY DEFINER RPC (service_role only, require_jj_staff() inside)
 *
 * Constitutional:
 *   - P-ARCH-1: NULL = Unknown (no placeholders)
 *   - P-ARCH-5: lifecycle schema isolation
 *   - Three-event separation: Provider Expense / Tenant Charge / Tenant Payment
 *   - Atomic RPC: one call → reading + obligation + schedule update
 *
 * FORBIDDEN:
 *   - Writing to public.transactions
 *   - Bypassing rate resolution
 *   - Creating obligations without rate + consumption + contract
 *   - Manual schedule manipulation
 */

import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createServiceClient } from '@/lib/supabase'
import { isValidUUID } from '@/lib/owners/validation'
import type { RecordMeterReadingResultDTO } from './ownerWorkspaceTypes'

// ─── Constants ────────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// ─── Record Meter Reading ─────────────────────────────────────────────────────

export interface RecordMeterReadingInput {
  meterId: string
  readingDate: string
  readingValue: number
  recordedBy?: string | null
  photoEvidence?: string | null
}

export async function recordMeterReadingAction(
  input: RecordMeterReadingInput,
): Promise<
  | { ok: true; result: RecordMeterReadingResultDTO }
  | { ok: false; error: string }
> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }

  // ── Validate required fields ───────────────────────────────────────────────

  if (!input.meterId || !isValidUUID(input.meterId)) {
    return { ok: false, error: 'Invalid meter ID' }
  }
  if (!input.readingDate || !ISO_DATE_RE.test(input.readingDate)) {
    return { ok: false, error: 'Reading date is required (YYYY-MM-DD)' }
  }
  if (input.readingValue == null || input.readingValue < 0) {
    return { ok: false, error: 'Reading value must be non-negative' }
  }

  // ── RPC call ───────────────────────────────────────────────────────────────

  const db = createServiceClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('lifecycle')
      .rpc('record_meter_reading', {
        p_meter_id: input.meterId,
        p_reading_date: input.readingDate,
        p_reading_value: input.readingValue,
        p_recorded_by: input.recordedBy ?? null,
        p_photo_evidence: input.photoEvidence ?? null,
      })

    if (error) {
      console.error('[utilityActions] recordMeterReading RPC error:', error)
      return { ok: false, error: error.message ?? 'Database error' }
    }

    const raw = data as Record<string, unknown>

    const result: RecordMeterReadingResultDTO = {
      readingId: String(raw.reading_id),
      consumption: raw.consumption != null ? Number(raw.consumption) : null,
      obligationCreated: Boolean(raw.obligation_created),
      obligationId: raw.obligation_id != null ? String(raw.obligation_id) : null,
      needsReview: Boolean(raw.needs_review),
      reason: raw.reason != null ? String(raw.reason) : null,
      nextReadingDue: String(raw.next_reading_due),
    }

    return { ok: true, result }
  } catch (err) {
    console.error('[utilityActions] recordMeterReading unexpected error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}
