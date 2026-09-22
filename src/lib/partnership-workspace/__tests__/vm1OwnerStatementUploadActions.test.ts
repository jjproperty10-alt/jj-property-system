const mockAuth = jest.fn()
jest.mock('@/lib/statements/statementAuthService', () => ({
  authenticateStatementUser: () => mockAuth(),
}))

const mockRpc = jest.fn()
jest.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: () => ({ rpc: mockRpc }),
}))

const mockRevalidatePath = jest.fn()
jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}))

import { VM1_OS_REQUIRED_COLUMNS, VM1_OS_SOURCE_ASSERTION, VM1_OS_UPLOAD_REASON } from '@/lib/partnership-workspace/vm1OwnerStatementUploadContract'
import { buildMinimalOwnerStatementXlsx } from '@/lib/partnership-workspace/vm1OwnerStatementXlsxParser'
import {
  ingestOwnerStatementUpload,
  previewOwnerStatementUpload,
} from '@/app/(app)/finance/external-partner/avi/operations/ownerStatementUploadActions'

const HEADERS = [...VM1_OS_REQUIRED_COLUMNS]
const VALID_ROW = [
  '65733679',
  '2026-09-03',
  '2026-09-06',
  'confirmed',
  '1000.00',
  '100.00',
  '50.00',
  '0.00',
  '150.00',
  '700.00',
  'EUR',
]

function validBytes(): Buffer {
  return buildMinimalOwnerStatementXlsx(HEADERS, [VALID_ROW])
}

