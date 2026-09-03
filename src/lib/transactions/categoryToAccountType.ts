/**
 * Map public.transactions.category → CorrectionSourceRow.account_type.
 * Used only to feed the existing correction plan builder — does not rewrite
 * Category/Subcategory on the stored row.
 */
export function categoryToAccountType(category: string | null | undefined): string {
  switch ((category ?? '').trim()) {
    case 'Purchase':
      return 'purchase'
    case 'Sale':
      return 'sale'
    case 'Renovation':
      return 'renovation'
    case 'Management':
      return 'rental'
    case 'Airbnb':
      return 'airbnb'
    default:
      return 'general'
  }
}
