/**
 * Avi partner-report copy. Local to this screen — do not import
 * `@/lib/report/languageResolution` or any RC3 language helper.
 */
import {
  formatHebrewFullDateText,
  formatHebrewMonthYearText,
} from '@/components/finance/HebrewDate'

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
      'Private booking income and Hostaway rental income are separate. Hostaway uses Net Owner Payout.',
    privateIncome: 'Private booking income',
    privateIncomeHelp: 'Already-net private stays on the JJ ledger. Avi credit is 50% of the certified total.',
    hostawayIncome: 'Hostaway rental income',
    hostawayIncomeHelp: '50% of Net Owner Payout for completed, paid stays.',
    printedNto: 'Net Owner Payout',
    incomeSource: 'Source',
    completedHostawayStays: 'Completed Hostaway stays',
    airbnbCreditsTotal: 'Airbnb income credits total',
    aviShareCredit: 'Avi 50% credit',
    postAcquisitionLayers: 'Post-acquisition layers',
    postAcquisitionSubtitle:
      'Certified Avi balances. Acquisition is covered by certified paid and is not added again.',
    postAcquisitionTotal: 'Post-acquisition total',
    layer: 'Layer',
    certifiedCharge: 'Certified charge',
    result: 'Result',
    expenseReconciliation: 'Certified expense reconciliation',
    expenseReconciliationNote:
      'Avi share of post-acquisition expenses only. Purchase of Avi’s 50% interest (€250,000) is shown separately and is not included here.',
    certifiedExpenseRows: 'Certified expense rows',
    totalCharges: 'Total charges',
    aviExpenseShare: 'Avi share of expenses',
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
    finalNet: 'Final Net',
    monthlyGrandTotal: 'Grand total',
    roundingAdjustment: 'Rounding adjustment',
    notesControls: 'Notes and controls',
    certified: 'Certified',
    provisional: 'Provisional',
    stay: 'stay',
    stays: 'stays',
    night: 'night',
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
    date: 'Date',
    label: 'Purpose',
    payer: 'Payer',
    amount: 'Amount',
    appendixTitle: 'Certified expense appendix',
    appendixSubtitle: 'Full partner-visible certified expense lines. Month and year only.',
    appendixButton: 'Download certified expense appendix',
    backToReport: 'Back to main report',
    printButton: 'Print / Save PDF',
    downloadSendablePdf: 'Download sendable A4 PDF',
    downloadSendablePdfHint:
      'Partner-sendable file: JJ page numbers, no Chrome date/URL/localhost chrome. Prefer this for sending to Avi.',
    printHint: 'In the print dialog choose Save as PDF, paper A4, and uncheck Headers and footers.',
    brand: 'JJ PROPERTY 10',
    reportTitle: 'External Partner Report — Avi',
    propertyName: 'Villa Mazotos',
    confidentiality: 'Confidential — for Avi and JJ principals only',
    footerConfidential: 'Confidential',
    footerPartnerReport: 'Avi partner report',
    operationsContinued: 'Airbnb Operations — continued',
    pageLabel: 'Page',
    pageOf: 'of',
    generatedOn: 'Generated on',
    transactionsThrough: 'Transactions included through',
    approvedChargesNote: 'Approved monthly charges may include later periods.',
    formula: 'Paid + Credits − Obligation = Final result',
    internetSplitNote:
      'Internet €325.00 is presented once as €295.00 one-time installation in Setup plus €30.00 June 2025 internet in Operations (June 2025–September 2026, 16 months). No duplicate charge.',
    closingNarrative:
      'Avi is owed €740.94 because amounts already paid and credited (€280,600.00 + €19,744.44) exceed his certified obligation (€299,603.50) by that difference.',
    layerAcquisition: 'Acquisition',
    layerDeal: 'Acquisition / Deal expenses',
    layerRenovation: 'Renovation',
    layerAirbnb: 'Airbnb',
    layerManagement: 'Management',
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
      'הכנסות הזמנה פרטית והכנסות Hostaway מוצגות בנפרד. Hostaway לפי תשלום נטו לבעלים (Net Owner Payout).',
    privateIncome: 'הכנסות הזמנה פרטית',
    privateIncomeHelp: 'שהיות פרטיות נטו בספר JJ. זיכוי אבי הוא 50% מהסכום המאושר.',
    hostawayIncome: 'הכנסות Hostaway',
    hostawayIncomeHelp: '50% מתשלום נטו לבעלים (Net Owner Payout) עבור שהיות שהושלמו ושולמו.',
    printedNto: 'תשלום נטו לבעלים (Net Owner Payout)',
    incomeSource: 'מקור',
    completedHostawayStays: 'שהיות Hostaway שהושלמו',
    airbnbCreditsTotal: 'סה״כ זיכויי הכנסה Airbnb',
    aviShareCredit: 'זיכוי אבי 50%',
    postAcquisitionLayers: 'שכבות התחשבנות לאחר הרכישה',
    postAcquisitionSubtitle:
      'יתרות מאושרות של אבי. הרכישה מכוסה בתשלום המאושר ואינה מתווספת שוב.',
    postAcquisitionTotal: 'סה״כ לאחר רכישה',
    layer: 'שכבה',
    certifiedCharge: 'חיוב מאושר',
    result: 'תוצאה',
    expenseReconciliation: 'הוצאות מאושרות לאחר רכישת חלקו',
    expenseReconciliationNote:
      'חלק אבי בהוצאות לאחר רכישת חלקו בלבד. רכישת 50% (€250,000) מוצגת בנפרד ואינה כלולה כאן.',
    certifiedExpenseRows: 'שורות הוצאה מאושרות',
    totalCharges: 'סה״כ חיובים',
    aviExpenseShare: 'חלק אבי בהוצאות',
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
    finalNet: 'יתרה סופית',
    monthlyGrandTotal: 'סה״כ',
    roundingAdjustment: 'התאמת עיגול',
    notesControls: 'הערות ובקרות',
    certified: 'מאושר',
    provisional: 'זמני',
    stay: 'שהייה',
    stays: 'שהיות',
    night: 'לילה',
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
    date: 'תאריך',
    label: 'ייעוד',
    payer: 'משלם',
    amount: 'סכום',
    appendixTitle: 'נספח הוצאות מאושרות',
    appendixSubtitle: 'פירוט מלא של שורות הוצאה מאושרות הנראות לשותף. חודש ושנה בלבד.',
    appendixButton: 'הורדת נספח הוצאות מאושרות',
    backToReport: 'חזרה לדוח הראשי',
    printButton: 'הדפסה / שמירה כ־PDF',
    downloadSendablePdf: 'הורדת PDF לשליחה (A4)',
    downloadSendablePdfHint:
      'קובץ לשליחה לשותף: מספור JJ, בלי תאריך/כתובת/localhost של Chrome. זה הנתיב המומלץ לשליחה לאבי.',
    printHint: 'בחלון ההדפסה בחרו שמירה כ־PDF, נייר A4, ובטלו Headers and footers.',
    brand: 'JJ PROPERTY 10',
    reportTitle: 'דוח שותף חיצוני — אבי',
    propertyName: 'וילה מזוטוס',
    confidentiality: 'סודי — לאבי ולבעלי JJ בלבד',
    footerConfidential: 'סודי',
    footerPartnerReport: 'דוח שותף אבי',
    operationsContinued: 'תפעול Airbnb — המשך',
    pageLabel: 'עמוד',
    pageOf: 'מתוך',
    generatedOn: 'הופק ב־',
    transactionsThrough: 'עסקאות שנכללו עד',
    approvedChargesNote: 'חיובים חודשיים מאושרים עשויים לכלול תקופות מאוחרות יותר.',
    formula: 'שולם + זיכויים − התחייבות = תוצאה סופית',
    internetSplitNote:
      'אינטרנט €325.00 מוצג פעם אחת כ־€295.00 התקנה חד־פעמית בהקמה ועוד €30.00 אינטרנט ליוני 2025 בתפעול (יוני 2025–ספטמבר 2026, 16 חודשים). ללא חיוב כפול.',
    closingNarrative:
      'מגיע לאבי €740.94 כי הסכומים שכבר שולמו וזוכו (€280,600.00 + €19,744.44) עולים על ההתחייבות המאושרת שלו (€299,603.50) בהפרש זה.',
    layerAcquisition: 'רכישה',
    layerDeal: 'הוצאות רכישה / עסקה',
    layerRenovation: 'שיפוץ',
    layerAirbnb: 'Airbnb',
    layerManagement: 'ניהול',
  },
} as const

