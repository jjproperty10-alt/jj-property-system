/**
 * @module partner-settlement/external-partner/externalPartnerTransactionsSource
 * @description READ-ONLY `public.transactions` fetch for the external-partner reader.
 *
 * Only `.select()` is used. Property match is exact (`Villa Mazotos`).
 * `is_deleted = false`. `review_status` is not filtered — confirmed_duplicate
 * rows must remain available for Avi control. Independent of the certified
 * partner-ledger reader, client-report views, and partner-statement lifecycle.
 */

import 'server-only'
import { createServiceClient } from '@/lib/supabase'
import {
  EXTERNAL_PARTNER_PROPERTY_NAME,
  isInExternalPartnerReadScope,
} from './externalPartnerReader'
import type {
  ExternalPartnerTransactionsFetchResult,
  RawExternalPartnerTransaction,
} from './externalPartnerReadTypes'

const TRANSACTION_COLUMNS =
  'id, date, property_name, category, subcategory, description, payer, payee, amount_eur, client_charge, notes, k_note, is_deleted, review_status'

export async function fetchVillaMazotosTransactionsForExternalPartner(): Promise<ExternalPartnerTransactionsFetchResult> {
  const db = createServiceClient()
  const { data, error } = await db
    .from('transactions')
    .select(TRANSACTION_COLUMNS)
    .eq('property_name', EXTERNAL_PARTNER_PROPERTY_NAME)
    .eq('is_deleted', false)

  if (error || data == null) {
    return {
      status: 'failed',
      reason: `transactions query failed: ${String(error ?? 'null data')}`,
    }
  }

  const rows = (data as RawExternalPartnerTransaction[]).filter(isInExternalPartnerReadScope)
  return { status: 'ok', rows }
}
