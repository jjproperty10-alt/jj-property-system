/**
 * Explicit certified property-bridge packs, keyed by evidence_ref from the live reader.
 * Not imported by reusable settlement adapter/types. Matched only through compose.
 */

import type { CertifiedClientSettlementAvailable } from '../finance/certifiedClientSettlementTypes'
import type {
  CertifiedBridgeComponent,
  CertifiedOwnerStatementCompose,
  CertifiedPropertyBridgePack,
} from '../finance/certifiedPropertyBridge'
import { composeCertifiedOwnerStatement } from '../finance/certifiedPropertyBridge'

function effectRow(
  category: CertifiedBridgeComponent['category'],
  labelEn: string,
  labelHe: string,
  effectDueToJj: number,
  sourceStatus: CertifiedBridgeComponent['sourceStatus'],
  extra?: Pick<CertifiedBridgeComponent, 'detailEn' | 'detailHe'>,
): CertifiedBridgeComponent {
  const chargesDueToJj = effectDueToJj > 0 ? effectDueToJj : 0
  const creditsDueToClient = effectDueToJj < 0 ? -effectDueToJj : 0
  return {
    category,
    labelEn,
    labelHe,
    chargesDueToJj,
    creditsDueToClient,
    effectDueToJj,
    sourceStatus,
    ...extra,
  }
}

