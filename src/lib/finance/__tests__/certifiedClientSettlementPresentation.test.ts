import {
  certifiedClosingIgnoresContactAndRc3,
  certifiedCents,
  certifiedHeroLabelKey,
  certifiedToOwnerBalanceDirection,
  closingDirectionFromDueToJj,
  composeCertifiedClosingDueToJj,
  composeCertifiedRemainingDueToJj,
  fifoCreditDisplayAmount,
  fifoCreditLabelKey,
  isCertifiedAvailable,
} from '../certifiedClientSettlementPresentation'
import { URIEL_SHAPED_CERTIFIED } from '../__fixtures__/certifiedClientSettlement'
import type { CertifiedClientSettlementAvailable } from '../certifiedClientSettlementTypes'
import { t } from '@/lib/report/labels'

function withClosing(
  closingDueToJj: number,
): CertifiedClientSettlementAvailable {
  return {
    ...URIEL_SHAPED_CERTIFIED,
    closingDueToJj,
    closingDirection: closingDirectionFromDueToJj(closingDueToJj),
    fifoCreditsTotal: URIEL_SHAPED_CERTIFIED.openingDueToJj - closingDueToJj,
  }
}

describe('certified settlement sign contract', () => {
  test('positive closing → client owes JJ', () => {
    expect(closingDirectionFromDueToJj(50677.42)).toBe('client_owes_jj')
    expect(certifiedToOwnerBalanceDirection(50677.42)).toBe('owner_owes_jj')
    expect(certifiedHeroLabelKey('client_owes_jj')).toBe('certClosingDueToJj')
  })

  test('negative closing → JJ owes client', () => {
    expect(closingDirectionFromDueToJj(-1200)).toBe('jj_owes_client')
    expect(certifiedToOwnerBalanceDirection(-1200)).toBe('jj_owes_owner')
    expect(certifiedHeroLabelKey('jj_owes_client')).toBe('certClosingDueToClient')
  })

  test('zero closing → settled', () => {
    expect(closingDirectionFromDueToJj(0)).toBe('settled')
    expect(certifiedToOwnerBalanceDirection(0)).toBe('balanced')
    expect(certifiedHeroLabelKey('settled')).toBe('balSettled')
  })
})

describe('certified FIFO / exclusion arithmetic', () => {
  test('noncash credit is cash=false and displays as a negative line', () => {
    const noncash = URIEL_SHAPED_CERTIFIED.fifoCredits[0]
    expect(noncash.cash).toBe(false)
    expect(noncash.eventType).toBe('noncash_settlement_credit')
    expect(fifoCreditLabelKey(noncash)).toBe('certNoncashCredit')
    expect(fifoCreditDisplayAmount(noncash)).toBe(-55000)
  })

  test('included cash credit is counted once', () => {
    const cash = URIEL_SHAPED_CERTIFIED.fifoCredits[1]
    expect(cash.cash).toBe(true)
    expect(URIEL_SHAPED_CERTIFIED.fifoCredits.filter((c) => c.cash).length).toBe(1)
    expect(fifoCreditDisplayAmount(cash)).toBe(-14000)
    expect(URIEL_SHAPED_CERTIFIED.fifoCreditsTotal).toBe(55000 + 14000)
  })

  test('exclusion is informational only and does not change closing', () => {
    const exclusion = URIEL_SHAPED_CERTIFIED.exclusions[0]
    expect(exclusion.arithmeticEffect).toBe(0)
    expect(exclusion.settlementAmount).toBe(13900)
    const composed = composeCertifiedClosingDueToJj(
      URIEL_SHAPED_CERTIFIED.openingDueToJj,
      URIEL_SHAPED_CERTIFIED.fifoCreditsTotal,
    )
    expect(composed).toBe(50677.42)
    expect(composed).toBe(URIEL_SHAPED_CERTIFIED.closingDueToJj)
    expect(composed).not.toBe(50677.42 - 13900)
  })

  test('cash allocation remaining uses signed total once, not cash amount_eur twice', () => {
    expect(composeCertifiedRemainingDueToJj(-5000, -3260)).toBe(-1740)
    expect(composeCertifiedRemainingDueToJj(5000, 3260)).toBe(1740)
    expect(composeCertifiedRemainingDueToJj(-5000, -3260)).not.toBe(-5000 - 3260 - 3260)
  })

  test('contact settlement and RC3 net are not added to certified closing', () => {
    expect(
      certifiedClosingIgnoresContactAndRc3(URIEL_SHAPED_CERTIFIED, -126931.23, 51.85),
    ).toBe(50677.42)
  })

  test('€7,000, Jumbo €51.85 and Duplex rent €1,500 are not FIFO credits', () => {
    const fifoAmounts = URIEL_SHAPED_CERTIFIED.fifoCredits.map((c) => c.settlementAmount)
    expect(fifoAmounts).not.toContain(7000)
    expect(fifoAmounts).not.toContain(51.85)
    expect(fifoAmounts).not.toContain(1500)
    expect(URIEL_SHAPED_CERTIFIED.fifoCreditsTotal).toBe(69000)
  })

  test('Studio €4,099 comes from a certification line, not a fabricated transaction', () => {
    expect(URIEL_SHAPED_CERTIFIED.propertyLines.some((l) => l.amountDueToJj === 4099)).toBe(true)
    expect(URIEL_SHAPED_CERTIFIED.fifoCredits.some((c) => c.settlementAmount === 4099)).toBe(false)
  })

  test('Uriel-shaped fixture produces exactly €50,677.42 due to JJ', () => {
    expect(URIEL_SHAPED_CERTIFIED.openingDueToJj).toBe(119677.42)
    expect(certifiedCents(URIEL_SHAPED_CERTIFIED.openingDueToJj)).toBe(11967742)
    expect(URIEL_SHAPED_CERTIFIED.closingDueToJj).toBe(50677.42)
    expect(URIEL_SHAPED_CERTIFIED.closingDirection).toBe('client_owes_jj')
    expect(isCertifiedAvailable(URIEL_SHAPED_CERTIFIED)).toBe(true)
    expect(withClosing(-1).closingDirection).toBe('jj_owes_client')
    expect(withClosing(0).closingDirection).toBe('settled')
  })
})

describe('certified settlement labels', () => {
  test('Hebrew and English required labels exist', () => {
    expect(t('certOpeningBalance', 'he')).toBe('יתרת התחייבויות פתיחה מאושרת')
    expect(t('certNoncashCredit', 'he')).toBe('זיכוי יישוב ללא מזומן')
    expect(t('certIncludedCash', 'he')).toBe('תשלום מזומן שנכלל ביישוב')
    expect(t('certExclusionDoubleCount', 'he')).toBe('הוצא מההתחשבנות – ייצוג כפול')
    expect(t('certClosingDueToJj', 'he')).toBe('יתרה סופית לתשלום ל-JJ')
    expect(t('certClosingDueToClient', 'he')).toBe('יתרה סופית לתשלום ללקוח')
    expect(t('certNoncash', 'he')).toBe('לא מזומן')

    expect(t('certOpeningBalance', 'en')).toBe('Certified opening obligation balance')
    expect(t('certNoncashCredit', 'en')).toBe('Noncash settlement credit')
    expect(t('certIncludedCash', 'en')).toBe('Cash payment included in settlement')
    expect(t('certExclusionDoubleCount', 'en')).toBe('Excluded from settlement – double representation')
    expect(t('certClosingDueToJj', 'en')).toBe('Final balance due to JJ')
    expect(t('certClosingDueToClient', 'en')).toBe('Final balance due to client')
    expect(t('certNoncash', 'en')).toBe('Noncash')
  })
})
