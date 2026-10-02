/**
 * Single registry of client-facing wording for the universal client report.
 * Section keys double as the Hebrew labels the approved report already prints, so the
 * composer, gates and PDF read the same constant. No client and no amount lives here.
 */

import type { ReportLanguage } from './presentation'

/** Section identifiers used on DisplayLine.section (Hebrew is the canonical key). */
export const SECTION = {
  purchase: 'קניית הנכס',
  renovation: 'שיפוץ',
  setup: 'ציוד והכנת הנכס להשכרה קצרה',
  ltrIncome: 'הכנסות משכירות ארוכה',
  strIncome: 'הכנסות משכירות קצרה',
  strExpenses: 'הוצאות השכרה קצרה',
  ownerTransfers: 'תשלומים שהועברו לבעלים',
  propertyExpenses: 'הוצאות הנכס',
  recurring: 'הוצאות שוטפות',
  repairs: 'תקלות ותיקונים',
} as const

export type SectionKey = (typeof SECTION)[keyof typeof SECTION]

/** Closing-bridge step labels (Hebrew canonical). */
export const BRIDGE = {
  purchaseBalance: 'יתרת קניית הנכס',
  renovationBalance: 'יתרת שיפוץ',
  setup: SECTION.setup,
  ltrCredit: 'זיכוי שכירות ארוכה',
  strExpenses: 'הוצאות שכירות קצרה',
  strCredit: 'זיכוי שכירות קצרה',
  ownerTransfers: SECTION.ownerTransfers,
  propertyExpenses: SECTION.propertyExpenses,
  income: 'הכנסות',
} as const

/** Status-line labels (Hebrew canonical). */
export const STATUS_LABEL = {
  purchase: SECTION.purchase,
  renovation: SECTION.renovation,
  propertyBalance: 'יתרת הנכס',
} as const

/** Unit kinds and the title suffix the approved report prints. */
export const UNIT_TITLE_SUFFIX = {
  str: 'Short-Term Rental',
  ltr: 'Long-Term Rental',
} as const

/** Subcategories that the approved report files under repairs instead of general expenses. */
export const REPAIR_SUBCATEGORIES: ReadonlySet<string> = new Set(['Key Duplication', 'Plumber', 'Electrical Work'])

interface Bilingual {
  readonly he: string
  readonly en: string
}

/**
 * Approved client terminology (Hebrew first). Entries marked `approvedOnly` are part of the
 * approved vocabulary but are not printed by the reference report; they exist for new sections.
 */
