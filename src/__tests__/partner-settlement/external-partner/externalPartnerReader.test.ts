/**
 * Commit 2A — external-partner reader + visibility split (no UI, no engine wire).
 */
import * as fs from 'fs'
import * as path from 'path'
import {
  AVI_CONTROL_CONFIRMED_DUPLICATE_IDS,
  bindLiveRowsToApprovedSnapshot,
  isAviPayerField,
  isExactExternalPartnerProperty,
  isInExternalPartnerReadScope,
  readExternalPartnerTransactionViews,
  resolvePayerIdentity,
  VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT,
} from '@/lib/partner-settlement/external-partner'
import type { RawExternalPartnerTransaction } from '@/lib/partner-settlement/external-partner'

const JACOB_1400 = '9363b7c1-c536-4e35-b3ed-98bff7c3db40'
const YOSSI_1000 = 'c2a9dff0-83f4-441b-96ca-01cb272993ff'
const AVI_PURCHASE = '1cc117ba-94c7-463b-8e72-f9d021613ac5'
const DELETED_DUPLICATE = 'ca1448db-27a6-41c8-b3bf-424f52969d88'

const SRC_FILES = [
  'src/lib/partner-settlement/external-partner/externalPartnerReadTypes.ts',
  'src/lib/partner-settlement/external-partner/externalPartnerReader.ts',
  'src/lib/partner-settlement/external-partner/externalPartnerScope.ts',
  'src/lib/partner-settlement/external-partner/externalPartnerAttribution.ts',
  'src/lib/partner-settlement/external-partner/externalPartnerSnapshot.ts',
  'src/lib/partner-settlement/external-partner/externalPartnerTransactionsSource.ts',
]

function raw(overrides: Partial<RawExternalPartnerTransaction> = {}): RawExternalPartnerTransaction {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    date: '2025-01-16',
    property_name: 'Villa Mazotos',
    category: 'Purchase',
    subcategory: 'Purchase Expenses',
    description: 'Legal fee',
    payer: 'Yossi',
    payee: 'company',
    amount_eur: 1000,
    client_charge: null,
    notes: null,
    k_note: null,
    is_deleted: false,
    review_status: 'active',
    ...overrides,
  }
}

describe('external-partner reader — property and deletion scope', () => {
  it('rejects the sister Villa Mazotos property (exact name only)', () => {
    const sister = ['Villa Mazotos', ' 2'].join('')
    expect(isExactExternalPartnerProperty(sister)).toBe(false)
    expect(isInExternalPartnerReadScope(raw({ property_name: sister }))).toBe(false)

    const views = readExternalPartnerTransactionViews([
      raw({ id: 'sister-row', property_name: sister, is_deleted: false }),
      raw({ id: JACOB_1400, payer: 'Jacob', amount_eur: 1400, review_status: 'confirmed_duplicate' }),
    ])
    expect(views.internal.rows.some((r) => r.id === 'sister-row')).toBe(false)
    expect(views.internal.rows.some((r) => r.id === JACOB_1400)).toBe(true)
  })

  it('rejects a deleted row', () => {
    const views = readExternalPartnerTransactionViews([
      raw({ id: DELETED_DUPLICATE, is_deleted: true, amount_eur: 650 }),
      raw({ id: JACOB_1400, payer: 'Jacob', amount_eur: 1400 }),
    ])
    expect(views.internal.rows.some((r) => r.id === DELETED_DUPLICATE)).toBe(false)
    expect(views.internal.rows).toHaveLength(1)
  })

  it('rejects null is_deleted (scope is is_deleted = false, not unknown)', () => {
    expect(isInExternalPartnerReadScope(raw({ is_deleted: null }))).toBe(false)
  })
})

