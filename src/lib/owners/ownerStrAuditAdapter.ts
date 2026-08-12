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

/** Human label for a reconciliation window (e.g. "Aug 2026" or "Jun–Sep 2026"). Display only. */
function periodWindowLabel(startDate: string, endDate: string): string {
  const fmt = (iso: string) =>
    new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const a = fmt(startDate);
  const b = fmt(endDate);
  return a === b ? a : `${a} \u2013 ${b}`;
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

  // Month-aligned evidence (P3B/UX): build ONE reconciliation period for the SELECTED window,
  // using engine-computed totals only (no local arithmetic — G3-5). This makes the panel follow
  // the same period as the Reservations screen and surfaces Hostaway-only activity as
  // "Missing in JJ / Needs Review" instead of hiding it behind an empty period list.
  const periods: StrPeriodInput[] = [];
  if (res.success && res.audit) {
    const s = res.audit.summary;
    const jjHasPlatformIncome = s.jjPeriodAggregateCount > 0;   // # of JJ Platform Income rows
    const hasHostawayActivity = s.revenueEligibleReservations > 0;
    if (hasHostawayActivity || jjHasPlatformIncome) {
      const label = periodWindowLabel(input.startDate, input.endDate);
      periods.push({
        period: label,
        hostawayAmount: s.hostawayTotalPayout.amount,               // engine (authoritative), null if unknown
        hostawayConfidence: s.hostawayTotalPayout.confidence,
        // null when JJ has NO Platform Income evidence in the window (P-ARCH-1: unknown != 0),
        // else the engine-computed period total.
        jjAmount: jjHasPlatformIncome ? s.jjPlatformIncomeTotal : null,
        attribution: classifyStrPeriodAttribution(input.startDate, input.endDate, label),
      });
    }
  }
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
