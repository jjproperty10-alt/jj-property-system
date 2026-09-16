/**
 * Certified Airbnb Setup / Operations split — option A.
 * The €325 internet row is replaced by €295 Setup + €30 June Operations.
 * No double counting. Final identity remains Avi is owed €594.25.
 */
import {
  AVI_AIRBNB_CHARGE_AVI_EUR,
  AVI_AIRBNB_CHARGE_TOTAL_EUR,
  AVI_AIRBNB_OPERATIONS_AVI_EUR,
  AVI_AIRBNB_OPERATIONS_LINES,
  AVI_AIRBNB_OPERATIONS_TOTAL_EUR,
  AVI_AIRBNB_SETUP_AVI_EUR,
  AVI_AIRBNB_SETUP_LINES,
  AVI_AIRBNB_SETUP_TOTAL_EUR,
  AVI_INTERNET_SPLIT_ROW,
  AVI_KEPT_MAINTENANCE_AMOUNTS_EUR,
  AVI_KEPT_MAINTENANCE_TOTAL_EUR,
  AVI_PER_STAY_CONSUMABLES_EUR,
  AVI_SUPERSEDED_CONSUMABLE_IDS,
  AVI_SUPERSEDED_CONSUMABLE_TOTAL_EUR,
  aviMonthlyChargeMonths,
} from '@/lib/partner-settlement/external-partner/aviAirbnbDepartments'
import {
  AVI_EXCLUDED_RESERVATIONS,
  AVI_HOSTAWAY_NIGHTS,
  AVI_HOSTAWAY_STAY_COUNT,
  AVI_HOSTAWAY_STAYS,
  AVI_HOSTAWAY_UNION_NTO_EUR,
  aviDuplicateStayIds,
} from '@/lib/partner-settlement/external-partner/aviHostawayStays'
import {
  composeAviFinalSummary,
  composeAviMonthly,
  composeAviPurchaseExpenses,
} from '@/lib/partner-settlement/external-partner/aviReportSections'
import {
  AVI_CERTIFIED_CREDITS_EUR,
  AVI_CERTIFIED_NET_EUR,
  AVI_CERTIFIED_OBLIGATION_EUR,
  AVI_CERTIFIED_PAID_EUR,
  aviCertifiedIdentityFailures,
  aviCertifiedIdentityIsSelfConsistent,
} from '@/lib/partner-settlement/external-partner/aviCertifiedIdentity'
import { roundEur } from '@/lib/partner-settlement/external-partner'

describe('option A — internet split and certified department totals', () => {
  it('splits the €325 row into €295 Setup and €30 June Operations, never both', () => {
    expect(AVI_INTERNET_SPLIT_ROW.ledgerAmountEur).toBe(325)
    expect(AVI_INTERNET_SPLIT_ROW.installationEur).toBe(295)
    expect(AVI_INTERNET_SPLIT_ROW.firstMonthEur).toBe(30)
    expect(AVI_INTERNET_SPLIT_ROW.firstMonthCovered).toBe('2025-06')
    expect(
      roundEur(AVI_INTERNET_SPLIT_ROW.installationEur + AVI_INTERNET_SPLIT_ROW.firstMonthEur),
    ).toBe(325)

    const setupInstall = AVI_AIRBNB_SETUP_LINES.filter((l) => l.basis === 'ledger_split')
    expect(setupInstall).toHaveLength(1)
    expect(setupInstall[0].amountEur).toBe(295)
    expect(setupInstall[0].month).toBe('2025-06')

    const juneInternet = AVI_AIRBNB_OPERATIONS_LINES.filter(
      (l) => l.labelEn === 'Internet' && l.month === '2025-06',
    )
    expect(juneInternet).toHaveLength(1)
    expect(juneInternet[0].amountEur).toBe(30)
    expect(juneInternet[0].basis).toBe('ledger_split')

    expect(AVI_AIRBNB_SETUP_LINES.some((l) => l.amountEur === 325)).toBe(false)
    expect(AVI_AIRBNB_OPERATIONS_LINES.some((l) => l.amountEur === 325)).toBe(false)
  })

  it('Setup is €5,706.06 / Avi €2,853.03 and Operations is €9,181.80 / Avi €4,590.90', () => {
    expect(AVI_AIRBNB_SETUP_TOTAL_EUR).toBe(5706.06)
    expect(AVI_AIRBNB_SETUP_AVI_EUR).toBe(2853.03)
    expect(AVI_AIRBNB_OPERATIONS_TOTAL_EUR).toBe(9181.8)
    expect(AVI_AIRBNB_OPERATIONS_AVI_EUR).toBe(4590.9)
    expect(AVI_AIRBNB_CHARGE_TOTAL_EUR).toBe(14887.86)
    expect(AVI_AIRBNB_CHARGE_AVI_EUR).toBe(7443.93)
    expect(roundEur(AVI_AIRBNB_SETUP_TOTAL_EUR + AVI_AIRBNB_OPERATIONS_TOTAL_EUR)).toBe(14887.86)
  })

  it('bills internet once per month for 15 months, licence 14, pool 19', () => {
    const internet = aviMonthlyChargeMonths('Internet')
    const licence = aviMonthlyChargeMonths('Hostaway licence')
    const pool = aviMonthlyChargeMonths('Pool service')
    expect(internet).toHaveLength(15)
    expect(new Set(internet).size).toBe(15)
    expect(internet[0]).toBe('2025-06')
    expect(internet[internet.length - 1]).toBe('2026-08')
    expect(licence).toHaveLength(14)
    expect(new Set(licence).size).toBe(14)
    expect(pool).toHaveLength(19)
    expect(new Set(pool).size).toBe(19)
    expect(roundEur(internet.length * 30)).toBe(450)
    expect(roundEur(licence.length * 40)).toBe(560)
    expect(roundEur(pool.length * 120)).toBe(2280)
  })

  it('charges €15 only for the 28 completed stays and replaces €729.67 of supplies', () => {
    expect(AVI_HOSTAWAY_STAY_COUNT).toBe(28)
    expect(AVI_HOSTAWAY_NIGHTS).toBe(149)
    expect(AVI_HOSTAWAY_UNION_NTO_EUR).toBe(37630.5)
    expect(aviDuplicateStayIds()).toEqual([])
    expect(AVI_EXCLUDED_RESERVATIONS.some((r) => r.reservationId === '47817104')).toBe(true)
    expect(AVI_HOSTAWAY_STAYS.some((s) => s.reservationId === '47817104')).toBe(false)
    expect(AVI_SUPERSEDED_CONSUMABLE_IDS).toHaveLength(10)
    expect(AVI_SUPERSEDED_CONSUMABLE_TOTAL_EUR).toBe(729.67)
    expect(roundEur(AVI_HOSTAWAY_STAY_COUNT * AVI_PER_STAY_CONSUMABLES_EUR)).toBe(420)
    expect(AVI_KEPT_MAINTENANCE_AMOUNTS_EUR).toHaveLength(7)
    expect(roundEur(AVI_KEPT_MAINTENANCE_AMOUNTS_EUR.reduce((s, n) => s + n, 0))).toBe(
      AVI_KEPT_MAINTENANCE_TOTAL_EUR,
    )
    expect(AVI_KEPT_MAINTENANCE_TOTAL_EUR).toBe(267.77)
    const consumables = AVI_AIRBNB_OPERATIONS_LINES.filter((l) => l.basis === 'per_stay_charge')
    expect(roundEur(consumables.reduce((s, l) => s + l.amountEur, 0))).toBe(420)
  })
})