describe('external-partner reader — Avi control confirmed_duplicate rows', () => {
  it('keeps 9363b7c1 and c2a9dff0 in Avi control despite confirmed_duplicate', () => {
    const views = readExternalPartnerTransactionViews([
      raw({
        id: JACOB_1400,
        payer: 'Jacob',
        payee: 'Yanis',
        amount_eur: 1400,
        review_status: 'confirmed_duplicate',
      }),
      raw({
        id: YOSSI_1000,
        payer: 'Yossi',
        payee: 'company',
        amount_eur: 1000,
        review_status: 'confirmed_duplicate',
      }),
    ])

    expect(AVI_CONTROL_CONFIRMED_DUPLICATE_IDS).toEqual([JACOB_1400, YOSSI_1000])
    expect(views.control.confirmedDuplicateRows.map((r) => r.id).sort()).toEqual(
      [JACOB_1400, YOSSI_1000].sort(),
    )
    expect(views.control.confirmedDuplicateRows.every((r) => r.reviewStatus === 'confirmed_duplicate')).toBe(
      true,
    )
    expect(views.control.confirmedDuplicateRows.every((r) => r.aviControl === 'confirmed_duplicate_included')).toBe(
      true,
    )
    expect(views.internal.rows).toHaveLength(2)
    expect(views.partnerVisible.expenses.map((r) => r.id).sort()).toEqual([JACOB_1400, YOSSI_1000].sort())
    expect(views.partnerVisible.payments).toHaveLength(0)
  })
})

describe('external-partner reader — payer vs partner-visible', () => {
  it('keeps Payer on internal and hides it from partner-visible when the payer is not Avi', () => {
    const views = readExternalPartnerTransactionViews([
      raw({ id: YOSSI_1000, payer: 'Yossi', notes: 'staff evidence', amount_eur: 1000 }),
    ])
    expect(views.internal.rows[0].payer).toBe('Yossi')
    expect(views.internal.rows[0].notes).toBe('staff evidence')

    const expense = views.partnerVisible.expenses[0]
    expect(expense.kind).toBe('expense')
    expect(expense).not.toHaveProperty('payer')
    expect(expense).not.toHaveProperty('notes')
    expect(expense).not.toHaveProperty('kNote')
    expect(expense).not.toHaveProperty('payee')
    expect(expense).not.toHaveProperty('description')
    const serialized = JSON.stringify(expense)
    expect(serialized).not.toContain('Yossi')
    expect(serialized).not.toContain('staff evidence')
    expect(serialized).not.toContain('Legal fee')
    expect(views.partnerVisible.payments).toHaveLength(0)
  })

  it('shows a payment of Avi as his payment', () => {
    const views = readExternalPartnerTransactionViews([
      raw({
        id: AVI_PURCHASE,
        category: 'Purchase',
        subcategory: 'Purchase Payment',
        payer: 'AVI',
        payee: 'Owner',
        amount_eur: 200000,
        notes: 'internal funding note',
      }),
    ])
    expect(views.internal.rows[0].payer).toBe('AVI')
    expect(views.partnerVisible.expenses).toHaveLength(0)
    expect(views.partnerVisible.payments).toHaveLength(1)
    expect(views.partnerVisible.payments[0]).toEqual(
      expect.objectContaining({
        kind: 'payment',
        visibility: 'partner-visible',
        id: AVI_PURCHASE,
        label: 'Partner funding',
        payer: 'Avi',
        amountEur: 200000,
      }),
    )
    expect(views.partnerVisible.payments[0]).not.toHaveProperty('notes')
    expect(views.partnerVisible.payments[0]).not.toHaveProperty('description')
    expect(views.partnerVisible.payments[0]).not.toHaveProperty('payee')
    expect(views.partnerVisible.payments[0]).not.toHaveProperty('category')
    expect(views.partnerVisible.payments[0]).not.toHaveProperty('subcategory')
    const payJson = JSON.stringify(views.partnerVisible.payments[0])
    expect(payJson).not.toContain('internal funding note')
    expect(payJson).not.toContain('Owner')
    expect(payJson).toContain('Partner funding')
  })

  it('does not treat a mapped Client row as Avi until the overlay is applied', () => {
    const views = readExternalPartnerTransactionViews([
      raw({
        id: 'c51df847-5275-47b2-b104-1a57aea0c293',
        payer: 'Client',
        notes: 'Avi renovation funding via Jacob',
        amount_eur: 5000,
      }),
    ])
    expect(isAviPayerField('Client')).toBe(false)
    expect(views.partnerVisible.payments).toHaveLength(0)
    expect(views.partnerVisible.expenses[0]).not.toHaveProperty('payer')
    expect(views.internal.rows[0].payer).toBe('Client')
    expect(views.internal.rows[0].rawPayer).toBe('Client')
    expect(views.internal.rows[0].attributedPayer).toBeNull()
  })

  it('does not treat an unmapped Client row as Avi even when Notes mention Avi', () => {
    const views = readExternalPartnerTransactionViews([
      raw({
        id: 'cc0ab3a1-33c2-41d3-8e12-82c3e5cdb7e2',
        payer: 'Client',
        notes: 'Avi held the cash',
        amount_eur: 960,
        category: 'Airbnb',
        subcategory: 'Platform Income',
      }),
    ])
    expect(views.partnerVisible.payments).toHaveLength(0)
    expect(views.internal.rows[0].payer).toBe('Client')
    expect(views.internal.rows[0].attributedPayer).toBeNull()
  })
})

