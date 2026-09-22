/**
 * Exact-cent parser matching partnership.parse_exact_cents_text / assert_exact_cents.
 * server-only.
 */

import 'server-only'

const EXACT_CENT_RE = /^[0-9]+(\.[0-9]{1,2})?$/
const MAX = 9999999999.99

export function parseExactCentsText(value: string, label: string): string {
  const text = value.trim()
  if (text === '') {
    throw new Error(`[input] ${label} is required.`)
  }
  if (/[eE]/.test(text) || text === 'NaN' || text === 'Infinity' || text === '-Infinity') {
    throw new Error(`[input] ${label} must be a non-negative exact-cent decimal.`)
  }
  if (!EXACT_CENT_RE.test(text)) {
    throw new Error(`[input] ${label} must be a non-negative exact-cent decimal.`)
  }
  const amount = Number(text)
  if (!Number.isFinite(amount)) {
    throw new Error(`[input] ${label} must be a finite exact-cent number.`)
  }
  const rounded = Math.round(amount * 100) / 100
  if (amount !== rounded) {
    throw new Error(`[input] ${label} must be exact cents (scale 2).`)
  }
  if (amount < 0 || amount > MAX) {
    throw new Error(`[input] ${label} is out of range for NUMERIC(12,2).`)
  }
  return formatExactCents(amount)
}

export function parseExactCentsUnknown(value: unknown, label: string): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`[input] ${label} must be a finite exact-cent number.`)
    }
    const rounded = Math.round(value * 100) / 100
    if (value !== rounded) {
      throw new Error(`[input] ${label} must be exact cents (scale 2).`)
    }
    if (value < 0 || value > MAX) {
      throw new Error(`[input] ${label} is out of range for NUMERIC(12,2).`)
    }
    return formatExactCents(value)
  }
  if (typeof value === 'string') return parseExactCentsText(value, label)
  throw new Error(`[input] ${label} is required.`)
}

export function formatExactCents(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2)
}

export function sumExactCents(values: readonly string[]): string {
  const cents = values.reduce((acc, value) => acc + Math.round(Number(value) * 100), 0)
  return formatExactCents(cents / 100)
}
