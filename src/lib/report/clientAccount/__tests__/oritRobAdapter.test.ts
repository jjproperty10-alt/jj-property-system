/**
 * Orit Rob — fail-closed proof for the universal client report engine.
 *
 * UNRESOLVED ORIT DIVERGENCE (documented here; no business decision is taken in code):
 *   previously approved STR net           3,391.00
 *   current live STR net (repo STR path)  3,374.87   → net divergence 16.13
 *   platform-fee baseline                 1,267.05
 *   live platform fees                    1,287.21   → gross platform-fee divergence 20.16
 *   suspected cause: synthetic Booking payment fee of 1.6 % applied by the live STR path
 *   status: unresolved — Orit has no applied certification and the engine must stay blocked.
 *
 * These figures appear ONLY in this test as values the runtime must never contain or substitute.
 */
import * as fs from 'fs'
import * as path from 'path'

import type { CertifiedClientSettlementAvailable } from '@/lib/finance/certifiedClientSettlementTypes'

import { oritRobAdapter } from '../adapters/oritRob'
import { buildClientAccountReport } from '../buildClientAccountReport'
import { compositionFromCertifiedSettlement } from '../certifiedSource'
import { ClientAccountBlock } from '../composeCertifiedAccount'

const readCertifiedClientSettlement = jest.fn()
const transactionsQuery = jest.fn()

jest.mock('@/lib/finance/certifiedClientSettlementAdapter', () => ({
  readCertifiedClientSettlement: (...args: unknown[]) => readCertifiedClientSettlement(...args),
  resolveCertifiedSettlementEntityFromProperty: jest.fn(),
}))

jest.mock('@/lib/finance/certifiedStrMonthlySettlementAdapter', () => ({
  readCertifiedStrMonthlySettlement: async () => ({ unavailable: true, reason: 'no_applied_certification' }),
}))

jest.mock('@/lib/supabase', () => ({
  createServiceClient: () => ({
    schema: () => ({
      from: () => ({
        select: () => ({
          in: () => ({
            eq: async () => ({ data: [{ id: '92ed1f7e-f7df-4529-b118-4aa63b2b15b2', canonical_name: 'Orit Rob', status: 'active' }], error: null }),
          }),
        }),
      }),
    }),
    from: () => ({
      select: () => ({
        in: () => ({
          lte: () => ({
            order: () => ({
              order: () => ({
                range: async () => {
                  transactionsQuery()
                  return { data: [], error: null }
                },
              }),
            }),
          }),
        }),
      }),
    }),
  }),
}))

import { loadClientAccountReport } from '../loadClientAccountReport'

const ENTITY = '92ed1f7e-f7df-4529-b118-4aa63b2b15b2'
const PROPERTY = 'c74e3ff2-cf7c-477a-8dad-ac11e45540ba'
const UNCERTIFIED = { unavailable: true as const, reason: 'no_applied_certification' as const, entityId: ENTITY, asOf: '2026-08-31' }

/** Test-only certified shape carrying the baseline closing; used solely to prove the engine refuses to force it. */
const FIXTURE_CERTIFIED: CertifiedClientSettlementAvailable = {
  unavailable: false,
  certificationId: '00000000-0000-4000-8000-0000000000aa',
  entityId: ENTITY,
  asOf: '2026-08-31',
  certificationAsOf: '2026-08-31',
  openingDueToJj: 552.52,
  propertyLines: [{
    lineOrder: 1, propertyKey: PROPERTY, propertyName: 'Orit Rob', componentCode: 'opening_property_obligation',
    amountDueToJj: 552.52, reason: 'fixture', evidenceRef: 'fixture', metadata: {},
  }],
  fifoCredits: [],
  exclusions: [],
  fifoCreditsTotal: 0,
  overlayClosingDueToJj: 552.52,
  cashAllocationSignedTotal: 0,
  remainingR: -552.52,
  remainingS: 552.52,
  obligationSlices: [],
  unboundLines: [],
  cashExecutions: [],
  closingDueToJj: 552.52,
  closingDirection: 'client_owes_jj',
}

/** Values that must never be hardcoded or substituted by runtime code. */
const FORBIDDEN_RUNTIME_LITERALS = ['3391', '3,391', '3374.87', '3,374.87', '552.52', '568.65', '1267.05', '1,267.05', '1287.21', '1,287.21', '6713.52', '2770']
const FORBIDDEN_POLICY_LITERALS = ['booking_payment_fee', '1_6pct', '0.016', '1.6%', '1.6 %']

const RUNTIME_DIR = path.join(__dirname, '..')
const runtimeFiles = (): string[] => {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full)
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push(full)
      }
    }
  }
  walk(RUNTIME_DIR)
  walk(path.join(RUNTIME_DIR, '..', '..', 'pdf', 'clientAccount'))
  out.push(path.join(RUNTIME_DIR, '..', '..', 'pdf', 'ClientAccountPdf.tsx'))
  return out
}