describe('external-partner reader — Notes never override payer', () => {
  it('keeps Jacob as payer when Notes claim Avi paid', () => {
    const row = raw({
      id: JACOB_1400,
      payer: 'Jacob',
      notes: 'this was actually Avi',
      k_note: 'funding_source=Avi',
      description: 'Avi paid Yanis',
      amount_eur: 1400,
    })
    expect(resolvePayerIdentity(row)).toBe('Jacob')
    expect(isAviPayerField(row.payer)).toBe(false)

    const views = readExternalPartnerTransactionViews([row])
    expect(views.internal.rows[0].payer).toBe('Jacob')
    expect(views.internal.rows[0].notes).toBe('this was actually Avi')
    expect(views.partnerVisible.payments).toHaveLength(0)
    expect(views.partnerVisible.expenses[0].id).toBe(JACOB_1400)
    expect(views.partnerVisible.expenses[0]).not.toHaveProperty('payer')
    expect(views.partnerVisible.expenses[0]).not.toHaveProperty('description')
    expect(JSON.stringify(views.partnerVisible.expenses[0])).not.toContain('Avi paid Yanis')
  })
})

describe('external-partner reader — 202-row snapshot is version control', () => {
  it('does not change the approved snapshot when live rows arrive after cutoff', () => {
    const extraAfterCutoff = raw({
      id: 'post-cutoff-live-row',
      date: '2026-09-03',
      amount_eur: 99,
    })
    const binding = bindLiveRowsToApprovedSnapshot([
      raw({ id: JACOB_1400, date: '2024-11-14', amount_eur: 1400 }),
      extraAfterCutoff,
    ])

    expect(binding.snapshot).toBe(VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT)
    expect(binding.snapshot.approvedRowCount).toBe(202)
    expect(binding.snapshot.sha256).toBe(
      '0477bfc5f2285425d55af6793f9d09bf829ee62387fb5b2a42bc0958478baf97',
    )
    expect(binding.snapshot.version).toBe('vm1-classification-202-v1')
    expect(binding.snapshot.cutoffDate).toBe('2026-08-29')
    expect(binding.liveRowsInScope).toHaveLength(2)
    expect(binding.liveRowsAfterCutoff.map((r) => r.id)).toEqual(['post-cutoff-live-row'])
    expect(Object.isFrozen(VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT)).toBe(true)
    expect(VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.approvedRowCount).toBe(202)
  })
})

describe('external-partner reader — isolation of the new read files', () => {
  it('does not import Partner B ledger, RC3, or lifecycle, and does not write', () => {
    const forbiddenImports = [
      'readPartnerLedger',
      'isCertifiedLedgerRow',
      'partnerStatementService',
      'partnerLedgerEngine',
      "from '@/lib/lifecycle",
      "from '@/lib/report/",
      'v_rc3_classified',
    ]
    const mutation = /\.(insert|update|delete|upsert|rpc)\s*\(/
    const forbiddenNames = [['Si', 'ma', 'wi'].join(''), ['Mor', '\u00e1', 'n'].join('')]
    const sisterProperty = ['Villa Mazotos', ' 2'].join('')

    for (const rel of SRC_FILES) {
      const text = fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
      for (const needle of forbiddenImports) {
        expect(text.includes(needle)).toBe(false)
      }
      expect(text).not.toMatch(mutation)
      for (const needle of forbiddenNames) {
        expect(text.includes(needle)).toBe(false)
      }
      expect(text.includes(sisterProperty)).toBe(false)
    }

    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/partner-settlement/external-partner/externalPartnerTransactionsSource.ts'),
      'utf8',
    )
    expect(source).toContain('.select(')
    expect(source).toContain(".eq('property_name'")
    expect(source).toContain(".eq('is_deleted', false)")
    expect(source).toContain('review_status')
    expect(source).not.toContain(".eq('review_status'")
    expect(source).not.toContain(".neq('review_status'")
    expect(source).toContain("import 'server-only'")
  })
})
