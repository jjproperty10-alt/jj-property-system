const n = (v: unknown): number => {
  const f = parseFloat(String(v ?? 0))
  return isNaN(f) ? 0 : f
}

const EUR = (v: unknown): string =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n(v))

export const UNAVAILABLE_METRIC = 'הנתון אינו זמין'

/** A failed or missing staff read is not a zero. A returned numeric zero stays zero. */
export function staffMetricLabel(loading: boolean, available: boolean, value: unknown): string {
  if (loading) return '…'
  if (!available || value == null || value === '') return UNAVAILABLE_METRIC
  return EUR(value)
}
