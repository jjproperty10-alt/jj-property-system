/**
 * Generic client-report presentation: direction phrases, months, categories.
 * The client display name is an input. Amounts are not stored here.
 */

import type { ClosingDirection } from './types'

export const UNDATED_LABEL = 'לפי התאמה מאושרת'

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

const ENGLISH_MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

export function roundEur(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function sameMoney(a: number, b: number): boolean {
  return Math.abs(roundEur(a) - roundEur(b)) < 0.001
}

export function directionOf(dueToJj: number): ClosingDirection {
  if (Math.abs(dueToJj) < 0.005) return 'settled'
  return dueToJj > 0 ? 'client_owes_jj' : 'jj_owes_client'
}

export function heroDirectionText(clientName: string, direction: ClosingDirection): string {
  if (direction === 'client_owes_jj') return `${clientName} חייב ל־JJ.`
  if (direction === 'jj_owes_client') return `לזכות ${clientName}.`
  return 'החשבון סגור.'
}

export function balanceDirectionText(clientName: string, direction: ClosingDirection): string {
  if (direction === 'client_owes_jj') return 'לתשלום ל־JJ.'
  if (direction === 'jj_owes_client') return `לזכות ${clientName}.`
  return 'נסגר.'
}

export function directionColor(direction: ClosingDirection): 'red' | 'green' | 'gray' {
  if (direction === 'client_owes_jj') return 'red'
  if (direction === 'jj_owes_client') return 'green'
  return 'gray'
}

export function hebrewMonth(year: number, monthIndex0: number): string {
  return `${HEBREW_MONTHS[monthIndex0]} ${year}`
}

export function monthFromIsoDate(iso: string): string {
  const [year, month] = iso.slice(0, 10).split('-').map(Number)
  if (!year || !month) return UNDATED_LABEL
  return hebrewMonth(year, month - 1)
}

export function monthLabelForRow(date: string | null, description: string | null): string {
  if (!date) return UNDATED_LABEL
  const named = (description || '').trim().toLowerCase()
  const idx = ENGLISH_MONTHS.findIndex((m) => named === m || named.startsWith(`${m} `))
  if (idx >= 0) {
    const [yearText, monthText] = date.slice(0, 10).split('-')
    const year = Number(yearText)
    const payMonth = Number(monthText) - 1
    const namedYear = idx > payMonth ? year - 1 : year
    return hebrewMonth(namedYear, idx)
  }
  return monthFromIsoDate(date)
}

const SUBCATEGORY_LABEL: Record<string, string> = {
  'Tenant Payment': 'שכירות',
  'Bank Payment to Owner': 'תשלום לבעלים',
  'Management Fee': 'דמי ניהול',
  Cleaning: 'ניקיון',
  'Electricity bill': 'חשבון חשמל',
  Electricity: 'חשבון חשמל',
  Water: 'חשבון מים',
  'Water bill': 'חשבון מים',
  'Key Duplication': 'שכפול מפתח',
  'Lock Replacement': 'החלפת מנעול',
  Plumber: 'תיקון אינסטלציה',
  'Electrical Appliances': 'מוצרי חשמל וציוד',
  Kitchen: 'עבודות מטבח',
  Curtains: 'וילונות',
  Repairs: 'תיקון',
  'Client Payment': 'תשלום על חשבון הרכישה',
  'Third-Party Payment': 'תשלום על חשבון הרכישה',
  'Client Sale Expenses': 'הוצאות נלוות לרכישה',
  'Sale Contract': 'מחיר הרכישה',
  'Renovation Contract': 'חוזה שיפוץ',
  Extras: 'תוספת שיפוץ',
  'Design Fee': 'הכנת הנכס להשכרה',
  Design: 'עיצוב',
  'Consumable Supplies': 'ציוד מתכלה',
  'Bedding/Pillows/Blankets': 'מצעים ומגבות',
  'Airbnb Equipment': 'ציוד לנכס',
  Internet: 'אינטרנט',
  Furniture: 'ריהוט',
  'Guest Supplies': 'ציוד אירוח',
  'Guest Service Expenses': 'שירותי אירוח',
  'Software/Hostaway': 'תוכנת ניהול הזמנות',
  'Property insurance': 'ביטוח הנכס',
  Wine: 'אירוח',
  HOA: 'ועד בית',
  'Staff Accommodation Rent': 'התאמת שכירות',
  Workers: 'עבודת שיפוץ',
  Materials: 'חומרי שיפוץ',
  Contractors: 'קבלן שיפוץ',
}

const INTERNAL_WORD = /\b(yossi|jacob|yaacov|anastasia|david|yasin|fabi|shifra|rc3|fifo|uuid)\b|יעקוב|יעקב|יוסי|אנסטסיה|דיויד|יסין/i

export function clientDescription(subcategory: string | null, description: string | null): string {
  const raw = (description || '').trim()
  const hebrew = /[\u0590-\u05FF]/.test(raw)
  if (hebrew && raw.length > 0 && raw.length <= 80 && !INTERNAL_WORD.test(raw)) return raw
  if (subcategory && SUBCATEGORY_LABEL[subcategory]) return SUBCATEGORY_LABEL[subcategory]
  return 'חיוב מאושר'
}
