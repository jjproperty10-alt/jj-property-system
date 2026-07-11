/**
 * JJ Property 10 — Module Status Derivation
 * M0 — 2026-07-10
 *
 * getModuleStatus(balance, convention) — balance-convention-aware status.
 *
 * ACCOUNTING FREEZE: this file reads balance and convention only.
 * It does NOT modify, recalculate, or reinterpret any accounting value.
 * The balance MUST come from RC3AccountSection.closing_balance (computed by
 * computeBalance.ts). This file is presentation-classification only.
 *
 * Unit tests: src/__tests__/report/moduleStatus.test.ts
 */

import type { BalanceConvention } from './types'
import type { ModuleStatus } from './reportTypes'

/**
 * Derives the client-facing module status from the account's closing balance
 * and its balance convention.
 *
 * Convention semantics:
 *
 *   owner_credit (rental, airbnb):
 *     positive balance → 'payable_to_you'   (JJ owes owner)
 *     negative balance → 'payable_by_you'   (owner owes JJ)
 *     zero             → 'settled'
 *
 *   client_debt (sale, renovation):
 *     positive balance → 'payable_by_you'   (client owes JJ)
 *     negative balance → 'payable_to_you'   (JJ owes client)
 *     zero             → 'settled'
 *
 * @param balance    RC3AccountSection.closing_balance (may be fractional)
 * @param convention RC3AccountSection.balance_convention
 * @returns          Client-facing ModuleStatus
 */
export function getModuleStatus(
  balance: number,
  convention: BalanceConvention,
): ModuleStatus {
  if (balance === 0) return 'settled'

  if (convention === 'owner_credit') {
    // Positive = JJ owes owner → owner will receive → payable_to_you
    return balance > 0 ? 'payable_to_you' : 'payable_by_you'
  }

  // client_debt: positive = client owes JJ → client must pay → payable_by_you
  return balance > 0 ? 'payable_by_you' : 'payable_to_you'
}