function formFrom(bytes: Buffer, confirmation?: string, name = 'tm20.xlsx'): FormData {
  const formData = new FormData()
  formData.set(
    'file',
    new File([new Uint8Array(bytes)], name, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  )
  if (confirmation != null) formData.set('confirmation', confirmation)
  return formData
}

beforeEach(() => {
  mockAuth.mockReset()
  mockRpc.mockReset()
  mockRevalidatePath.mockReset()
})

describe('Owner Statement upload actions', () => {
  it('denies unauthenticated and non-staff callers before parse or ingest', async () => {
    mockAuth.mockResolvedValue({ ok: false, error: 'NO_SESSION' })
    await expect(previewOwnerStatementUpload(formFrom(validBytes()))).resolves.toEqual({
      ok: false,
      reason: VM1_OS_UPLOAD_REASON.unauthenticated,
    })
    mockAuth.mockResolvedValue({ ok: false, error: 'NOT_STAFF' })
    await expect(ingestOwnerStatementUpload(formFrom(validBytes(), VM1_OS_SOURCE_ASSERTION))).resolves.toEqual({
      ok: false,
      reason: VM1_OS_UPLOAD_REASON.notStaff,
    })
    mockAuth.mockResolvedValue({ ok: true, staffRole: 'operations', userId: 'u1' })
    await expect(previewOwnerStatementUpload(formFrom(validBytes()))).resolves.toEqual({
      ok: false,
      reason: VM1_OS_UPLOAD_REASON.notStaff,
    })
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('preview for ceo uses no RPC and does not revalidate', async () => {
    mockAuth.mockResolvedValue({ ok: true, staffRole: 'ceo', userId: 'u1' })
    const result = await previewOwnerStatementUpload(formFrom(validBytes()))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.preview.lineCount).toBe(1)
    expect(result.preview.lines[0].reservation_id).toBe('65733679')
    expect(JSON.stringify(result)).not.toMatch(/[a-f0-9]{64}/)
    expect(JSON.stringify(result)).not.toContain('documentHash')
    expect(JSON.stringify(result)).not.toContain('actor_id')
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('rejects malformed XLSX and PII during preview without ingest', async () => {
    mockAuth.mockResolvedValue({ ok: true, staffRole: 'finance_admin', userId: 'u1' })
    await expect(previewOwnerStatementUpload(formFrom(Buffer.from('nope')))).resolves.toEqual({
      ok: false,
      reason: VM1_OS_UPLOAD_REASON.malformedXlsx,
    })
    const pii = buildMinimalOwnerStatementXlsx([...HEADERS, 'guest_email'], [[...VALID_ROW, 'hidden']])
    await expect(previewOwnerStatementUpload(formFrom(pii))).resolves.toEqual({
      ok: false,
      reason: VM1_OS_UPLOAD_REASON.piiRejected,
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('requires explicit confirmation before ingest', async () => {
    mockAuth.mockResolvedValue({ ok: true, staffRole: 'ceo', userId: 'u1' })
    await expect(ingestOwnerStatementUpload(formFrom(validBytes()))).resolves.toEqual({
      ok: false,
      reason: VM1_OS_UPLOAD_REASON.confirmationRequired,
    })
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('ingests through the user JWT RPC only and refreshes the reader on success', async () => {
    mockAuth.mockResolvedValue({ ok: true, staffRole: 'ceo', userId: 'u1' })
    mockRpc.mockResolvedValue({ data: { ok: true, idempotent: false, document_id: 'doc-1' }, error: null })
    const result = await ingestOwnerStatementUpload(formFrom(validBytes(), VM1_OS_SOURCE_ASSERTION))
    expect(result).toEqual({ ok: true, kind: 'success' })
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc.mock.calls[0][0]).toBe('ingest_partnership_owner_statement_document')
    const payload = mockRpc.mock.calls[0][1].p_payload as Record<string, unknown>
    expect(payload).not.toHaveProperty('actor_id')
    expect(payload).not.toHaveProperty('verified_by')
    expect(payload).not.toHaveProperty('imported_by')
    expect(JSON.stringify(result)).not.toContain('doc-1')
    expect(JSON.stringify(result)).not.toMatch(/[a-f0-9]{64}/)
    expect(mockRevalidatePath).toHaveBeenCalledWith('/finance/external-partner/avi/operations')
  })

  it('maps identical payload replay to idempotent without exposing amounts', async () => {
    mockAuth.mockResolvedValue({ ok: true, staffRole: 'ceo', userId: 'u1' })
    mockRpc.mockResolvedValue({ data: { ok: true, idempotent: true, document_id: 'doc-1' }, error: null })
    await expect(ingestOwnerStatementUpload(formFrom(validBytes(), VM1_OS_SOURCE_ASSERTION))).resolves.toEqual({
      ok: true,
      kind: 'idempotent',
    })
  })

  it('maps hash/payload and row conflicts without amounts', async () => {
    mockAuth.mockResolvedValue({ ok: true, staffRole: 'ceo', userId: 'u1' })
    const cases = [
      ['hash_payload_conflict', 'Stored Owner Statement evidence conflicts with this file.'],
      ['voided_document_same_hash', 'This Owner Statement hash belongs to a voided document.'],
      ['reservation_conflict', 'Stored Owner Statement evidence has a reservation conflict.'],
      ['date_pair_conflict', 'Stored Owner Statement evidence has a date-pair conflict.'],
      ['cent_conflict', 'Stored Owner Statement evidence has an amount conflict.'],
    ] as const
    for (const [reason, label] of cases) {
      mockRpc.mockResolvedValueOnce({
        data: { ok: false, reason, gross_rental_revenue: '999.99' },
        error: null,
      })
      const result = await ingestOwnerStatementUpload(formFrom(validBytes(), VM1_OS_SOURCE_ASSERTION))
      expect(result).toEqual({ ok: false, reason: label })
      expect(JSON.stringify(result)).not.toContain('999.99')
    }
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('does not use a service-role client, settlement, or Certified write path', () => {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        'src/app/(app)/finance/external-partner/avi/operations/ownerStatementUploadActions.ts',
      ),
      'utf8',
    )
    expect(src).toContain('createSupabaseServerClient')
    expect(src).not.toContain('createServiceClient')
    expect(src).not.toContain('service_role')
    expect(src).not.toContain('void_partnership_owner_statement_document')
    expect(src).not.toContain('public.transactions')
    expect(src).not.toContain('50/25/25')
    expect(src).not.toContain("'actor_id'")
    expect(src).not.toContain("'verified_by'")
    expect(src).not.toContain("'imported_by'")
    const panel = fs.readFileSync(
      path.join(process.cwd(), 'src/components/finance/Vm1OwnerStatementUploadPanel.tsx'),
      'utf8',
    )
    expect(panel).toContain('type="button"')
    expect(panel).toContain('vm1-os-upload-cancel')
    expect(panel).toContain('staff_confirmed_hostaway_download')
    expect(panel).not.toContain('createSupabaseServerClient')
    expect(panel).not.toContain('documentHash')
    expect(panel).not.toContain('50/25/25')
    expect(panel).not.toContain('void')
  })
})
