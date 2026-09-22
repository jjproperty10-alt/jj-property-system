'use server'

/**
 * Staff-only Owner Statement preview/ingest actions.
 * Preview never writes. Ingest uses the request JWT only.
 */

import 'server-only'

import { revalidatePath } from 'next/cache'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { VM1_OPERATIONS_ROUTE } from '@/lib/partnership-workspace/vm1OperationsRoutes'
import {
  isVm1OsUploadStaffRole,
  VM1_OS_INGEST_CONFLICT_LABEL,
  VM1_OS_INGEST_RPC,
  VM1_OS_SOURCE_ASSERTION,
  VM1_OS_UPLOAD_REASON,
  type Vm1OwnerStatementUploadPreview,
} from '@/lib/partnership-workspace/vm1OwnerStatementUploadContract'
import { parseVm1OwnerStatementXlsx } from '@/lib/partnership-workspace/vm1OwnerStatementUploadService'

export type Vm1OwnerStatementPreviewActionResult =
  | { readonly ok: true; readonly preview: Vm1OwnerStatementUploadPreview }
  | { readonly ok: false; readonly reason: string }

export type Vm1OwnerStatementIngestActionResult =
  | { readonly ok: true; readonly kind: 'success' | 'idempotent' }
  | { readonly ok: false; readonly reason: string }

const CONFLICT_REASONS = new Set(Object.keys(VM1_OS_INGEST_CONFLICT_LABEL))

function staffGate(
  auth: Awaited<ReturnType<typeof authenticateStatementUser>>,
): { ok: true } | { ok: false; reason: string } {
  if (!auth.ok) {
    return {
      ok: false,
      reason: auth.error === 'NO_SESSION' ? VM1_OS_UPLOAD_REASON.unauthenticated : VM1_OS_UPLOAD_REASON.notStaff,
    }
  }
  if (!isVm1OsUploadStaffRole(auth.staffRole)) {
    return { ok: false, reason: VM1_OS_UPLOAD_REASON.notStaff }
  }
  return { ok: true }
}

async function readUploadBytes(
  formData: FormData,
): Promise<{ ok: true; bytes: Buffer } | { ok: false; reason: string }> {
  const file = formData.get('file')
  if (file == null || typeof file === 'string') {
    return { ok: false, reason: VM1_OS_UPLOAD_REASON.missingFile }
  }
  const blob = file as Blob
  if (typeof blob.arrayBuffer !== 'function') {
    return { ok: false, reason: VM1_OS_UPLOAD_REASON.missingFile }
  }
  const named = file as { name?: unknown }
  if (typeof named.name === 'string' && named.name !== '' && !named.name.toLowerCase().endsWith('.xlsx')) {
    return { ok: false, reason: VM1_OS_UPLOAD_REASON.malformedXlsx }
  }
  const bytes = Buffer.from(await blob.arrayBuffer())
  return { ok: true, bytes }
}

function previewWithoutSecrets(
  preview: Vm1OwnerStatementUploadPreview,
): Vm1OwnerStatementUploadPreview {
  return {
    listingId: preview.listingId,
    statementFrom: preview.statementFrom,
    statementTo: preview.statementTo,
    lineCount: preview.lineCount,
    netOwnerPayoutTotalEur: preview.netOwnerPayoutTotalEur,
    lines: preview.lines.map((line) => ({
      reservation_id: line.reservation_id,
      check_in: line.check_in,
      check_out: line.check_out,
      reservation_status: line.reservation_status,
      gross_rental_revenue: line.gross_rental_revenue,
      platform_fee: line.platform_fee,
      guest_cleaning: line.guest_cleaning,
      total_taxes: line.total_taxes,
      management_charge: line.management_charge,
      net_owner_payout: line.net_owner_payout,
      currency: line.currency,
      source_row_reference: line.source_row_reference,
      reconciliation_status: line.reconciliation_status,
    })),
  }
}

function mapIngestPayload(data: unknown): Vm1OwnerStatementIngestActionResult {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, reason: VM1_OS_UPLOAD_REASON.ingestUnavailable }
  }
  const row = data as Record<string, unknown>
  if (row.ok === true) {
    return { ok: true, kind: row.idempotent === true ? 'idempotent' : 'success' }
  }
  if (typeof row.reason === 'string' && CONFLICT_REASONS.has(row.reason)) {
    return { ok: false, reason: VM1_OS_INGEST_CONFLICT_LABEL[row.reason] }
  }
  return { ok: false, reason: VM1_OS_UPLOAD_REASON.ingestUnavailable }
}

export async function previewOwnerStatementUpload(
  formData: FormData,
): Promise<Vm1OwnerStatementPreviewActionResult> {
  const gate = staffGate(await authenticateStatementUser())
  if (!gate.ok) return gate
  const uploaded = await readUploadBytes(formData)
  if (!uploaded.ok) return uploaded
  const parsed = parseVm1OwnerStatementXlsx(uploaded.bytes)
  if (!parsed.ok) return parsed
  return { ok: true, preview: previewWithoutSecrets(parsed.preview) }
}

export async function ingestOwnerStatementUpload(
  formData: FormData,
): Promise<Vm1OwnerStatementIngestActionResult> {
  const gate = staffGate(await authenticateStatementUser())
  if (!gate.ok) return gate
  const confirmation = String(formData.get('confirmation') ?? '').trim()
  if (confirmation !== VM1_OS_SOURCE_ASSERTION) {
    return { ok: false, reason: VM1_OS_UPLOAD_REASON.confirmationRequired }
  }
  const uploaded = await readUploadBytes(formData)
  if (!uploaded.ok) return uploaded
  const parsed = parseVm1OwnerStatementXlsx(uploaded.bytes)
  if (!parsed.ok) return { ok: false, reason: parsed.reason }
  const { data, error } = await createSupabaseServerClient().rpc(VM1_OS_INGEST_RPC, {
    p_payload: parsed.payload,
  })
  if (error) return { ok: false, reason: VM1_OS_UPLOAD_REASON.ingestUnavailable }
  const mapped = mapIngestPayload(data)
  if (mapped.ok) revalidatePath(VM1_OPERATIONS_ROUTE)
  return mapped
}
