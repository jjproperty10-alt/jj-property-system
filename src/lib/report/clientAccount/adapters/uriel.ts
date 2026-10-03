/**
 * Uriel — full account through the universal engine.
 * Identity, scope, and approved evidence only. Amounts come from the certification.
 * Garden and Sharon credit wording are named constants pending Yossi's choice.
 * Neer stays inside this report because cert v3 includes it. That placement is pending Yossi.
 * Transaction ids are not stored here.
 */

import { toLedgerRow, type RawTransactionRow } from '../certifiedSource'
import { URIEL_GARDEN_2_LABEL, URIEL_SHARON_CREDIT_LABEL } from '../presentationTags'
import type { LedgerRow, PurchaseSupplement } from '../types'
import type { ClientReportAdapter } from './types'

const MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

const LEGACY_SOURCE_NAMES: Readonly<Record<string, readonly string[]>> = {
  'Apartment Neer Yoav Dekelia': ['Efi Dekelia'],
}

const DATED_PURCHASE = 'תשלום נוסף על חשבון קניית הנכס'
const UNDATED_PURCHASE = 'השלמת תשלום על חשבון קניית הנכס'
const UNDATED_MONTH = 'מועד לא מתועד'

function monthLabel(iso: string): string {
  const month = Number(iso.slice(5, 7))
  const name = MONTHS[month - 1]
  return name ? `${name} ${iso.slice(0, 4)}` : iso
}

function isClientPurchasePayment(row: RawTransactionRow, propertyName: string): boolean {
  return row.property_name === propertyName
    && row.category === 'Sale'
    && (row.subcategory === 'Client Payment' || row.subcategory === 'Third-Party Payment')
    && (row.payer || '').toLowerCase() === 'client'
    && !row.is_deleted
    && (row.review_status || 'active') === 'active'
}

export const urielAdapter: ClientReportAdapter = {
  clientSlug: 'uriel',
  clientDisplayName: 'אוריאל',
  reportTitle: 'סיכום חשבון לקוח',
  reportLanguage: 'he',
  reportType: 'full_account',
  asOf: '2026-08-31',
  identity: { kind: 'entity', entityId: '2944e9ad-c298-4dbf-b666-26561d934b61' },
  strMonthly: { start: '2026-06-01', end: '2026-08-31' },
  linkedRowPropertyNames: ['Efi Dekelia'],
  evidence: ({ settlement, rows, linkedRows }) => {
    const undatedChargeLabelByPropertyKey: Record<string, string> = {}
    const historicalSourceNamesByPropertyKey: Record<string, readonly string[]> = {}
    const linkedRowsByPropertyKey: Record<string, LedgerRow[]> = {}
    const purchaseSupplementsByPropertyKey: Record<string, PurchaseSupplement[]> = {}
    for (let i = 0; i < settlement.propertyLines.length; i += 1) {
      const line = settlement.propertyLines[i]
      const meta = line.metadata
      const legacy = LEGACY_SOURCE_NAMES[line.propertyName]
      if (legacy) {
        historicalSourceNamesByPropertyKey[line.propertyKey] = legacy
        const linked: LedgerRow[] = []
        for (let n = 0; n < legacy.length; n += 1) {
          const named = linkedRows[legacy[n]] || []
          for (let r = 0; r < named.length; r += 1) linked.push(toLedgerRow(named[r]))
        }
        linkedRowsByPropertyKey[line.propertyKey] = linked
      }
      if (typeof meta.garden_2 === 'string') undatedChargeLabelByPropertyKey[line.propertyKey] = URIEL_GARDEN_2_LABEL
      const accepted = typeof meta.accepted_purchase_payments === 'number' ? meta.accepted_purchase_payments : null
      if (accepted != null && typeof meta.purchase_overlay === 'string') {
        let paid = 0
        for (let r = 0; r < rows.length; r += 1) {
          const row = rows[r]
          if (isClientPurchasePayment(row, line.propertyName)) paid += Number(row.amount_eur)
        }
        const gap = Math.round((accepted - paid) * 100) / 100
        const exclusions = settlement.exclusions.filter((exclusion) => exclusion.settlementAmount <= gap)
        if (exclusions.length === 1) {
          const dated = Math.round(exclusions[0].settlementAmount * 100) / 100
          const rest = Math.round((gap - dated) * 100) / 100
          const supplements: PurchaseSupplement[] = [{
            amount: dated,
            monthLabel: monthLabel(exclusions[0].effectiveDate),
            description: DATED_PURCHASE,
          }]
          if (rest > 0.001) {
            supplements.push({ amount: rest, monthLabel: UNDATED_MONTH, description: UNDATED_PURCHASE })
          }
          purchaseSupplementsByPropertyKey[line.propertyKey] = supplements
        } else {
          purchaseSupplementsByPropertyKey[line.propertyKey] = [{
            amount: gap,
            monthLabel: UNDATED_MONTH,
            description: UNDATED_PURCHASE,
          }]
        }
      }
    }
    return {
      undatedChargeLabelByPropertyKey,
      purchaseSupplementsByPropertyKey,
      historicalSourceNamesByPropertyKey,
      linkedRowsByPropertyKey,
      creditLabels: { noncash: URIEL_SHARON_CREDIT_LABEL },
    }
  },
}
