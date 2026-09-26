/**
 * Server-only load of one certified monthly STR table.
 * Missing scope does not call the reader.
 */

import 'server-only'

import { readCertifiedStrMonthlySettlement } from '@/lib/finance/certifiedStrMonthlySettlementAdapter'
import { readMonthlyStrOrUnavailable, type StrMonthlyAdmitScope } from './certifiedStrMonthly'
import type { CertifiedStrMonthlySection, CertifiedStrMonthlyUnavailable } from './types'

export async function loadCertifiedStrMonthlySection(
  scope: StrMonthlyAdmitScope & { readonly identityCount?: number },
): Promise<CertifiedStrMonthlySection | CertifiedStrMonthlyUnavailable> {
  return readMonthlyStrOrUnavailable(scope, async () => {
    const parsed = await readCertifiedStrMonthlySettlement({
      entityId: scope.entityId || '',
      propertyId: scope.propertyId || '',
      periodFrom: scope.periodStart || '',
      periodTo: scope.periodEnd || '',
    })
    if (parsed.unavailable) return { unavailable: true, reason: parsed.reason }
    return {
      unavailable: false,
      certification_id: parsed.certificationId,
      entity_id: parsed.entityId,
      property_id: parsed.propertyId,
      period_from: parsed.periodFrom,
      period_to: parsed.periodTo,
      total_owner_net: parsed.totalOwnerNet,
      reconciliation: {
        monthly_sum: parsed.reconciliation.monthlySum,
        certified_total: parsed.reconciliation.certifiedTotal,
        difference: parsed.reconciliation.difference,
        status: parsed.reconciliation.status,
      },
      months: parsed.months.map((month) => ({
        month: month.month,
        reservation_count: month.reservationCount,
        nights: month.nights,
        owner_net: month.ownerNet,
        component_reconciliation_status: month.componentReconciliationStatus,
      })),
    }
  })
}
