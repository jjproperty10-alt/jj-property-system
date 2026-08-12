/**
 * ownerStrAuditAdapter — server-only read path: Hostaway STR evidence reconciliation (P3B).
 * external_id -> property_id -> active airbnb_str engagement (certified P2 effective-period
 * resolution) -> Hostaway evidence vs JJ ledger -> reconcileStrPeriod -> StrReconciliationDTO.
 * READ-ONLY. No writes, no financial authority. property_id authoritative; name used only for the
 * legacy transactions ledger hop (documented), never as machine identity.
 */
import 'server-only';
import { createServiceClient } from '@/lib/supabase';
import {
  PropertyAuditService, buildStrReconciliation, resolveActiveStrEngagement, classifyStrPeriodAttribution,
} from '@/lib/hostaway-audit';
import type { StrPeriodInput, StrReconciliationDTO, StrEngagementRow } from '@/lib/hostaway-audit';

export interface OwnerStrAuditInput {
  readonly propertyId: string;   // canonical UUID (authoritative)
  readonly startDate: string;
  readonly endDate: string;
}

export async function getStrReconciliation(input: OwnerStrAuditInput): Promise<StrReconciliationDTO> {
  const sb = createServiceClient();

  // P2 certified effective-period resolution (as of endDate): expired/future ignored, overlap => fail closed.
  const { data: engRows } = await (sb as any).schema('lifecycle').from('service_engagements')
    .select('id, entity_id, service_type, status, effective_from, effective_to')
    .eq('property_id', input.propertyId).eq('service_type', 'airbnb_str');
  const rows: StrEngagementRow[] = (engRows ?? []).map((r: any) => ({
    id: r.id, propertyId: input.propertyId, entityId: r.entity_id, serviceType: r.service_type,
    status: r.status, effectiveFrom: r.effective_from ?? null, effectiveTo: r.effective_to ?? null,
  }));
  const resolution = resolveActiveStrEngagement(input.propertyId, rows, input.endDate);
  const engagementId: string | null = resolution.resolved ? resolution.engagementId : null;

  // Legacy ledger hop: canonical property_id -> property_name (documented boundary).
  const { data: pd } = await sb.from('property_definitions')
    .select('property_name').eq('property_id', input.propertyId).limit(1).maybeSingle();
  const jjPropertyName = (pd?.property_name as string | undefined) ?? null;
  if (!jjPropertyName) return buildStrReconciliation(input.propertyId, engagementId, []);

  const svc = new PropertyAuditService(sb);
  const res = await svc.auditProperty({ jjPropertyName, dateFrom: input.startDate, dateTo: input.endDate });
  const periods: StrPeriodInput[] = res.success && res.audit
    ? res.audit.periodComparisons.map((pc) => ({
        period: pc.jjAggregate.periodFrom ?? pc.jjAggregate.description ?? 'unknown',
        hostawayAmount: pc.hostawayPeriodPayout.amount,
        hostawayConfidence: pc.hostawayPeriodPayout.confidence,
        jjAmount: pc.jjPeriodAmount.amount,
        attribution: classifyStrPeriodAttribution(pc.jjAggregate.periodFrom, pc.jjAggregate.periodTo, pc.jjAggregate.description),
      }))
    : [];
  return buildStrReconciliation(input.propertyId, engagementId, periods);
}

/** Resolve canonical property_id from a JJ property name (property_definitions is the name<->UUID authority). */
export async function getStrReconciliationByName(
  propertyName: string, startDate: string, endDate: string,
): Promise<StrReconciliationDTO | null> {
  const sb = createServiceClient();
  const { data: pd } = await sb.from('property_definitions')
    .select('property_id')
    .or(`property_name.eq.${propertyName},canonical_name.eq.${propertyName}`)
    .limit(1).maybeSingle();
  const propertyId = (pd?.property_id as string | undefined) ?? null;
  if (!propertyId) return null;
  return getStrReconciliation({ propertyId, startDate, endDate });
}
