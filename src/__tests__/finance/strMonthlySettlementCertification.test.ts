import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  formatStrMonthlyCount,
  parseCertifiedStrMonthlySettlement,
  strMonthlyReportMayShowComponentFormula,
} from '@/lib/finance/strMonthlySettlementCertificationContract'
import {
  assertStrMonthlySettlementRpcAuthorized,
  UnauthorizedStrMonthlySettlementError,
} from '@/lib/finance/strMonthlySettlementCertificationRpcAuth'

jest.mock('server-only', () => ({}), { virtual: true })

const mockAuth = jest.fn()
jest.mock('@/lib/statements/statementAuthService', () => ({
  authenticateStatementUser: () => mockAuth(),
}))

const mockRpc = jest.fn()
jest.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: () => ({ rpc: mockRpc }),
}))

import {
  applyStrMonthlySettlementCertificationAction,
  voidStrMonthlySettlementCertificationAction,
} from '@/lib/finance/strMonthlySettlementCertificationActions'

const MIGRATION = '20260924000000_str_monthly_settlement_certifications.sql'
const PREVIOUS_MIGRATION = '20260923233000_owner_level_client_obligation.sql'
const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8')
const ddl = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

const APP_FILES = [
  'src/lib/finance/strMonthlySettlementCertificationTypes.ts',
  'src/lib/finance/strMonthlySettlementCertificationRpcAuth.ts',
  'src/lib/finance/strMonthlySettlementCertificationContract.ts',
  'src/lib/finance/strMonthlySettlementCertificationActions.ts',
  'src/lib/finance/certifiedStrMonthlySettlementAdapter.ts',
]

const FORBIDDEN = [
  '2944e9ad',
  'b587f463',
  '947.25',
  '1525.77',
  '961.96',
  '3434.98',
  '6983.10',
  '259.02',
  '48901.54',
  'Uriel',
  'Neer',
  'Duplex',
]

const ENTITY = '11111111-1111-4111-8111-111111111111'
const PROPERTY = '12121212-1212-4212-8212-121212121212'

const lines = [
  {
    line_order: 1,
    month_start: '2026-06-01',
    reservation_count: 2,
    nights: 5,
    owner_net: 10.1,
    source_authority: 'approved_reconstruction' as const,
    evidence_ref: 'ev-jun',
    evidence_note: 'june approved net',
    component_reconciliation_status: 'partial' as const,
  },
  {
    line_order: 2,
    month_start: '2026-07-01',
    owner_net: 0,
    source_authority: 'owner_statement' as const,
    evidence_ref: 'ev-jul',
    evidence_note: 'july zero net',
    component_reconciliation_status: 'certified_total_only' as const,
  },
  {
    line_order: 3,
    month_start: '2026-08-01',
    reservation_count: 1,
    nights: 3,
    owner_net: -1.25,
    source_authority: 'platform_statement' as const,
    evidence_ref: 'ev-aug',
    evidence_note: 'august negative net',
    component_reconciliation_status: 'partial' as const,
    gross_accommodation: 4,
  },
]

const input = {
  entityId: ENTITY,
  propertyId: PROPERTY,
  periodFrom: '2026-06-01',
  periodTo: '2026-08-31',
  version: 1,
  supersedesId: null,
  totalOwnerNet: 8.85,
  reason: 'alpha monthly',
  evidenceRef: 'ev-alpha',
  idempotencyKey: 'k-alpha',
  lines,
}

