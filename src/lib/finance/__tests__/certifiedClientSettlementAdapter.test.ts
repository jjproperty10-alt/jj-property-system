jest.mock('server-only', () => ({}), { virtual: true })

const mockRpc = jest.fn()
const mockEpaEq = jest.fn()
const mockMrIs = jest.fn()
const mockResolveProperty = jest.fn()
const mockSchema = jest.fn()

jest.mock('@/lib/supabase', () => ({
  createServiceClient: () => ({
    rpc: mockRpc,
    schema: (...args: unknown[]) => mockSchema(...args),
  }),
}))

jest.mock('@/lib/identity', () => ({
  resolveProperty: (...args: unknown[]) => mockResolveProperty(...args),
}))

import {
  loadCertifiedSettlementForEntity,
  loadCertifiedSettlementForProperty,
  parseCertifiedReaderPayload,
  readCertifiedClientSettlement,
} from '../certifiedClientSettlementAdapter'
import { URIEL_SHAPED_CERTIFIED, readerPayloadFromDto } from '../__fixtures__/certifiedClientSettlement'
import { CLIENT_SETTLEMENT_CERTIFICATION_RPC } from '../clientSettlementCertificationTypes'

const ENTITY = URIEL_SHAPED_CERTIFIED.entityId
const AS_OF = URIEL_SHAPED_CERTIFIED.asOf

describe('parseCertifiedReaderPayload', () => {
  test('parses an available overlay and keeps integer-cent closing', () => {
    const dto = parseCertifiedReaderPayload(readerPayloadFromDto(URIEL_SHAPED_CERTIFIED), ENTITY, AS_OF)
    expect(dto.unavailable).toBe(false)
    if (dto.unavailable) return
    expect(dto.closingDueToJj).toBe(50677.42)
    expect(dto.fifoCredits[0].cash).toBe(false)
    expect(dto.exclusions[0].arithmeticEffect).toBe(0)
  })

  test('jsonb integer 4099 still parses as exact cents', () => {
    const raw = readerPayloadFromDto(URIEL_SHAPED_CERTIFIED)
    ;(raw.lines as Record<string, unknown>[])[2].amount_due_to_jj = 4099
    const dto = parseCertifiedReaderPayload(raw, ENTITY, AS_OF)
    expect(dto.unavailable).toBe(false)
    if (dto.unavailable) return
    expect(dto.propertyLines[2].amountDueToJj).toBe(4099)
  })

  test('unavailable reader result is not a fake zero', () => {
    const dto = parseCertifiedReaderPayload(
      { unavailable: true, reason: 'no_applied_certification' },
      ENTITY,
      AS_OF,
    )
    expect(dto.unavailable).toBe(true)
    if (!dto.unavailable) return
    expect(dto.reason).toBe('no_applied_certification')
    expect(dto).not.toHaveProperty('closingDueToJj')
  })

  test('malformed payload is unavailable, never €0', () => {
    const dto = parseCertifiedReaderPayload({ unavailable: false }, ENTITY, AS_OF)
    expect(dto).toEqual({
      unavailable: true,
      reason: 'malformed_payload',
      entityId: ENTITY,
      asOf: AS_OF,
    })
  })

  test('FIFO/exclusion mismatch is fail-closed', () => {
    const raw = readerPayloadFromDto(URIEL_SHAPED_CERTIFIED)
    raw.certified_closing_due_to_jj = 36777.42
    const dto = parseCertifiedReaderPayload(raw, ENTITY, AS_OF)
    expect(dto.unavailable).toBe(true)
    if (!dto.unavailable) return
    expect(dto.reason).toBe('malformed_payload')
  })

  test('JJ_TO_CLIENT remaining is R=+1740 after P=3260 without double-counting cash', () => {
    const raw = readerPayloadFromDto(URIEL_SHAPED_CERTIFIED)
    raw.certified_opening_due_to_jj = -5000
    raw.fifo_credits = []
    raw.fifo_credits_total = 0
    raw.certified_closing_due_to_jj = -5000
    raw.cash_allocation_signed_total = -3260
    raw.certified_remaining_due_to_jj = -1740
    raw.remaining_r = 1740
    raw.remaining_s = -1740
    raw.as_of = AS_OF
    raw.certification_as_of = AS_OF
    const dto = parseCertifiedReaderPayload(raw, ENTITY, AS_OF)
    expect(dto.unavailable).toBe(false)
    if (dto.unavailable) return
    expect(dto.remainingR).toBe(1740)
    expect(dto.remainingS).toBe(-1740)
    expect(dto.closingDueToJj).toBe(-1740)
    expect(dto.overlayClosingDueToJj).toBe(-5000)
    expect(dto.closingDueToJj).not.toBe(-5000 - 3260 - 3260)
  })

  test('CLIENT_TO_JJ remaining is R=-1740 after P=3260', () => {
    const raw = readerPayloadFromDto(URIEL_SHAPED_CERTIFIED)
    raw.certified_opening_due_to_jj = 5000
    raw.fifo_credits = []
    raw.fifo_credits_total = 0
    raw.certified_closing_due_to_jj = 5000
    raw.cash_allocation_signed_total = 3260
    raw.certified_remaining_due_to_jj = 1740
    raw.remaining_r = -1740
    raw.remaining_s = 1740
    raw.as_of = AS_OF
    raw.certification_as_of = AS_OF
    const dto = parseCertifiedReaderPayload(raw, ENTITY, AS_OF)
    expect(dto.unavailable).toBe(false)
    if (dto.unavailable) return
    expect(dto.remainingR).toBe(-1740)
    expect(dto.remainingS).toBe(1740)
    expect(dto.closingDueToJj).toBe(1740)
  })

  test('double-counted remaining is fail-closed', () => {
    const raw = readerPayloadFromDto(URIEL_SHAPED_CERTIFIED)
    raw.certified_opening_due_to_jj = -5000
    raw.fifo_credits = []
    raw.fifo_credits_total = 0
    raw.certified_closing_due_to_jj = -5000
    raw.cash_allocation_signed_total = -3260
    raw.certified_remaining_due_to_jj = -1520
    raw.remaining_r = 1520
    raw.remaining_s = -1520
    const dto = parseCertifiedReaderPayload(raw, ENTITY, AS_OF)
    expect(dto.unavailable).toBe(true)
  })
})

