/**
 * Generic client-report presentation: direction phrases, months, categories.
 * The client display name and report language are inputs. Amounts are not stored here.
 */

import type { ClosingDirection, DisplayLine, PropertyAccount } from './types'

export type ReportLanguage = 'he' | 'en'
export type DescriptionRole = 'general' | 'purchase-payment' | 'renovation-payment' | 'owner-transfer'
export type DateColumnEdge = 'right' | 'left'

export const UNDATED_LABEL = 'מועד לא מתועד'

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

const ENGLISH_MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

const ENGLISH_MONTH_TITLE = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

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
  Photography: 'צילום',
  Wine: 'אירוח',
  HOA: 'ועד בית',
  'Staff Accommodation Rent': 'התאמת שכירות',
  Workers: 'עבודת שיפוץ',
  Materials: 'חומרי שיפוץ',
  Contractors: 'קבלן שיפוץ',
}

const INTERNAL_WORD = /\b(yossi|jacob|yaacov|anastasia|david|yasin|fabi|shifra|faby|rc3|fifo|uuid)\b|יעקוב|יעקב|יוסי|אנסטסיה|דיויד|יסין/i
const ROUTE_WORD = /\b(atm|airbnb|arbnb|hostaway|bank|cyprus|inbaluri|jj)\b|מזומן|בנק/i
const presentationGaps: string[] = []

export function takePresentationGaps(): string[] {
  const found = presentationGaps.slice()
  presentationGaps.length = 0
  return found
}

function unproven(subcategory: string | null, raw: string): string {
  const detail = `${subcategory || 'a line'}: ${raw.slice(0, 120) || 'no description'}`
  presentationGaps.push(detail)
  return `UNPROVEN ${detail}`
}

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

export function dateColumnEdge(language: ReportLanguage): DateColumnEdge {
  return language === 'he' ? 'right' : 'left'
}

export function tableFlexDirection(language: ReportLanguage): 'row-reverse' | 'row' {
  return language === 'he' ? 'row-reverse' : 'row'
}

export function undatedLabel(language: ReportLanguage = 'he'): string {
  return language === 'en' ? 'Date not recorded' : UNDATED_LABEL
}

export function heroDirectionText(clientName: string, direction: ClosingDirection, language: ReportLanguage = 'he'): string {
  if (language === 'en') {
    if (direction === 'client_owes_jj') return `${clientName} owes JJ.`
    if (direction === 'jj_owes_client') return `Credit to ${clientName}.`
    return 'The account is closed.'
  }
  if (direction === 'client_owes_jj') return `${clientName} חייב ל־JJ.`
  if (direction === 'jj_owes_client') return `זיכוי ל${clientName}.`
  return 'החשבון סגור.'
}

export function balanceDirectionText(clientName: string, direction: ClosingDirection, language: ReportLanguage = 'he'): string {
  if (language === 'en') {
    if (direction === 'client_owes_jj') return 'Payable to JJ.'
    if (direction === 'jj_owes_client') return `Credit to ${clientName}.`
    return 'Closed.'
  }
  if (direction === 'client_owes_jj') return 'לתשלום ל־JJ.'
  if (direction === 'jj_owes_client') return `זיכוי ל${clientName}.`
  return 'נסגר.'
}

export function completedTransferText(language: ReportLanguage = 'he'): string {
  return language === 'en' ? 'Transferred to the owner' : 'הועבר לבעלים'
}

export function reducesBalanceText(language: ReportLanguage = 'he'): string {
  return language === 'en' ? 'Reduces the property balance' : 'מפחית את יתרת הנכס'
}

export function rentStatusText(
  status: 'paid' | 'paid_late' | 'partial' | 'open',
  language: ReportLanguage = 'he',
): string {
  if (language === 'en') {
    if (status === 'paid') return 'Paid'
    if (status === 'paid_late') return 'Paid late'
    if (status === 'partial') return 'Partly paid'
    return 'Open'
  }
  if (status === 'paid') return 'שולם'
  if (status === 'paid_late') return 'שולם באיחור'
  if (status === 'partial') return 'שולם חלקית'
  return 'פתוח'
}