const PACKS: readonly CertifiedPropertyBridgePack[] = [
  {
    evidenceRef: 'uriel-bridge-v2:kamares',
    displayNameHe: 'קמארס',
    formulaResultDirection: 'due_to_client',
    formula: [
      { op: 'start', labelEn: 'Rent', labelHe: 'שכירות', amount: 14400 },
      { op: 'subtract', labelEn: 'Bank payment to owner', labelHe: 'תשלום לבעלים', amount: 5400 },
      { op: 'subtract', labelEn: 'Fees', labelHe: 'עמלות', amount: 1800 },
      { op: 'subtract', labelEn: 'Other accepted charges', labelHe: 'חיובים נוספים שהתקבלו', amount: 1656.78 },
      { op: 'equals', labelEn: 'Due to owner', labelHe: 'לתשלום לבעלים', amount: 5543.22 },
    ],
    components: [
      effectRow('rental', 'Rent', 'שכירות', -14400, 'system_verified'),
      effectRow('owner_payment', 'Bank payment to owner', 'תשלום לבעלים', 5400, 'system_verified'),
      effectRow('recurring', 'Fees', 'עמלות', 1800, 'system_verified'),
      effectRow('repairs', 'Other accepted charges', 'חיובים נוספים שהתקבלו', 1656.78, 'system_verified'),
    ],
  },
  {
    evidenceRef: 'uriel-bridge-v2:oroklini',
    displayNameHe: 'אורוקליני 2 חדרי שינה',
    formulaResultDirection: 'due_to_jj',
    formula: [
      { op: 'start', labelEn: 'Key', labelHe: 'מפתח', amount: 5 },
      { op: 'add', labelEn: 'Lock replacement', labelHe: 'החלפת מנעול', amount: 29.37 },
      { op: 'add', labelEn: 'Cleaning', labelHe: 'ניקיון', amount: 150 },
      { op: 'add', labelEn: 'Plumber', labelHe: 'שרברב', amount: 25 },
      { op: 'equals', labelEn: 'Due to JJ', labelHe: 'יתרת הנכס', amount: 209.37 },
    ],
    components: [
      effectRow('repairs', 'Key', 'מפתח', 5, 'system_verified'),
      effectRow('repairs', 'Lock replacement', 'החלפת מנעול', 29.37, 'system_verified', {
        detailEn: 'Counted once as lock replacement, not plumber.',
        detailHe: 'נספר פעם אחת כהחלפת מנעול, לא כשרברב.',
      }),
      effectRow('repairs', 'Cleaning', 'ניקיון', 150, 'system_verified'),
      effectRow('repairs', 'Plumber', 'שרברב', 25, 'system_verified'),
    ],
  },
  {
    evidenceRef: 'uriel-bridge-v2:studio-kitty',
    displayNameHe: 'סטודיו קיטי',
    formulaResultDirection: 'due_to_jj',
    formula: [
      { op: 'start', labelEn: 'Supporting property total', labelHe: 'סה"כ תומך בנכס', amount: 5589 },
      { op: 'subtract', labelEn: 'Concrete cost not charged to owner', labelHe: 'עלות בטון שאינה מחויבת לבעלים', amount: 1500 },
      { op: 'equals', labelEn: 'Due to JJ', labelHe: 'יתרת הנכס', amount: 4089 },
    ],
    components: [
      effectRow('renovation', 'Supporting property total', 'סה"כ תומך בנכס', 5589, 'system_verified'),
      effectRow('adjustment', 'Concrete cost not charged to owner', 'עלות בטון שאינה מחויבת לבעלים', -1500, 'approved_adjustment', {
        detailEn: 'The owner was charged €4,500 once for the two concrete jobs. The additional €1,500 cost is not charged again.',
        detailHe: 'הבעלים חויב €4,500 פעם אחת עבור שתי עבודות הבטון. עלות נוספת של €1,500 אינה מחויבת שוב.',
      }),
    ],
  },
  {
    evidenceRef: 'uriel-bridge-v2:metro',
    displayNameHe: 'מטרו שרון אינגליש',
    formulaResultDirection: 'due_to_jj',
    formula: [
      { op: 'start', labelEn: 'Purchase remainder', labelHe: 'יתרת רכישה', amount: 40550 },
      { op: 'add', labelEn: 'Garden job 1', labelHe: 'עבודת גינה 1', amount: 150 },
      { op: 'add', labelEn: 'Garden job 2', labelHe: 'עבודת גינה 2', amount: 150 },
      { op: 'equals', labelEn: 'Due to JJ', labelHe: 'יתרת הנכס', amount: 40850 },
    ],
    components: [
      effectRow('purchase', 'Purchase remainder', 'יתרת רכישה', 40550, 'system_verified'),
      effectRow('repairs', 'Garden job 1', 'עבודת גינה 1', 150, 'system_verified'),
      effectRow('adjustment', 'Garden job 2', 'עבודת גינה 2', 150, 'approved_adjustment', {
        detailEn: 'Approved adjustment. No transaction date is shown because none was recorded.',
        detailHe: 'התאמה מאושרת. לא מוצג תאריך כי לא נרשם תאריך עסקה.',
      }),
    ],
  },
  {
    evidenceRef: 'uriel-bridge-v2:debenhams',
    displayNameHe: 'דבנהמס',
    formulaResultDirection: 'due_to_jj',
    formula: [
      { op: 'start', labelEn: 'Renovation', labelHe: 'שיפוץ', amount: 3800 },
      { op: 'add', labelEn: 'Key', labelHe: 'מפתח', amount: 5.25 },
      { op: 'equals', labelEn: 'Due to JJ', labelHe: 'יתרת הנכס', amount: 3805.25 },
    ],
    components: [
      effectRow('renovation', 'Renovation', 'שיפוץ', 3800, 'system_verified'),
      effectRow('repairs', 'Key', 'מפתח', 5.25, 'system_verified'),
    ],
  },
  {
    evidenceRef: 'uriel-bridge-v2:kokkines',
    displayNameHe: 'קוקינס',
    formulaResultDirection: 'due_to_jj',
    formula: [
      { op: 'start', labelEn: 'Renovation remainder', labelHe: 'יתרת שיפוץ', amount: 15000 },
      { op: 'add', labelEn: 'Water', labelHe: 'מים', amount: 64.58 },
      { op: 'add', labelEn: 'Electricity', labelHe: 'חשמל', amount: 61.05 },
      { op: 'equals', labelEn: 'Due to JJ', labelHe: 'יתרת הנכס', amount: 15125.63 },
    ],
    components: [
      effectRow('renovation', 'Renovation remainder', 'יתרת שיפוץ', 15000, 'system_verified'),
      effectRow('recurring', 'Water', 'מים', 64.58, 'system_verified'),
      effectRow('recurring', 'Electricity', 'חשמל', 61.05, 'system_verified'),
    ],
  },
  {
    evidenceRef: 'uriel-bridge-v2:behind-yoav',
    displayNameHe: 'דירת ניר יואב דקליה',
    formulaResultDirection: 'due_to_jj',
    formula: [
      { op: 'start', labelEn: 'Acquisition contract', labelHe: 'חוזה רכישה', amount: 220000 },
      { op: 'subtract', labelEn: 'Accepted purchase payments', labelHe: 'תשלומי רכישה שהתקבלו', amount: 182098 },
      { op: 'add', labelEn: 'Accepted setup', labelHe: 'הקמה שהתקבלה', amount: 9379.88 },
      { op: 'add', labelEn: 'Recurring expenses from 01.06.2026', labelHe: 'הוצאות שוטפות מ-01.06.2026', amount: 763.18 },
      { op: 'subtract', labelEn: 'STR owner credit Jun–Aug', labelHe: 'זיכוי שכירות קצרה יוני–אוגוסט', amount: 3434.98 },
      { op: 'equals', labelEn: 'Due to JJ', labelHe: 'יתרת הנכס', amount: 44610.08 },
    ],
    components: [
      effectRow('purchase', 'Acquisition contract', 'חוזה רכישה', 220000, 'system_verified'),
      effectRow('owner_payment', 'Accepted purchase payments', 'תשלומי רכישה שהתקבלו', -182098, 'system_verified', {
        detailEn: 'Includes the €7,000 payment once. The €13,900 duplicate representation is already inside this total and is not subtracted again.',
        detailHe: 'כולל את התשלום €7,000 פעם אחת. הייצוג הכפול €13,900 כבר כלול בסכום זה ואינו מנוכה שוב.',
      }),
      effectRow('setup', 'Accepted setup', 'הקמה שהתקבלה', 9379.88, 'system_verified', {
        detailEn: 'Includes the fire kit €34.12 once.',
        detailHe: 'כולל את ערכת הכיבוי €34.12 פעם אחת.',
      }),
      effectRow('recurring', 'Recurring expenses from 01.06.2026', 'הוצאות שוטפות מ-01.06.2026', 763.18, 'system_verified', {
        detailEn: 'Recurring expenses before 01.06.2026 are not charged.',
        detailHe: 'הוצאות שוטפות לפני 01.06.2026 אינן מחויבות.',
      }),
      effectRow('str', 'STR owner credit Jun–Aug', 'זיכוי שכירות קצרה יוני–אוגוסט', -3434.98, 'approved_adjustment'),
    ],
    strMonths: [
      { month: '2026-06', bookings: null, nights: null, gross: null, platformFees: null, cleaning: null, tax: null, management: null, ownerNet: 947.25 },
      { month: '2026-07', bookings: null, nights: null, gross: null, platformFees: null, cleaning: null, tax: null, management: null, ownerNet: 1525.77 },
      { month: '2026-08', bookings: null, nights: null, gross: null, platformFees: null, cleaning: null, tax: null, management: null, ownerNet: 961.96 },
    ],
    notesHe: ['שם המערכת נשאר Apartment Neer Yoav Dekelia.'],
    notesEn: ['The system name remains Apartment Neer Yoav Dekelia.'],
  },
  {
    evidenceRef: 'uriel-bridge-v2:duplex',
    displayNameHe: 'דופלקס',
    formulaResultDirection: 'due_to_jj',
    formula: [
      { op: 'start', labelEn: 'Renovation', labelHe: 'שיפוץ', amount: 22145 },
      { op: 'subtract', labelEn: 'Rental income / credits', labelHe: 'הכנסות / זיכויי שכירות', amount: 7000 },
      { op: 'add', labelEn: 'Net extras after certified STR', labelHe: 'תוספות נטו לאחר זיכוי שכירות קצרה', amount: 1410.43 },
      { op: 'equals', labelEn: 'Due to JJ', labelHe: 'יתרת הנכס', amount: 16555.43 },
    ],
    components: [
      effectRow('renovation', 'Renovation', 'שיפוץ', 22145, 'system_verified'),
      effectRow('rental', 'Rental income / credits', 'הכנסות / זיכויי שכירות', -7000, 'system_verified', {
        detailEn: '9 × €500 + €1,000 + €1,500. No separate extra rental layer.',
        detailHe: '9 × €500 + €1,000 + €1,500. אין שכבת שכירות נפרדת מחוץ לרישום.',
      }),
      effectRow('repairs', 'Owner extras', 'תוספות לבעלים', 8393.53, 'system_verified', {
        detailEn: '€100 cleaning is already inside certified STR cleaning and is not added again.',
        detailHe: 'ניקיון €100 כבר כלול בניקיון של השכירות הקצרה המאושרת ואינו מתווסף שוב.',
      }),
      effectRow('str', 'Certified STR credit', 'זיכוי שכירות קצרה מאושר', -6983.1, 'approved_adjustment'),
    ],
    notesHe: ['זיכוי השכירות הקצרה הוא הסכום המאושר. לא נעשה שימוש בפעילות חודשית גולמית.'],
    notesEn: ['The STR credit is the certified amount. Raw mixed monthly activity is not used.'],
  },
]

export const CERTIFIED_PROPERTY_BRIDGE_PACKS: ReadonlyMap<string, CertifiedPropertyBridgePack> =
  new Map(PACKS.map((pack) => [pack.evidenceRef, pack]))

export function composeLiveCertifiedOwnerStatement(
  certified: CertifiedClientSettlementAvailable,
): CertifiedOwnerStatementCompose {
  return composeCertifiedOwnerStatement(certified, CERTIFIED_PROPERTY_BRIDGE_PACKS)
}
