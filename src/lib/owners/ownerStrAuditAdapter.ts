/**
 * ownerStrAuditAdapter — server-only read path: Hostaway STR evidence reconciliation (P3B).
 * external_id -> property_id -> active airbnb_str engagement -> Hostaway evidence vs JJ ledger
 * -> reconcileStrPeriod -> StrReconciliationDTO. READ-ONLY. No writes, no financial authority.
 * property_id is authoritative; jj_property_name is derived from property_definitions only for the
 * legacy transactions ledger hop (transactions.property_id is unpopulated) — never a machine identity.
 */
import 'server-only';
import { createServiceClient } from '@/lib/supabase';
import { PropertyAuditService, buildStrReconciliation } from '@/lib/hostaway-audit';
import type { StrPeriodInput, StrReconciliationDTO } from '@/lib/hostaway-audit';

export interface OwnerStrAuditInput {
  readonly propertyId: string;   // canonical UUID (authoritative)
  readonly startDate: string;
  readonly endDate: string;
}

export async function getStrReconciliation(input: OwnerStrAuditInput): Promise<StrReconciliationDTO> {
  const sb = createServiceClient();

  // Legacy ledger hop: derive property_name from canonical property_id (documented boundary).
  const { data: pd } = await sb.from('property_definitions')
    .select('property_name').eq('property_id', input.propertyId).limit(1).maybeSingle();
  const jjPropertyName = (pd?.property_name as string | undefined) ?? null;

  // P2: active airbnb_str engagement resolved by property_id.
  const { data: eng } = await (sb as any).schema('lifecycle').from('service_engagements')
    .select('id, effective_from')
    .eq('property_id', input.propertyId).eq('service_type', 'airbnb_str').eq('status', 'active')
    .lte('effective_from', input.endDate)
    .order('effective_from', { ascending: true }).limit(1).maybeSingle();
  const engagementId: string | null = eng?.id ?? null;

  // No canonical property name => cannot reach the ledger; return fail-closed (no evidence).
  if (!jjPropertyName) return buildStrReconciliation(input.propertyId, engagementId, []);

  // Reuse the existing read-only period-aggregate audit for evidence.
  const svc = new PropertyAuditService(sb);
  const res = await svc.auditProperty({ jjPropertyName, dateFrom: input.startDate, dateTo: input.endDate });
  const periods: StrPeriodInput[] = res.success && res.audit
    ? res.audit.periodComparisons.map((pc) => ({
        period: pc.jjAggregate.periodFrom ?? pc.jjAggregate.description ?? 'unknown',
        hostawayAmount: pc.hostawayPeriodPayout.amount,
        hostawayConfidence: pc.hostawayPeriodPayout.confidence,
        jjAmount: pc.jjPeriodAmount.amount,
      }))
    : [];
  return buildStrReconciliation(input.propertyId, engagementId, periods);
}
