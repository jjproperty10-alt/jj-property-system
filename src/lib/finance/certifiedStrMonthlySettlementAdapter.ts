/**
 * Server-only adapter for public.read_certified_str_monthly_settlement.
 * Service-role path only. Never imported by Client Components.
 * Fail-closed: missing certification → unavailable, never a fake €0.
 * Does not read finance tables, pms, or call a finance-schema RPC.
 * Does not add the monthly STR credit to the certified client closing.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import { isValidUUID } from '@/lib/owners/validation'
import { parseCertifiedStrMonthlySettlement } from './strMonthlySettlementCertificationContract'
import { STR_MONTHLY_SETTLEMENT_RPC } from './strMonthlySettlementCertificationTypes'
import type { CertifiedStrMonthlySettlement } from './strMonthlySettlementCertificationContract'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export async function readCertifiedStrMonthlySettlement(input: {
  entityId: string
  propertyId: string
  periodFrom: string
  periodTo: string
}): Promise<CertifiedStrMonthlySettlement> {
  const scope = {
    entityId: input.entityId,
    propertyId: input.propertyId,
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
  }
  if (
    !isValidUUID(input.entityId) ||
    !isValidUUID(input.propertyId) ||
    !ISO_DATE.test(input.periodFrom) ||
    !ISO_DATE.test(input.periodTo) ||
    input.periodFrom > input.periodTo
  ) {
    return parseCertifiedStrMonthlySettlement(
      { unavailable: true, reason: 'invalid_scope' },
      scope,
    )
  }

  try {
    const sb = createServiceClient()
    const { data, error } = await sb.rpc(STR_MONTHLY_SETTLEMENT_RPC.read, {
      p_entity_id: input.entityId,
      p_property_id: input.propertyId,
      p_period_from: input.periodFrom,
      p_period_to: input.periodTo,
    })
    if (error || data == null) {
      return parseCertifiedStrMonthlySettlement(
        { unavailable: true, reason: 'reader_unavailable' },
        scope,
      )
    }
    return parseCertifiedStrMonthlySettlement(data, scope)
  } catch {
    return parseCertifiedStrMonthlySettlement(
      { unavailable: true, reason: 'reader_unavailable' },
      scope,
    )
  }
}
