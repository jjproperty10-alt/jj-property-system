/**
 * Explicit property-account packs, keyed by evidence_ref from the live reader.
 * Owner-facing layers only. Competing seller-side remainders are omitted.
 */

import type { CertifiedClientSettlementAvailable } from '../finance/certifiedClientSettlementTypes'
import type {
  CertifiedPropertyAccountCompose,
  CertifiedPropertyAccountPack,
  ClosingBridgeLine,
  ContractLayer,
  OperatingAccountRow,
  PropertySpecificPayment,
} from '../finance/certifiedPropertyAccount'
import { composeCertifiedPropertyAccount } from '../finance/certifiedPropertyAccount'

function contract(
  layer: ContractLayer['layer'],
  agreedAmount: number,
  paidCredited: number,
  remainingDueToJj: number,
  status: ContractLayer['status'],
  extra?: Pick<ContractLayer, 'noteEn' | 'noteHe'>,
): ContractLayer {
  return { layer, agreedAmount, paidCredited, remainingDueToJj, status, ...extra }
}

function operating(
  category: OperatingAccountRow['category'],
  labelEn: string,
  labelHe: string,
  chargesToOwner: number,
  ownerCredits: number,
): OperatingAccountRow {
  return {
    category,
    labelEn,
    labelHe,
    chargesToOwner,
    ownerCredits,
    netEffectDueToJj: chargesToOwner - ownerCredits,
  }
}

function bridge(
  op: ClosingBridgeLine['op'],
  labelEn: string,
  labelHe: string,
  amountDueToJj: number,
): ClosingBridgeLine {
  return { op, labelEn, labelHe, amountDueToJj }
}

function payment(
  labelEn: string,
  labelHe: string,
  amount: number,
  kind: PropertySpecificPayment['kind'],
  reducesDueToJj: boolean,
): PropertySpecificPayment {
  return { labelEn, labelHe, amount, kind, reducesDueToJj }
}