export const TERMS = {
  settlementSummary: { he: 'סיכום התחשבנות', en: 'Settlement summary' },
  propertyAccountSummary: { he: 'סיכום חשבון הנכס', en: 'Property account summary' },
  propertyAccount: { he: 'חשבון נכס', en: 'Property account' },
  unitDetail: { he: 'פירוט יחידה', en: 'Unit detail' },
  balancesByProperty: { he: 'יתרות לפי נכס', en: 'Balances by property' },
  propertyBalances: { he: 'סך יתרות הנכסים', en: 'Property balances' },
  ownerLevelObligation: { he: 'תשלום כללי ברמת הבעלים', en: 'Owner-level payment' },
  certifiedOpening: { he: 'יתרת פתיחה מאושרת', en: 'Certified opening balance' },
  purchase: { he: SECTION.purchase, en: 'Purchase' },
  renovation: { he: SECTION.renovation, en: 'Renovation' },
  setup: { he: 'הכנת הנכס', en: 'Property setup' },
  operations: { he: 'תפעול', en: 'Operations' },
  operatingExpenses: { he: 'הוצאות תפעול', en: 'Operating expenses' },
  operatingAccount: { he: 'חשבון תפעול וניהול', en: 'Operating account' },
  repairs: { he: SECTION.repairs, en: 'Repairs and maintenance' },
  cleaning: { he: 'ניקיון', en: 'Cleaning' },
  sharedExpenses: { he: 'הוצאות משותפות', en: 'Shared expenses' },
  income: { he: 'הכנסות', en: 'Income' },
  ltrIncome: { he: SECTION.ltrIncome, en: 'Long-term rental income' },
  ltr: { he: 'השכרה ארוכה', en: 'Long-term rental' },
  str: { he: 'השכרה קצרה', en: 'Short-term rental' },
  strCredit: { he: BRIDGE.strCredit, en: 'Short-term rental credit' },
  strOwnerNet: { he: 'זיכוי הכנסות מהשכרה קצרת טווח', en: 'Short-term rental owner net' },
  strMonthlyNote: { he: 'סיכום חודשי מאושר — לפי חודש הצ׳ק־אין', en: 'Certified monthly summary by check-in month' },
  strMonthlyFootnote: {
    he: 'הפירוט מציג את הנטו המאושר לבעלים לפי חודש הצ׳ק־אין. פירוט ההזמנות המלא זמין כנספח נפרד.',
    en: 'The detail shows the certified owner net by check-in month. Full reservation detail is available as a separate appendix.',
  },
  ownerTransfers: { he: SECTION.ownerTransfers, en: 'Payments transferred to the owner' },
  paymentsAndCredits: { he: 'תשלומים וזיכויים', en: 'Payments and credits' },
  clientLevelCredits: { he: 'זיכויים ברמת ההתחשבנות הכוללת', en: 'Client-level settlement credits' },
  closingBridge: { he: 'גשר סגירה', en: 'Closing bridge' },
  propertyBalance: { he: STATUS_LABEL.propertyBalance, en: 'Property balance' },
  propertyClosingBalance: { he: 'יתרת סגירת הנכס', en: 'Property closing balance' },
  openClosed: { he: 'מה נסגר ומה נשאר פתוח', en: 'Closed and open items' },
  closed: { he: 'נסגר', en: 'Closed' },
  open: { he: 'פתוח', en: 'Open' },
  information: { he: 'מידע', en: 'Information' },
  payableToJj: { he: 'לתשלום ל־JJ.', en: 'Payable to JJ.' },
  creditToClient: { he: 'זיכוי ללקוח', en: 'Credit to client' },
  clientOwesJj: { he: 'הלקוח חייב ל־JJ', en: 'The client owes JJ' },
  jjOwesClient: { he: 'JJ חייבת ללקוח', en: 'JJ owes the client' },
  transactions: { he: 'פירוט תנועות', en: 'Transactions' },
  unitBalance: { he: 'יתרת היחידה', en: 'Unit balance' },
  ltrCreditsTotal: { he: 'סה״כ זיכויי שכירות ארוכה', en: 'Long-term rent credits' },
  ltrCreditsTotalNote: { he: 'סה״כ מוצג לצורך פירוט — נכלל פעם אחת בגשר הסגירה', en: 'Shown for detail — included once in the closing bridge' },
  noSharedExpenses: { he: 'אין הוצאות משותפות שלא ניתן לשייך ליחידה.', en: 'There are no shared expenses that cannot be assigned to a unit.' },
  nonCash: { he: 'ללא מזומן', en: 'Non-cash' },
  creditNoncash: { he: 'זיכוי ללא מזומן', en: 'Non-cash credit' },
  creditCash: { he: 'תשלום כללי', en: 'General payment' },
  creditEventCaption: { he: 'מועד הזיכוי', en: 'Credit event' },
  creditEventNote: { he: 'מועד אירוע הזיכוי המאושר, לא מועד קבלת כסף.', en: 'Certified credit-event date, not a date cash was received.' },
  recorded: { he: 'רשום.', en: 'Recorded.' },
  purchasePricePayments: { he: 'תשלומים על מחיר הקנייה', en: 'Payments on the purchase price' },
  paidFromReceipts: { he: 'שולם מתוך סך התקבולים.', en: 'Paid from the purchase receipts.' },
  paidStatus: { he: 'שולם', en: 'Paid' },
  strLumpDefault: { he: 'זיכוי Airbnb מאושר', en: 'Approved Airbnb credit' },
  strLumpNote: {
    he: 'זיכוי מאושר בגין הכנסות מהשכרה קצרה. הזיכוי מוצג כסכום כולל, מאחר שלא נשמר עבורו פירוט חודשי מאושר.',
    en: 'The short-term rental credit is the approved amount for the period. A monthly split has not been approved, so no monthly detail is shown.',
  },
  ltrSeparateSourcesNote: {
    he: 'הזיכוי בגין שימוש של JJ בדירה ותקבולי השוכר הם מקורות הכנסה נפרדים.',
    en: 'The rent adjustment and the tenant receipt are two separate sources.',
  },
  propertyIncome: { he: 'הכנסות מהנכס', en: 'Property income' },
  units: { he: 'יחידות', en: 'Units' },
  purchasePrice: { he: 'מחיר קניית הנכס', en: 'Purchase price' },
  purchaseAncillary: { he: 'הוצאות נלוות לקנייה', en: 'Purchase ancillary costs' },
  purchaseRemaining: { he: 'יתרת מחיר הקנייה', en: 'Purchase price balance' },
  agreedAmount: { he: 'סכום מוסכם', en: 'Agreed amount' },
  paymentsTotal: { he: 'סך תשלומים', en: 'Total payments' },
  ancillaryCharges: { he: 'חיובים נלווים', en: 'Ancillary charges' },
  renovationRemaining: { he: BRIDGE.renovationBalance, en: 'Renovation balance' },
  totalReceipts: { he: 'סך התקבולים', en: 'Total receipts' },
  monthYear: { he: 'חודש ושנה', en: 'Month' },
  reservations: { he: 'מספר הזמנות', en: 'Reservations' },
  nights: { he: 'מספר לילות', en: 'Nights' },
  ownerNet: { he: 'נטו לבעלים', en: 'Owner net' },
  total: { he: 'סה״כ', en: 'Total' },
  totalOwnerNet: { he: 'סה״כ נטו לבעלים', en: 'Total owner net' },
  unavailable: { he: 'לא זמין', en: 'Unavailable' },
  clientReport: { he: 'דוח ללקוח', en: 'Client report' },
  client: { he: 'לקוח', en: 'Client' },
  date: { he: 'תאריך', en: 'Date' },
  description: { he: 'פירוט', en: 'Description' },
  status: { he: 'סטטוס', en: 'Status' },
  amount: { he: 'סכום', en: 'Amount' },
  component: { he: 'רכיב', en: 'Component' },
  charges: { he: 'חיובים', en: 'Charges' },
  credits: { he: 'זיכויים', en: 'Credits' },
  direction: { he: 'כיוון', en: 'Direction' },
  balance: { he: 'יתרה', en: 'Balance' },
  paid: { he: 'תשלום', en: 'Paid' },
  page: { he: 'עמוד', en: 'Page' },
  of: { he: 'מתוך', en: 'of' },
  continued: { he: 'המשך', en: 'continued' },
  closingCountedOnce: {
    he: 'יתרת הסגירה היא הסכום המאושר של הנכס ונספרת פעם אחת.',
    en: 'The closing balance is the certified property total and is counted once.',
  },
  balanceBeforePayments: { he: 'יתרה לפני תשלומים וזיכויים', en: 'Balance before payments and credits' },
  cashAllocation: { he: 'תשלומים שהוקצו ליתרה', en: 'Payments allocated to the balance' },
  closingBalance: { he: 'יתרת סגירה', en: 'Closing balance' },
} as const satisfies Record<string, Bilingual>