describe('readCertifiedClientSettlement adapter', () => {
  beforeEach(() => {
    mockRpc.mockReset()
    mockEpaEq.mockReset()
    mockMrIs.mockReset()
    mockResolveProperty.mockReset()
    mockSchema.mockReset()
    mockSchema.mockImplementation(() => ({
      from: (table: string) => {
        if (table === 'entity_property_associations') {
          return {
            select: () => ({
              eq: () => ({
                eq: mockEpaEq,
              }),
            }),
          }
        }
        return {
          select: () => ({
            eq: () => ({
              is: mockMrIs,
            }),
          }),
        }
      },
    }))
  })

  test('calls public.read_certified_client_settlement through the service-role client', async () => {
    mockRpc.mockResolvedValue({ data: readerPayloadFromDto(URIEL_SHAPED_CERTIFIED), error: null })
    const dto = await readCertifiedClientSettlement(ENTITY, AS_OF)
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith(CLIENT_SETTLEMENT_CERTIFICATION_RPC.read, {
      p_entity_id: ENTITY,
      p_as_of: AS_OF,
    })
    expect(mockSchema).not.toHaveBeenCalled()
    expect(mockSchema).not.toHaveBeenCalledWith('finance')
    expect(dto.unavailable).toBe(false)
  })

  test('missing as-of does not call the reader and is not a fake zero', async () => {
    const dto = await loadCertifiedSettlementForEntity(ENTITY, undefined)
    expect(mockRpc).not.toHaveBeenCalled()
    expect(dto).toEqual({
      unavailable: true,
      reason: 'missing_as_of',
      entityId: ENTITY,
      asOf: null,
    })
  })

  test('reader failure is unavailable, not €0', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const dto = await readCertifiedClientSettlement(ENTITY, AS_OF)
    expect(dto.unavailable).toBe(true)
    if (!dto.unavailable) return
    expect(dto.reason).toBe('reader_failed')
  })

  test('PGRST/RPC error fails closed', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST106', message: 'Invalid schema: finance' },
    })
    const dto = await readCertifiedClientSettlement(ENTITY, AS_OF)
    expect(dto).toEqual({
      unavailable: true,
      reason: 'reader_failed',
      entityId: ENTITY,
      asOf: AS_OF,
    })
  })

  test('missing reader payload fails closed', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    const dto = await readCertifiedClientSettlement(ENTITY, AS_OF)
    expect(dto).toEqual({
      unavailable: true,
      reason: 'malformed_payload',
      entityId: ENTITY,
      asOf: AS_OF,
    })
  })

  test('ambiguous property identity is fail-closed', async () => {
    mockResolveProperty.mockResolvedValue({
      status: 'resolved',
      canonicalPropertyId: '99999999-9999-4999-8999-999999999999',
      canonicalName: 'Alpha',
    })
    mockEpaEq.mockResolvedValue({
      data: [{ entity_id: ENTITY }, { entity_id: '22222222-2222-4222-8222-222222222222' }],
      error: null,
    })
    mockMrIs.mockResolvedValue({ data: [], error: null })
    const dto = await loadCertifiedSettlementForProperty('Alpha', AS_OF)
    expect(mockRpc).not.toHaveBeenCalled()
    expect(dto.unavailable).toBe(true)
    if (!dto.unavailable) return
    expect(dto.reason).toBe('ambiguous_entity')
  })

  test('unique property identity loads the reader', async () => {
    mockResolveProperty.mockResolvedValue({
      status: 'resolved',
      canonicalPropertyId: '99999999-9999-4999-8999-999999999999',
      canonicalName: 'Alpha',
    })
    mockEpaEq.mockResolvedValue({ data: [{ entity_id: ENTITY }], error: null })
    mockMrIs.mockResolvedValue({ data: [{ entity_id: ENTITY }], error: null })
    mockRpc.mockResolvedValue({ data: readerPayloadFromDto(URIEL_SHAPED_CERTIFIED), error: null })
    const dto = await loadCertifiedSettlementForProperty('Alpha', AS_OF)
    expect(dto.unavailable).toBe(false)
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockSchema).toHaveBeenCalledWith('lifecycle')
    expect(mockSchema).not.toHaveBeenCalledWith('finance')
  })
})

describe('certified settlement adapter source contract', () => {
  test('service client only; public RPC; browser imports forbidden', () => {
    const src = require('fs').readFileSync(
      require('path').join(process.cwd(), 'src/lib/finance/certifiedClientSettlementAdapter.ts'),
      'utf8',
    )
    expect(src).toContain("import 'server-only'")
    expect(src).toContain("import { createServiceClient } from '@/lib/supabase'")
    expect(src).toContain('.rpc(CLIENT_SETTLEMENT_CERTIFICATION_RPC.read')
    expect(src).not.toContain("schema('finance')")
    expect(src).not.toContain('createSupabaseBrowserClient')
    expect(src).not.toContain('createSupabaseServerClient')
  })
})
