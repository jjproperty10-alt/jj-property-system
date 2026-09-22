import { parseExactCentsText, parseExactCentsUnknown, sumExactCents } from '../vm1OwnerStatementExactCents'

describe('parseExactCentsText', () => {
  it('keeps exact two-decimal and whole-euro values', () => {
    expect(parseExactCentsText('2', 'n')).toBe('2.00')
    expect(parseExactCentsText('2.0', 'n')).toBe('2.00')
    expect(parseExactCentsText('2.00', 'n')).toBe('2.00')
    expect(parseExactCentsUnknown(2, 'n')).toBe('2.00')
    expect(parseExactCentsUnknown(2.0, 'n')).toBe('2.00')
  })

  it('rejects 1.999 as a number and as a string', () => {
    expect(() => parseExactCentsUnknown(1.999, 'n')).toThrow(/exact cents/)
    expect(() => parseExactCentsText('1.999', 'n')).toThrow(/exact-cent|exact cents/)
  })

  it('rejects scientific notation, NaN, and Infinity', () => {
    expect(() => parseExactCentsText('1e3', 'n')).toThrow()
    expect(() => parseExactCentsText('NaN', 'n')).toThrow()
    expect(() => parseExactCentsText('Infinity', 'n')).toThrow()
    expect(() => parseExactCentsUnknown(Number.NaN, 'n')).toThrow()
    expect(() => parseExactCentsUnknown(Number.POSITIVE_INFINITY, 'n')).toThrow()
  })

  it('sums exact cents without float drift', () => {
    expect(sumExactCents(['700.00', '50.50'])).toBe('750.50')
  })
})
