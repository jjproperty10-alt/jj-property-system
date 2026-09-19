import {
  loadVm1ApprovedFutureDraftExpense,
  VM1_EXPENSE_LEDGER_SELECT,
  type Vm1ExpenseLedgerClient,
} from '../vm1ExpenseAdmissionService'
import {
  VM1_APPROVED_FUTURE_DRAFT_EXPENSE_TRANSACTION_ID,
  VM1_EXPENSE_ADMISSION_REASON,
} from '../vm1ExpenseAdmission'
import {
  VM1_CANONICAL_PROPERTY_ID,
  VM1_HOSTAWAY_LISTING_ID,
  VM1_LEGACY_LEDGER_PROPERTY_ID,
} from '../vm1Identity'
import type { VerifiedVm1Identity } from '../vm1IdentityAdapter'

const VM2_PROPERTIES_ID = '2959c273-fc9f-40af-9659-347f52e7587f'
const VM2_CANONICAL_ID = 'c632463a-67f9-477d-8173-cd5f88ee92ac'
const NEER_CANONICAL_ID = 'b587f463-279d-4376-bb14-38789f34cbba'
const NEER_LISTING_ID = '426237'

const VM1_VERIFIED: VerifiedVm1Identity = {
  canonicalPropertyId: VM1_CANONICAL_PROPERTY_ID,
  legacyLedgerPropertyId: VM1_LEGACY_LEDGER_PROPERTY_ID,
  hostawayListingId: VM1_HOSTAWAY_LISTING_ID,
}

const FORGED_VM2_IDENTITY: VerifiedVm1Identity = {
  canonicalPropertyId: VM2_CANONICAL_ID,
  legacyLedgerPropertyId: VM2_PROPERTIES_ID,
  hostawayListingId: NEER_LISTING_ID,
}

const NEER_IDENTITY: VerifiedVm1Identity = {
  canonicalPropertyId: NEER_CANONICAL_ID,
  legacyLedgerPropertyId: NEER_CANONICAL_ID,
  hostawayListingId: NEER_LISTING_ID,
}

const CANONICAL_AS_LEDGER: VerifiedVm1Identity = {
  canonicalPropertyId: VM1_CANONICAL_PROPERTY_ID,
  legacyLedgerPropertyId: VM1_CANONICAL_PROPERTY_ID,
  hostawayListingId: VM1_HOSTAWAY_LISTING_ID,
}

const LIVE_ROW = {
  id: VM1_APPROVED_FUTURE_DRAFT_EXPENSE_TRANSACTION_ID,
  date: '2026-09-06',
  property_id: VM1_LEGACY_LEDGER_PROPERTY_ID,
  category: 'Airbnb',
  subcategory: 'Internet',
  amount_eur: 30,
  client_charge: null,
  review_status: 'active',
  is_deleted: false,
}

function mockLedger(result: { data: unknown; error: { message: string } | null }): {
  client: Vm1ExpenseLedgerClient
  calls: Array<{ relation: string; columns: string; filters: Array<[string, string]> }>
} {
  const calls: Array<{ relation: string; columns: string; filters: Array<[string, string]> }> = []
  const client: Vm1ExpenseLedgerClient = {
    from(relation) {
      return {
        select(columns) {
          return {
            eq(column, value) {
              return {
                eq(column2, value2) {
                  calls.push({
                    relation,
                    columns,
                    filters: [
                      [column, value],
                      [column2, value2],
                    ],
                  })
                  return Promise.resolve(result)
                },
              }
            },
          }
        },
      }
    },
  }
  return { client, calls }
}

