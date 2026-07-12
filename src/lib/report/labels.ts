/**
 * JJ Property 10 — Client-Facing Label Overrides & i18n
 * Phase A: display label overrides (Sale → Purchase perspective)
 * Phase B: full EN / HE label system, expense group mapping, buildRowLabel()
 *
 * Rules:
 *  - NEVER write these values to the database
 *  - NEVER modify accounting logic, client_amount, or balance calculations
 *  - All client-visible strings must come from this file
 */

import type { ClientDisplayRow } from './clientRow'

/* ──────────────────────────────────────────────────────────────────────────────
 * PHASE A — Display label overrides (kept for backward compatibility)
 * ──────────────────────────────────────────────────────────────────────────── */

/** Exact-match overrides: internal display_label → client-facing label.
 *  The client is the BUYER so "Sale" from JJ's perspective is "Purchase". */
export const DISPLAY_LABEL_OVERRIDES: Record<string, string> = {
  'Sale Contract':                                   'Purchase Contract',
  'Sale Contract (Reference)':                       'Purchase Contract (Reference)',
  'Client Sale Expenses':                            'Purchase Expenses',
  'Sale Tax':                                        'Purchase / Transfer Tax',
  'Third-Party Payment (Bank Transfer to Seller)':   'Direct Payment to Seller',
  'Property Sale':                                   'Property Purchase',
}

/** Returns the client-facing display label. Pass-through if no override exists. */
export function overrideDisplayLabel(label: string): string {
  if (!label) return label
  return DISPLAY_LABEL_OVERRIDES[label] ?? label
}

/** Section header labels — static EN (kept for backward compat with Phase A PDF import) */
export const SECTION_LABELS = {
  contractInfo:     'Contract Information',
  contractInfoNote: 'Shown for reference only — does not affect settlement balance',
} as const

/** Account type → EN label */
export const ACCOUNT_LABEL_EN: Record<string, string> = {
  sale:       'Property Purchase',
  renovation: 'Renovation',
  rental:     'Rental',
  airbnb:     'Short-Term Rental',
}

/** Account type → HE label */
export const ACCOUNT_LABEL_HE: Record<string, string> = {
  sale:       'רכישת נכס',
  renovation: 'שיפוץ',
  rental:     'השכרה',
  airbnb:     'השכרה לטווח קצר',
}

/* ──────────────────────────────────────────────────────────────────────────────
 * PHASE B — i18n label system
 * ──────────────────────────────────────────────────────────────────────────── */

export type Lang = 'en' | 'he'