const PACKS: readonly CertifiedPropertyAccountPack[] = [
  {
    evidenceRef: 'uriel-bridge-v2:kamares',
    displayNameHe: 'קמארס',
    overallState: 'partially_closed',
    contracts: [],
    operating: [
      operating('recurring', 'Management fees', 'עמלות ניהול', 1800, 0),
      operating('repairs', 'Accepted operating charges', 'חיובים שהתקבלו', 1656.78, 0),
      operating('ltr', 'Long-term rent', 'שכירות ארוכה', 0, 14400),
    ],
    closingBridge: [
      bridge('start', 'Setup and operations', 'הקמה ותפעול', 3456.78),
      bridge('subtract', 'Rental income', 'הכנסות שכירות', 14400),
      bridge('add', 'Already paid to owner', 'שולם לבעלים', 5400),
      bridge('equals', 'Property closing', 'יתרת הנכס', -5543.22),
    ],
    propertyPayments: [
      payment('Already paid to owner', 'שולם לבעלים', 5400, 'cash', false),
    ],
    explanationEn:
      'There is no open purchase, sale or renovation on this property. The long-term rental account is €14,400 income, less €5,400 already paid to the owner, less €1,800 fees, less €1,656.78 accepted charges. All historical rent months are closed. Only the owner balance of €5,543.22 remains open, payable to the owner.',
    explanationHe:
      'אין בנכס זה יתרת רכישה, מכירה או שיפוץ. חשבון השכירות הארוכה: הכנסות בסך 14,400 אירו, בניכוי 5,400 אירו ששולמו לבעלים, בניכוי עמלות 1,800 אירו ובניכוי חיובים שהתקבלו 1,656.78 אירו. כל חודשי השכירות ההיסטוריים סגורים. נותרה פתוחה רק יתרת הבעלים בסך 5,543.22 אירו לתשלום לבעלים.',
  },
  {
    evidenceRef: 'uriel-bridge-v2:oroklini',
    displayNameHe: 'אורוקליני 2 חדרי שינה',
    overallState: 'open',
    contracts: [],
    operating: [
      operating('setup', 'Key', 'מפתח', 5, 0),
      operating('repairs', 'Lock replacement', 'החלפת מנעול', 29.37, 0),
      operating('repairs', 'Cleaning', 'ניקיון', 150, 0),
      operating('repairs', 'Plumber', 'שרברב', 25, 0),
    ],
    closingBridge: [
      bridge('start', 'Setup and operations', 'הקמה ותפעול', 209.37),
      bridge('equals', 'Property closing', 'יתרת הנכס', 209.37),
    ],
    propertyPayments: [],
    explanationEn:
      'No purchase, sale or renovation balance is claimed. The open amount is operating and repair charges only: key €5, lock replacement €29.37 counted once (not as plumber), cleaning €150, and plumber €25. Property closing €209.37 payable to JJ.',
    explanationHe:
      'אין יתרת רכישה, מכירה או שיפוץ בנכס זה. היתרה הפתוחה היא חיוב תפעול ותיקונים בלבד: מפתח 5 אירו, החלפת מנעול 29.37 אירו שנספרה פעם אחת ולא כשרברב, ניקיון 150 אירו ושרברב 25 אירו. יתרת הנכס 209.37 אירו לתשלום לחברה.',
  },
  {
    evidenceRef: 'uriel-bridge-v2:studio-kitty',
    displayNameHe: 'סטודיו קיטי',
    overallState: 'partially_closed',
    contracts: [
      contract('purchase', 75000, 75000, 0, 'closed'),
      contract('sale', 85000, 85000, 0, 'closed'),
      contract(
        'renovation',
        5589,
        1500,
        4089,
        'partially_paid',
        {
          noteEn: 'The owner was charged €4,500 once for the two concrete jobs. The additional €1,500 cost is credited and not charged again.',
          noteHe: 'הבעלים חויב 4,500 אירו פעם אחת עבור שתי עבודות הבטון. עלות נוספת של 1,500 אירו זוכתה ואינה מחויבת שוב.',
        },
      ),
    ],
    operating: [],
    closingBridge: [
      bridge('start', 'Renovation remaining', 'יתרת שיפוץ', 4089),
      bridge('equals', 'Property closing', 'יתרת הנכס', 4089),
    ],
    propertyPayments: [],
    explanationEn:
      'The purchase and sale contracts are closed. The supporting property total is €5,589. From that total, JJ concrete cost of €1,500 is not chargeable to the owner. The owner was charged €4,500 once for the two concrete jobs, and that extra cost is not charged again. The renovation/project remains open with €4,089 still payable to JJ.',
    explanationHe:
      'חוזי הרכישה והמכירה סגורים. הסכום התומך בנכס הוא 5,589 אירו. מתוכו עלות בטון פנימית בסך 1,500 אירו אינה מחויבת לבעלים. הבעלים חויב 4,500 אירו פעם אחת עבור שתי עבודות הבטון, והעלות הנוספת אינה מחויבת שוב. פרויקט השיפוץ נשאר פתוח ביתרה של 4,089 אירו לתשלום לחברה.',
  },
  {
    evidenceRef: 'uriel-bridge-v2:metro',
    displayNameHe: 'מטרו שרון אינגליש',
    overallState: 'open',
    contracts: [
      contract(
        'sale',
        280000,
        239450,
        40550,
        'partially_paid',
        {
          noteEn: 'The client sale contract of €280,000 remains open. Payments of €239,450 were received, so €40,550 is still unpaid on that contract.',
          noteHe: 'חוזה המכירה ללקוח בסך 280,000 אירו נשאר פתוח. התקבלו תשלומים בסך 239,450 אירו, ולכן נותרה יתרה של 40,550 אירו על החוזה.',
        },
      ),
    ],
    operating: [
      operating('repairs', 'Garden job 1', 'עבודת גינה 1', 150, 0),
      operating('repairs', 'Garden job 2', 'עבודת גינה 2', 150, 0),
    ],
    closingBridge: [
      bridge('start', 'Sale remaining', 'יתרת חוזה המכירה', 40550),
      bridge('add', 'Setup and operations', 'הקמה ותפעול', 300),
      bridge('equals', 'Property closing', 'יתרת הנכס', 40850),
    ],
    propertyPayments: [],
    explanationEn:
      'The open contract is the client sale contract of €280,000. Payments received are €239,450, so €40,550 remains unpaid on that sale. Garden job 1 €150 and garden job 2 €150 (owner-approved, no transaction date recorded) are added. Property closing €40,850 payable to JJ.',
    explanationHe:
      'החוזה שנותר פתוח הוא חוזה המכירה ללקוח בסך 280,000 אירו. התקבלו תשלומים בסך 239,450 אירו, ולכן נותרה יתרה של 40,550 אירו על חוזה המכירה. נוספו שתי עבודות גינה של 150 אירו כל אחת. השנייה מאושרת לבעלים ובלי תאריך עסקה. יתרת הנכס 40,850 אירו לתשלום לחברה.',
  },
  {
    evidenceRef: 'uriel-bridge-v2:debenhams',
    displayNameHe: 'דבנהמס',
    overallState: 'open',
    contracts: [
      contract(
        'renovation',
        3800,
        0,
        3800,
        'open',
        {
          noteEn: 'The renovation contract is unpaid. The full client balance remains open.',
          noteHe: 'חוזה השיפוץ לא שולם. יתרת הלקוח נשארה פתוחה במלואה.',
        },
      ),
    ],
    operating: [
      operating('setup', 'Key', 'מפתח', 5.25, 0),
    ],
    closingBridge: [
      bridge('start', 'Renovation remaining', 'יתרת שיפוץ', 3800),
      bridge('add', 'Setup and operations', 'הקמה ותפעול', 5.25),
      bridge('equals', 'Property closing', 'יתרת הנכס', 3805.25),
    ],
    propertyPayments: [],
    explanationEn:
      'The renovation contract of €3,800 has not been paid, so the full renovation balance remains open. A key charge of €5.25 is added. Property closing €3,805.25 payable to JJ.',
    explanationHe:
      'חוזה השיפוץ בסך 3,800 אירו לא שולם, ולכן יתרת השיפוץ נשארה פתוחה במלואה. נוסף מפתח 5.25 אירו. יתרת הנכס 3,805.25 אירו לתשלום לחברה.',
  },
  {
    evidenceRef: 'uriel-bridge-v2:kokkines',
    displayNameHe: 'קוקינס',
    overallState: 'partially_closed',
    contracts: [
      contract('sale', 68000, 68000, 0, 'closed'),
      contract(
        'renovation',
        40000,
        25000,
        15000,
        'partially_paid',
        {
          noteEn: 'Renovation contract €40,000. Payments and credits €25,000. Remaining €15,000 is still open.',
          noteHe: 'חוזה שיפוץ 40,000 אירו. תשלומים וזיכויים 25,000 אירו. נותרה יתרה פתוחה של 15,000 אירו.',
        },
      ),
    ],
    operating: [
      operating('recurring', 'Water', 'מים', 64.58, 0),
      operating('recurring', 'Electricity', 'חשמל', 61.05, 0),
    ],
    closingBridge: [
      bridge('start', 'Renovation remaining', 'יתרת שיפוץ', 15000),
      bridge('add', 'Setup and operations', 'הקמה ותפעול', 125.63),
      bridge('equals', 'Property closing', 'יתרת הנכס', 15125.63),
    ],
    propertyPayments: [],
    explanationEn:
      'The sale contract is closed. The renovation contract is €40,000. Payments and credits of €25,000 were applied, so €15,000 remains open on renovation. Water €64.58 and electricity €61.05 are added. Property closing €15,125.63 payable to JJ.',
    explanationHe:
      'חוזה המכירה סגור. חוזה השיפוץ הוא 40,000 אירו. הוחלו תשלומים וזיכויים בסך 25,000 אירו, ולכן נותרה יתרת שיפוץ פתוחה של 15,000 אירו. נוספו מים 64.58 אירו וחשמל 61.05 אירו. יתרת הנכס 15,125.63 אירו לתשלום לחברה.',
  },
  {
    evidenceRef: 'uriel-bridge-v2:behind-yoav',
    displayNameHe: 'דירת ניר יואב דקליה',
    overallState: 'partially_closed',
    contracts: [
      contract(
        'purchase',
        220000,
        182098,
        37902,
        'partially_paid',
        {
          noteEn: 'The €7,000 payment is counted once inside accepted payments. The €13,900 duplicate representation is already inside that total and is not deducted again.',
          noteHe: 'התשלום 7,000 אירו נספר פעם אחת בתוך התשלומים שהתקבלו. הייצוג הכפול 13,900 אירו כבר כלול בסכום זה ואינו מנוכה שוב.',
        },
      ),
    ],
    operating: [
      operating('setup', 'Accepted setup', 'הקמה שהתקבלה', 9379.88, 0),
      operating('recurring', 'Recurring from 01.06.2026', 'הוצאות שוטפות מ-01.06.2026', 763.18, 0),
      operating('str', 'Short-term rental owner credit Jun–Aug', 'זיכוי שכירות קצרה יוני–אוגוסט', 0, 3434.98),
    ],
    closingBridge: [
      bridge('start', 'Purchase remaining', 'יתרת רכישה', 37902),
      bridge('add', 'Setup and operations', 'הקמה ותפעול', 10143.06),
      bridge('subtract', 'Rental / STR credit', 'זיכוי שכירות / שכירות קצרה', 3434.98),
      bridge('equals', 'Property closing', 'יתרת הנכס', 44610.08),
    ],
    propertyPayments: [
      payment('Accepted purchase payments', 'תשלומי רכישה שהתקבלו', 182098, 'cash', true),
    ],
    strMonths: [
      { month: '2026-06', bookings: null, nights: null, gross: null, platformFees: null, cleaning: null, tax: null, management: null, ownerNet: 947.25 },
      { month: '2026-07', bookings: null, nights: null, gross: null, platformFees: null, cleaning: null, tax: null, management: null, ownerNet: 1525.77 },
      { month: '2026-08', bookings: null, nights: null, gross: null, platformFees: null, cleaning: null, tax: null, management: null, ownerNet: 961.96 },
    ],
    explanationEn:
      'The purchase is not closed. From a client purchase contract of €220,000, accepted payments of €182,098 were received, so €37,902 remains. The €7,000 payment is counted once. The €13,900 duplicate representation is not deducted again. Setup of €9,379.88 includes the fire kit €34.12 once. Recurring expenses before 01.06.2026 are not charged; accepted recurring from that date is €763.18. Short-term rental owner credits are June €947.25, July €1,525.77 and August €961.96, total €3,434.98. Property closing €44,610.08 payable to JJ. The system name remains Apartment Neer Yoav Dekelia.',
    explanationHe:
      'עסקת הרכישה טרם נסגרה. מתוך מחיר רכישה של 220,000 אירו התקבלו תשלומים בסך 182,098 אירו, ולכן נותרה יתרת רכישה של 37,902 אירו. התשלום 7,000 אירו נספר פעם אחת. הייצוג הכפול 13,900 אירו אינו מנוכה שוב. ההקמה 9,379.88 אירו כוללת את ערכת הכיבוי 34.12 אירו פעם אחת. הוצאות שוטפות לפני 01.06.2026 אינן מחויבות. ממועד זה חויבו 763.18 אירו. זיכויי שכירות קצרה: יוני 947.25, יולי 1,525.77, אוגוסט 961.96, סה"כ 3,434.98 אירו. יתרת הנכס 44,610.08 אירו לתשלום לחברה.',
  },
  {
    evidenceRef: 'uriel-bridge-v2:duplex',
    displayNameHe: 'דופלקס',
    overallState: 'partially_closed',
    contracts: [
      contract('sale', 215000, 215000, 0, 'closed'),
      contract(
        'renovation',
        35935,
        13790,
        22145,
        'partially_paid',
        {
          noteEn: 'Renovation contract €28,000 plus approved extras €7,935. Payments €13,790. Remaining €22,145 is still open.',
          noteHe: 'חוזה שיפוץ 28,000 אירו ותוספות מאושרות 7,935 אירו. תשלומים 13,790 אירו. נותרה יתרה פתוחה של 22,145 אירו.',
        },
      ),
    ],
    operating: [
      operating('repairs', 'Additional owner expenses', 'הוצאות נוספות לבעלים', 8393.53, 0),
      operating('ltr', 'Rental income / credits', 'הכנסות / זיכויי שכירות', 0, 7000),
      operating('str', 'Short-term rental owner credit', 'זיכוי שכירות קצרה', 0, 6983.1),
    ],
    closingBridge: [
      bridge('start', 'Renovation remaining', 'יתרת שיפוץ', 22145),
      bridge('add', 'Setup and operations', 'הקמה ותפעול', 8393.53),
      bridge('subtract', 'Rental / STR credit', 'זיכוי שכירות / שכירות קצרה', 13983.1),
      bridge('equals', 'Property closing', 'יתרת הנכס', 16555.43),
    ],
    propertyPayments: [],
    explanationEn:
      'The sale contract is closed. Renovation is still open: contractual remainder €22,145 after payments of €13,790 on agreed €35,935. Rental income/credits of €7,000 equal 9 × €500 + €1,000 + €1,500; there is no separate €5,500 extra rental layer outside the ledger. Additional owner expenses are €8,393.53. The €100 cleaning already appears inside the short-term rental cleaning and is not added again. The short-term rental credit is €6,983.10. A historical short-term result of €1,251.41 is rejected and not used. After those credits, €16,555.43 remains payable to JJ.',
    explanationHe:
      'חוזה המכירה סגור. השיפוץ עדיין פתוח: יתרה חוזית 22,145 אירו לאחר תשלומים של 13,790 אירו מתוך 35,935 אירו מוסכמים. הכנסות השכירות 7,000 אירו מורכבות מתשעה חודשים כפול 500 אירו, ועוד 1,000 אירו ועוד 1,500 אירו. אין שכבת שכירות נפרדת של 5,500 אירו מחוץ לרישום. הוצאות נוספות לבעלים 8,393.53 אירו. ניקיון 100 אירו כבר כלול בניקיון של השכירות הקצרה ואינו מתווסף שוב. זיכוי השכירות הקצרה הוא 6,983.10 אירו. תוצאה היסטורית של 1,251.41 אירו נדחתה ואינה בשימוש. לאחר הזיכויים נותרה יתרת נכס 16,555.43 אירו לתשלום לחברה.',
  },
]

export const CERTIFIED_PROPERTY_ACCOUNT_PACKS: ReadonlyMap<string, CertifiedPropertyAccountPack> =
  new Map(PACKS.map((pack) => [pack.evidenceRef, pack]))

export function composeLiveCertifiedPropertyAccount(
  certified: CertifiedClientSettlementAvailable,
): CertifiedPropertyAccountCompose {
  return composeCertifiedPropertyAccount(certified, CERTIFIED_PROPERTY_ACCOUNT_PACKS)
}
