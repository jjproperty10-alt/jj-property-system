/**
 * JJ Property 10 — Client-Facing Label Overrides & i18n
 * Phase A: display label overrides (Sale → Purchase perspective)
 * Phase B: full EN / HE label system, expense group mapping
 *
 * Rules:
 *  - NEVER write these values to the database
 *  - NEVER modify accounting logic, client_amount, or balance calculations
 *  - All client-visible strings must come from this file
 */

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
  dashTitle:            { en: 'Owner Dashboard',         he: 'לוח בקרה לבעלים'    },
  dashIncome:           { en: 'Total Income',             he: 'סך הכנסות'           },
  dashExpenses:         { en: 'Total Expenses',           he: 'סך הוצאות'           },
  dashTransfers:        { en: 'Transfers to Owner',       he: 'העברות לבעלים'       },
  dashBalance:          { en: 'Current Balance (Net)',    he: 'יתרה כוללת נטו'      },

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

  /* ── Expense categories (Rental / Airbnb grouping) ──────────────────────── */
  expElectricity:       { en: 'Electricity',             he: 'חשמל'                 },
  expWater:             { en: 'Water',                   he: 'מים'                  },
  expInternet:          { en: 'Internet',                he: 'אינטרנט'              },
  expHoa:               { en: 'HOA / Building Fees',     he: 'ועד בית / דמי ניהול'  },
  expRepairs:           { en: 'Repairs & Maintenance',   he: 'תיקונים ותחזוקה'       },
  expCleaning:          { en: 'Cleaning',                he: 'ניקיון'               },
  expInsurance:         { en: 'Insurance',               he: 'ביטוח'                },
  expFurniture:         { en: 'Furniture / Equipment',   he: 'ריהוט / ציוד'         },
  expSoftware:          { en: 'Software / Hostaway',     he: 'תוכנה / Hostaway'     },
  expOther:             { en: 'Other Property Expenses', he: 'הוצאות נכס אחרות'     },

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

  /* ── Future / placeholder ────────────────────────────────────────────────── */
  multiPropertyComing:  { en: 'Multi-property view — coming soon',
                          he: 'תצוגה מרובת נכסים — בקרוב' },
  rentalAllocationNote: { en: 'Monthly rental allocation — available in next release.',
                          he: 'הקצאה חודשית — תהיה זמינה בגרסה הבאה.' },

  /* ── Opening balance warning ──────────────────────────────────────────────── */
  openingBalTitle:      { en: 'Opening Balance Not Included.',
                          he: 'יתרת פתיחה לא כלולה.' },
  openingBalDetail:     { en: 'Date-filtered reports may show incorrect closing balances because prior-period balances are not yet carried forward. Use all-time (unfiltered) reports only for financial review.',
                          he: 'דוחות עם סינון תאריכים עלולים להציג יתרות סגירה שגויות. יש להשתמש בדוחות ללא סינון בלבד לצורכי בדיקה פיננסית.' },

} as const

export type LabelKey = keyof typeof L

/** Translate a label key to the requested language. Falls back to English. */
export function t(key: LabelKey, lang: Lang = 'en'): string {
  const entry = L[key] as Record<Lang, string> | undefined
  if (!entry) return key
  return entry[lang] ?? entry.en
}

/* ──────────────────────────────────────────────────────────────────────────────
 * PHASE B — Expense group mapping (Rental / Airbnb)
 * ──────────────────────────────────────────────────────────────────────────── */

/** Maps transaction subcategory strings → expense group label key */
export const EXPENSE_GROUP_MAP: Partial<Record<string, LabelKey>> = {
  'Electricity':         'expElectricity',
  'Electric':            'expElectricity',
  'Water':               'expWater',
  'Internet':            'expInternet',
  'HOA':                 'expHoa',
  'HOA Fee':             'expHoa',
  'Building Fee':        'expHoa',
  'Building Fees':       'expHoa',
  'Municipal Charges':   'expHoa',
  'Municipality':        'expHoa',
  'Municipality Tax':    'expHoa',
  'Repairs':             'expRepairs',
  'Repair':              'expRepairs',
  'Maintenance':         'expRepairs',
  'General Maintenance': 'expRepairs',
  'Cleaning':            'expCleaning',
  'Cleaning Fee':        'expCleaning',
  'Insurance':           'expInsurance',
  'Furniture':           'expFurniture',
  'Equipment':           'expFurniture',
  'Appliances':          'expFurniture',
  'Software':            'expSoftware',
  'Hostaway':            'expSoftware',
  'Platform Fee':        'expSoftware',
  'Management Fee':      'expOther',
  'Pool':                'expOther',
  'Garden':              'expOther',
}

/** Returns the expense group label key for a given subcategory. Defaults to 'expOther'. */
export function getExpenseGroupKey(subcategory: string | null): LabelKey {
  if (!subcategory) return 'expOther'
  return EXPENSE_GROUP_MAP[subcategory.trim()] ?? 'expOther'
}