export function aviReportDir(lang: AviReportLang): 'ltr' | 'rtl' {
  return lang === 'he' ? 'rtl' : 'ltr'
}

export function formatAviMonth(month: string, lang: AviReportLang): string {
  if (lang === 'he') return formatHebrewMonthYearText(month)
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return month
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(y, m - 1, 1))
}

export function formatAviFullDate(iso: string, lang: AviReportLang): string {
  if (lang === 'he') return formatHebrewFullDateText(iso)
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  if (!year || !month || !day) return iso
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

export function formatAviStayNightLabel(
  lang: AviReportLang,
  stayCount: number,
  nights: number,
): string {
  if (lang === 'he') {
    const stayPart =
      stayCount === 1 ? 'שהייה אחת' : stayCount === 2 ? 'שתי שהיות' : `${stayCount} שהיות`
    const nightPart =
      nights === 1 ? 'לילה אחד' : nights === 2 ? 'שני לילות' : `${nights} לילות`
    return `${stayPart} · ${nightPart}`
  }
  const stayPart = `${stayCount} ${stayCount === 1 ? 'stay' : 'stays'}`
  const nightPart = `${nights} ${nights === 1 ? 'night' : 'nights'}`
  return `${stayPart} · ${nightPart}`
}

export function formatAviOwedCopy(
  lang: AviReportLang,
  semanticNet: string | null,
  direction: 'to_refund' | 'to_pay' | 'settled' | null,
): string | null {
  if (lang !== 'he' || !semanticNet) return semanticNet
  const inferred =
    direction ??
    (semanticNet.includes('Avi is owed')
      ? 'to_refund'
      : semanticNet.includes('Avi owes')
        ? 'to_pay'
        : semanticNet === 'Settled' || semanticNet === 'settled'
          ? 'settled'
          : null)
  if (inferred === 'to_refund') return semanticNet.replaceAll('Avi is owed', 'מגיע לאבי')
  if (inferred === 'to_pay') return semanticNet.replaceAll('Avi owes', 'אבי חייב')
  if (inferred === 'settled') return 'סגור'
  return semanticNet
    .replaceAll('Avi is owed', 'מגיע לאבי')
    .replaceAll('Avi owes', 'אבי חייב')
}
