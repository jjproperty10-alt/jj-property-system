/**
 * Avi partner-report copy. Local to this screen — do not import
 * `@/lib/report/languageResolution` or any RC3 language helper.
 */
export type AviReportLang = 'en' | 'he'

export const AVI_REPORT_COPY = {
  en: {
    toggleEn: 'English',
    toggleHe: 'עברית',
    summary: 'Summary',
    ownership: 'Ownership',
    acquisition: 'Acquisition',
    acquisitionSubtitle: '50% partnership interest at the agreed Villa Mazotos transaction value',
    agreedValue: 'Agreed transaction value',
    aviObligation: 'Avi 50% obligation',
    remaining: 'Remaining',
    purchaseExpenses: 'Purchase expenses',
    purchaseSubtitle: 'Purchase-side costs. The purchase tax is shown once.',
    renovation: 'Renovation',
    renovationSubtitle: 'Actual work. The contract value is the agreed price, not a separate purchase.',
    airbnbIncome: 'Airbnb income',
    airbnbIncomeSubtitle:
      'Private booking income and Hostaway rental income are separate. Hostaway uses the printed Net Owner Payout.',
    privateIncome: 'Private booking income',
    hostawayIncome: 'Hostaway rental income',
    setup: 'Airbnb setup',
    operations: 'Airbnb operations',
    monthly: 'Month by month',
    monthlySubtitle: 'Income and operating cost by check-in month. Expand a month to see stays.',
    payments: 'Avi payments',
    paymentsSubtitle: 'Verified funding from Avi',
    finalSettlement: 'Final settlement',
    paid: 'Paid',
    credits: 'Credits',
    obligation: 'Obligation',
    finalResult: 'Final result',
    certified: 'Certified',
    provisional: 'Provisional',
    stay: 'Stay',
    stays: 'stays',
    nights: 'nights',
    expand: 'Show stays',
    collapse: 'Hide stays',
    month: 'Month',
    income: 'Income',
    property: 'Property',
    aviShare: 'Avi 50% share',
    aviPaid: 'Avi paid',
    aviRemaining: 'Avi remaining',
    rows: 'Rows',
  },
  he: {
    toggleEn: 'English',
    toggleHe: 'עברית',
    summary: 'סיכום',
    ownership: 'בעלות',
    acquisition: 'רכישה',
    acquisitionSubtitle: '50% שותפות לפי שווי העסקה המוסכם של וילה מזוטוס',
    agreedValue: 'שווי עסקה מוסכם',
    aviObligation: 'חלק אבי 50%',
    remaining: 'יתרה',
    purchaseExpenses: 'הוצאות רכישה',
    purchaseSubtitle: 'עלויות רכישה. מס הרכישה מוצג פעם אחת.',
    renovation: 'שיפוץ',
    renovationSubtitle: 'העבודה שבוצעה. ערך החוזה הוא המחיר המוסכם, לא רכישה נפרדת.',
    airbnbIncome: 'הכנסות Airbnb',
    airbnbIncomeSubtitle:
      'הכנסות הזמנה פרטית והכנסות Hostaway מוצגות בנפרד. Hostaway לפי Net Owner Payout מודפס.',
    privateIncome: 'הכנסות הזמנה פרטית',
    hostawayIncome: 'הכנסות Hostaway',
    setup: 'הקמת Airbnb',
    operations: 'תפעול Airbnb',
    monthly: 'חודש אחר חודש',
    monthlySubtitle: 'הכנסה ועלות תפעול לפי חודש צ׳ק-אין. פתיחת חודש מציגה שהיות.',
    payments: 'תשלומי אבי',
    paymentsSubtitle: 'מימון מאומת מאבי',
    finalSettlement: 'התחשבנות סופית',
    paid: 'שולם',
    credits: 'זיכויים',
    obligation: 'התחייבות',
    finalResult: 'תוצאה סופית',
    certified: 'מאושר',
    provisional: 'זמני',
    stay: 'שהייה',
    stays: 'שהיות',
    nights: 'לילות',
    expand: 'הצג שהיות',
    collapse: 'הסתר שהיות',
    month: 'חודש',
    income: 'הכנסה',
    property: 'נכס',
    aviShare: 'חלק אבי 50%',
    aviPaid: 'אבי שילם',
    aviRemaining: 'יתרת אבי',
    rows: 'שורות',
  },
} as const

export function aviReportDir(lang: AviReportLang): 'ltr' | 'rtl' {
  return lang === 'he' ? 'rtl' : 'ltr'
}

export function formatAviMonth(month: string, lang: AviReportLang): string {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return month
  return new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(y, m - 1, 1))
}

export function formatAviFullDate(iso: string, lang: AviReportLang): string {
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  if (!year || !month || !day) return iso
  return new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

export function formatAviOwedCopy(
  lang: AviReportLang,
  semanticNet: string | null,
  direction: 'to_refund' | 'to_pay' | 'settled' | null,
): string | null {
  if (lang !== 'he' || !semanticNet) return semanticNet
  if (direction === 'to_refund') return semanticNet.replace('Avi is owed', 'מגיע לאבי')
  if (direction === 'to_pay') return semanticNet.replace('Avi owes', 'אבי חייב')
  if (direction === 'settled') return 'סגור'
  return semanticNet
}
