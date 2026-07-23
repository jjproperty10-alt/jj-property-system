/**
 * propertyAuditService.ts — Read-only Hostaway Property Audit Service.
 *
 * Sprint 2: Period-aggregate comparison, AuthoritativeAmount, AuditMatchState,
 *           AuditLimitations, EvidenceQuality.
 *
 * Implements IPropertyAuditService.
 * Queries pms schema + public.transactions, produces audit DTOs.
 * No writes. No mutations. No UI.
 *
 * Data access pattern:
 *   1. pms.property_mappings     → resolve Hostaway ↔ JJ mapping
 *   2. pms.canonical_reservations → get reservation list
 *   3. pms.raw_reservations      → get raw financials (JSONB)
 *   4. public.transactions       → get JJ Airbnb records
 *   5. Build period comparisons + audit states → produce DTOs
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  IPropertyAuditService,
  PropertyAuditRequest,
  PropertyAuditResult,
  HostawayPropertyAuditDTO,
  PropertyAuditSummaryDTO,
  AuditDifferenceDTO,
  AuditableProperty,
  AuditHealth,
  AuditMatchState,
  ChannelBreakdown,
  BookingChannel,
  ReservationAuditDTO,
  DataSourceRef,
  ReservationStatus,
  DateFilterMode,
  AuditLimitations,
  EvidenceQuality,
  AuthoritativeAmount,
  PeriodComparison,
} from './types';
import { isRevenueEligible } from './types';
import {
  normalizeChannel,
  buildReservationFinancials,
  parseAmount,
} from './computeFinancials';
import type { RawReservationFinancials } from './computeFinancials';
import {
  matchReservations,
  findUnmatchedJjTransactions,
  buildJjPeriodAggregates,
  buildPeriodComparisons,
  assignAuditStates,
} from './matchReservations';
import type {
  CanonicalReservationRow,
  JjAirbnbTransaction,
} from './matchReservations';

// ─── Audit ID counter ────────────────────────────────────────────────────────

let auditSeq = 0;

function nextAuditId(): string {
  auditSeq += 1;
  const year = new Date().getFullYear();
  return `HAU-${year}-${String(auditSeq).padStart(6, '0')}`;
}

// ─── Service implementation ──────────────────────────────────────────────────

export class PropertyAuditService implements IPropertyAuditService {
  constructor(private readonly supabase: SupabaseClient) {}

  async listAuditableProperties(): Promise<readonly AuditableProperty[]> {
    const { data, error } = await this.supabase
      .rpc('get_auditable_properties_v1')
      .select('*');

    // Fallback: direct query if RPC not available
    if (error) {
      return this.listAuditablePropertiesDirect();
    }

    return data ?? [];
  }

  private async listAuditablePropertiesDirect(): Promise<readonly AuditableProperty[]> {
    const { data: mappings, error } = await this.supabase
      .from('property_mappings')
      .select('external_id, jj_property_name, confidence_label, status')
      .eq('status', 'approved')
      .order('jj_property_name');

    if (error || !mappings) return [];

    // Get reservation counts per property
    const { data: resCounts } = await this.supabase
      .from('canonical_reservations')
      .select('external_property_id, check_in, check_out')
      .in('external_property_id', mappings.map(m => m.external_id));

    const countMap = new Map<string, { count: number; earliest: string | null; latest: string | null }>();
    for (const r of resCounts ?? []) {
      const entry = countMap.get(r.external_property_id) ?? { count: 0, earliest: null, latest: null };
      entry.count++;
      if (r.check_in && (!entry.earliest || r.check_in < entry.earliest)) entry.earliest = r.check_in;
      if (r.check_out && (!entry.latest || r.check_out > entry.latest)) entry.latest = r.check_out;
      countMap.set(r.external_property_id, entry);
    }

    // Get property names from canonical
    const { data: props } = await this.supabase
      .from('canonical_properties')
      .select('external_id, name')
      .in('external_id', mappings.map(m => m.external_id));

    const nameMap = new Map<string, string>();
    for (const p of props ?? []) {
      nameMap.set(p.external_id, p.name ?? '');
    }

    return mappings.map((m): AuditableProperty => {
      const rc = countMap.get(m.external_id);
      return {
        jjPropertyName: m.jj_property_name,
        hostawayPropertyId: m.external_id,
        hostawayName: nameMap.get(m.external_id) ?? '',
        mappingConfidence: m.confidence_label,
        earliestReservation: rc?.earliest ?? null,
        latestReservation: rc?.latest ?? null,
        totalReservations: rc?.count ?? 0,
      };
    });
  }

  async auditProperty(request: PropertyAuditRequest): Promise<PropertyAuditResult> {
    const { jjPropertyName, dateFrom, dateTo } = request;
    const dateFilterMode: DateFilterMode = request.dateFilterMode ?? 'stay_overlaps';
    const dataSources: DataSourceRef[] = [];

    try {
      // ── Step 1: Resolve property mapping ──
      const mapping = await this.resolveMapping(jjPropertyName);
      if (!mapping) {
        return {
          success: false,
          audit: null,
          error: `No approved mapping found for property "${jjPropertyName}"`,
        };
      }

      // ── Step 2: Fetch Hostaway canonical reservations ──
      const { reservations, rawFinancials, resCount } = await this.fetchReservations(
        mapping.externalId,
        dateFrom,
        dateTo,
        dateFilterMode,
      );
      dataSources.push({
        source: 'pms.canonical_reservations',
        queryTimestamp: new Date().toISOString(),
        rowCount: resCount,
      });

      // ── Step 3: Fetch JJ Airbnb transactions ──
      const jjTx = await this.fetchJjTransactions(jjPropertyName, dateFrom, dateTo);
      dataSources.push({
        source: 'public.transactions',
        queryTimestamp: new Date().toISOString(),
        rowCount: jjTx.length,
      });

      // ── Step 4: Build canonical rows with financials ──
      const nullPayout: AuthoritativeAmount = {
        amount: null,
        source: 'unknown',
        confidence: 'none',
        calculationNote: null,
      };

      const canonicalRows = reservations.map((r): CanonicalReservationRow => {
        const raw = rawFinancials.get(r.hostawayReservationId);
        const channel = (r.channel as BookingChannel) ?? normalizeChannel(r.channelRaw);
        const financials = raw
          ? buildReservationFinancials(channel, raw)
          : {
              totalPrice: parseAmount(String(r.totalPrice)),
              cleaningFee: parseAmount(String(r.cleaningFee)),
              hostServiceFee: null,
              channelCommission: null,
              taxAmount: null,
              payout: nullPayout,
              payoutExpected: null,
              basePrice: null,
            };

        return {
          hostawayReservationId: r.hostawayReservationId,
          hostawayPropertyId: r.hostawayPropertyId,
          channel,
          channelRaw: r.channelRaw,
          status: r.status as ReservationStatus,
          guestName: r.guestName,
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          nights: r.nights,
          guests: r.guests,
          currencyCode: r.currencyCode,
          financials,
        };
      });

      // ── Step 5: Build period aggregates + comparisons ──
      const jjAggregates = buildJjPeriodAggregates(jjTx);
      const periodComparisons = buildPeriodComparisons(canonicalRows, jjAggregates);

      // ── Step 6: Assign audit states ──
      const auditedReservations = assignAuditStates(canonicalRows, periodComparisons, jjTx);

      // ── Step 7: Collect all differences ──
      const allDifferences: AuditDifferenceDTO[] = [];
      const matchedIds = new Set<string>();

      for (const ar of auditedReservations) {
        if (ar.difference) allDifferences.push(ar.difference);
        for (const txId of ar.matchedTransactionIds) matchedIds.add(txId);
      }

      // Add period-level differences
      for (const pc of periodComparisons) {
        if (pc.periodMatchState === 'period_difference' && pc.periodDifference !== null) {
          allDifferences.push({
            direction: pc.periodDifference > 0 ? 'amount_mismatch' : 'amount_mismatch',
            lineType: 'platform_income',
            hostawayAmount: pc.hostawayPeriodPayout.amount,
            jjAmount: pc.jjPeriodAmount.amount,
            absoluteDifference: Math.abs(pc.periodDifference),
            description: `Period aggregate mismatch: Hostaway sum €${pc.hostawayPeriodPayout.amount?.toFixed(2)} vs JJ €${pc.jjPeriodAmount.amount?.toFixed(2)} (${pc.jjAggregate.description ?? 'no description'})`,
            expectedByBusinessRule: false,
            businessRuleRef: null,
          });
        }
      }

      // JJ-only transactions not covered by any period comparison
      const coveredJjIds = new Set(periodComparisons.map(pc => pc.jjAggregate.transactionId));
      const unmatchedJj = jjTx.filter(
        tx => tx.subcategory === 'Platform Income' && !coveredJjIds.has(tx.id),
      );
      for (const tx of unmatchedJj) {
        allDifferences.push({
          direction: 'jj_only',
          lineType: 'platform_income',
          hostawayAmount: null,
          jjAmount: tx.amountEur,
          absoluteDifference: Math.abs(tx.amountEur),
          description: `JJ Platform Income €${tx.amountEur.toFixed(2)} on ${tx.date} has no matching Hostaway reservations (description: "${tx.description}")`,
          expectedByBusinessRule: false,
          businessRuleRef: null,
        });
      }

      // ── Step 8: Build limitations + evidence quality ──
      const unparseableJjPeriods = jjAggregates.filter(a => a.periodFrom === null).length;
      const reservationsWithMissingFinancials = canonicalRows.filter(
        r => r.financials.payout.amount === null && isRevenueEligible(r.status),
      ).length;

      const limitations: AuditLimitations = {
        dateFilterMode,
        reservationLevelMatchingPossible: false,
        matchingLimitationReason: 'JJ records Platform Income as period aggregates (e.g. "1/7/25-31/12/25 = €5,857"), not per-reservation. Reservation-level matching is impossible with current JJ data.',
        comparisonGranularity: periodComparisons.length > 0 ? 'period_aggregate' : 'total_only',
        unparseableJjPeriods,
        reservationsWithMissingFinancials,
        notes: buildLimitationNotes(unparseableJjPeriods, reservationsWithMissingFinancials, unmatchedJj.length),
      };

      const evidenceQuality = buildEvidenceQuality(canonicalRows);

      // ── Step 9: Build summary ──
      const summary = buildSummary(
        auditedReservations,
        jjTx,
        allDifferences,
        periodComparisons,
        jjAggregates.length,
      );

      // ── Step 10: Assemble DTO ──
      const audit: HostawayPropertyAuditDTO = {
        jjPropertyName,
        hostawayPropertyId: mapping.externalId,
        hostawayPropertyName: mapping.hostawayName,
        hostawayInternalName: mapping.internalName,
        mappingConfidence: mapping.confidenceLabel,
        mappingStatus: mapping.status,
        auditId: nextAuditId(),
        auditDate: new Date().toISOString(),
        dateRangeFrom: dateFrom,
        dateRangeTo: dateTo,
        dateFilterMode,
        limitations,
        evidenceQuality,
        summary,
        reservations: auditedReservations,
        periodComparisons,
        differences: allDifferences,
        dataSources,
      };

      return { success: true, audit, error: null };
    } catch (err) {
      return {
        success: false,
        audit: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ─── Private query helpers ─────────────────────────────────────────────────

  private async resolveMapping(jjPropertyName: string) {
    const { data } = await this.supabase
      .from('property_mappings')
      .select('external_id, jj_property_name, status, confidence_label, evidence')
      .eq('jj_property_name', jjPropertyName)
      .eq('status', 'approved')
      .limit(1)
      .single();

    if (!data) return null;

    // Get Hostaway property name
    const { data: prop } = await this.supabase
      .from('canonical_properties')
      .select('name, internal_name')
      .eq('external_id', data.external_id)
      .limit(1)
      .single();

    return {
      externalId: data.external_id as string,
      jjPropertyName: data.jj_property_name as string,
      status: data.status as string,
      confidenceLabel: data.confidence_label as string,
      hostawayName: (prop?.name as string) ?? '',
      internalName: (prop?.internal_name as string | null) ?? null,
    };
  }

  private async fetchReservations(
    externalPropertyId: string,
    dateFrom: string,
    dateTo: string,
    dateFilterMode: DateFilterMode,
  ) {
    // Build query based on date filter mode
    let query = this.supabase
      .from('canonical_reservations')
      .select(
        'external_id, external_property_id, channel, channel_raw, status, guest_name, check_in, check_out, nights, guests, currency_code, total_price, cleaning_fee'
      )
      .eq('external_property_id', externalPropertyId);

    switch (dateFilterMode) {
      case 'stay_overlaps':
        // Reservation overlaps [dateFrom, dateTo] if check_in <= dateTo AND check_out >= dateFrom
        query = query.lte('check_in', dateTo).gte('check_out', dateFrom);
        break;
      case 'check_in_within':
        query = query.gte('check_in', dateFrom).lte('check_in', dateTo);
        break;
      case 'check_out_within':
        query = query.gte('check_out', dateFrom).lte('check_out', dateTo);
        break;
      case 'created_within':
        query = query.gte('created_at', dateFrom).lte('created_at', dateTo);
        break;
    }

    const { data: canonical, error } = await query;

    if (error) throw new Error(`canonical_reservations query failed: ${error.message}`);

    const rows = canonical ?? [];

    // Get raw financials for these reservations
    const externalIds = rows.map(r => r.external_id);
    const rawFinancials = new Map<string, RawReservationFinancials>();

    if (externalIds.length > 0) {
      const { data: rawRows } = await this.supabase
        .from('raw_reservations')
        .select('external_id, raw')
        .in('external_id', externalIds)
        .eq('is_current', true);

      for (const rr of rawRows ?? []) {
        const raw = rr.raw as Record<string, unknown>;
        rawFinancials.set(rr.external_id, {
          totalPrice: (raw.totalPrice as string) ?? null,
          cleaningFee: (raw.cleaningFee as string) ?? null,
          airbnbListingHostFee: (raw.airbnbListingHostFee as string) ?? null,
          airbnbExpectedPayoutAmount: (raw.airbnbExpectedPayoutAmount as string) ?? null,
          channelCommissionAmount: (raw.channelCommissionAmount as string) ?? null,
          taxAmount: (raw.taxAmount as string) ?? null,
          airbnbListingBasePrice: (raw.airbnbListingBasePrice as string) ?? null,
          airbnbListingCleaningFee: (raw.airbnbListingCleaningFee as string) ?? null,
        });
      }
    }

    const reservations = rows.map(r => ({
      hostawayReservationId: r.external_id as string,
      hostawayPropertyId: r.external_property_id as string,
      channel: r.channel as string | null,
      channelRaw: r.channel_raw as string | null,
      status: r.status as string,
      guestName: r.guest_name as string | null,
      checkIn: r.check_in as string,
      checkOut: r.check_out as string,
      nights: r.nights as number,
      guests: r.guests as number | null,
      currencyCode: r.currency_code as string,
      totalPrice: r.total_price as number | null,
      cleaningFee: r.cleaning_fee as number | null,
    }));

    return { reservations, rawFinancials, resCount: rows.length };
  }

  private async fetchJjTransactions(
    jjPropertyName: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<JjAirbnbTransaction[]> {
    const { data, error } = await this.supabase
      .from('transactions')
      .select('id, date, property_name, subcategory, amount_eur, description, payer, payee')
      .eq('category', 'Airbnb')
      .eq('property_name', jjPropertyName)
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .or('review_status.eq.active,review_status.is.null');

    if (error) throw new Error(`transactions query failed: ${error.message}`);

    return (data ?? []).map((r): JjAirbnbTransaction => ({
      id: r.id,
      date: r.date,
      propertyName: r.property_name,
      subcategory: r.subcategory,
      amountEur: Number(r.amount_eur),
      description: r.description,
      payer: r.payer,
      payee: r.payee,
    }));
  }
}

// ─── Limitation notes builder ───────────────────────────────────────────────

function buildLimitationNotes(
  unparseableJjPeriods: number,
  missingFinancials: number,
  unmatchedJjCount: number,
): readonly string[] {
  const notes: string[] = [];

  if (unparseableJjPeriods > 0) {
    notes.push(`${unparseableJjPeriods} JJ Platform Income row(s) have descriptions that could not be parsed into date ranges. These cannot participate in period-aggregate comparison.`);
  }

  if (missingFinancials > 0) {
    notes.push(`${missingFinancials} non-cancelled reservation(s) have missing payout data. These are marked as insufficient_evidence.`);
  }

  if (unmatchedJjCount > 0) {
    notes.push(`${unmatchedJjCount} JJ Platform Income row(s) could not be matched to any Hostaway period. This may indicate JJ records outside the Hostaway date range or data entry differences.`);
  }

  return notes;
}

// ─── Evidence quality builder ───────────────────────────────────────────────

function buildEvidenceQuality(
  canonicalRows: readonly CanonicalReservationRow[],
): EvidenceQuality {
  const revenueEligible = canonicalRows.filter(
    r => isRevenueEligible(r.status),
  );

  if (revenueEligible.length === 0) {
    return {
      reportedPayoutFraction: 0,
      completeFinancialsFraction: 0,
      overallQuality: 'insufficient',
      qualityNote: 'No revenue-eligible reservations to evaluate.',
    };
  }

  const reported = revenueEligible.filter(r => r.financials.payout.source === 'reported').length;
  const complete = revenueEligible.filter(r => r.financials.payout.amount !== null).length;

  const reportedFraction = Math.round((reported / revenueEligible.length) * 100) / 100;
  const completeFraction = Math.round((complete / revenueEligible.length) * 100) / 100;

  let overallQuality: EvidenceQuality['overallQuality'];
  if (reportedFraction >= 0.8 && completeFraction >= 0.95) {
    overallQuality = 'high';
  } else if (reportedFraction >= 0.5 && completeFraction >= 0.8) {
    overallQuality = 'medium';
  } else if (completeFraction >= 0.5) {
    overallQuality = 'low';
  } else {
    overallQuality = 'insufficient';
  }

  const qualityNote = `${reported}/${revenueEligible.length} payouts from reported source (${(reportedFraction * 100).toFixed(0)}%), ${complete}/${revenueEligible.length} have complete financial data (${(completeFraction * 100).toFixed(0)}%).`;

  return { reportedPayoutFraction: reportedFraction, completeFinancialsFraction: completeFraction, overallQuality, qualityNote };
}

// ─── Summary builder ─────────────────────────────────────────────────────────

function buildSummary(
  reservations: readonly ReservationAuditDTO[],
  jjTransactions: readonly JjAirbnbTransaction[],
  differences: readonly AuditDifferenceDTO[],
  periodComparisons: readonly PeriodComparison[],
  jjPeriodAggregateCount: number,
): PropertyAuditSummaryDTO {
  // Only revenue-eligible statuses (confirmed/modified) participate in financial totals
  const revenueEligible = reservations.filter(r => isRevenueEligible(r.status));
  const cancelled = reservations.filter(r => r.status === 'cancelled');
  const confirmed = reservations.filter(r => r.status === 'confirmed');
  const inquiry = reservations.filter(r => r.status === 'inquiry');
  const ownerStay = reservations.filter(r => r.status === 'owner_stay');
  const modified = reservations.filter(r => r.status === 'modified');
  const unknown = reservations.filter(r => r.status === 'unknown');

  // Channel breakdown (non-cancelled only)
  const channelMap = new Map<BookingChannel, { count: number; revenue: number; payout: number | null }>();
  for (const r of revenueEligible) {
    const entry = channelMap.get(r.channel) ?? { count: 0, revenue: 0, payout: 0 };
    entry.count++;
    entry.revenue += r.financials.totalPrice ?? 0;
    if (r.financials.payout.amount !== null && entry.payout !== null) {
      entry.payout += r.financials.payout.amount;
    } else {
      entry.payout = null;
    }
    channelMap.set(r.channel, entry);
  }

  const channelBreakdown: ChannelBreakdown[] = [];
  for (const [channel, data] of channelMap) {
    channelBreakdown.push({
      channel,
      reservationCount: data.count,
      totalRevenue: Math.round(data.revenue * 100) / 100,
      totalPayout: data.payout !== null ? Math.round(data.payout * 100) / 100 : null,
    });
  }

  // Hostaway totals
  let hostawayTotalRevenue = 0;
  let payoutSum = 0;
  let anyPayoutNull = false;
  let allPayoutReported = true;
  let hostawayTotalCleaning = 0;

  for (const r of revenueEligible) {
    hostawayTotalRevenue += r.financials.totalPrice ?? 0;
    if (r.financials.payout.amount !== null) {
      payoutSum += r.financials.payout.amount;
      if (r.financials.payout.source !== 'reported') allPayoutReported = false;
    } else {
      anyPayoutNull = true;
    }
    hostawayTotalCleaning += r.financials.cleaningFee ?? 0;
  }

  const hostawayTotalPayout: AuthoritativeAmount = anyPayoutNull
    ? { amount: null, source: 'unknown', confidence: 'none', calculationNote: 'Some reservations have missing payout data' }
    : {
        amount: Math.round(payoutSum * 100) / 100,
        source: allPayoutReported ? 'reported' : 'calculated',
        confidence: allPayoutReported ? 'high' : 'medium',
        calculationNote: `Sum of ${revenueEligible.length} reservation payouts`,
      };

  // JJ totals
  const piTx = jjTransactions.filter(t => t.subcategory === 'Platform Income');
  const clTx = jjTransactions.filter(t => t.subcategory === 'Cleaning');
  const mfTx = jjTransactions.filter(t => t.subcategory === 'Management Fee');

  const jjPlatformIncomeTotal = piTx.reduce((s, t) => s + t.amountEur, 0);
  const jjCleaningTotal = clTx.reduce((s, t) => s + t.amountEur, 0);
  const jjManagementFeeTotal = mfTx.reduce((s, t) => s + t.amountEur, 0);

  // Period comparison stats
  const periodsCompared = periodComparisons.filter(pc => pc.periodMatchState !== 'period_insufficient_data').length;
  const periodsMatched = periodComparisons.filter(pc => pc.periodMatchState === 'period_exact').length;
  const totalPeriodDifference = periodComparisons.reduce((sum, pc) => {
    if (pc.periodDifference !== null) return sum + pc.periodDifference;
    return sum;
  }, 0);

  // Audit state distribution
  const auditStateDistribution: Record<AuditMatchState, number> = {
    exact: 0,
    aggregate_match: 0,
    probable: 0,
    difference: 0,
    missing_in_jj: 0,
    missing_in_hostaway: 0,
    not_comparable: 0,
    insufficient_evidence: 0,
  };
  for (const r of reservations) {
    auditStateDistribution[r.auditState]++;
  }

  // Date range
  const allCheckIns = reservations.map(r => r.checkIn).filter(Boolean).sort();
  const allCheckOuts = reservations.map(r => r.checkOut).filter(Boolean).sort();

  // Total difference amount
  const totalDiffAmount = differences.reduce((s, d) => s + d.absoluteDifference, 0);

  // Health assessment
  const health = assessHealth(differences, totalDiffAmount, periodsCompared, periodsMatched);

  return {
    totalReservations: reservations.length,
    revenueEligibleReservations: revenueEligible.length,
    confirmedReservations: confirmed.length,
    modifiedReservations: modified.length,
    cancelledReservations: cancelled.length,
    inquiryReservations: inquiry.length,
    ownerStayReservations: ownerStay.length,
    unknownStatusReservations: unknown.length,
    channelBreakdown,
    hostawayTotalRevenue: Math.round(hostawayTotalRevenue * 100) / 100,
    hostawayTotalPayout,
    hostawayTotalCleaning: Math.round(hostawayTotalCleaning * 100) / 100,
    jjAirbnbRows: jjTransactions.length,
    jjPlatformIncomeTotal: Math.round(jjPlatformIncomeTotal * 100) / 100,
    jjCleaningTotal: Math.round(jjCleaningTotal * 100) / 100,
    jjManagementFeeTotal: Math.round(jjManagementFeeTotal * 100) / 100,
    jjPeriodAggregateCount,
    periodsCompared,
    periodsMatched,
    totalPeriodDifference: periodsCompared > 0 ? Math.round(totalPeriodDifference * 100) / 100 : null,
    auditStateDistribution,
    totalDifferences: differences.length,
    totalDifferenceAmount: Math.round(totalDiffAmount * 100) / 100,
    earliestCheckIn: allCheckIns[0] ?? null,
    latestCheckOut: allCheckOuts[allCheckOuts.length - 1] ?? null,
    health,
  };
}

function assessHealth(
  differences: readonly AuditDifferenceDTO[],
  totalDiffAmount: number,
  periodsCompared: number,
  periodsMatched: number,
): AuditHealth {
  if (differences.length === 0 && periodsCompared > 0 && periodsMatched === periodsCompared) return 'clean';
  if (differences.length === 0) return 'clean';

  // If less than 50% of periods match → critical
  if (periodsCompared > 0 && periodsMatched / periodsCompared < 0.5) return 'critical';

  // If total difference > €500 → critical
  if (totalDiffAmount > 500) return 'critical';

  // If total difference > €50 → review
  if (totalDiffAmount > 50) return 'review';

  // Small differences
  return 'minor';
}
