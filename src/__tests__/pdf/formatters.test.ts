/**
 * Unit tests for PDF formatting utilities.
 * Tests fmt() and fmtSigned() in isolation — no renderer, no DOM, no Supabase.
 */

import { fmt, fmtSigned } from '../../lib/pdf/formatters'

// ─────────────────────────── fmt() ───────────────────────────

describe('fmt()', () => {

  test('zero renders as €0.00', () => {
    expect(fmt(0)).toBe('€0.00')
  })

  test('whole number gets .00 suffix', () => {
    expect(fmt(1234)).toBe('€1,234.00')
  })

  test('normal 2-decimal value', () => {
    expect(fmt(1234.56)).toBe('€1,234.56')
  })

  test('rounds up at third decimal .567', () => {
    expect(fmt(1234.567)).toBe('€1,234.57')
  })

  test('rounds down at third decimal .001', () => {
    expect(fmt(1234.001)).toBe('€1,234.00')
  })

  test('negative input returns absolute value — no sign prefix', () => {
    expect(fmt(-1234.56)).toBe('€1,234.56')
  })

  test('thousands separator at one million', () => {
    expect(fmt(1_000_000)).toBe('€1,000,000.00')
  })

  test('boundary: 0.005 rounds up to €0.01', () => {
    expect(fmt(0.005)).toBe('€0.01')
  })

  test('sub-penny value 0.004 rounds down to €0.00', () => {
    expect(fmt(0.004)).toBe('€0.00')
  })

  test('large value with multiple thousand groups', () => {
    expect(fmt(1_234_567.89)).toBe('€1,234,567.89')
  })

})

// ─────────────────────────── fmtSigned() ───────────────────────────

describe('fmtSigned()', () => {

  test('zero renders as €0.00 with no sign', () => {
    expect(fmtSigned(0)).toBe('€0.00')
  })

  test('positive value below threshold (0.004) renders as €0.00', () => {
    expect(fmtSigned(0.004)).toBe('€0.00')
  })

  test('negative value below threshold (-0.004) renders as €0.00', () => {
    expect(fmtSigned(-0.004)).toBe('€0.00')
  })

  test('positive value gets + prefix', () => {
    expect(fmtSigned(0.01)).toBe('+€0.01')
  })

  test('normal positive value', () => {
    expect(fmtSigned(1234.56)).toBe('+€1,234.56')
  })

  test('negative value uses Unicode minus (U+2212), not ASCII hyphen', () => {
    const result = fmtSigned(-1234.56)
    // Primary assertion: full expected string
    expect(result).toBe('−€1,234.56')
    // Guard: must NOT start with ASCII hyphen (U+002D)
    expect(result.charCodeAt(0)).toBe(0x2212)
    expect(result.startsWith('-')).toBe(false)
  })

  test('small negative value just above threshold uses Unicode minus', () => {
    expect(fmtSigned(-0.01)).toBe('−€0.01')
  })

  test('threshold boundary — exactly 0.005 is treated as non-zero positive', () => {
    expect(fmtSigned(0.005)).toBe('+€0.01')
  })

  test('threshold boundary — exactly -0.005 is treated as non-zero negative', () => {
    expect(fmtSigned(-0.005)).toBe('−€0.01')
  })

})