describe('str monthly settlement migration guards', () => {
  test('creates the generic certification layer and staff apply RPC', () => {
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS finance\.str_monthly_settlement_certifications/)
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS finance\.str_monthly_settlement_lines/)
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS finance\.str_monthly_settlement_audit/)
    expect(ddl).toMatch(/CREATE OR REPLACE FUNCTION public\.apply_str_monthly_settlement_certification/)
    expect(ddl).toMatch(/CREATE OR REPLACE FUNCTION public\.void_str_monthly_settlement_certification/)
    expect(ddl).toMatch(/CREATE OR REPLACE FUNCTION finance\.read_certified_str_monthly_settlement/)
    expect(ddl).toMatch(/CREATE OR REPLACE FUNCTION public\.read_certified_str_monthly_settlement/)
    expect(ddl).toMatch(/property_definitions\(property_id\)/)
    expect(ddl).toMatch(/SECURITY DEFINER\s+SET search_path TO ''/)
    expect(ddl).toMatch(/public\.require_jj_staff\(ARRAY\['ceo', 'finance_admin'\]\)/)
    expect(ddl).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(ddl).toMatch(/FORCE ROW LEVEL SECURITY/)
    expect(ddl).toMatch(/GRANT EXECUTE ON FUNCTION public\.read_certified_str_monthly_settlement[\s\S]*TO service_role/)
    expect(ddl).not.toMatch(/INSERT INTO public\.transactions/i)
    expect(ddl).not.toMatch(/UPDATE\s+public\.transactions/i)
    expect(ddl).not.toMatch(/DELETE\s+FROM\s+public\.transactions/i)
    expect(ddl).not.toMatch(/\bpms\./)
    expect(ddl).not.toMatch(/CREATE OR REPLACE VIEW public\.v_certified_ledger_transactions/)
    expect(ddl).not.toMatch(/CREATE OR REPLACE VIEW public\.v_cashbox_audit/)
  })

  test('sorts immediately after the owner-level obligation migration', () => {
    const files = readdirSync(join(process.cwd(), 'supabase', 'migrations'))
      .filter((name) => /^\d{14}_.+\.sql$/.test(name))
      .sort()
    const versions = files.map((name) => name.slice(0, 14))
    expect(new Set(versions).size).toBe(versions.length)
    expect(files.some((name) => name.startsWith('20260923140000'))).toBe(false)
    const index = files.indexOf(MIGRATION)
    expect(index).toBeGreaterThan(0)
    expect(files[index - 1]).toBe(PREVIOUS_MIGRATION)
  })

  test('runtime SQL and application constants stay generic', () => {
    for (const token of FORBIDDEN) {
      expect(ddl.includes(token)).toBe(false)
    }
    for (const rel of APP_FILES) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8')
      for (const token of FORBIDDEN) {
        expect(src.includes(token)).toBe(false)
      }
      expect(src).not.toMatch(/INSERT INTO public\.transactions/i)
    }
  })
})

