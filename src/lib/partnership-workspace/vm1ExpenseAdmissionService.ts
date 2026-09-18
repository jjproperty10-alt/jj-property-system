/**
 * VM1 approved future-Draft expense loader — exact Production SELECT only.
 *
 * Requires a runtime-verified VM1 identity object. No free ledger UUID.
 * No insert/update/delete. No name fallback. No revenue admission.
 *
 * server-only.
 */

import 'server-only'

import { VM1_LEGACY_LEDGER_PROPERTY_ID } from './vm1Identity'
import {
  admitVm1ApprovedFutureDraftExpense,
  VM1_APPROVED_FUTURE_DRAFT_EXPENSE_TRANSACTION_ID,
  VM1_EXPENSE_ADMISSION_REASON,
  type Vm1ExpenseAdmissionLine,
} from './vm1ExpenseAdmission'
import {
  acceptVm1LedgerTransactionPropertyId,
  vm1LedgerPropertyIdFilter,
  type VerifiedVm1Identity,
} from './vm1IdentityAdapter'

export const VM1_EXPENSE_LEDGER_SELECT =
  'id,date,property_id,category,subcategory,amount_eur,client_charge,review_status,is_deleted' as const

export interface Vm1ExpenseLedgerQueryResult {
  readonly data: unknown
  readonly error: { readonly message: string } | null
}

export interface Vm1ExpenseLedgerClient {
  from(relation: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): PromiseLike<Vm1ExpenseLedgerQueryResult>
      }
    }
  }
}

export interface Vm1ApprovedExpenseLoadInput {
  readonly client: unknown
  readonly verifiedIdentity: VerifiedVm1Identity
}

function blocked(reason: string): Vm1ExpenseAdmissionLine {
  return {
    transactionId: null,
    date: null,
    category: null,
    subcategory: null,
    admissionState: 'blocked',
    partnershipChargeEur: null,
    jjActualCostEur: null,
    jjOperatingProfitEur: null,
    reason,
  }
}

export function isVm1ExpenseLedgerClient(value: unknown): value is Vm1ExpenseLedgerClient {
  return (
    value != null &&
    typeof value === 'object' &&
    typeof (value as { from?: unknown }).from === 'function'
  )
}

function isVerifiedIdentityObject(value: unknown): value is VerifiedVm1Identity {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

export async function loadVm1ApprovedFutureDraftExpense(
  input: Vm1ApprovedExpenseLoadInput,
): Promise<Vm1ExpenseAdmissionLine> {
  if (!isVerifiedIdentityObject(input.verifiedIdentity)) {
    return blocked(VM1_EXPENSE_ADMISSION_REASON.verifiedIdentity)
  }

  const accepted = acceptVm1LedgerTransactionPropertyId(
    VM1_LEGACY_LEDGER_PROPERTY_ID,
    input.verifiedIdentity,
  )
  if (!accepted.ok) {
    return blocked(accepted.reason)
  }

  if (!isVm1ExpenseLedgerClient(input.client)) {
    return blocked(VM1_EXPENSE_ADMISSION_REASON.ledgerUnavailable)
  }

  const ledgerPropertyId = vm1LedgerPropertyIdFilter(input.verifiedIdentity)

  const result = await input.client
    .from('transactions')
    .select(VM1_EXPENSE_LEDGER_SELECT)
    .eq('id', VM1_APPROVED_FUTURE_DRAFT_EXPENSE_TRANSACTION_ID)
    .eq('property_id', ledgerPropertyId)

  if (result.error) {
    return blocked(VM1_EXPENSE_ADMISSION_REASON.ledgerRead)
  }

  return admitVm1ApprovedFutureDraftExpense(result.data)
}