/* All user-visible strings, bilingual. Add new strings here — never inline. */
const L = {

  /* ── Balance wording ── client-facing only, no internal accounting terms ── */
  balPayableToYou:      { en: 'Amount Payable to You by JJ',  he: 'סכום לתשלום אליך על ידי JJ' },
  balPayableByYou:      { en: 'Amount Payable by You to JJ',  he: 'סכום לתשלום על ידך ל-JJ'   },
  balSettled:           { en: 'Settled',                       he: 'סגור / ללא יתרה'            },

  /* ── Top bar ─────────────────────────────────────────────────────────────── */
  reportTitle:          { en: 'Client Financial Report',       he: 'דוח פיננסי ללקוח'           },
  confidential:         { en: 'Confidential',                  he: 'סודי'                        },

  /* ── Module names ────────────────────────────────────────────────────────── */
  accountSale:          { en: 'Property Purchase',   he: 'רכישת נכס'          },
  accountRenovation:    { en: 'Renovation',          he: 'שיפוץ'              },
  accountRental:        { en: 'Rental',              he: 'השכרה'              },
  accountAirbnb:        { en: 'Short-Term Rental',   he: 'השכרה לטווח קצר'   },

  /* ── Owner Dashboard — aggregate KPIs ───────────────────────────────────── */
  dashTitle:            { en: 'Owner Dashboard',                  he: 'לוח בקרה לבעלים'        },
  dashSubtitle:         { en: 'Your complete financial overview',  he: 'סקירה פיננסית מלאה'     },
  dashIncome:           { en: 'Total Income',                     he: 'סך הכנסות'              },
  dashExpenses:         { en: 'Total Expenses',                   he: 'סך הוצאות'              },
  dashTransfers:        { en: 'Transfers to Owner',               he: 'העברות לבעלים'          },
  dashBalance:          { en: 'Current Balance',                  he: 'יתרה כוללת'             },
  dashStatusLabel:      { en: 'Account Status',                   he: 'סטטוס חשבון'            },

  /* ── Executive summary ───────────────────────────────────────────────────── */
  execTitle:            { en: 'Financial Summary',   he: 'סיכום פיננסי'       },
  execProperty:         { en: 'Property',            he: 'נכס'                },
  execPeriod:           { en: 'Period',              he: 'תקופה'              },
  execAllDates:         { en: 'All dates',           he: 'כל התאריכים'        },

  /* ── Summary cards — Sale ────────────────────────────────────────────────── */
  cardSaleContract:     { en: 'Contract Value',      he: 'ערך חוזה'          },
  cardSaleExpenses:     { en: 'Purchase Expenses',   he: 'הוצאות רכישה'      },
  cardSalePayments:     { en: 'Payments Made',       he: 'תשלומים שבוצעו'    },
  cardSaleBalance:      { en: 'Current Balance',     he: 'יתרה נוכחית'       },

  /* ── Summary cards — Renovation ─────────────────────────────────────────── */
  cardRenovContract:    { en: 'Renovation Contract', he: 'חוזה שיפוץ'        },
  cardRenovExtras:      { en: 'Approved Extras',     he: 'תוספות מאושרות'    },
  cardRenovTotal:       { en: 'Total Contract',      he: 'סכום חוזה כולל'    },
  cardRenovPayments:    { en: 'Client Payments',     he: 'תשלומים שבוצעו'    },
  cardRenovBalance:     { en: 'Current Balance',     he: 'יתרה נוכחית'       },

  /* ── Summary cards — Rental ──────────────────────────────────────────────── */
  cardRentalIncome:     { en: 'Rental Income',             he: 'הכנסות שכירות'     },
  cardRentalExpenses:   { en: 'Property Expenses',          he: 'הוצאות נכס'        },
  cardRentalBpo:        { en: 'Transfers to Owner',         he: 'העברות לבעלים'     },
  cardRentalBalance:    { en: 'Current Balance',            he: 'יתרה נוכחית'       },

  /* ── Summary cards — Airbnb ──────────────────────────────────────────────── */
  cardAirbnbIncome:     { en: 'Platform Income',            he: 'הכנסות פלטפורמה'   },
  cardAirbnbExpenses:   { en: 'Property Expenses',           he: 'הוצאות נכס'        },
  cardAirbnbBpo:        { en: 'Transfers to Owner',          he: 'העברות לבעלים'     },
  cardAirbnbBalance:    { en: 'Current Balance',             he: 'יתרה נוכחית'       },

  /* ── Row-level labels (transaction descriptions shown to client) ──────────── */
  rowClientPayment:     { en: 'Client Payment',                  he: 'תשלום לקוח'              },
  rowDirectSeller:      { en: 'Direct Payment to Seller',        he: 'תשלום ישיר למוכר'        },
  rowPurchaseExpense:   { en: 'Purchase Expense',                he: 'הוצאת רכישה'             },
  rowPurchaseTax:       { en: 'Purchase / Transfer Tax',         he: 'מס רכישה / העברה'        },
  rowRenovPayment:      { en: 'Renovation Payment',              he: 'תשלום שיפוץ'             },
  rowApprovedExtra:     { en: 'Approved Extra',                  he: 'תוספת מאושרת'            },
  rowRentalPayment:     { en: 'Rental Payment',                  he: 'תשלום שכירות'            },
  rowOwnerTransfer:     { en: 'Transfer to Owner',               he: 'העברה לבעלים'            },
  rowPlatformIncome:    { en: 'Platform Income',                 he: 'הכנסות פלטפורמה'         },
  rowPropertyExpense:   { en: 'Property Expense',                he: 'הוצאת נכס'               },
  rowContractRef:       { en: 'Purchase Contract (Reference)',   he: 'חוזה רכישה (לעיון)'      },
  rowRenovContractRef:  { en: 'Renovation Contract (Reference)', he: 'חוזה שיפוץ (לעיון)'      },
  rowInfoInternal:      { en: 'Internal (Tracking Only)',        he: 'פנימי (מעקב בלבד)'       },

  /* ── Subcategory display labels (for individual expense row labels) ───────── */
  subElectricity:       { en: 'Electricity',             he: 'חשמל'               },
  subWater:             { en: 'Water',                   he: 'מים'                },
  subInternet:          { en: 'Internet',                he: 'אינטרנט'            },
  subHoa:               { en: 'Building / HOA',          he: 'ועד בית'            },
  subMaintenance:       { en: 'Maintenance',             he: 'תחזוקה'             },
  subCleaning:          { en: 'Cleaning',                he: 'ניקיון'             },
  subInsurance:         { en: 'Insurance',               he: 'ביטוח'              },
  subManagementFee:     { en: 'Management Fee',          he: 'דמי ניהול'          },
  subFurniture:         { en: 'Furniture & Equipment',   he: 'ריהוט וציוד'        },
  subGuestSupplies:     { en: 'Guest Supplies',          he: 'אביזרי אורחים'     },
  subSoftware:          { en: 'Software',                he: 'תוכנה'              },

  /* ── Expense group headers (Rental / Airbnb grouping — 10 groups) ─────────── */
  expUtilities:         { en: 'Utilities',               he: 'שירותים'                      },
  expMaintenance:       { en: 'Maintenance',             he: 'תחזוקה'                       },
  expBuildingHoa:       { en: 'Building / HOA',          he: 'ועד בית'                      },
  expCleaning:          { en: 'Cleaning',                he: 'ניקיון'                       },
  expInsurance:         { en: 'Insurance',               he: 'ביטוח'                        },
  expManagement:        { en: 'Management',              he: 'ניהול'                        },
  expFurniture:         { en: 'Furniture & Equipment',   he: 'ריהוט וציוד'                  },
  expGuestSupplies:     { en: 'Guest Supplies',          he: 'אביזרי אורחים'               },
  expSoftware:          { en: 'Software',                he: 'תוכנה'                        },
  expOther:             { en: 'Other Property Expenses', he: 'הוצאות נכס אחרות'            },

  // Expense group headers — individual utility lines (M3)
  grpElectricity:       { en: 'Electricity',              he: 'חשמל'                         },
  grpWater:             { en: 'Water',                    he: 'מים'                          },
  grpInternet:          { en: 'Internet',                 he: 'אינטרנט'                      },

  /* ── Section labels ──────────────────────────────────────────────────────── */
  contractInfo:         { en: 'Contract Information',
                          he: 'פרטי חוזה' },
  contractInfoNote:     { en: 'Shown for reference only — does not affect settlement balance',
                          he: 'מוצג לעיון בלבד — אינו משפיע על יתרת החשבון' },

  /* ── Table headers ───────────────────────────────────────────────────────── */
  thDate:               { en: 'Date',         he: 'תאריך'   },
  thDescription:        { en: 'Description',  he: 'תיאור'   },
  thAmount:             { en: 'Amount',        he: 'סכום'    },
  total:                { en: 'Total',         he: 'סה"כ'    },

  /* ── Income / expense group headers inside each account ─────────────────── */
  incomeSale:           { en: 'Charges & Expenses',              he: 'חיובים והוצאות'       },
  expensesSale:         { en: 'Payments Received',               he: 'תשלומים שהתקבלו'      },
  incomeRenov:          { en: 'Additional Approved Charges',     he: 'חיובים נוספים מאושרים' },
  expensesRenov:        { en: 'Payments Received',               he: 'תשלומים שהתקבלו'      },
  incomeRental:         { en: 'Rental Income',                   he: 'הכנסות שכירות'        },
  expensesRental:       { en: 'Property Expenses',               he: 'הוצאות נכס'           },
  incomeAirbnb:         { en: 'Platform Income',                 he: 'הכנסות פלטפורמה'      },
  expensesAirbnb:       { en: 'Property Expenses',               he: 'הוצאות נכס'           },
  bpoLabel:             { en: 'Payments Sent to You',            he: 'תשלומים שהועברו אליך'  },

  /* ── Final Summary ───────────────────────────────────────────────────────── */
  finalTitle:           { en: 'Settlement Summary',              he: 'סיכום התחשבנות'          },
  finalTotalIncome:     { en: 'Total Income Received',           he: 'סך הכנסות שהתקבלו'       },
  finalTotalExpenses:   { en: 'Total Property Expenses',         he: 'סך הוצאות הנכס'           },
  finalTotalTransfers:  { en: 'Total Transfers to Owner',        he: 'סך העברות לבעלים'         },
  finalCurrentBalance:  { en: 'Current Balance',                 he: 'יתרה נוכחית'              },
  finalNoteTitle:       { en: 'Important Note',                  he: 'הערה חשובה'               },
  finalDisclaimer:      { en: 'This report is prepared for informational purposes. Figures are based on recorded transactions and are subject to final audit and reconciliation. Opening balances from prior periods are not yet included.',
                          he: 'דוח זה נערך למטרות מידע בלבד. הנתונים מבוססים על עסקאות שנרשמו וכפופים לביקורת ופיוס סופי. יתרות פתיחה מתקופות קודמות אינן כלולות עדיין.' },
  finalGenerated:       { en: 'Report generated',                he: 'הדוח נוצר'                },

  /* ── Controls ────────────────────────────────────────────────────────────── */
  property:             { en: 'Property',     he: 'נכס'         },
  fromDate:             { en: 'From Date',    he: 'מתאריך'      },
  toDate:               { en: 'To Date',      he: 'עד תאריך'    },
  loadReport:           { en: 'Load Report',  he: 'טען דוח'     },
  loading:              { en: 'Loading…',     he: 'טוען…'        },
  downloadPdf:          { en: 'Download PDF', he: 'הורד PDF'    },
  buildingPdf:          { en: 'Building PDF…',he: 'מכין PDF…'   },
  allDates:             { en: 'All dates',    he: 'כל התאריכים' },
  rows:                 { en: 'rows',         he: 'רשומות'      },
  accounts:             { en: 'accounts',     he: 'חשבונות'     },
  noTransactions:       { en: 'No transactions found for the selected property and date range.',
                          he: 'לא נמצאו עסקאות עבור הנכס הנבחר בטווח התאריכים.' },
  showInfoRows:         { en: 'Show informational rows',  he: 'הצג שורות מידע' },
  hideInfoRows:         { en: 'Hide',                     he: 'הסתר'           },
  platformTracking:     { en: 'platform tracking, trust account, needs review',
                          he: 'מעקב פלטפורמה, חשבון נאמנות, דורש בדיקה' },

  /* ── Report type selector (M1) — added M0 ──────────────────────────────── */
  reportTypeLabel:      { en: 'Report Type',     he: 'סוג דוח'      },
  reportTypeFull:       { en: 'Full Report',     he: 'דוח מלא'      },
  reportTypePeriodic:   { en: 'Periodic Report', he: 'דוח תקופתי'   },

  /* ── Executive Summary M2 ────────────────────────────────────────────────── */
  opSummaryTitle:       { en: 'Operational Summary',   he: 'סיכום תפעולי'       },
  opIncomeLabel:        { en: 'Operational Income',    he: 'הכנסות תפעוליות'    },
  opExpensesLabel:      { en: 'Operational Expenses',  he: 'הוצאות תפעוליות'   },

  /* ── Opening balance warning ──────────────────────────────────────────────── */
  openingBalTitle:      { en: 'Opening Balance Not Included.',
                          he: 'יתרת פתיחה לא כלולה.' },
  openingBalDetail:     { en: 'Date-filtered reports may show incorrect closing balances because prior-period balances are not yet carried forward. Use all-time (unfiltered) reports only for financial review.',
                          he: 'דוחות עם סינון תאריכים עלולים להציג יתרות סגירה שגויות. יש להשתמש בדוחות ללא סינון בלבד לצורכי בדיקה פיננסית.' },


  /* ── Meta / footer ────────────────────────────────────────────────────── */
  metaGenerated: { en: 'Generated',    he: 'נוצר ב'  },
  pageLabel:     { en: 'Page',          he: 'עמוד'          },

} as const