describe('str monthly reporting contract', () => {
  test('null counts display as unavailable and zero stays zero', () => {
    expect(formatStrMonthlyCount(null)).toBe('לא זמין')
    expect(formatStrMonthlyCount(0)).toBe('0')
  })

  test('partial reconciliation does not show a component formula', () => {
    expect(strMonthlyReportMayShowComponentFormula('partial', true)).toBe(false)
    expect(strMonthlyReportMayShowComponentFormula('certified_total_only', true)).toBe(false)
    expect(strMonthlyReportMayShowComponentFormula('complete', false)).toBe(false)
    expect(strMonthlyReportMayShowComponentFormula('complete', true)).toBe(true)
  })

  test('missing certification is unavailable and does not invent zero', () => {
    const parsed = parseCertifiedStrMonthlySettlement(
      { unavailable: true, reason: 'no_applied_certification' },
      { entityId: ENTITY, propertyId: PROPERTY, periodFrom: '2026-06-01', periodTo: '2026-08-31' },
    )
    expect(parsed.unavailable).toBe(true)
    if (!parsed.unavailable) throw new Error('expected unavailable')
    expect(parsed.reason).toBe('no_applied_certification')
    expect(JSON.stringify(parsed)).not.toMatch(/"totalOwnerNet":0/)
  })

  test('applied months keep null counts and do not add the credit to closing', () => {
    const parsed = parseCertifiedStrMonthlySettlement(
      {
        unavailable: false,
        certification_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        entity_id: ENTITY,
        property_id: PROPERTY,
        period_from: '2026-06-01',
        period_to: '2026-08-31',
        version: 1,
        total_owner_net: 8.85,
        months: [
          {
            month: '2026-06-01',
            reservation_count: 2,
            nights: 5,
            owner_net: 10.1,
            source_authority: 'approved_reconstruction',
            evidence_note: 'june',
            component_reconciliation_status: 'partial',
          },
          {
            month: '2026-07-01',
            reservation_count: null,
            nights: null,
            owner_net: 0,
            source_authority: 'owner_statement',
            evidence_note: 'july',
            component_reconciliation_status: 'certified_total_only',
          },
          {
            month: '2026-08-01',
            reservation_count: 1,
            nights: 3,
            owner_net: -1.25,
            source_authority: 'platform_statement',
            evidence_note: 'august',
            component_reconciliation_status: 'partial',
            components: { gross_accommodation: 4 },
          },
        ],
        reconciliation: {
          monthly_sum: 8.85,
          certified_total: 8.85,
          difference: 0,
          status: 'exact',
        },
      },
      { entityId: ENTITY, propertyId: PROPERTY, periodFrom: '2026-06-01', periodTo: '2026-08-31' },
    )
    expect(parsed.unavailable).toBe(false)
    if (parsed.unavailable) throw new Error('expected available')
    expect(parsed.months[1].reservationCount).toBeNull()
    expect(parsed.months[1].reservationCountLabel).toBe('לא זמין')
    expect(parsed.months[0].showComponentFormula).toBe(false)
    expect(parsed.addsToCertifiedClosing).toBe(false)
    expect(parsed.settlementRole).toBe('explanatory_str_credit')
    expect(parsed.reconciliation.difference).toBe(0)
  })
})

describe('str monthly settlement actions', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockRpc.mockReset()
    mockAuth.mockResolvedValue({ ok: true, userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', staffRole: 'ceo' })
    mockRpc.mockResolvedValue({
      data: { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', status: 'applied', replay: false, inserted_count: 3 },
      error: null,
    })
  })

  test('ceo apply sends the public RPC and keeps null counts null', async () => {
    const result = await applyStrMonthlySettlementCertificationAction(input)
    expect(result.ok).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith(
      'apply_str_monthly_settlement_certification',
      expect.objectContaining({
        p_entity_id: ENTITY,
        p_property_id: PROPERTY,
        p_total_owner_net: 8.85,
        p_lines: lines,
      }),
    )
    const sent = mockRpc.mock.calls[0][1].p_lines[1]
    expect(sent.reservation_count).toBeUndefined()
    expect(sent.owner_net).toBe(0)
  })

  test('operations cannot apply', async () => {
    mockAuth.mockResolvedValue({ ok: true, userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', staffRole: 'operations' })
    const result = await applyStrMonthlySettlementCertificationAction(input)
    expect(result.ok).toBe(false)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  test('sum mismatch is rejected before the RPC', async () => {
    const result = await applyStrMonthlySettlementCertificationAction({ ...input, totalOwnerNet: 9 })
    expect(result.ok).toBe(false)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  test('void uses the audited public RPC', async () => {
    mockRpc.mockResolvedValue({
      data: { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', status: 'void', replay: false, inserted_count: 0 },
      error: null,
    })
    const result = await voidStrMonthlySettlementCertificationAction(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'withdrawn',
      'ev-void',
    )
    expect(result.ok).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('void_str_monthly_settlement_certification', {
      p_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      p_reason: 'withdrawn',
      p_evidence_ref: 'ev-void',
    })
  })

  test('service role is not a staff bypass', () => {
    expect(() =>
      assertStrMonthlySettlementRpcAuthorized({ jwtRole: 'service_role', staffRole: 'ceo' }),
    ).toThrow(UnauthorizedStrMonthlySettlementError)
  })
})
