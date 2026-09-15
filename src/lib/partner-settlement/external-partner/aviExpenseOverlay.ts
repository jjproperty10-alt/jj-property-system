/**
 * @module partner-settlement/external-partner/aviExpenseOverlay
 * @description Approved Avi-report presentation overlay. Does not write Production.
 *
 * Closed decisions (Yossi) encoded here until ledger rows exist:
 * - Gardener 2025-12-05 €280 is Airbnb Garden Maintenance (Avi €140), not hidden pool cash.
 * - Markup stay 4c40f610 €450 is Airbnb Pool Equipment, not a monthly Pool Service invoice.
 * - Pool vendor payments never charge Avi again (including Management €480 on 2026-03-14).
 * - Internet 2026-08-10 €30 and Electricity 2026-08-11 €181.79 are Airbnb, not Management.
 * - From 1 Feb 2025, monthly Pool Service is a partner charge of €120 (Avi €60)
 *   even if the vendor has not yet been paid. Jan–Sep 2026 invoices are approved
 *   business charges not yet on the Production ledger. They are not `active`
 *   ledger rows; they are `approved_business_overlay`. Dedup is by calendar
 *   month so a later Production insert is not counted twice.
 */

import type { ExternalPartnerInternalRow } from './externalPartnerReadTypes'

export const AVI_GARDENER_ID = '98ce79c4-cb44-4dc0-a807-32010d529ac1'
export const AVI_POOL_VENDOR_MANAGEMENT_ID = '00e84a59-7972-428b-bc54-7b3407c16754'
export const AVI_INTERNET_ID = '049dc8af-ea5a-4a0a-9e40-f85693866f85'
export const AVI_ELECTRICITY_ID = '71d5f307-af4e-4194-83b3-7e9413dd4028'
export const AVI_POOL_EQUIPMENT_ID = '4c40f610-c173-4027-b513-cffe12fcd288'

export const AVI_APPROVED_BUSINESS_OVERLAY = 'approved_business_overlay' as const
export const AVI_MONTHLY_POOL_CHARGE_EUR = 120
export const AVI_MONTHLY_POOL_AVI_SHARE_EUR = 60

const HIDDEN_SUPPLIER_PAYMENT_IDS: ReadonlySet<string> = new Set([
  AVI_POOL_VENDOR_MANAGEMENT_ID,
])

export const AVI_PENDING_POOL_MONTHS: readonly string[] = Object.freeze([
  '2026-01-01',
  '2026-02-01',
  '2026-03-01',
  '2026-04-01',
  '2026-05-01',
  '2026-06-01',
  '2026-07-01',
  '2026-08-01',
  '2026-09-01',
])

export function pendingPoolInvoiceId(isoDate: string): string {
  return `pending-ledger:pool-${isoDate.slice(0, 7)}`
}

export function poolInvoiceMonthKey(isoDate: string): string {
  return isoDate.slice(0, 7)
}

function hasPositiveClientCharge(clientCharge: number | null | undefined): boolean {
  return clientCharge != null && Number.isFinite(clientCharge) && clientCharge > 0
}

function isAirbnbPoolCashExecution(row: ExternalPartnerInternalRow): boolean {
  if ((row.category ?? '').trim() !== 'Airbnb') return false
  if ((row.subcategory ?? '').trim() !== 'Pool Service') return false
  const amount = row.amountEur ?? 0
  return amount > 0 && !hasPositiveClientCharge(row.clientCharge)
}

/**
 * Monthly Airbnb Pool Service partner invoice (€120), including overlay rows
 * and later Production billing-only rows for the same calendar month.
 * Cash paid to the vendor and marked-up stay charges (e.g. €450) are not this invoice.
 */
export function isApprovedMonthlyAirbnbPoolInvoice(row: ExternalPartnerInternalRow): boolean {
  if ((row.category ?? '').trim() !== 'Airbnb') return false
  if ((row.subcategory ?? '').trim() !== 'Pool Service') return false
  if (row.overlayKind === AVI_APPROVED_BUSINESS_OVERLAY) return true
  if (row.id.startsWith('pending-ledger:pool-')) return true
  if (isAirbnbPoolCashExecution(row)) return false
  if (!hasPositiveClientCharge(row.clientCharge)) return false
  return Math.abs((row.clientCharge as number) - AVI_MONTHLY_POOL_CHARGE_EUR) < 0.005
}

function pendingPoolRow(isoDate: string): ExternalPartnerInternalRow {
  return {
    visibility: 'internal',
    id: pendingPoolInvoiceId(isoDate),
    date: isoDate,
    propertyName: 'Villa Mazotos',
    category: 'Airbnb',
    subcategory: 'Pool Service',
    description: null,
    payer: null,
    rawPayer: null,
    attributedPayer: null,
    attributionSource: null,
    payee: null,
    amountEur: 0,
    clientCharge: AVI_MONTHLY_POOL_CHARGE_EUR,
    notes: null,
    kNote: null,
    isDeleted: false,
    reviewStatus: AVI_APPROVED_BUSINESS_OVERLAY,
    aviControl: null,
    overlayKind: AVI_APPROVED_BUSINESS_OVERLAY,
  }
}

function recodeRow(row: ExternalPartnerInternalRow): ExternalPartnerInternalRow | null {
  if (HIDDEN_SUPPLIER_PAYMENT_IDS.has(row.id)) return null
  if (row.id === AVI_GARDENER_ID) {
    return {
      ...row,
      category: 'Airbnb',
      subcategory: 'Garden Maintenance',
    }
  }
  if (row.id === AVI_POOL_EQUIPMENT_ID) {
    return {
      ...row,
      category: 'Airbnb',
      subcategory: 'Pool Equipment',
    }
  }
  if (row.id === AVI_INTERNET_ID || row.id === AVI_ELECTRICITY_ID) {
    return {
      ...row,
      category: 'Airbnb',
    }
  }
  return row
}

/**
 * Presentation overlay for the Avi report. Pure. No database writes.
 */
export function applyAviApprovedExpenseOverlay(
  rows: readonly ExternalPartnerInternalRow[],
): ExternalPartnerInternalRow[] {
  const out: ExternalPartnerInternalRow[] = []
  const coveredMonths = new Set<string>()
  for (const row of rows) {
    const next = recodeRow(row)
    if (next === null) continue
    out.push(next)
    if (isApprovedMonthlyAirbnbPoolInvoice(next)) {
      coveredMonths.add(poolInvoiceMonthKey(next.date))
    }
  }
  for (const month of AVI_PENDING_POOL_MONTHS) {
    if (coveredMonths.has(poolInvoiceMonthKey(month))) continue
    out.push(pendingPoolRow(month))
  }
  return out
}
