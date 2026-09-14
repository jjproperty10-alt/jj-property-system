/**
 * Presentation-only helpers for the Avi partner report.
 * No settlement math — labels, date masks, and privacy shaping only.
 */

/** Known Avi funding rows → partner-facing purpose (EN/HE). */
const AVI_PAYMENT_PURPOSE_BY_ID: Readonly<
  Record<string, { en: string; he: string }>
> = Object.freeze({
  // €50,000 — 16 June 2024
  '372cf021-f659-480a-8647-98a84e718d67': {
    en: 'Purchase funding',
    he: 'מימון רכישה',
  },
  // €200,000 — 10 October 2024
  '1cc117ba-94c7-463b-8e72-f9d021613ac5': {
    en: 'Purchase funding',
    he: 'מימון רכישה',
  },
  // €5,600 — 16 November 2024
  'b71e4098-39fb-4562-a0b4-1d8db9fbdfd1': {
    en: 'Purchase-expense funding',
    he: 'מימון הוצאות רכישה',
  },
  // €5,000 — 16 November 2024
  'c51df847-5275-47b2-b104-1a57aea0c293': {
    en: 'Renovation funding',
    he: 'מימון שיפוץ',
  },
  // €20,000 — 10 July 2025
  '3afd3b3f-b6de-4e6e-8476-2b07bbd09ea7': {
    en: 'Renovation funding',
    he: 'מימון שיפוץ',
  },
})

/** Partner display names for Hebrew presentation only — IDs stay canonical. */
const PARTNER_DISPLAY_HE: Readonly<Record<string, string>> = Object.freeze({
  Avi: 'אבי',
  Yossi: 'יוסי',
  Jacob: 'יעקב',
  Yaakov: 'יעקב',
})

export function aviPartnerDisplayName(partner: string, lang: 'en' | 'he'): string {
  if (lang !== 'he') return partner
  return PARTNER_DISPLAY_HE[partner] ?? partner
}

const RENOVATION_CATEGORY_LABEL: Readonly<
  Record<string, { en: string; he: string }>
> = Object.freeze({
  Workers: { en: 'Workers', he: 'עובדים' },
  Materials: { en: 'Materials', he: 'חומרים' },
  Contractors: { en: 'Contractors', he: 'קבלנים' },
  Furniture: { en: 'Furniture', he: 'ריהוט' },
  'Electrical Appliances': { en: 'Electrical appliances', he: 'מכשירי חשמל' },
  Alouminiom: { en: 'Aluminium', he: 'אלומיניום' },
  'Pool Service': { en: 'Pool service', he: 'שירות בריכה' },
  Plumber: { en: 'Plumber', he: 'אינסטלטור' },
})

export function aviPaymentPurpose(
  paymentId: string,
  lang: 'en' | 'he',
  fallback: string,
): string {
  const mapped = AVI_PAYMENT_PURPOSE_BY_ID[paymentId]
  if (!mapped) return fallback
  return lang === 'he' ? mapped.he : mapped.en
}

export function aviRenovationCategoryLabel(
  subcategory: string,
  lang: 'en' | 'he',
): string {
  const mapped = RENOVATION_CATEGORY_LABEL[subcategory]
  if (!mapped) return subcategory
  return lang === 'he' ? mapped.he : mapped.en
}

/** Expenses: month + year only (never a day). Accepts YYYY-MM or YYYY-MM-DD. */
export function aviExpensePeriodKey(dateOrMonth: string): string {
  if (/^\d{4}-\d{2}$/.test(dateOrMonth)) return dateOrMonth
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOrMonth)) return dateOrMonth.slice(0, 7)
  return dateOrMonth
}

export type AviAppendixExpenseRow = {
  readonly period: string
  readonly descriptionEn: string
  readonly descriptionHe: string
  readonly propertyAmountEur: number
  readonly aviShareEur: number
  readonly layer: string
}