export function directionColor(direction: ClosingDirection): 'red' | 'green' | 'gray' {
  if (direction === 'client_owes_jj') return 'red'
  if (direction === 'jj_owes_client') return 'green'
  return 'gray'
}

export function monthYearLabel(year: number, monthIndex0: number, language: ReportLanguage = 'he'): string {
  if (language === 'en') return `${ENGLISH_MONTH_TITLE[monthIndex0]} ${year}`
  return `${HEBREW_MONTHS[monthIndex0]} ${year}`
}

export function hebrewMonth(year: number, monthIndex0: number): string {
  return monthYearLabel(year, monthIndex0, 'he')
}

export function monthFromIsoDate(iso: string, language: ReportLanguage = 'he'): string {
  const [year, month] = iso.slice(0, 10).split('-').map(Number)
  if (!year || !month) return undatedLabel(language)
  return monthYearLabel(year, month - 1, language)
}

export function namedMonthIndex(description: string | null): number | null {
  const named = (description || '').trim().toLowerCase()
  const idx = ENGLISH_MONTHS.findIndex((month) => named === month || named.startsWith(`${month} `))
  return idx >= 0 ? idx : null
}

export function monthLabelForRow(date: string | null, description: string | null, language: ReportLanguage = 'he'): string {
  if (!date) return undatedLabel(language)
  const idx = namedMonthIndex(description)
  if (idx != null) {
    const [yearText, monthText] = date.slice(0, 10).split('-')
    const year = Number(yearText)
    const payMonth = Number(monthText) - 1
    const namedYear = idx > payMonth ? year - 1 : year
    return monthYearLabel(namedYear, idx, language)
  }
  return monthFromIsoDate(date, language)
}

export function purchaseClosingExplanation(
  language: ReportLanguage,
  agreed: number,
  payments: number,
  ancillary: number,
  balance: number,
): string | null {
  if (!(ancillary > 0 && sameMoney(balance, 0) && sameMoney(payments, agreed))) return null
  if (language === 'en') {
    return 'Payments on the purchase price are shown separately from the ancillary purchase costs. The ancillary costs were paid from the total receipts. The purchase price balance is closed and is not part of the property balance.'
  }
  return 'התשלומים על מחיר הקנייה מוצגים בנפרד מההוצאות הנלוות לקנייה. ההוצאות הנלוות שולמו מתוך סך התקבולים. יתרת מחיר הקנייה סגורה ואינה נכנסת ליתרת הנכס.'
}

const MONTH_WORD = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'

function monthIndexFromToken(token: string): number {
  return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(token.toLowerCase().slice(0, 3))
}

function describedMonthSpan(raw: string, language: ReportLanguage): string | null {
  const match = new RegExp(`\\b(${MONTH_WORD})\\s*\\+\\s*(${MONTH_WORD})\\b`, 'i').exec(raw)
  if (!match) return null
  const start = monthIndexFromToken(match[1])
  const end = monthIndexFromToken(match[2])
  if (start < 0 || end < 0) return null
  if (language === 'en') return `${ENGLISH_MONTH_TITLE[start]}–${ENGLISH_MONTH_TITLE[end]}`
  return `${HEBREW_MONTHS[start]}–${HEBREW_MONTHS[end]}`
}