describe('loadVm1ApprovedFutureDraftExpense', () => {
  it('selects only after a verified VM1 identity, with exact id and legacy property_id', async () => {
    const { client, calls } = mockLedger({ data: [LIVE_ROW], error: null })
    const line = await loadVm1ApprovedFutureDraftExpense({
      client,
      verifiedIdentity: VM1_VERIFIED,
    })
    expect(line.admissionState).toBe('approved_future_draft_expense')
    expect(line.partnershipChargeEur).toBe(30)
    expect(line.jjActualCostEur).toBe(30)
    expect(line.jjOperatingProfitEur).toBe(0)
    expect(calls).toEqual([
      {
        relation: 'transactions',
        columns: VM1_EXPENSE_LEDGER_SELECT,
        filters: [
          ['id', VM1_APPROVED_FUTURE_DRAFT_EXPENSE_TRANSACTION_ID],
          ['property_id', VM1_LEGACY_LEDGER_PROPERTY_ID],
        ],
      },
    ])
    expect(VM1_EXPENSE_LEDGER_SELECT).toBe(
      'id,date,property_id,category,subcategory,amount_eur,client_charge,review_status,is_deleted',
    )
    expect(VM1_EXPENSE_LEDGER_SELECT).not.toContain('payer')
    expect(VM1_EXPENSE_LEDGER_SELECT).not.toContain('payee')
    expect(VM1_EXPENSE_LEDGER_SELECT).not.toContain('description')
    expect(VM1_EXPENSE_LEDGER_SELECT).not.toContain('notes')
    expect(VM1_EXPENSE_LEDGER_SELECT).not.toContain('k_note')
    expect(VM1_EXPENSE_LEDGER_SELECT).not.toContain('property_name')
    expect(VM1_EXPENSE_LEDGER_SELECT).not.toContain('guest')
  })

  it('does not SELECT for a forged VM2 identity', async () => {
    const { client, calls } = mockLedger({ data: [LIVE_ROW], error: null })
    const line = await loadVm1ApprovedFutureDraftExpense({
      client,
      verifiedIdentity: FORGED_VM2_IDENTITY,
    })
    expect(line.admissionState).toBe('blocked')
    expect(line.partnershipChargeEur).toBeNull()
    expect(line.jjActualCostEur).toBeNull()
    expect(line.jjOperatingProfitEur).toBeNull()
    expect(calls).toEqual([])
  })

  it('does not SELECT for a Neer / listing 426237 identity', async () => {
    const { client, calls } = mockLedger({ data: [LIVE_ROW], error: null })
    const line = await loadVm1ApprovedFutureDraftExpense({
      client,
      verifiedIdentity: NEER_IDENTITY,
    })
    expect(line.admissionState).toBe('blocked')
    expect(line.partnershipChargeEur).toBeNull()
    expect(calls).toEqual([])
  })

  it('does not SELECT when the canonical UUID is used as the ledger UUID', async () => {
    const { client, calls } = mockLedger({ data: [LIVE_ROW], error: null })
    const line = await loadVm1ApprovedFutureDraftExpense({
      client,
      verifiedIdentity: CANONICAL_AS_LEDGER,
    })
    expect(line.admissionState).toBe('blocked')
    expect(calls).toEqual([])
  })

  it('fails closed when the ledger client cannot SELECT', async () => {
    const line = await loadVm1ApprovedFutureDraftExpense({
      client: {},
      verifiedIdentity: VM1_VERIFIED,
    })
    expect(line.admissionState).toBe('blocked')
    expect(line.partnershipChargeEur).toBeNull()
    expect(line.reason).toBe(VM1_EXPENSE_ADMISSION_REASON.ledgerUnavailable)
  })

  it('fails closed when the SELECT errors', async () => {
    const { client } = mockLedger({ data: null, error: { message: 'permission denied' } })
    const line = await loadVm1ApprovedFutureDraftExpense({
      client,
      verifiedIdentity: VM1_VERIFIED,
    })
    expect(line.admissionState).toBe('blocked')
    expect(line.reason).toBe(VM1_EXPENSE_ADMISSION_REASON.ledgerRead)
    expect(line.jjActualCostEur).toBeNull()
  })

  it('imports server-only and gates SELECT on acceptVm1LedgerTransactionPropertyId', () => {
    const src = require('fs').readFileSync(
      require('path').join(process.cwd(), 'src/lib/partnership-workspace/vm1ExpenseAdmissionService.ts'),
      'utf8',
    )
    expect(src).toMatch(/import 'server-only'/)
    expect(src.indexOf("import 'server-only'")).toBeLessThan(src.indexOf("from './vm1ExpenseAdmission'"))
    expect(src).toContain('acceptVm1LedgerTransactionPropertyId')
    expect(src).toContain('vm1LedgerPropertyIdFilter')
    expect(src).toContain('verifiedIdentity')
    expect(src.indexOf('acceptVm1LedgerTransactionPropertyId')).toBeLessThan(src.indexOf(".from('transactions')"))
    expect(src).not.toContain('.insert')
    expect(src).not.toContain('.update')
    expect(src).not.toContain('.delete')
    expect(src).not.toContain('.upsert')
  })
})