export type LabelKey = keyof typeof L

/** Translate a label key to the requested language. Falls back to English. */
export function t(key: LabelKey, lang: Lang = 'en'): string {
  const entry = L[key] as Record<Lang, string> | undefined
  if (!entry) return key
  return entry[lang] ?? entry.en
}

/* ──────────────────────────────────────────────────────────────────────────────
 * PHASE B — Expense group mapping (Rental / Airbnb — 10 groups)
 * ──────────────────────────────────────────────────────────────────────────── */

/** Maps transaction subcategory strings → expense group label key */
export const EXPENSE_GROUP_MAP: Partial<Record<string, LabelKey>> = {
  // Utilities — individual groups (M3)
  'Electricity':           'grpElectricity',
  'Electricity bill':      'grpElectricity',
  'Electric':              'grpElectricity',
  'Water':                 'grpWater',
  'Internet':              'grpInternet',
  // Maintenance
  'Repairs':               'expMaintenance',
  'Repair':                'expMaintenance',
  'Maintenance':           'expMaintenance',
  'General Maintenance':   'expMaintenance',
  'Pool':                  'expMaintenance',
  'Pool Service':          'expMaintenance',
  'Workers':               'expMaintenance',
  'Materials':             'expMaintenance',
  'Plumber':               'expMaintenance',
  'Key Duplication':       'expMaintenance',
  'Minor Renovation':      'expMaintenance',
  // Building / HOA
  'HOA':                   'expBuildingHoa',
  'HOA Fee':               'expBuildingHoa',
  'Building Fee':          'expBuildingHoa',
  'Building Fees':         'expBuildingHoa',
  'Municipal Charges':     'expBuildingHoa',
  'Municipality':          'expBuildingHoa',
  'Municipality Tax':      'expBuildingHoa',
  // Cleaning
  'Cleaning':              'expCleaning',
  'Cleaning Fee':          'expCleaning',
  'Laundry':               'expCleaning',
  // Insurance
  'Insurance':             'expInsurance',
  // Management
  'Management Fee':        'expManagement',
  // Furniture & Equipment
  'Furniture':             'expFurniture',
  'Equipment':             'expFurniture',
  'Appliances':            'expFurniture',
  'Electrical Appliances': 'expFurniture',
  'Airbnb Equipment':      'expFurniture',
  'Curtains':              'expFurniture',
  'Kitchen':               'expFurniture',
  'Kitchen Supply':        'expFurniture',
  // Guest Supplies
  'Guest Supplies':        'expGuestSupplies',
  'Bedding/Pillows/Blankets': 'expGuestSupplies',
  'Bedding':               'expGuestSupplies',
  'Pillows':               'expGuestSupplies',
  'Consumable Supplies':   'expGuestSupplies',
  'Wine':                  'expGuestSupplies',
  'Sweets':                'expGuestSupplies',
  // Software
  'Software':              'expSoftware',
  'Hostaway':              'expSoftware',
  'Software/Hostaway':     'expSoftware',
  'Platform Fee':          'expSoftware',
}