function ledgerRow(id: string, date: string, amount: number, category: string, subcategory: string, description: string) {
  return {
    id, date, property_name: 'Orit Rob', category, subcategory, description,
    payer: 'Client', payee: 'company', amount_eur: amount, client_charge: null, review_status: 'active', is_deleted: false,
  }
}

describe('Orit Rob adapter — fail closed', () => {
  beforeEach(() => {
    readCertifiedClientSettlement.mockReset()
    transactionsQuery.mockReset()
  })

  test('the adapter carries identity and scope only — no amounts, ids or internal terms', () => {
    const text = JSON.stringify(oritRobAdapter)
    expect(text).not.toMatch(/\d+\.\d{2}/)
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    expect(oritRobAdapter.reportType).toBe('period_account')
    expect(oritRobAdapter.period).toEqual({ start: '2026-04-01', end: '2026-08-31' })
    expect(oritRobAdapter.asOf).toBe('2026-08-31')
    expect(oritRobAdapter.identity).toEqual({ kind: 'canonicalName', canonicalNames: ['Orit Rob', 'Orit Rob Pingodes'] })
    expect(typeof oritRobAdapter.evidence).toBe('function')
  })

  test('1. no applied Orit certification → blocked, and no ledger row is read', async () => {
    readCertifiedClientSettlement.mockResolvedValue(UNCERTIFIED)
    const result = await loadClientAccountReport(oritRobAdapter)
    expect(result).toEqual({ status: 'blocked', code: 'NO_CERTIFIED_SOURCE', reason: 'no_applied_certification' })
    expect(readCertifiedClientSettlement).toHaveBeenCalledWith(ENTITY, '2026-08-31')
    expect(transactionsQuery).not.toHaveBeenCalled()
  })

  test('2. a live STR result cannot be substituted for a certified settlement', () => {
    // A live-shaped payload carrying numbers but no applied certification is still an unavailable source.
    const liveShaped = { ...UNCERTIFIED, strNet: 3374.87, closingDueToJj: 568.65 } as unknown as typeof UNCERTIFIED
    const result = compositionFromCertifiedSettlement({ settlement: liveShaped, rows: [], clientDisplayName: 'אורית רוב', reportTitle: 'דוח' })
    expect(result).toEqual({ status: 'blocked', code: 'NO_CERTIFIED_SOURCE', reason: 'no_applied_certification' })
  })

  test('3. the previously approved value and the live value are not hardcoded anywhere in the runtime', () => {
    const files = runtimeFiles()
    expect(files.length).toBeGreaterThan(5)
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8')
      for (const literal of FORBIDDEN_RUNTIME_LITERALS) {
        expect({ file: path.basename(file), literal, found: source.includes(literal) }).toEqual({ file: path.basename(file), literal, found: false })
      }
    }
  })

  test('4. the Booking payment-fee decision is not guessed by the engine', () => {
    for (const file of runtimeFiles()) {
      const source = fs.readFileSync(file, 'utf8').toLowerCase()
      for (const literal of FORBIDDEN_POLICY_LITERALS) {
        expect({ file: path.basename(file), literal, found: source.includes(literal) }).toEqual({ file: path.basename(file), literal, found: false })
      }
    }
  })

  test('5 + 6. no Orit document exists to render and nothing is marked ready', async () => {
    readCertifiedClientSettlement.mockResolvedValue(UNCERTIFIED)
    const result = await loadClientAccountReport(oritRobAdapter)
    expect(result.status).not.toBe('ready')
    expect('report' in result).toBe(false)
    expect('certificationId' in result).toBe(false)
  })

  test('7. ledger totals alone do not authorize an STR closing', () => {
    // Expenses 6,713.52 and payments 2,770.00 are real ledger facts; without a certified STR credit they cannot
    // produce the baseline balance, and the engine refuses to compose one.
    const rows = [
      ledgerRow('e1', '2026-05-10', 6530.17, 'Management', 'Repairs', 'עבודות'),
      ledgerRow('e2', '2026-06-02', 183.35, 'Management', 'Electricity', 'חשמל'),
      ledgerRow('p1', '2026-04-28', 1770, 'Management', 'Client Payment', 'תשלום'),
      ledgerRow('p2', '2026-05-06', 1000, 'Management', 'Client Payment', 'תשלום'),
    ]
    const composition = compositionFromCertifiedSettlement({
      settlement: FIXTURE_CERTIFIED, rows, clientDisplayName: 'אורית רוב', reportTitle: 'דוח', reportType: 'period_account', period: { start: '2026-04-01', end: '2026-08-31' },
    })
    expect(composition.status).toBe('ready')
    if (composition.status !== 'ready') return
    expect(() => buildClientAccountReport(composition.input)).toThrow(ClientAccountBlock)
  })

  test('a certified settlement whose rows do not reconcile is blocked through the loader, never forced', async () => {
    readCertifiedClientSettlement.mockResolvedValue(FIXTURE_CERTIFIED)
    const result = await loadClientAccountReport(oritRobAdapter)
    expect(result.status).toBe('blocked')
    if (result.status === 'blocked') expect(result.code).toBe('BLOCKED_ACCOUNTING')
  })
})