describe('certified identity remains Avi is owed €594.25', () => {
  it('purchase expenses are €11,900 / Avi €5,950 after removing the duplicate tax', () => {
    const purchase = composeAviPurchaseExpenses()
    expect(purchase.totalEur).toBe(11900)
    expect(purchase.aviShareEur).toBe(5950)
    expect(purchase.aviPaidEur).toBe(5600)
    expect(purchase.aviRemainingEur).toBe(350)
    expect(purchase.lines.filter((l) => l.labelEn === 'Purchase tax')).toHaveLength(2)
    expect(purchase.lines.filter((l) => l.amountEur === 2400)).toHaveLength(1)
    expect(purchase.lines.reduce((s, l) => s + l.amountEur, 0)).toBe(11900)
  })

  it('Paid + Credits − Obligation = +€594.25 and the legacy −€380.50 fails closed', () => {
    expect(aviCertifiedIdentityIsSelfConsistent()).toBe(true)
    expect(AVI_CERTIFIED_PAID_EUR).toBe(280600)
    expect(AVI_CERTIFIED_CREDITS_EUR).toBe(19495.25)
    expect(AVI_CERTIFIED_OBLIGATION_EUR).toBe(299501)
    expect(AVI_CERTIFIED_NET_EUR).toBe(594.25)
    expect(
      aviCertifiedIdentityFailures({
        paidEur: 280600,
        creditsEur: 19495.25,
        obligationEur: 299501,
        netEur: 594.25,
      }),
    ).toEqual([])
    const legacy = aviCertifiedIdentityFailures({
      paidEur: 280600,
      creditsEur: 19640.34,
      obligationEur: 300620.84,
      netEur: -380.5,
    })
    expect(legacy).toContain('certified_identity_mismatch')
    expect(legacy).toContain('certified_identity_mismatch:net')

    const summary = composeAviFinalSummary({
      acquisitionObligationEur: 250000,
      acquisitionPaidEur: 250000,
      renovationObligationEur: 36107.07,
      renovationPaidEur: 25000,
      creditsEur: 19495.25,
    })
    expect(summary.obligationTotalEur).toBe(299501)
    expect(summary.paidTotalEur).toBe(280600)
    expect(summary.creditsTotalEur).toBe(19495.25)
    expect(summary.netEur).toBe(594.25)
    expect(summary.aviIsOwed).toBe(true)
    expect(summary.rows.find((r) => r.key === 'airbnb_setup')?.obligationEur).toBe(2853.03)
    expect(summary.rows.find((r) => r.key === 'airbnb_operations')?.obligationEur).toBe(4590.9)
  })

  it('monthly view uses the same Setup and Operations totals', () => {
    const monthly = composeAviMonthly()
    expect(monthly.totals.setupEur).toBe(5706.06)
    expect(monthly.totals.operationsEur).toBe(9181.8)
    expect(monthly.totals.consumablesEur).toBe(420)
    expect(monthly.totals.internetEur).toBe(450)
    expect(monthly.totals.hostawayLicenceEur).toBe(560)
    expect(monthly.totals.poolServiceEur).toBe(2280)
    expect(monthly.totals.stayCount).toBe(28)
    expect(monthly.totals.nights).toBe(149)
    expect(monthly.totals.hostawayNtoEur).toBe(37630.5)
    expect(monthly.totals.privateIncomeEur).toBe(1360)
    expect(monthly.totals.aviIncomeShareEur).toBe(19495.25)
    const june = monthly.rows.find((r) => r.month === '2025-06')
    expect(june?.internetEur).toBe(30)
    expect(june?.setupEur).toBe(347.99)
    const may = monthly.rows.find((r) => r.month === '2025-05')
    expect(may?.internetEur).toBe(0)
    expect(may?.setupEur).toBe(600)
  })
})
