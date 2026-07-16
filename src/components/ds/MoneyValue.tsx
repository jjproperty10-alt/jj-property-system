import type { MoneySizeToken } from '@/lib/ds/tokens'
import { MONEY_SIZE_CLASSES } from '@/lib/ds/tokens'

interface MoneyValueProps {
  /** Monetary amount. null renders as em dash (—). */
  amount: number | null
  /** ISO 4217 currency code. Defaults to 'EUR'. */
  currency?: string
  /** Visual size variant. */
  size?: MoneySizeToken
  /** Locale for Intl.NumberFormat. Defaults to 'en-IE'. */
  locale?: string
  /** Additional CSS classes. */
  className?: string
}

/**
 * MoneyValue — Design System 2035
 *
 * Renders a monetary amount with strict LTR isolation and tabular numerals.
 * null → '—' (em dash). NEVER renders the string "null" or "0" for missing values.
 *
 * LTR isolation is mandatory for financial values even inside RTL page contexts.
 * Use this component for every monetary amount in the application.
 *
 * Extracted pattern from PartnerCapitalSection / PartnerPortfolioSection (PR #52).
 */
export function MoneyValue({
  amount,
  currency = 'EUR',
  size = 'md',
  locale = 'en-IE',
  className = '',
}: MoneyValueProps) {
  const sizeClass = MONEY_SIZE_CLASSES[size]

  if (amount === null) {
    return (
      <span
        className={`text-gray-400 italic ${sizeClass} ${className}`.trim()}
        aria-label="Value unknown"
        role="text"
      >
        &#8212;
      </span>
    )
  }

  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)

  return (
    <span
      dir="ltr"
      className={`tabular-nums ${sizeClass} ${className}`.trim()}
    >
      {formatted}
    </span>
  )
}
