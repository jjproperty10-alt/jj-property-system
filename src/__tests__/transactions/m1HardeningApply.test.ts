/**
 * M1 hardening — applyControlledCorrectionAction / preview auth & safety.
 */
import type { CorrectionPlan } from '@/lib/statements/correctionPlan'
import {
  fingerprintCanonical,
  fingerprintProposed,
  buildIdempotencyKey,
} from '@/lib/transactions/previewFingerprint'

const mockAuth = jest.fn()
const mockOpen = jest.fn()
const mockTransition = jest.fn()
const mockApply = jest.fn()
const mockFrom = jest.fn()
const mockSchemaFrom = jest.fn()
const mockResolveParty = jest.fn()

jest.mock('@/lib/statements/statementAuthService', () => ({
  authenticateStatementUser: () => mockAuth(),
}))

jest.mock('@/lib/owners/billingActions', () => ({
  openCorrectionCaseAction: (input: unknown) => mockOpen(input),
  transitionCorrectionCaseAction: (input: unknown) => mockTransition(input),
  applyCorrectionCaseAction: (input: unknown) => mockApply(input),
}))

jest.mock('@/lib/identity/partyResolverService', () => ({
  resolvePartyForEntity: (id: string) => mockResolveParty(id),
}))

jest.mock('@/lib/supabase', () => ({
  createServiceClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    schema: () => ({
      from: (...args: unknown[]) => mockSchemaFrom(...args),
    }),
  }),
}))

jest.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: () => {
    throw new Error('correctionWorkspaceActions must not call session client directly — billingActions does')
  },
}))

import {
  applyControlledCorrectionAction,
  previewControlledCorrectionAction,
} from '@/lib/transactions/correctionWorkspaceActions'

const TX_ID = '11111111-1111-1111-1111-111111111111'
const SERIES_ID = '33333333-3333-3333-3333-333333333333'
const ENTITY_ID = '44444444-4444-4444-4444-444444444444'
const PARTY_ID = '55555555-5555-5555-5555-555555555555'

const CANONICAL = {
  id: TX_ID,
  date: '2026-01-15',
  property_id: '22222222-2222-2222-2222-222222222222',
  property_name: 'Sea View',
  category: 'Management',
  subcategory: 'Tenant Payment',
  description: 'January rent',
  payer: 'Tenant',
  payee: 'JJ',
  amount_eur: 1000,
  client_charge: 1000,
  notes: 'internal note',
  is_deleted: false,
  review_status: 'active',
  updated_at: '2026-01-15T10:00:00Z',
}

function chain(result: { data?: unknown; error?: unknown }) {
  const api: Record<string, unknown> = {}
  const self = () => api
  ;['select', 'eq', 'in', 'is', 'order', 'limit'].forEach((m) => {
    api[m] = jest.fn(self)
  })
  api.maybeSingle = jest.fn(async () => result)
  // thenable for await without maybeSingle
  api.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return api
}

function setupCanonicalFetch(row: typeof CANONICAL | null = CANONICAL) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'transactions') {
      return chain({ data: row, error: null })
    }
    if (table === 'transaction_exclusions') {
      return chain({ data: [], error: null })
    }
    return chain({ data: null, error: null })
  })
}

function setupBoundSeriesOk() {
  mockResolveParty.mockResolvedValue({ status: 'resolved', partyId: PARTY_ID })
  mockSchemaFrom.mockImplementation((table: string) => {
    if (table === 'management_relationship') {
      return chain({
        data: [{ entity_id: ENTITY_ID, property_name: 'Sea View', verification_status: 'verified', valid_to: null }],
        error: null,
      })
    }
    if (table === 'statement_series') {
      return chain({
        data: [{ series_id: SERIES_ID, owner_party_id: PARTY_ID, series_status: 'active', created_at: '2026-01-01' }],
        error: null,
      })
    }
    if (table === 'correction_cases') {
      return chain({ data: [], error: null })
    }
    if (table === 'correction_applied_transactions') {
      return chain({ data: [], error: null })
    }
    return chain({ data: [], error: null })
  })
}

function tokenFor(proposed: { amount_eur: number }) {
  const originalFingerprint = fingerprintCanonical(CANONICAL)
  const proposedFingerprint = fingerprintProposed({
    date: CANONICAL.date,
    category: CANONICAL.category,
    subcategory: CANONICAL.subcategory,
    amount_eur: proposed.amount_eur,
    client_charge: CANONICAL.client_charge,
    description: CANONICAL.description,
  })
  return {
    originalFingerprint,
    proposedFingerprint,
    idempotencyKey: buildIdempotencyKey(TX_ID, originalFingerprint, proposedFingerprint),
  }
}

