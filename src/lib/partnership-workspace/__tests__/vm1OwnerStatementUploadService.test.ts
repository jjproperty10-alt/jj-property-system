import { createHash } from 'crypto'
import { VM1_OS_REQUIRED_COLUMNS, VM1_OS_UPLOAD_REASON } from '../vm1OwnerStatementUploadContract'
import { parseVm1OwnerStatementXlsx } from '../vm1OwnerStatementUploadService'
import { buildMinimalOwnerStatementXlsx } from '../vm1OwnerStatementXlsxParser'
import { normalizedOwnerStatementPayloadHash, sha256Hex } from '../vm1OwnerStatementCanonicalHash'

const HEADERS = [...VM1_OS_REQUIRED_COLUMNS]

const BASE = {
  reservation_id: '65733679',
  check_in: '2026-09-03',
  check_out: '2026-09-06',
  reservation_status: 'confirmed',
  gross_rental_revenue: '1000.00',
  platform_fee: '100.00',
  guest_cleaning: '50.00',
  total_taxes: '0.00',
  management_charge: '150.00',
  net_owner_payout: '700.00',
  currency: 'EUR',
} as const

function row(overrides: Record<string, string | number> = {}, headers: readonly string[] = HEADERS): (string | number)[] {
  const cells: Record<string, string | number> = { ...BASE, ...overrides }
  return headers.map((header) => cells[header] ?? '')
}

function xlsx(
  rows: readonly (readonly (string | number)[])[],
  headers: readonly string[] = HEADERS,
): Buffer {
  return buildMinimalOwnerStatementXlsx(headers, rows)
}

