/**
 * Display-only euro formatter for the client-report presentation components.
 * This is presentation formatting, NOT a financial calculation — it never
 * changes a value, it only renders one already computed upstream.
 */
export function formatEur(value: number): string {
  const n = Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat('en-IE', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)
}