function noteWithoutLedgerArithmetic(raw: string, label: string | null, language: ReportLanguage): string | null {
  const hasEquation = /\d+(?:\.\d+)?\s*\+\s*\d+(?:\.\d+)?\s*=/.test(raw)
  const hasCode = /\b[A-Za-z]{2,}-\d+\b/.test(raw)
  if (!hasEquation && !hasCode) return null
  const hebrew = raw
    .replace(/[A-Za-z0-9€$=.+\-–—/]+/g, ' ')
    .replace(/שולם[הת]?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const span = describedMonthSpan(raw, language)
  const subject = hebrew || label
  if (subject && span) {
    return language === 'en' ? `${subject}, covers ${span}` : `${subject}, מכסה ${span}`
  }
  return subject || span
}

export function clientDescription(
  subcategory: string | null,
  description: string | null,
  role: DescriptionRole = 'general',
  language: ReportLanguage = 'he',
): string {
  if (role === 'renovation-payment') return 'תשלום על חשבון השיפוץ'
  if (role === 'purchase-payment') return 'תשלום על חשבון הרכישה'
  if (role === 'owner-transfer') return 'תשלום לבעלים'
  const label = subcategory ? SUBCATEGORY_LABEL[subcategory] || null : null
  const raw = (description || '').trim()
  const noted = noteWithoutLedgerArithmetic(raw, label, language)
  if (noted) return noted
  if (/\bhobs?\b/i.test(raw)) return 'כיריים'
  if (/timer booster/i.test(raw)) return 'טיימר לדוד'
  if (/\bblinds?\b/i.test(raw)) return 'חלקים לווילונות'
  if (/bowl for the salad/i.test(raw) && /opener/i.test(raw)) return 'קערה לסלט ופותחן לבקבוק יין'
  if (/cooking oven/i.test(raw)) return 'תנור בישול'
  if (/washing mashine|washing machine/i.test(raw)) return 'מכונת כביסה'
  if (/blow dryer/i.test(raw)) return 'מייבש שיער'
  if (/bed sheets/i.test(raw)) return 'מצעים'
  if (/jumbo decoration/i.test(raw)) return 'פריטי עיצוב – Jumbo'
  if (/air\s*b(?:and|nb)?\s*(?:and\s*b\s*)?sup(?:ply|lay)|airbnb suply|מוצרי חשמל\s*ARBNB|apartment equipment\/setup/i.test(raw)) return 'ציוד Airbnb'
  if (/kitchen sup(?:ply|ly)/i.test(raw)) return 'ציוד מטבח'
  if (!raw || INTERNAL_WORD.test(raw) || ROUTE_WORD.test(raw)) {
    if (label) return label
    return unproven(subcategory, raw)
  }
  let text = raw
    .replace(/\b(sup(?:ply)?|suply|app)\b/ig, ' ')
    .replace(/[A-Za-z€$]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^ל\s+/, '')
    .replace(/\s+ל$/, '')
    .replace(/שוקלד/g, 'שוקולד')
    .replace(/וילנות/g, 'וילונות')
    .replace(/שכט\s*עוד/g, 'שכר טרחה')
    .replace(/מקרר\s*\+\s*כריים\s*\+?/g, 'מקרר וכיריים')
    .replace(/סירים\s+מחבתות\s+וכו\.*/g, 'כלי מטבח')
    .replace(/נקיון/g, 'ניקיון')
    .replace(/שיכפול/g, 'שכפול')
  if (text === 'ניהול' && label === 'דמי ניהול') return label
  if (INTERNAL_WORD.test(text) || ROUTE_WORD.test(text) || !/[\u0590-\u05FF]{2,}/.test(text)) {
    if (label) return label
    return unproven(subcategory, raw)
  }
  return polishClientHebrew(text)
}

export interface PropertyLayerSummary {
  readonly key: string
  readonly title: string
  readonly charges: number
  readonly credits: number
  readonly balance: number
  readonly state: 'closed' | 'open' | 'informational'
  readonly direction: ClosingDirection
}

function roundLayer(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

function layerDirection(balance: number): ClosingDirection {
  if (Math.abs(balance) < 0.005) return 'settled'
  return balance > 0 ? 'client_owes_jj' : 'jj_owes_client'
}

function partsOf(lines: readonly DisplayLine[]): { charges: number; credits: number; balance: number } {
  let charges = 0
  let credits = 0
  lines.forEach((line) => {
    if (line.effect === 'charge') charges += line.amount
    else if (line.effect === 'credit') credits += line.amount
  })
  return { charges: roundLayer(charges), credits: roundLayer(credits), balance: roundLayer(charges - credits) }
}

function bridgeAmount(property: PropertyAccount, label: string): number {
  const step = property.bridge.find((item) => item.label === label)
  return step ? step.signedDueToJj : 0
}

export function propertyLayerSummaries(property: PropertyAccount, language: ReportLanguage = 'he'): PropertyLayerSummary[] {
  const he = language === 'he'
  const layers: PropertyLayerSummary[] = []
  const purchase = property.summaries.find((item) => item.kind === 'purchase')
  if (purchase) {
    const charges = roundLayer(purchase.agreed + purchase.ancillary)
    layers.push({
      key: 'purchase',
      title: he ? 'קניית הנכס' : 'Purchase',
      charges,
      credits: roundLayer(charges - purchase.balance),
      balance: purchase.balance,
      state: purchase.state,
      direction: layerDirection(purchase.balance),
    })
  }
  const renovation = property.summaries.find((item) => item.kind === 'renovation')
  if (renovation) {
    const charges = roundLayer(renovation.agreed + renovation.ancillary)
    layers.push({
      key: 'renovation',
      title: he ? 'שיפוץ' : 'Renovation',
      charges,
      credits: renovation.payments,
      balance: renovation.balance,
      state: renovation.state,
      direction: layerDirection(renovation.balance),
    })
  }
  const setup = partsOf(property.lines.filter((line) => line.section === 'ציוד והכנת הנכס להשכרה קצרה'))
  if (setup.charges !== 0 || setup.credits !== 0) {
    layers.push({
      key: 'setup',
      title: he ? 'הכנת הנכס' : 'Property setup',
      ...setup,
      state: Math.abs(setup.balance) < 0.005 ? 'closed' : 'open',
      direction: layerDirection(setup.balance),
    })
  }
  const repairLines = property.lines.filter((line) => line.section === 'תקלות ותיקונים')
  const repairs = partsOf(repairLines)
  const expenseStep = bridgeAmount(property, 'הוצאות הנכס')
  const transferStep = bridgeAmount(property, 'תשלומים שהועברו לבעלים')
  const knownBridge = new Set([
    'יתרת קניית הנכס', 'יתרת שיפוץ', 'ציוד והכנת הנכס להשכרה קצרה',
    'זיכוי שכירות ארוכה', 'הוצאות שכירות קצרה', 'זיכוי שכירות קצרה',
    'תשלומים שהועברו לבעלים', 'הוצאות הנכס', 'הכנסות',
  ])
  const otherSteps = roundLayer(property.bridge
    .filter((step) => !knownBridge.has(step.label))
    .reduce((sum, step) => sum + step.signedDueToJj, 0))
  const operatingBalance = roundLayer(expenseStep - repairs.balance + transferStep + otherSteps)
  const operatingLines = property.lines.filter((line) => (
    line.section === 'הוצאות הנכס' || line.section === 'הוצאות שוטפות' || line.section === 'תשלומים שהועברו לבעלים'
  ))
  if (operatingLines.length > 0 || Math.abs(operatingBalance) >= 0.005) {
    const operatingParts = partsOf(operatingLines)
    layers.push({
      key: 'operating',
      title: he ? 'חשבון תפעול וניהול' : 'Operating account',
      charges: operatingParts.charges,
      credits: operatingParts.credits,
      balance: operatingBalance,
      state: Math.abs(operatingBalance) < 0.005 ? 'closed' : 'open',
      direction: layerDirection(operatingBalance),
    })
  }
  if (repairLines.length > 0) {
    layers.push({
      key: 'repairs',
      title: he ? 'תקלות ותיקונים' : 'Repairs and maintenance',
      ...repairs,
      state: Math.abs(repairs.balance) < 0.005 ? 'closed' : 'open',
      direction: layerDirection(repairs.balance),
    })
  }
  const strUnit = property.units.find((unit) => unit.title.includes('Short-Term Rental'))
  const strLines = strUnit
    ? strUnit.lines
    : property.lines.filter((line) => line.section === 'הכנסות משכירות קצרה' || line.section === 'הוצאות השכרה קצרה')
  const strParts = partsOf(strLines)
  const strCharges = bridgeAmount(property, 'הוצאות שכירות קצרה') || strParts.charges
  const monthlyCredit = property.certifiedMonthlyStr ? property.certifiedMonthlyStr.totalOwnerNet : 0
  const strCreditStep = Math.abs(bridgeAmount(property, 'זיכוי שכירות קצרה'))
  const strCredits = roundLayer(strCreditStep || strParts.credits || monthlyCredit)
  const strBalance = roundLayer(strCharges - strCredits)
  if (strCharges !== 0 || strCredits !== 0) {
    layers.push({
      key: 'str',
      title: he ? 'השכרה קצרה' : 'Short-term rental',
      charges: strCharges,
      credits: strCredits,
      balance: strBalance,
      state: Math.abs(strBalance) < 0.005 ? 'closed' : 'open',
      direction: layerDirection(strBalance),
    })
  }
  const ltrUnit = property.units.find((unit) => unit.title.includes('Long-Term Rental'))
  const ltrLines = ltrUnit
    ? ltrUnit.lines
    : property.lines.filter((line) => line.section === 'הכנסות משכירות ארוכה')
  const ltrParts = partsOf(ltrLines)
  const ltrStep = bridgeAmount(property, 'זיכוי שכירות ארוכה')
  const incomeStep = bridgeAmount(property, 'הכנסות')
  const ltrBalance = ltrStep !== 0 ? ltrStep : (ltrParts.balance !== 0 ? ltrParts.balance : incomeStep && strCredits === 0 ? incomeStep : ltrParts.balance)
  const ltrCredits = roundLayer(Math.abs(Math.min(ltrBalance, 0)) || ltrParts.credits)
  if (ltrLines.length > 0 || ltrBalance !== 0) {
    layers.push({
      key: 'ltr',
      title: he ? 'השכרה ארוכה' : 'Long-term rental',
      charges: ltrParts.charges,
      credits: ltrCredits,
      balance: ltrBalance,
      state: Math.abs(ltrBalance) < 0.005 ? 'closed' : 'open',
      direction: layerDirection(ltrBalance),
    })
  }
  const componentBalance = roundLayer(layers.reduce((sum, layer) => sum + layer.balance, 0))
  if (Math.abs(componentBalance - property.amountDueToJj) > 0.02) {
    throw new Error(`${property.propertyName}: layer summary ${componentBalance} does not equal certified ${property.amountDueToJj}.`)
  }
  layers.push({
    key: 'closing',
    title: he ? 'יתרת סגירת הנכס' : 'Property closing balance',
    charges: 0,
    credits: 0,
    balance: property.amountDueToJj,
    state: Math.abs(property.amountDueToJj) < 0.005 ? 'closed' : 'open',
    direction: property.direction,
  })
  return layers
}

function polishClientHebrew(text: string): string {
  const withAnd = text.replace(/([\u0590-\u05FF]{2,})\s+פלוס\s+([\u0590-\u05FF]{2,})/g, '$1 ו$2')
  return withAnd.replace(
    /(\d{1,2})\.(\d{1,2})\.(\d{2})-(\d{1,2})\.(\d{1,2})\.(\d{2})/g,
    (_match, dayA, monthA, yearA, dayB, monthB, yearB) => {
      const pad = (value: string) => value.padStart(2, '0')
      const year = (value: string) => `${Number(value) >= 70 ? '19' : '20'}${value.padStart(2, '0')}`
      return `${pad(dayA)}.${pad(monthA)}.${year(yearA)}–${pad(dayB)}.${pad(monthB)}.${year(yearB)}`
    },
  )
}