export type TermKey = keyof typeof TERMS

export function term(key: TermKey, language: ReportLanguage = 'he'): string {
  return TERMS[key][language]
}

/**
 * Internal vocabulary that must never reach a client. Matched case-insensitively as whole
 * words or phrases against every client-facing string (gate 14).
 */
export const FORBIDDEN_CLIENT_TERMS: readonly string[] = [
  'RC3',
  'FIFO',
  'certification',
  'certified_',
  'RPC',
  'UUID',
  'metadata',
  'Overall Net',
  'Current Balance',
  'confirmed_duplicate',
  'needs_review',
  'review_status',
  'is_deleted',
  'reversal',
  'duplicate',
  'rebook',
  'UNPROVEN',
  'Hostaway',
  'internal',
  'payer',
  'payee',
  'jsonb',
  'settlement_amount',
  'amount_eur',
  'client_charge',
]

/** People and internal routing words the presentation layer must never print. */
export const INTERNAL_IDENTITY_WORD = /\b(yossi|jacob|yaacov|anastasia|david|yasin|fabi|shifra|faby)\b|יעקוב|יעקב|יוסי|אנסטסיה|דיויד|יסין/i

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/**
 * Display whitelist: the only client-facing text allowed is text without internal vocabulary,
 * internal identities or identifiers. Returns the offending tokens (empty = pass).
 */
export function displayWhitelistViolations(text: string): string[] {
  const hits: string[] = []
  if (!text.trim()) return hits
  if (UUID_RE.test(text)) hits.push('uuid')
  const lower = text.toLowerCase()
  for (const phrase of FORBIDDEN_CLIENT_TERMS) {
    const needle = phrase.toLowerCase()
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}_])`, 'iu')
    if (pattern.test(lower)) hits.push(phrase)
  }
  if (INTERNAL_IDENTITY_WORD.test(text)) hits.push('internal-identity')
  return hits
}
