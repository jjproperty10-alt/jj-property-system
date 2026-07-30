/**
 * @module __tests__/sanitizeReturnPath.test.ts
 * @description VS1B — Behavioral tests for return-path preservation + open-redirect prevention.
 *
 * Tests cover:
 * - T1–T5:   Valid internal paths (with query strings, fragments, encoded spaces)
 * - T6–T12:  Scheme-based attack vectors
 * - T13–T17: Encoded redirect attacks (single, double, mixed-case encoding)
 * - T18–T20: Backslash variants
 * - T21–T26: Control character injection (null, CRLF, ESC, DEL)
 * - T27–T28: Whitespace prefix attacks
 * - T29–T30: Malformed percent encoding
 * - T31–T32: Username/password URL forms
 * - T33–T35: Relative paths (no leading /)
 * - T36–T39: Edge cases (null, empty, undefined, custom fallback)
 */

import { sanitizeReturnPath } from '@/lib/auth/sanitizeReturnPath'

describe('sanitizeReturnPath', () => {
  // ── T1–T5: Valid internal paths ────────────────────────────────────────

  test('T1: preserves simple internal path', () => {
    expect(sanitizeReturnPath('/partner/avi/statement')).toBe('/partner/avi/statement')
  })

  test('T2: preserves path with query string (the VS1B bug fix)', () => {
    expect(sanitizeReturnPath('/partner/avi/statement?property=Villa%20Mazotos'))
      .toBe('/partner/avi/statement?property=Villa%20Mazotos')
  })

  test('T3: preserves path with multiple query params', () => {
    expect(sanitizeReturnPath('/partner/avi/statement?property=Villa%20Mazotos&period=2026-H1'))
      .toBe('/partner/avi/statement?property=Villa%20Mazotos&period=2026-H1')
  })

  test('T4: preserves root path', () => {
    expect(sanitizeReturnPath('/')).toBe('/')
  })

  test('T5: preserves path with fragment', () => {
    expect(sanitizeReturnPath('/path#section')).toBe('/path#section')
  })

  // ── T6–T12: Scheme-based attacks ──────────────────────────────────────

  test('T6: rejects protocol-relative URL (//evil.example)', () => {
    expect(sanitizeReturnPath('//evil.example')).toBe('/')
  })

  test('T7: rejects protocol-relative with path', () => {
    expect(sanitizeReturnPath('//evil.example/path')).toBe('/')
  })

  test('T8: rejects absolute https URL', () => {
    expect(sanitizeReturnPath('https://evil.example/partner/avi')).toBe('/')
  })

  test('T9: rejects absolute http URL', () => {
    expect(sanitizeReturnPath('http://evil.example')).toBe('/')
  })

  test('T10: rejects uppercase HTTP scheme', () => {
    expect(sanitizeReturnPath('HTTP://evil.example')).toBe('/')
  })

  test('T11: rejects javascript: scheme', () => {
    expect(sanitizeReturnPath('javascript:alert(1)')).toBe('/')
  })

  test('T12: rejects data: scheme', () => {
    expect(sanitizeReturnPath('data:text/html,<script>alert(1)</script>')).toBe('/')
  })

  // ── T13–T17: Encoded redirect attacks ─────────────────────────────────

  test('T13: rejects encoded // (%2F%2F)', () => {
    expect(sanitizeReturnPath('%2F%2Fevil.example')).toBe('/')
  })

  test('T14: rejects lowercase encoded // (%2f%2f)', () => {
    expect(sanitizeReturnPath('%2f%2fevil.example')).toBe('/')
  })

  test('T15: rejects mixed-case encoded // (%2F%2f)', () => {
    expect(sanitizeReturnPath('%2F%2fevil.example')).toBe('/')
  })

  test('T16: rejects double-encoded // (%252F%252F)', () => {
    expect(sanitizeReturnPath('%252F%252Fevil.example')).toBe('/')
  })

  test('T17: rejects double-encoded lowercase (%252f%252f)', () => {
    expect(sanitizeReturnPath('%252f%252fevil.example')).toBe('/')
  })

  // ── T18–T20: Backslash variants ───────────────────────────────────────

  test('T18: rejects backslash path (/\\evil.com)', () => {
    expect(sanitizeReturnPath('/\\evil.com')).toBe('/')
  })

  test('T19: rejects leading backslash (\\evil.com)', () => {
    expect(sanitizeReturnPath('\\evil.com')).toBe('/')
  })

  test('T20: rejects backslash traversal (/path\\..\\evil)', () => {
    expect(sanitizeReturnPath('/path\\..\\evil')).toBe('/')
  })

  // ── T21–T26: Control character injection ──────────────────────────────

  test('T21: rejects null byte in path', () => {
    expect(sanitizeReturnPath('/partner/avi\x00')).toBe('/')
  })

  test('T22: rejects CRLF injection', () => {
    expect(sanitizeReturnPath('/path\r\n')).toBe('/')
  })

  test('T23: rejects CR only', () => {
    expect(sanitizeReturnPath('/path\r')).toBe('/')
  })

  test('T24: rejects LF only', () => {
    expect(sanitizeReturnPath('/path\n')).toBe('/')
  })

  test('T25: rejects ESC control character', () => {
    expect(sanitizeReturnPath('/path\x1b')).toBe('/')
  })

  test('T26: rejects DEL control character', () => {
    expect(sanitizeReturnPath('/path\x7f')).toBe('/')
  })

  // ── T27–T28: Whitespace prefix attacks ────────────────────────────────

  test('T27: rejects space prefix', () => {
    expect(sanitizeReturnPath(' /path')).toBe('/')
  })

  test('T28: rejects tab prefix', () => {
    expect(sanitizeReturnPath('\t/path')).toBe('/')
  })

  // ── T29–T30: Malformed percent encoding ───────────────────────────────

  test('T29: rejects malformed percent encoding (%zz)', () => {
    expect(sanitizeReturnPath('/%zz')).toBe('/')
  })

  test('T30: rejects truncated percent (%)', () => {
    expect(sanitizeReturnPath('/%')).toBe('/')
  })

  // ── T31–T32: Username/password URL forms ──────────────────────────────

  test('T31: rejects credentials in URL', () => {
    expect(sanitizeReturnPath('http://user:pass@evil.com/path')).toBe('/')
  })

  test('T32: rejects username in URL', () => {
    expect(sanitizeReturnPath('https://admin@evil.com')).toBe('/')
  })

  // ── T33–T35: Relative paths (no leading /) ────────────────────────────

  test('T33: rejects relative path without /', () => {
    expect(sanitizeReturnPath('partner/avi')).toBe('/')
  })

  test('T34: rejects dot-relative path', () => {
    expect(sanitizeReturnPath('./partner/avi')).toBe('/')
  })

  test('T35: rejects dot-dot-relative path', () => {
    expect(sanitizeReturnPath('../evil')).toBe('/')
  })

  // ── T36–T39: Edge cases ───────────────────────────────────────────────

  test('T36: returns fallback for null input', () => {
    expect(sanitizeReturnPath(null)).toBe('/')
  })

  test('T37: returns fallback for empty string', () => {
    expect(sanitizeReturnPath('')).toBe('/')
  })

  test('T38: returns fallback for undefined', () => {
    expect(sanitizeReturnPath(undefined)).toBe('/')
  })

  test('T39: returns custom fallback when provided', () => {
    expect(sanitizeReturnPath(null, '/home')).toBe('/home')
  })

  // ── T40–T41: Additional scheme variants (reconcile standalone 40-vector suite) ─

  test('T40: rejects vbscript scheme', () => {
    expect(sanitizeReturnPath('vbscript:msgbox')).toBe('/')
  })

  test('T41: rejects mixed-case scheme (hTtPs)', () => {
    expect(sanitizeReturnPath('hTtPs://evil.example')).toBe('/')
  })
})