describe('M1 hardened apply/preview', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue({ ok: true, userId: 'u1', staffRole: 'ceo', isActive: true })
    setupCanonicalFetch()
    setupBoundSeriesOk()
  })

  it('unauthenticated Apply fails', async () => {
    mockAuth.mockResolvedValue({ ok: false, error: 'NO_SESSION' })
    const res = await applyControlledCorrectionAction({
      transactionId: TX_ID,
      proposed: { amount_eur: 800 },
      reason: 'fix',
      evidenceReference: '',
      confirmed: true,
      previewToken: tokenFor({ amount_eur: 800 }),
      seriesId: SERIES_ID,
    })
    expect(res.ok).toBe(false)
    expect(mockOpen).not.toHaveBeenCalled()
  })

  it('non-authorized staff Apply fails (operations)', async () => {
    mockAuth.mockResolvedValue({ ok: true, userId: 'u1', staffRole: 'operations', isActive: true })
    const res = await applyControlledCorrectionAction({
      transactionId: TX_ID,
      proposed: { amount_eur: 800 },
      reason: 'fix',
      evidenceReference: '',
      confirmed: true,
      previewToken: tokenFor({ amount_eur: 800 }),
      seriesId: SERIES_ID,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/ceo or finance_admin/i)
    expect(mockOpen).not.toHaveBeenCalled()
  })

  it('Apply without Preview token rejected', async () => {
    const res = await applyControlledCorrectionAction({
      transactionId: TX_ID,
      proposed: { amount_eur: 800 },
      reason: 'fix',
      evidenceReference: '',
      confirmed: true,
      // @ts-expect-error intentional
      previewToken: null,
      seriesId: SERIES_ID,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/Preview/i)
    expect(mockOpen).not.toHaveBeenCalled()
  })

  it('arbitrary/cross-owner series rejected', async () => {
    const res = await applyControlledCorrectionAction({
      transactionId: TX_ID,
      proposed: { amount_eur: 800 },
      reason: 'fix',
      evidenceReference: '',
      confirmed: true,
      previewToken: tokenFor({ amount_eur: 800 }),
      seriesId: '99999999-9999-9999-9999-999999999999',
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/Rejected seriesId|cross-owner/i)
    expect(mockOpen).not.toHaveBeenCalled()
  })

  it('spoofed browser original values ignored — plan uses server canonical amount', async () => {
    mockOpen.mockResolvedValue({ ok: true, caseId: '66666666-6666-6666-6666-666666666666' })
    mockTransition.mockResolvedValue({ ok: true })
    mockApply.mockResolvedValue({
      ok: true,
      primaryAppliedTransactionId: '77777777-7777-7777-7777-777777777777',
      appliedTransactionIds: ['77777777-7777-7777-7777-777777777777'],
      insertedCount: 2,
    })

    const res = await applyControlledCorrectionAction({
      transactionId: TX_ID,
      proposed: { amount_eur: 800 },
      reason: 'Wrong imported amount',
      evidenceReference: 't-1',
      confirmed: true,
      previewToken: tokenFor({ amount_eur: 800 }),
      seriesId: SERIES_ID,
    })
    expect(res.ok).toBe(true)
    expect(mockOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        originalTransactionId: TX_ID,
        originalAmountEur: 1000, // canonical, not a spoofed browser original
        seriesId: SERIES_ID,
      }),
    )
    const applyArg = mockApply.mock.calls[0][0] as { original: { amount_eur: number }; plan: CorrectionPlan }
    expect(applyArg.original.amount_eur).toBe(1000)
    expect(applyArg.plan.kind).toBe('void_and_replace')
  })

  it('stale Preview rejected when canonical fingerprint drifts', async () => {
    const stale = tokenFor({ amount_eur: 800 })
    stale.originalFingerprint = 'deadbeef'
    const res = await applyControlledCorrectionAction({
      transactionId: TX_ID,
      proposed: { amount_eur: 800 },
      reason: 'fix',
      evidenceReference: '',
      confirmed: true,
      previewToken: stale,
      seriesId: SERIES_ID,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/Stale Preview/i)
    expect(mockOpen).not.toHaveBeenCalled()
  })

  it('invalid money rejected (non-finite)', async () => {
    const res = await applyControlledCorrectionAction({
      transactionId: TX_ID,
      proposed: { amount_eur: Number.NaN },
      reason: 'fix',
      evidenceReference: '',
      confirmed: true,
      previewToken: tokenFor({ amount_eur: 800 }),
      seriesId: SERIES_ID,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/finite/i)
  })

  it('invalid category rejected', async () => {
    const res = await previewControlledCorrectionAction(TX_ID, {
      category: 'NotARealCategory',
      amount_eur: 900,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/Unsupported category/i)
  })

  it('null and zero client_charge remain distinct in preview token', async () => {
    const a = fingerprintProposed({ client_charge: null })
    const b = fingerprintProposed({ client_charge: 0 })
    expect(a).not.toBe(b)
  })

  it('partial failure returns caseId; retry resumes same case (no second open)', async () => {
    const caseId = '66666666-6666-6666-6666-666666666666'
    mockOpen.mockResolvedValue({ ok: true, caseId })
    mockTransition.mockResolvedValue({ ok: true })
    mockApply.mockResolvedValueOnce({ ok: false, error: 'RPC blew up' })

    const first = await applyControlledCorrectionAction({
      transactionId: TX_ID,
      proposed: { amount_eur: 800 },
      reason: 'fix',
      evidenceReference: '',
      confirmed: true,
      previewToken: tokenFor({ amount_eur: 800 }),
      seriesId: SERIES_ID,
    })
    expect(first.ok).toBe(false)
    if (!first.ok) {
      expect(first.caseId).toBe(caseId)
      expect(first.resumable).toBe(true)
    }

    // Second call finds existing case by idempotency key
    const token = tokenFor({ amount_eur: 800 })
    mockSchemaFrom.mockImplementation((table: string) => {
      if (table === 'management_relationship') {
        return chain({
          data: [{ entity_id: ENTITY_ID, property_name: 'Sea View', verification_status: 'verified', valid_to: null }],
          error: null,
        })
      }
      if (table === 'statement_series') {
        return chain({
          data: [{ series_id: SERIES_ID, owner_party_id: PARTY_ID, series_status: 'active' }],
          error: null,
        })
      }
      if (table === 'correction_cases') {
        return chain({
          data: [
            {
              id: caseId,
              status: 'approved',
              series_id: SERIES_ID,
              corrected_field_values: { m1_idempotency_key: token.idempotencyKey },
              applied_transaction_id: null,
            },
          ],
          error: null,
        })
      }
      return chain({ data: [], error: null })
    })

    mockApply.mockResolvedValueOnce({
      ok: true,
      primaryAppliedTransactionId: '77777777-7777-7777-7777-777777777777',
      appliedTransactionIds: ['77777777-7777-7777-7777-777777777777'],
      insertedCount: 2,
    })

    const second = await applyControlledCorrectionAction({
      transactionId: TX_ID,
      proposed: { amount_eur: 800 },
      reason: 'fix',
      evidenceReference: '',
      confirmed: true,
      previewToken: token,
      seriesId: SERIES_ID,
      resumeCaseId: caseId,
    })
    expect(second.ok).toBe(true)
    expect(mockOpen).toHaveBeenCalledTimes(1) // no second open
    if (second.ok) expect(second.resumed).toBe(true)
  })

  it('Preview performs zero mutation', async () => {
    const res = await previewControlledCorrectionAction(TX_ID, { amount_eur: 800 })
    expect(res.ok).toBe(true)
    expect(mockOpen).not.toHaveBeenCalled()
    expect(mockApply).not.toHaveBeenCalled()
    expect(mockTransition).not.toHaveBeenCalled()
  })

  it('unique_violation with same idempotency key resumes instead of duplicating', async () => {
    const caseId = '66666666-6666-6666-6666-666666666666'
    const token = tokenFor({ amount_eur: 800 })
    mockOpen.mockResolvedValue({
      ok: false,
      error: 'duplicate key value violates unique constraint "uq_correction_cases_one_nonterminal_per_tx"',
      code: 'unique_violation',
    })
    let correctionCalls = 0
    mockSchemaFrom.mockImplementation((table: string) => {
      if (table === 'management_relationship') {
        return chain({
          data: [{ entity_id: ENTITY_ID, property_name: 'Sea View', verification_status: 'verified', valid_to: null }],
          error: null,
        })
      }
      if (table === 'statement_series') {
        return chain({
          data: [{ series_id: SERIES_ID, owner_party_id: PARTY_ID, series_status: 'active' }],
          error: null,
        })
      }
      if (table === 'correction_cases') {
        correctionCalls += 1
        // 1: findCaseByIdempotencyKey (miss)  2: openCases guard (empty)
        // 3+: post-unique-violation findCaseByIdempotencyKey (hit)
        if (correctionCalls >= 3) {
          return chain({
            data: [
              {
                id: caseId,
                status: 'open',
                series_id: SERIES_ID,
                corrected_field_values: { m1_idempotency_key: token.idempotencyKey },
                applied_transaction_id: null,
              },
            ],
            error: null,
          })
        }
        return chain({ data: [], error: null })
      }
      return chain({ data: [], error: null })
    })
    mockTransition.mockResolvedValue({ ok: true })
    mockApply.mockResolvedValue({
      ok: true,
      primaryAppliedTransactionId: '77777777-7777-7777-7777-777777777777',
      appliedTransactionIds: ['77777777-7777-7777-7777-777777777777'],
      insertedCount: 2,
    })

    const res = await applyControlledCorrectionAction({
      transactionId: TX_ID,
      proposed: { amount_eur: 800 },
      reason: 'fix',
      evidenceReference: '',
      confirmed: true,
      previewToken: token,
      seriesId: SERIES_ID,
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.resumed).toBe(true)
      expect(res.caseId).toBe(caseId)
    }
    expect(mockOpen).toHaveBeenCalledTimes(1)
    expect(mockTransition).toHaveBeenCalled()
    expect(mockApply).toHaveBeenCalled()
  })

  it('unique_violation with a different active case fails closed (no unhandled exception)', async () => {
    const otherId = '88888888-8888-8888-8888-888888888888'
    mockOpen.mockResolvedValue({
      ok: false,
      error: 'duplicate key value violates unique constraint "uq_correction_cases_one_nonterminal_per_tx"',
      code: 'unique_violation',
    })
    // First correction_cases lookups (idempotency / open cases) empty; race lookup returns other.
    let correctionCalls = 0
    mockSchemaFrom.mockImplementation((table: string) => {
      if (table === 'management_relationship') {
        return chain({
          data: [{ entity_id: ENTITY_ID, property_name: 'Sea View', verification_status: 'verified', valid_to: null }],
          error: null,
        })
      }
      if (table === 'statement_series') {
        return chain({
          data: [{ series_id: SERIES_ID, owner_party_id: PARTY_ID, series_status: 'active' }],
          error: null,
        })
      }
      if (table === 'correction_cases') {
        correctionCalls += 1
        // findCaseByIdempotencyKey / openCases → empty; post-race → other active case
        if (correctionCalls >= 3) {
          return chain({
            data: [{ id: otherId, status: 'approved' }],
            error: null,
          })
        }
        return chain({ data: [], error: null })
      }
      return chain({ data: [], error: null })
    })

    const res = await applyControlledCorrectionAction({
      transactionId: TX_ID,
      proposed: { amount_eur: 800 },
      reason: 'fix',
      evidenceReference: '',
      confirmed: true,
      previewToken: tokenFor({ amount_eur: 800 }),
      seriesId: SERIES_ID,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toMatch(/non-terminal correction case already exists/i)
      expect(res.error).not.toMatch(/unhandled|stack/i)
      expect(res.caseId).toBe(otherId)
      expect(res.resumable).toBe(true)
    }
    expect(mockApply).not.toHaveBeenCalled()
  })

  it('finance_admin can enter the controlled apply workflow', async () => {
    mockAuth.mockResolvedValue({ ok: true, userId: 'u2', staffRole: 'finance_admin', isActive: true })
    mockOpen.mockResolvedValue({ ok: true, caseId: '66666666-6666-6666-6666-666666666666' })
    mockTransition.mockResolvedValue({ ok: true })
    mockApply.mockResolvedValue({
      ok: true,
      primaryAppliedTransactionId: '77777777-7777-7777-7777-777777777777',
      appliedTransactionIds: ['77777777-7777-7777-7777-777777777777'],
      insertedCount: 2,
    })
    const res = await applyControlledCorrectionAction({
      transactionId: TX_ID,
      proposed: { amount_eur: 800 },
      reason: 'fix',
      evidenceReference: '',
      confirmed: true,
      previewToken: tokenFor({ amount_eur: 800 }),
      seriesId: SERIES_ID,
    })
    expect(res.ok).toBe(true)
    expect(mockOpen).toHaveBeenCalled()
  })
})
