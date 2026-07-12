import {
  isRTL,
  rtlRowDirection,
  rtlTextStyle,
  rtlColumnOrder,
  rtlAlignEnd,
} from '../../lib/pdf/rtlHelpers'

describe('RTL PDF helpers', () => {
  describe('isRTL', () => {
    it('returns true for Hebrew', () => {
      expect(isRTL('he')).toBe(true)
    })
    it('returns false for English', () => {
      expect(isRTL('en')).toBe(false)
    })
  })

  describe('rtlRowDirection', () => {
    it('returns row-reverse for Hebrew', () => {
      expect(rtlRowDirection('he')).toEqual({ flexDirection: 'row-reverse' })
    })
    it('returns empty object for English (no-op)', () => {
      expect(rtlRowDirection('en')).toEqual({})
    })
  })

  describe('rtlTextStyle', () => {
    it('returns textAlign right for Hebrew', () => {
      expect(rtlTextStyle('he')).toEqual({ textAlign: 'right' })
    })
    it('returns empty object for English (no-op)', () => {
      expect(rtlTextStyle('en')).toEqual({})
    })
  })

  describe('rtlColumnOrder', () => {
    it('returns textAlign left for Hebrew — amount col is leftmost in RTL table', () => {
      expect(rtlColumnOrder('he')).toEqual({ textAlign: 'left' })
    })
    it('returns textAlign right for English', () => {
      expect(rtlColumnOrder('en')).toEqual({ textAlign: 'right' })
    })
  })

  describe('rtlAlignEnd', () => {
    it('returns flex-start for Hebrew — end-anchored panel flips to start', () => {
      expect(rtlAlignEnd('he')).toEqual({ alignItems: 'flex-start' })
    })
    it('returns flex-end for English', () => {
      expect(rtlAlignEnd('en')).toEqual({ alignItems: 'flex-end' })
    })
  })
})
