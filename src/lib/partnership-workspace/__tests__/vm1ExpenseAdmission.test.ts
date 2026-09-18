import * as fs from 'fs'
import * as path from 'path'
import {
  admitVm1ApprovedFutureDraftExpense,
  VM1_APPROVED_FUTURE_DRAFT_EXPENSE_TRANSACTION_ID,
  VM1_EXPENSE_ADMISSION_REASON,
} from '../vm1ExpenseAdmission'
import { admitVm1DraftReservations } from '../vm1DraftAdmission'
import { VM1_CANONICAL_PROPERTY_ID, VM1_HOSTAWAY_LISTING_ID, VM1_LEGACY_LEDGER_PROPERTY_ID } from '../vm1Identity'
import type { Vm1ReservationRow } from '../vm1IdentityAdapter'

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

function live(overrides: Record<string, unknown> = {}) {
  return { ...LIVE_ROW, ...overrides }
}

describe('admitVm1ApprovedFutureDraftExpense', () => {
  it('approves the exact live-shape Production row', () => {
    const line = admitVm1ApprovedFutureDraftExpense([live()])
    expect(line.admissionState).toBe('approved_future_draft_expense')
    expect(line.date).toBe('2026-09-06')
    expect(line.category).toBe('Airbnb')
    expect(line.subcategory).toBe('Internet')
    expect(line.partnershipChargeEur).toBe(30)
    expect(line.jjActualCostEur).toBe(30)
    expect(line.jjOperatingProfitEur).toBe(0)
    expect(line.reason).toBe(VM1_EXPENSE_ADMISSION_REASON.approved)
  })

  it('uses amount_eur as partnership charge when client_charge is null, with zero margin', () => {
    const line = admitVm1ApprovedFutureDraftExpense([live({ amount_eur: 30, client_charge: null })])
    expect(line.admissionState).toBe('approved_future_draft_expense')
    expect(line.partnershipChargeEur).toBe(30)
    expect(line.jjActualCostEur).toBe(30)
    expect(line.jjOperatingProfitEur).toBe(0)
  })

  it('uses client_charge as partnership charge and the difference as operating profit', () => {
    const line = admitVm1ApprovedFutureDraftExpense([live({ amount_eur: 30, client_charge: 42 })])
    expect(line.admissionState).toBe('approved_future_draft_expense')
    expect(line.partnershipChargeEur).toBe(42)
    expect(line.jjActualCostEur).toBe(30)
    expect(line.jjOperatingProfitEur).toBe(12)
  })

  it('blocks a missing row', () => {
    const line = admitVm1ApprovedFutureDraftExpense([])
    expect(line.admissionState).toBe('blocked')
    expect(line.partnershipChargeEur).toBeNull()
    expect(line.jjActualCostEur).toBeNull()
    expect(line.jjOperatingProfitEur).toBeNull()
    expect(line.reason).toBe(VM1_EXPENSE_ADMISSION_REASON.rowCount)
  })

  it('blocks a multi-row response', () => {
    const line = admitVm1ApprovedFutureDraftExpense([live(), live()])
    expect(line.admissionState).toBe('blocked')
    expect(line.reason).toBe(VM1_EXPENSE_ADMISSION_REASON.rowCount)
    expect(line.partnershipChargeEur).toBeNull()
  })

  it('blocks the wrong transaction ID', () => {
    const line = admitVm1ApprovedFutureDraftExpense([live({ id: '00000000-0000-0000-0000-000000000001' })])
    expect(line.admissionState).toBe('blocked')
    expect(line.reason).toBe(VM1_EXPENSE_ADMISSION_REASON.transactionId)
  })

  it('blocks the wrong property_id', () => {
    const line = admitVm1ApprovedFutureDraftExpense([
      live({ property_id: '2959c273-fc9f-40af-9659-347f52e7587f' }),
    ])
    expect(line.admissionState).toBe('blocked')
    expect(line.reason).toBe(VM1_EXPENSE_ADMISSION_REASON.propertyId)
  })

  it('blocks the canonical UUID in place of the legacy ledger UUID', () => {
    const line = admitVm1ApprovedFutureDraftExpense([live({ property_id: VM1_CANONICAL_PROPERTY_ID })])
    expect(line.admissionState).toBe('blocked')
    expect(line.reason).toBe(VM1_EXPENSE_ADMISSION_REASON.canonicalPropertyId)
  })

  it('blocks the wrong date, category, or subcategory', () => {
    expect(admitVm1ApprovedFutureDraftExpense([live({ date: '2026-09-07' })]).reason).toBe(
      VM1_EXPENSE_ADMISSION_REASON.date,
    )
    expect(admitVm1ApprovedFutureDraftExpense([live({ category: 'Management' })]).reason).toBe(
      VM1_EXPENSE_ADMISSION_REASON.category,
    )
    expect(admitVm1ApprovedFutureDraftExpense([live({ subcategory: 'Cleaning' })]).reason).toBe(
      VM1_EXPENSE_ADMISSION_REASON.subcategory,
    )
  })

  it('blocks inactive or deleted rows', () => {
    expect(admitVm1ApprovedFutureDraftExpense([live({ review_status: 'excluded' })]).reason).toBe(
      VM1_EXPENSE_ADMISSION_REASON.reviewStatus,
    )
    expect(admitVm1ApprovedFutureDraftExpense([live({ is_deleted: true })]).reason).toBe(
      VM1_EXPENSE_ADMISSION_REASON.deleted,
    )
  })

  it('blocks null, negative, NaN, and Infinity amount_eur', () => {
    expect(admitVm1ApprovedFutureDraftExpense([live({ amount_eur: null })]).reason).toBe(
      VM1_EXPENSE_ADMISSION_REASON.amount,
    )
    expect(admitVm1ApprovedFutureDraftExpense([live({ amount_eur: -30 })]).reason).toBe(
      VM1_EXPENSE_ADMISSION_REASON.amount,
    )
    expect(admitVm1ApprovedFutureDraftExpense([live({ amount_eur: Number.NaN })]).reason).toBe(
      VM1_EXPENSE_ADMISSION_REASON.amount,
    )
    expect(admitVm1ApprovedFutureDraftExpense([live({ amount_eur: Number.POSITIVE_INFINITY })]).reason).toBe(
      VM1_EXPENSE_ADMISSION_REASON.amount,
    )
  })

  it('blocks invalid client_charge', () => {
    expect(admitVm1ApprovedFutureDraftExpense([live({ client_charge: -1 })]).reason).toBe(
      VM1_EXPENSE_ADMISSION_REASON.clientCharge,
    )
    expect(admitVm1ApprovedFutureDraftExpense([live({ client_charge: Number.NaN })]).reason).toBe(
      VM1_EXPENSE_ADMISSION_REASON.clientCharge,
    )
    expect(admitVm1ApprovedFutureDraftExpense([live({ client_charge: Number.POSITIVE_INFINITY })]).reason).toBe(
      VM1_EXPENSE_ADMISSION_REASON.clientCharge,
    )
  })

  it('blocks when computed charge, cost, or profit is not finite', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/lib/partnership-workspace/vm1ExpenseAdmission.ts'), 'utf8')
    expect(src).toContain('Number.isFinite(partnershipChargeEur)')
    expect(src).toContain('Number.isFinite(jjActualCostEur)')
    expect(src).toContain('Number.isFinite(jjOperatingProfitEur)')
    expect(src).toContain('VM1_EXPENSE_ADMISSION_REASON.computedAmounts')
    expect(src).not.toContain('Math.min')
    expect(src).not.toContain('Math.max')
    expect(src).not.toContain('clamp')
  })

  it('does not fall back to a property name and does not select payer or payee', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/lib/partnership-workspace/vm1ExpenseAdmission.ts'), 'utf8')
    expect(src).not.toContain('property_name')
    expect(src).not.toContain('payer')
    expect(src).not.toContain('payee')
    expect(src).not.toContain('pms_resolve_mapping')
  })

  it('does not allocate partner shares or opening carry-forward', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/lib/partnership-workspace/vm1ExpenseAdmission.ts'), 'utf8')
    expect(src).not.toContain('50%')
    expect(src).not.toContain('25%')
    expect(src).not.toContain('Avi €15')
    expect(src).not.toContain('7.50')
    expect(src).not.toContain('594.25')
    const line = admitVm1ApprovedFutureDraftExpense([live()])
    expect(JSON.stringify(line)).not.toContain('594.25')
    expect(line.partnershipChargeEur).not.toBe(15)
    expect(line.partnershipChargeEur).not.toBe(7.5)
  })

  it('does not change revenue Draft admission', () => {
    const reservation: Vm1ReservationRow = {
      externalId: '65733679',
      listingId: VM1_HOSTAWAY_LISTING_ID,
      channel: 'airbnb',
      status: 'confirmed',
      checkIn: '2026-09-03',
      checkOut: '2026-09-06',
      nights: 3,
      totalPrice: 1005.9,
      cleaningFee: 150,
      hostServiceFee: 155.91,
      expectedPayout: 849.99,
      taxAmount: 0,
      paymentStatus: 'Paid',
      cancellationDate: null,
      disposition: 'operational_candidate',
      reason: 'Confirmed stay with check-in on or after the new-period start.',
    }
    admitVm1ApprovedFutureDraftExpense([live()])
    const revenue = admitVm1DraftReservations([reservation], {
      asOfIso: '2026-09-18',
      certifiedReservationIds: new Set(['53139113']),
    })
    expect(revenue.ok).toBe(true)
    if (!revenue.ok) return
    expect(revenue.lines.every((l) => l.admittedCandidate === false)).toBe(true)
    expect(revenue.lines[0].admissionState).toBe('completed_pending_authoritative_evidence')
  })

  it('does not mention VM2, Oren, or Neer', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/lib/partnership-workspace/vm1ExpenseAdmission.ts'), 'utf8')
    expect(src).not.toMatch(/VM2|Oren|Neer/i)
  })
})