/** Partner-safe appendix rows — no payer/payee/ids/notes/status. */
export function toAviAppendixExpenseRows(
  expenses: readonly {
    readonly date: string
    readonly amountEur: number | null
    readonly aviShareEur: number | null
    readonly category: string | null
    readonly subcategory: string | null
    readonly layer: string
  }[],
): readonly AviAppendixExpenseRow[] {
  return expenses.map((e) => ({
    period: aviExpensePeriodKey(e.date),
    descriptionEn: e.subcategory
      ? `${e.category ?? 'Expense'} — ${e.subcategory}`
      : (e.category ?? 'Expense'),
    descriptionHe: e.subcategory
      ? `${e.category ?? 'הוצאה'} — ${e.subcategory}`
      : (e.category ?? 'הוצאה'),
    propertyAmountEur: e.amountEur ?? 0,
    aviShareEur: e.aviShareEur ?? 0,
    layer: e.layer,
  }))
}

/** Strings that must never appear in the partner-facing certified report body. */
export const AVI_PARTNER_FORBIDDEN_MARKERS = [
  '380.50',
  '18,900.84',
  '190.35',
  '380.70',
  '400,000',
  '400000',
  '47817104',
  'localhost',
  '127.0.0.1',
  'Preview',
  'fixture',
  '46340130',
  'Tomer Niazof',
] as const

/** Map DTO layer labels to partner-facing EN/HE (presentation only). */
export function aviLayerLabel(
  key: string,
  fallback: string,
  lang: 'en' | 'he',
): string {
  const byKey: Record<string, { en: string; he: string }> = {
    acquisition: { en: 'Acquisition', he: 'רכישה' },
    deal_expense: { en: 'Acquisition / Deal expenses', he: 'הוצאות רכישה / עסקה' },
    renovation: { en: 'Renovation', he: 'שיפוץ' },
    airbnb: { en: 'Airbnb', he: 'Airbnb' },
    management: { en: 'Management', he: 'ניהול' },
  }
  const mapped = byKey[key]
  if (!mapped) return fallback
  return lang === 'he' ? mapped.he : mapped.en
}

import type { ExternalPartnerAviReport } from '@/lib/partner-settlement/external-partner/externalPartnerAviReportTypes'

/**
 * Strip guest names / reservation IDs from the client-bound report payload.
 * Totals and stay counts are unchanged. Presentation-only — no settlement math.
 */
export function sanitizeAviReportClientPayload(
  report: ExternalPartnerAviReport,
): ExternalPartnerAviReport {
  if (report.status !== 'certified') return report
  const redactStay = <T extends { reservationId: string }>(stay: T, monthKey: string, i: number): T => ({
    ...stay,
    reservationId: `stay-${monthKey}-${i + 1}`,
  })
  const airbnbCredits = report.airbnbCredits
    ? {
        ...report.airbnbCredits,
        ...(report.airbnbCredits.certifiedDirectStay
          ? {
              certifiedDirectStay: {
                ...report.airbnbCredits.certifiedDirectStay,
                reservationId: '',
                guestName: '',
                source: 'Hostaway printed Net Owner Payout (aggregated)',
              },
            }
          : {}),
      }
    : report.airbnbCredits
  const hostawayIncome = report.hostawayIncome
    ? {
        ...report.hostawayIncome,
        stays: (report.hostawayIncome.stays ?? []).map((stay, i) =>
          redactStay(stay, stay.checkIn.slice(0, 7), i),
        ),
        excluded: (report.hostawayIncome.excluded ?? []).map((row) => ({
          ...row,
          reservationId: '',
        })),
      }
    : report.hostawayIncome
  const monthly = report.monthly
    ? {
        ...report.monthly,
        rows: (report.monthly.rows ?? []).map((row) => ({
          ...row,
          stays: (row.stays ?? []).map((stay, i) => redactStay(stay, row.month, i)),
        })),
      }
    : report.monthly
  return {
    ...report,
    airbnbCredits,
    hostawayIncome,
    monthly,
  }
}
