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
  parsePeriodFromDescription,
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
  // Aggregate-aware JJ coverage: fetch ALL Platform Income rows for this property (any transaction
  // date) and classify each by its RECORDED period (existing description parser, reused — no second
  // parser, no splitting). A row whose period spans beyond the selected month is a MULTI-MONTH
  // aggregate that must never be compared against one month of Hostaway payout.
  const { data: piRows } = await sb.from('transactions')
    .select('date, description, amount_eur')
    .eq('property_name', jjPropertyName)
    .eq('category', 'Airbnb')
    .eq('subcategory', 'Platform Income')
    .or('review_status.eq.active,review_status.is.null');

  let monthSpecificSum = 0, monthSpecificCount = 0;
  let aggregateSum = 0, aggregateCount = 0;
  for (const t of piRows ?? []) {
    const parsed = parsePeriodFromDescription((t.description as string | null) ?? null);
    const from = parsed?.from ?? String(t.date);   // ISO 'YYYY-MM-DD' — lexical compare is date-correct
    const to = parsed?.to ?? String(t.date);
    const overlaps = from <= input.endDate && to >= input.startDate;
    if (!overlaps) continue;
    const amt = Number(t.amount_eur) || 0;
    const spansBeyondMonth = from < input.startDate || to > input.endDate;
    if (spansBeyondMonth) { aggregateSum += amt; aggregateCount++; }
    else { monthSpecificSum += amt; monthSpecificCount++; }
  }

  const periods: StrPeriodInput[] = [];
  if (res.success && res.audit) {
    const s = res.audit.summary;
    const hasHostawayActivity = s.revenueEligibleReservations > 0;

    // Month-specific JJ evidence wins (normal reconciliation). Otherwise, if only aggregate evidence
    // covers this month, mark aggregate_only. Otherwise there is genuinely no JJ evidence (missing).
    let jjAmount: number | null = null;
    let jjIsAggregate = false;
    if (aggregateCount > 0) {
      // A month touched by a multi-month aggregate cannot be cleanly reconciled monthly — even if a
      // month-specific row also exists, part of the month's income may live in the aggregate. Show
      // aggregate_only rather than risk a misleading variance. Never split.
      jjAmount = Math.round((aggregateSum + monthSpecificSum) * 100) / 100;   // context only, never compared
      jjIsAggregate = true;
    } else if (monthSpecificCount > 0) {
      jjAmount = Math.round(monthSpecificSum * 100) / 100;   // genuinely month-specific → normal reconciliation
    }

    if (hasHostawayActivity || monthSpecificCount > 0 || aggregateCount > 0) {
      const label = periodWindowLabel(input.startDate, input.endDate);
      periods.push({
        period: label,
        hostawayAmount: s.hostawayTotalPayout.amount,               // engine (authoritative), null if unknown
        hostawayConfidence: s.hostawayTotalPayout.confidence,
        jjAmount,
        jjIsAggregate,
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