/** Returns the expense group label key for a given subcategory. Defaults to 'expOther'. */
export function getExpenseGroupKey(subcategory: string | null): LabelKey {
  if (!subcategory) return 'expOther'
  return EXPENSE_GROUP_MAP[subcategory.trim()] ?? 'expOther'
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Internal: subcategory → label key (used by buildRowLabel for expense rows)
 * ──────────────────────────────────────────────────────────────────────────── */

const SUBCATEGORY_LABEL_KEYS: Partial<Record<string, LabelKey>> = {
  'Electricity':               'subElectricity',
  'Electricity bill':          'subElectricity',
  'Electric':                  'subElectricity',
  'Water':                     'subWater',
  'Internet':                  'subInternet',
  'HOA':                       'subHoa',
  'HOA Fee':                   'subHoa',
  'Building Fee':              'subHoa',
  'Building Fees':             'subHoa',
  'Municipal Charges':         'subHoa',
  'Municipality':              'subHoa',
  'Municipality Tax':          'subHoa',
  'Repairs':                   'subMaintenance',
  'Repair':                    'subMaintenance',
  'Maintenance':               'subMaintenance',
  'General Maintenance':       'subMaintenance',
  'Pool':                      'subMaintenance',
  'Pool Service':              'subMaintenance',
  'Workers':                   'subMaintenance',
  'Materials':                 'subMaintenance',
  'Plumber':                   'subMaintenance',
  'Key Duplication':           'subMaintenance',
  'Minor Renovation':          'subMaintenance',
  'Cleaning':                  'subCleaning',
  'Cleaning Fee':              'subCleaning',
  'Laundry':                   'subCleaning',
  'Insurance':                 'subInsurance',
  'Management Fee':            'subManagementFee',
  'Furniture':                 'subFurniture',
  'Equipment':                 'subFurniture',
  'Appliances':                'subFurniture',
  'Electrical Appliances':     'subFurniture',
  'Airbnb Equipment':          'subFurniture',
  'Curtains':                  'subFurniture',
  'Kitchen':                   'subFurniture',
  'Kitchen Supply':            'subFurniture',
  'Guest Supplies':            'subGuestSupplies',
  'Bedding/Pillows/Blankets':  'subGuestSupplies',
  'Bedding':                   'subGuestSupplies',
  'Pillows':                   'subGuestSupplies',
  'Consumable Supplies':       'subGuestSupplies',
  'Wine':                      'subGuestSupplies',
  'Sweets':                    'subGuestSupplies',
  'Software':                  'subSoftware',
  'Hostaway':                  'subSoftware',
  'Software/Hostaway':         'subSoftware',
  'Platform Fee':              'subSoftware',
}

/* ──────────────────────────────────────────────────────────────────────────────
 * PHASE B — buildRowLabel: client-facing label per transaction row
 *
 * Maps display_group + display_label + account_type + subcategory → translated string.
 *
 * ACCOUNTING FREEZE: reads display_group/display_label from computeBalance.ts output.
 * Does NOT modify balance_effect, client_amount, or any accounting field.
 * Presentation-only. Do not change behavior in response to accounting questions.
 * ──────────────────────────────────────────────────────────────────────────── */

export function buildRowLabel(row: ClientDisplayRow, lang: Lang): string {
  const dl   = row.display_label ?? ''
  const grp  = row.display_group
  const acct = row.account_type
  const sub  = row.subcategory ?? ''

  // ── payment_out (Bank Payment to Owner / BPO) ────────────────────────────
  if (grp === 'payment_out') return t('rowOwnerTransfer', lang)

  // ── income ───────────────────────────────────────────────────────────────
  if (grp === 'income') {
    if (dl === 'Payment Received')
      return acct === 'renovation' ? t('rowRenovPayment', lang) : t('rowClientPayment', lang)
    if (dl === 'Third-Party Payment (Bank Transfer to Seller)')
      return t('rowDirectSeller', lang)
    if (dl === 'Rent Collected')
      return t('rowRentalPayment', lang)
    if (dl === 'Platform Income (Net to You)')
      return t('rowPlatformIncome', lang)
    if (dl === 'Client Payment')
      return t('rowClientPayment', lang)
    return dl || '—'
  }

  // ── expense ──────────────────────────────────────────────────────────────
  if (grp === 'expense') {
    if (dl === 'Client Sale Expenses' || sub === 'Client Sale Expenses')
      return t('rowPurchaseExpense', lang)
    if (dl === 'Sale Tax' || sub === 'Sale Tax')
      return t('rowPurchaseTax', lang)
    if (dl === 'Extras (Additional Work)')
      return t('rowApprovedExtra', lang)
    // Rental / Airbnb: clean subcategory label
    const key = SUBCATEGORY_LABEL_KEYS[sub.trim()]
    if (key) return t(key, lang)
    return sub || t('rowPropertyExpense', lang)
  }

  // ── reference ────────────────────────────────────────────────────────────
  if (grp === 'reference') {
    if (dl === 'Sale Contract (Reference)' || dl === 'Sale Contract')
      return t('rowContractRef', lang)
    if (dl === 'Renovation Contract (Reference)')
      return t('rowRenovContractRef', lang)
    if (dl.endsWith(' (Internal)'))
      return t('rowInfoInternal', lang)
    return overrideDisplayLabel(dl) || '—'
  }

  // ── info (platform tracking, trust account, needs review) ────────────────
  return overrideDisplayLabel(dl) || '—'
}
