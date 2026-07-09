/**
 * JJ Property 10 — Client-Facing Label Overrides
 * Phase A UX — client-report-v1-ux
 *
 * Purpose:
 *   Map internal subcategory / display_label values to client-facing language.
 *   The client is the BUYER — so "Sale" from JJ's perspective is "Purchase"
 *   from the client's perspective.
 *
 * Rules:
 *   - DISPLAY_LABEL_OVERRIDES: exact string match → replace. No match → pass through.
 *   - Display-only. NEVER write these overrides to the database.
 *   - NEVER modify accounting logic, client_amount, or balance calculations.
 */

/* ─── Display label overrides (Sale → Purchase perspective) ─────────────────── */

export const DISPLAY_LABEL_OVERRIDES: Record<string, string> = {
  'Sale Contract':                                   'Purchase Contract',
  'Sale Contract (Reference)':                       'Purchase Contract (Reference)',
  'Client Sale Expenses':                            'Purchase Expenses',
  'Sale Tax':                                        'Purchase / Transfer Tax',
  'Third-Party Payment (Bank Transfer to Seller)':   'Direct Payment to Seller',
  'Property Sale':                                   'Property Purchase',
}

/**
 * Returns the client-facing display label.
 * Pass-through unchanged if no override exists.
 */
export function overrideDisplayLabel(label: string): string {
  if (!label) return label
  return DISPLAY_LABEL_OVERRIDES[label] ?? label
}

/* ─── Section header labels ─────────────────────────────────────────────────── */

export const SECTION_LABELS = {
  contractInfo:     'Contract Information',
  contractInfoNote: 'Shown for reference only — does not affect settlement balance',
} as const

/* ─── Account type labels (EN / HE) — for future i18n toggle ───────────────── */

export const ACCOUNT_LABEL_EN: Record<string, string> = {
  sale:       'Property Purchase',
  renovation: 'Renovation',
  rental:     'Rental',
  airbnb:     'Short-Term Rental',
}

export const ACCOUNT_LABEL_HE: Record<string, string> = {
  sale:       'רכישת נכס',
  renovation: 'שיפוץ',
  rental:     'השכרה',
  airbnb:     'השכרה לטווח קצר',
}
