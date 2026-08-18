/**
 * Unit tests for canonical money semantics (Jest / ts-jest, node). No DB.
 * Guards the LOCKED receivable/payable/settled direction + open-amount rules.
 */

import { directionFromSignedPosition, openAmountFromSigned, sumOpenEur } from '../moneyMath'

describe('directionFromSignedPosition', () => {
  it('positive net → RECEIVABLE_TO_JJ (counterparty owes JJ)', () => {
    expect(directionFromSignedPosition(57015.89)).toBe('RECEIVABLE_TO_JJ')
    expect(directionFromSignedPosition(0.01)).toBe('RECEIVABLE_TO_JJ')
  })
  it('negative net → PAYABLE_BY_JJ (JJ owes counterparty)', () => {
    expect(directionFromSignedPosition(-8005.25)).toBe('PAYABLE_BY_JJ')
    expect(directionFromSignedPosition(-0.01)).toBe('PAYABLE_BY_JJ')
  })
  it('zero net → SETTLED', () => {
    expect(directionFromSignedPosition(0)).toBe('SETTLED')
  })
})

describe('openAmountFromSigned', () => {
  it('is always the magnitude', () => {
    expect(openAmountFromSigned(-8005.25)).toBeCloseTo(8005.25, 2)
    expect(openAmountFromSigned(57015.89)).toBeCloseTo(57015.89, 2)
    expect(openAmountFromSigned(0)).toBe(0)
  })
})

describe('sumOpenEur', () => {
  it('sums receivable lines to the certified total (2dp)', () => {
    // Uriel 57015.89, Oshrit 11400, Liora 3577.45, Ilan&Ilana 1981.54, Orit Rob 183.35
    expect(sumOpenEur([57015.89, 11400, 3577.45, 1981.54, 183.35])).toBe('74158.23')
  })
  it('sums payable lines to the certified total (2dp)', () => {
    // Liron&Alon 8005.25, Oren 7421.92, Tamir 7397.36, Roni 5813.41, Sharon 5314.85, Vard 500
    expect(sumOpenEur([8005.25, 7421.92, 7397.36, 5813.41, 5314.85, 500])).toBe('34452.79')
  })
  it('accepts strings and ignores nullish', () => {
    expect(sumOpenEur(['100.00', null, '50', undefined, 0])).toBe('150.00')
  })
  it('empty → 0.00', () => {
    expect(sumOpenEur([])).toBe('0.00')
  })
})
