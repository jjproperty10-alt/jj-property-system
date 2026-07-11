/**
 * JJ Property 10 — Report UI Types
 * M0 — 2026-07-10
 *
 * Single source of truth for report-level UI types.
 *
 * ACCOUNTING types (BalanceConvention, RC3AccountType, RC3Row, etc.) remain in types.ts.
 * Import from HERE for all report selector / display / PDF logic.
 * Do NOT redefine these types elsewhere.
 */

/**
 * The two report modes for RC3.
 *
 *   'full'     — All-time history for all four account types
 *                (Sale, Renovation, Rental, Airbnb).
 *                Uses complete transaction history from the beginning.
 *
 *   'periodic' — Management (Rental) and Airbnb accounts ONLY,
 *                filtered to the selected date range.
 *                Sale and Renovation are EXCLUDED.
 *
 * Why periodic excludes Sale / Renovation:
 *   Opening balances for prior periods are not yet implemented (Task 5 — deferred).
 *   Showing a partial-period Sale or Renovation balance without an opening balance
 *   would produce a misleading, incomplete figure. Until Task 5 is complete,
 *   Periodic mode is restricted to accounts where the balance can be computed
 *   solely from the selected period's transactions.
 */
export type ReportType = 'full' | 'periodic'

/**
 * Client-facing status for a single account module.
 * Derived from closing_balance + balance_convention via getModuleStatus().
 *
 *   'settled'        — closing balance is exactly 0: no outstanding obligation.
 *
 *   'payable_to_you' — JJ owes money to the owner / client.
 *                      owner_credit convention: positive closing_balance.
 *                      client_debt  convention: negative closing_balance.
 *
 *   'payable_by_you' — The client / owner owes money to JJ.
 *                      client_debt  convention: positive closing_balance.
 *                      owner_credit convention: negative closing_balance.
 *
 * IMPORTANT — 'in_progress' is intentionally NOT included here.
 *   It is reserved for future manual-override use only.
 *   It must NEVER be assigned automatically from a balance value.
 *   Add it only when a dedicated override mechanism is implemented.
 */
export type ModuleStatus = 'settled' | 'payable_to_you' | 'payable_by_you'