describe('VM1 Owner Statement XLSX parse/preview', () => {
  it('normalizes approved columns and does not return hashes in the preview', () => {
    const bytes = xlsx([row()])
    const parsed = parseVm1OwnerStatementXlsx(bytes)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.preview.listingId).toBe('412148')
    expect(parsed.preview.statementFrom).toBe('2026-08-30')
    expect(parsed.preview.statementTo).toBe('2026-11-30')
    expect(parsed.preview.lineCount).toBe(1)
    expect(parsed.preview.netOwnerPayoutTotalEur).toBe('700.00')
    expect(parsed.preview.lines[0]).toEqual({
      reservation_id: '65733679',
      check_in: '2026-09-03',
      check_out: '2026-09-06',
      reservation_status: 'confirmed',
      gross_rental_revenue: '1000.00',
      platform_fee: '100.00',
      guest_cleaning: '50.00',
      total_taxes: '0.00',
      management_charge: '150.00',
      net_owner_payout: '700.00',
      currency: 'EUR',
      source_row_reference: 'S1:R2',
      reconciliation_status: 'not_required',
    })
    expect(JSON.stringify(parsed.preview)).not.toContain('documentHash')
    expect(JSON.stringify(parsed.preview)).not.toContain('normalized_payload_hash')
    expect(parsed.documentHash).toBe(sha256Hex(bytes))
    expect(parsed.documentHash).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(parsed.normalizedPayloadHash).toBe(normalizedOwnerStatementPayloadHash(parsed.preview.lines))
    expect(parsed.payload.source_kind).toBe('hostaway_owner_statement')
    expect(parsed.payload.parser_version).toBe('hostaway_owner_minimal_xlsx_v1')
    expect(parsed.payload).not.toHaveProperty('actor_id')
    expect(parsed.payload).not.toHaveProperty('verified_by')
    expect(parsed.payload).not.toHaveProperty('verified_at')
    expect(parsed.payload).not.toHaveProperty('imported_by')
  })

  it('same file and identical payload produce the same hashes', () => {
    const bytes = xlsx([row()])
    const first = parseVm1OwnerStatementXlsx(bytes)
    const second = parseVm1OwnerStatementXlsx(Buffer.from(bytes))
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(first.documentHash).toBe(second.documentHash)
    expect(first.normalizedPayloadHash).toBe(second.normalizedPayloadHash)
  })

  it('same bytes with a different normalized line set get a different payload hash', () => {
    const left = parseVm1OwnerStatementXlsx(xlsx([row()]))
    const right = parseVm1OwnerStatementXlsx(
      xlsx([
        row({
          reservation_id: '65733680',
          gross_rental_revenue: '1100.00',
          net_owner_payout: '800.00',
        }),
      ]),
    )
    expect(left.ok && right.ok).toBe(true)
    if (!left.ok || !right.ok) return
    expect(left.documentHash).not.toBe(right.documentHash)
    expect(left.normalizedPayloadHash).not.toBe(right.normalizedPayloadHash)
  })

  it('rejects malformed XLSX before ingest', () => {
    expect(parseVm1OwnerStatementXlsx(Buffer.from('not-an-xlsx')).ok).toBe(false)
    expect(parseVm1OwnerStatementXlsx(Buffer.from('not-an-xlsx'))).toEqual({
      ok: false,
      reason: VM1_OS_UPLOAD_REASON.malformedXlsx,
    })
  })

  it('rejects PII columns', () => {
    const headers = [...HEADERS, 'guest_name']
    const parsed = parseVm1OwnerStatementXlsx(xlsx([row({}, headers)], headers))
    expect(parsed).toEqual({ ok: false, reason: VM1_OS_UPLOAD_REASON.piiRejected })
  })

  it('rejects unknown and missing columns', () => {
    expect(parseVm1OwnerStatementXlsx(xlsx([row()], [...HEADERS, 'notes']))).toEqual({
      ok: false,
      reason: VM1_OS_UPLOAD_REASON.unknownColumn,
    })
    expect(parseVm1OwnerStatementXlsx(xlsx([row()], HEADERS.slice(1)))).toEqual({
      ok: false,
      reason: VM1_OS_UPLOAD_REASON.missingColumn,
    })
  })

  it('rejects listing mismatch, period mismatch, and excluded reservation 53139113', () => {
    const listingHeaders = [...HEADERS, 'listing_id']
    expect(
      parseVm1OwnerStatementXlsx(xlsx([row({ listing_id: '999' }, listingHeaders)], listingHeaders)),
    ).toEqual({ ok: false, reason: VM1_OS_UPLOAD_REASON.identityRejected })
    expect(parseVm1OwnerStatementXlsx(xlsx([row({ check_in: '2026-08-20' })]))).toEqual({
      ok: false,
      reason: VM1_OS_UPLOAD_REASON.periodRejected,
    })
    expect(parseVm1OwnerStatementXlsx(xlsx([row({ reservation_id: '53139113' })]))).toEqual({
      ok: false,
      reason: VM1_OS_UPLOAD_REASON.excludedReservation,
    })
  })

  it('rejects duplicate reservation and duplicate date pair', () => {
    expect(
      parseVm1OwnerStatementXlsx(
        xlsx([row(), row({ check_in: '2026-09-11', check_out: '2026-09-13' })]),
      ),
    ).toEqual({ ok: false, reason: VM1_OS_UPLOAD_REASON.duplicateReservation })
    expect(
      parseVm1OwnerStatementXlsx(xlsx([row(), row({ reservation_id: '65733680' })])),
    ).toEqual({ ok: false, reason: VM1_OS_UPLOAD_REASON.duplicateDatePair })
  })

  it('rejects non-EUR currency, 1.999, scientific notation, and NaN', () => {
    expect(parseVm1OwnerStatementXlsx(xlsx([row({ currency: 'USD' })]))).toEqual({
      ok: false,
      reason: VM1_OS_UPLOAD_REASON.currencyRejected,
    })
    expect(parseVm1OwnerStatementXlsx(xlsx([row({ net_owner_payout: '1.999', gross_rental_revenue: '301.999' })]))).toEqual({
      ok: false,
      reason: VM1_OS_UPLOAD_REASON.centRejected,
    })
    expect(parseVm1OwnerStatementXlsx(xlsx([row({ platform_fee: '1e2' })]))).toEqual({
      ok: false,
      reason: VM1_OS_UPLOAD_REASON.centRejected,
    })
    expect(parseVm1OwnerStatementXlsx(xlsx([row({ total_taxes: 'NaN' })]))).toEqual({
      ok: false,
      reason: VM1_OS_UPLOAD_REASON.centRejected,
    })
  })

  it('does not write transactions, settlement, or Certified fields', () => {
    const src = require('fs').readFileSync(
      require('path').join(process.cwd(), 'src/lib/partnership-workspace/vm1OwnerStatementUploadService.ts'),
      'utf8',
    )
    expect(src).not.toContain('public.transactions')
    expect(src).not.toContain('createServiceClient')
    expect(src).not.toContain('ingest_partnership_owner_statement_document')
    expect(src).not.toContain('50/25/25')
    expect(src).not.toContain('authoritativeEvidenceByReservationId')
  })
})
