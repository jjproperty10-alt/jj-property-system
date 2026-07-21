/**
 * @module lifecycle/partnerStatementService
 * @description Server-side service: loads PartnerStatementDTO from lifecycle + RC3.
 *
 * SECURITY:
 * - Uses createServiceClient() (service_role) for all lifecycle reads.
 * lifecycle schema has RLS deny-all; service role is required.
 * - Slug-based authorization: unknown slug → null (no error detail leaked).
 * - viewMode controls whether verification block is included in output.
 * - NEVER import this module on the client side. Server Component only.
 *
 * COMPOSITION:
 * - Lifecycle data (capital, ownership, timeline): loaded via service client.
 * - RC3 financial data: loaded via fetchRC3Report (uses anon client on server).
 * - PartnerStatementDTO is assembled entirely server-side — UI receives only output.
 * - No joins between lifecycle schema and public schema in this service.
 * lifecycle → PartnerPropertyStatement.capital/ownership/timeline
 * public → PartnerPropertyStatement.financial (via RC3 engine)
 * Both are fetched independently, then composed here.
 *
 * IMMUTABILITY:
 * - This service is READ-ONLY. It never writes to any table.
 * - All business facts are loaded as-is — no inference, no default-filling.
 *
 * SCHEMA CONTRACT (verified 2026-07-16 against Production):
 * - lifecycle.entity_identity columns: id, canonical_name, aliases,
 *   entity_type, status, created_at, updated_at
 * - NO owner_type column (was never created — original design artifact).
 * - entity_type values: 'partner', 'investor', 'jj_company', 'external'
 * - NO 'person' entity_type value.
 * - Investor entities (loadable as /partner/{slug}): 'partner', 'investor'
 * - JJ group entities (shown as "JJ Group" in co-owner display): 'partner', 'jj_company'
 *
 * @see PartnerStatementDTO Contract v1.2 (partnerStatementTypes.ts)
 * @see P-ARCH-1: Unknown = NULL. Never 0 or placeholder.
 * @see P-ARCH-2: Payer identity must not be normalised — Yossi ≠ Jacob ≠ JJ.
 * @see P-ARCH-5: lifecycle schema and public schema never cross-referenced by FK.
 * @see P-ARCH-6: Partner route never exposes jj_* fields.
 * @see I-12: DTO is immutable. No consumer may mutate business data.
 */

import { createServiceClient } from '@/lib/supabase'
import { loadInvestmentTimeline } from './timelineService'
import { fetchRC3Report } from '@/lib/report/fetchReport'
import type {
  PartnerStatementDTO,
  PartnerFacingStatementDTO,
  AdminStatementDTO,
  InvestorInfo,
  PartnerPropertyStatement,
  CapitalStatement,
  CapitalPayment,
  OwnershipStatement,
  CoOwner,
  FinancialStatement,
  SettlementStatement,
  TimelineStatement,
  PortfolioSummary,
  StatementActions,
  StatementLocalization,
  VerificationSummary,
  CapitalStatus,
  DateConfidence,
} from './partnerStatementTypes'

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Entity types that belong to the JJ group.
 * Entities with these types appear as ownerKind='jj_group' in co-owner display.
 *
 * Verified against Production schema (2026-07-16):
 * 'partner' → Yossi, Jacob (JJ principals)
 * 'jj_company' → JJ Property 10 (the company entity)
 *
 * 'investor' (Avi, Oren) and 'external' (Anastasia, Fabi) are NOT JJ group.
 *
 * NOTE: owner_type column does not exist in lifecycle.entity_identity.
 * This constant supersedes the original JJ_OWNER_TYPES design which referenced
 * a non-existent owner_type column with values 'jj_principal'/'jj_partner'/'jj_employee'.
 */
const JJ_ENTITY_TYPES = new Set<string>(['jj_company', 'partner'])

// ─── Exported helpers (tested in partnerStatement.test.ts) ────────────────────

/**
 * Build a URL-safe slug from a canonical name.
 * 'Avi' → 'avi', 'Villa Mazotos' → 'villa-mazotos'
 */
export function buildSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

/**
 * Resolve capital status from DB values.
 * P-ARCH-1: null means unknown — never treat as 0.
 */
export function resolveCapitalStatus(
  capitalPaid: number | null,
  capitalRemaining: number | null,
  requiredCapital: number | null,
  hasCapitalEvents = true,
): CapitalStatus {
  // no_capital_event: no rows exist in DB for this entity + property (P-ARCH-1)
  if (!hasCapitalEvents) return 'no_capital_event'

  // paid + required are the authoritative fields.
  // capitalRemaining is accepted for compatibility but is NOT the source of truth.
  // Contradictory inputs (e.g. remaining=0 but paid < required) → paid+required wins.
  if (capitalPaid !== null && requiredCapital !== null) {
    return capitalPaid >= requiredCapital ? 'fully_paid' : 'partially_paid'
  }

  // At least one event exists but amounts are unknown (P-ARCH-1: never coerce to 0)
  return 'capital_unknown'
}

/**
 * Round a euro amount to 2 decimal places.
 * Applied once at aggregate boundary — never per-row.
 *
 * Uses Number(value.toFixed(2)) as approved by Yossi (2026-07-21).
 * Note: 1.005 in float64 is 1.00499... → rounds to 1.00 (IEEE 754 behavior).
 * Applied once at the aggregate boundary in buildPortfolioSummary.
 *
 * Implementation: Math.sign(v) * Math.round(|v|*100 + Number.EPSILON*100) / 100
 * - Uses Math.abs so Math.round always operates on a positive number,
 *   giving consistent "round half up" behavior regardless of sign.
 * - Adds Number.EPSILON*100 before Math.round to compensate for IEEE 754
 *   representation error at the ×100 scale (e.g., 1.005 stores as 1.00499...,
 *   deficit ≈ 1.42e-14; Number.EPSILON*100 ≈ 2.22e-14 covers it).
 * - Handles JS accumulation drift (0.1 + 0.2 = 0.30000000000000004 → 0.30).
 *
 * Verified (Node.js): 1.005→1.01, 2.675→2.68, -1.005→-1.01,
 * -5.245→-5.25, 0→0, 1085.919999999→1085.92, drift cases ✅.
 */
export const roundEur = (value: number): number => {
  if (value === 0) return 0
  return Math.sign(value) * Math.round(Math.abs(value) * 100 + Number.EPSILON * 100) / 100
}

/**
 * Build cross-property portfolio summary from per-property statements.
 * P-ARCH-1: if ANY property has unknown capital, the total is null (not 0).
 *
 * v1.2: also aggregates RC3 financial totals (income, expenses, net result).
 * Financial totals are null when NO property has financial data (P-ARCH-1).
 * When financial data exists and the aggregate is zero, returns 0 (not null).
 * roundEur applied once at the aggregate boundary — never per-row.
 */
export function buildPortfolioSummary(
  properties: readonly PartnerPropertyStatement[],
): PortfolioSummary {
  let totalAgreedValuation: number | null = 0
  let totalCapitalPaid: number | null = 0
  let totalCapitalRemaining: number | null = 0

  // Financial aggregation — null until at least one property has financial data
  let hasFinancial = false
  let incomeAcc = 0
  let expensesAcc = 0

  for (const prop of properties) {
    const c = prop.capital
    if (totalAgreedValuation !== null) {
      totalAgreedValuation =
        c.agreedEntryValuationEur !== null
          ? totalAgreedValuation + c.agreedEntryValuationEur
          : null
    }
    if (totalCapitalPaid !== null) {
      totalCapitalPaid =
        c.capitalPaidEur !== null ? totalCapitalPaid + c.capitalPaidEur : null
    }
    if (totalCapitalRemaining !== null) {
      totalCapitalRemaining =
        c.capitalRemainingEur !== null
          ? totalCapitalRemaining + c.capitalRemainingEur
          : null
    }

    // RC3 financial aggregation across all properties and sections
    if (prop.financial !== null) {
      hasFinancial = true
      for (const section of prop.financial.accountSections) {
        incomeAcc += section.total_income
        expensesAcc += section.total_expenses
      }
    }
  }

  return {
    totalPropertiesCount: properties.length,
    totalAgreedValuationEur: totalAgreedValuation,
    totalCapitalPaidEur: totalCapitalPaid,
    totalCapitalRemainingEur: totalCapitalRemaining,
    // TODO M9-C: Replace all four fields below with Settlement Engine values.
    totalReceivableFromJJ: 0,
    totalPayableToJJ: 0,
    finalNetBalance: 0,
    direction: 'unknown',
    // v1.2: pre-computed financial totals — roundEur applied once at aggregate boundary
    totalIncomeEur:   hasFinancial ? roundEur(incomeAcc)                : null,
    totalExpensesEur: hasFinancial ? roundEur(expensesAcc)              : null,
    netResultEur:     hasFinancial ? roundEur(incomeAcc - expensesAcc)  : null,
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface PartnerStatementOptions {
  /** 'partner' omits the verification block. 'admin' includes it. Default: 'partner'. */
  viewMode?: 'partner' | 'admin'
  lang?: 'en' | 'he'
  fromDate?: string
  toDate?: string
}

/**
 * Load PartnerStatementDTO for one investor identified by URL slug.
 *
 * Authorization flow:
 * 1. Resolve slug → entity_id via lifecycle.entity_identity (case-insensitive)
 * 2. Verify at least one active partner_entry exists for this entity
 * 3. For each property: load capital events, ownership, timeline (lifecycle)
 *    and RC3 financial data (public schema, fetched independently)
 * 4. Compose PortfolioSummary from per-property statements
 * 5. Return discriminated union based on viewMode
 *
 * Returns null when slug is unknown or entity has no active partner_entry rows.
 *
 * @param investorSlug URL slug (e.g. 'avi' for /partner/avi)
 * @param options View mode, language, date range
 */
export async function loadPartnerStatement(
  investorSlug: string,
  options: PartnerStatementOptions = {},
): Promise<PartnerStatementDTO | null> {
  const { viewMode = 'partner', lang = 'en', fromDate, toDate } = options
  const db = createServiceClient()

  // ── Step 1: resolve entity from slug (case-insensitive) ──────────────────
  const { data: allEntities, error: entityErr } = await db
    .schema('lifecycle')
    .from('entity_identity')
    .select('id, canonical_name, entity_type')
    .in('entity_type', ['partner', 'investor'])

  if (entityErr || !allEntities || allEntities.length === 0) return null

  type EntityRow = { id: string; canonical_name: string; entity_type: string }
  const matchedEntity = (allEntities as EntityRow[]).find(
    e => buildSlug(e.canonical_name) === investorSlug.toLowerCase(),
  )

  if (!matchedEntity) return null

  const entityId = matchedEntity.id
  const canonicalName = matchedEntity.canonical_name
  const ownerType = matchedEntity.entity_type ?? 'partner'

  // ── Step 2: load partner entries (authorization gate + property list) ─────
  const { data: partnerEntries, error: entriesErr } = await db
    .schema('lifecycle')
    .from('partner_entry')
    .select('property_name')
    .eq('entity_id', entityId)
    .neq('status', 'void')

  if (entriesErr || !partnerEntries || partnerEntries.length === 0) return null

  const propertyNames = Array.from(
    new Set((partnerEntries as Array<{ property_name: string }>).map(e => e.property_name)),
  )

  // ── Step 3: load summary rows from view (all properties in one query) ─────
  const { data: summaryRows } = await db
    .schema('lifecycle')
    .from('v_partner_investment_statement')
    .select('*')
    .eq('entity_id', entityId)
    .in('property_name', propertyNames)

  const summaryByProperty = new Map<string, Record<string, unknown>>(
    (summaryRows ?? []).map(r => {
      const row = r as Record<string, unknown>
      return [row.property_name as string, row]
    }),
  )

  // ── Step 4: build per-property statements (sequential — avoids rate limits) ─
  const propertyStatements: PartnerPropertyStatement[] = []

  for (const propertyName of propertyNames) {
    const s = summaryByProperty.get(propertyName) ?? null

    // ── 4a: Capital events (inflows only = investor payments) ───────────────
    // F1 fix: direction='inflow' — DB constraint only allows 'inflow'/'outflow'.
    const { data: capitalRows } = await db
      .schema('lifecycle')
      .from('capital_event')
      .select(
        'id, amount_eur, effective_date, effective_date_confidence, description, payer_name, payee_name, direction',
      )
      .eq('entity_id', entityId)
      .eq('property_name', propertyName)
      .neq('status', 'void')
      .eq('direction', 'inflow')
      .order('effective_date', { ascending: true, nullsFirst: false })

    const payments: CapitalPayment[] = (
      capitalRows as Array<Record<string, unknown>> ?? []
    ).map(r => ({
      eventId: r.id as string,
      effectiveDate: (r.effective_date as string | null) ?? null,
      effectiveDateConfidence:
        ((r.effective_date_confidence as string) ?? 'pending_verification') as DateConfidence,
      amountEur: (r.amount_eur as number) ?? 0,
      description: (r.description as string | null) ?? null,
      payerName: (r.payer_name as string | null) ?? null,
      payeeName: (r.payee_name as string | null) ?? null,
    }))

    const capitalPaidEur = s ? (s.capital_paid_eur as number | null) ?? null : null
    const capitalRemainingEur = s ? (s.capital_remaining_eur as number | null) ?? null : null
    const requiredCapitalEur = s ? (s.required_entry_capital_eur as number | null) ?? null : null

    const capital: CapitalStatement = {
      agreedEntryValuationEur:
        s ? (s.agreed_entry_valuation_eur as number | null) ?? null : null,
      requiredCapitalEur,
      capitalPaidEur,
      capitalRemainingEur,
      capitalStatus: resolveCapitalStatus(capitalPaidEur, capitalRemainingEur, requiredCapitalEur, payments.length > 0),
      payments,
    }

    // ── 4b: Ownership + co-owners ────────────────────────────────────────────
    const { data: ownershipRows } = await db
      .schema('lifecycle')
      .from('ownership_period')
      .select('entity_id, ownership_pct')
      .eq('property_name', propertyName)
      .neq('status', 'void')
      .is('effective_to', null)

    type OwnershipRow = { entity_id: string; ownership_pct: number }
    const allOwners = (ownershipRows as OwnershipRow[] ?? [])
    const currentOwnerRow = allOwners.find(r => r.entity_id === entityId)

    const otherOwners = allOwners.filter(r => r.entity_id !== entityId)
    const coOwners: CoOwner[] = []

    if (otherOwners.length > 0) {
      const { data: coOwnerEntities } = await db
        .schema('lifecycle')
        .from('entity_identity')
        .select('id, canonical_name, entity_type')
        .in('id', otherOwners.map(o => o.entity_id))

      type EntityIdentityRow = { id: string; canonical_name: string; entity_type: string }
      for (const entity of (coOwnerEntities as EntityIdentityRow[] ?? [])) {
        const pct = otherOwners.find(o => o.entity_id === entity.id)?.ownership_pct ?? 0
        const isJj = JJ_ENTITY_TYPES.has(entity.entity_type ?? '')
        coOwners.push({
          name: isJj ? 'JJ Group' : entity.canonical_name,
          ownershipPct: pct,
          ownerKind: isJj ? 'jj_group' : 'co_investor',
        })
      }
    }

    const ownership: OwnershipStatement = {
      currentOwnershipPct:
        currentOwnerRow?.ownership_pct ??
        (s ? (s.ownership_pct as number | null) ?? null : null),
      entryStatus: s ? (s.entry_status as string) ?? 'unknown' : 'unknown',
      coOwners,
    }

    // ── 4c: Financial data from RC3 engine ───────────────────────────────────
    let financial: FinancialStatement | null = null
    try {
      const rc3Report = await fetchRC3Report({ reportingName: propertyName, fromDate, toDate })
      if (rc3Report.accounts.length > 0) {
        financial = {
          reportingName: propertyName,
          fromDate: rc3Report.from_date,
          toDate: rc3Report.to_date,
          accountSections: rc3Report.accounts,
          hasSale: rc3Report.has_sale,
          hasRenovation: rc3Report.has_renovation,
          hasRental: rc3Report.has_rental,
          hasAirbnb: rc3Report.has_airbnb,
        }
      }
    } catch {
      // RC3 unavailable for this property — financial stays null.
    }

    // ── 4d: Settlement (M9-C scope) ──────────────────────────────────────────
    const settlement: SettlementStatement = {
      currentBalanceEur: null,
      totalDistributionsPaidEur: s
        ? (s.total_distributions_eur as number) ?? 0
        : 0,
    }

    // ── 4e: Timeline — reuse loadInvestmentTimeline from timelineService ─────
    const timelineDTO = await loadInvestmentTimeline(canonicalName, propertyName, {
      includeInternal: viewMode === 'admin',
    })

    const timeline: TimelineStatement = timelineDTO
      ? {
          events: timelineDTO.events.map(e => ({
            eventId: e.eventId,
            effectiveDate: e.effectiveDate,
            effectiveDateConfidence: e.effectiveDateConfidence as DateConfidence,
            title: e.title,
            description: e.description,
            amountEur: e.amount,
            partnerVisible: e.partnerVisible,
            status: e.status,
          })),
          openVerificationTasks: timelineDTO.evidence.openVerificationTasks,
          hasPendingDates: timelineDTO.evidence.hasPendingDates,
          // F3: real per-task rows — humanLabel computed server-side in timelineService
          verificationTaskItems: timelineDTO.evidence.verificationTaskItems,
        }
      : {
          events: [],
          openVerificationTasks: 0,
          hasPendingDates: false,
          verificationTaskItems: [],
        }

    propertyStatements.push({
      propertyName,
      rc3ReportingName: financial ? propertyName : null,
      capital,
      ownership,
      financial,
      settlement,
      timeline,
    })
  }

  // ── Step 5: portfolio summary ─────────────────────────────────────────────
  const portfolio = buildPortfolioSummary(propertyStatements)

  // ── Step 6: shared blocks ─────────────────────────────────────────────────
  const investor: InvestorInfo = {
    entityId,
    canonicalName,
    slug: investorSlug,
    ownerType,
  }

  const actions: StatementActions = {
    canExportCsv: propertyStatements.some(p => p.financial !== null),
    canGeneratePdf: propertyStatements.some(p => p.financial !== null),
    hasOpenVerificationTasks: propertyStatements.some(
      p => p.timeline.openVerificationTasks > 0,
    ),
  }

  const now = new Date().toISOString()
  const localization: StatementLocalization = { lang, currency: 'EUR', generatedAt: now }

  const baseMeta = {
    schemaVersion: 'PartnerStatementDTO/1.2' as const,
    generatedAt: now,
  }

  // ── Step 7: discriminate on viewMode ─────────────────────────────────────
  if (viewMode === 'admin') {
    const verification: VerificationSummary = {
      totalOpenTasks: propertyStatements.reduce(
        (sum, p) => sum + p.timeline.openVerificationTasks,
        0,
      ),
      propertiesWithPendingDates: propertyStatements
        .filter(p => p.timeline.hasPendingDates)
        .map(p => p.propertyName),
      propertiesWithUnknownCapital: propertyStatements
        .filter(p => p.capital.capitalStatus === 'capital_unknown')
        .map(p => p.propertyName),
    }

    return {
      meta: { ...baseMeta, viewMode: 'admin' },
      investor,
      properties: propertyStatements,
      portfolio,
      actions,
      localization,
      verification,
    } satisfies AdminStatementDTO
  }

  return {
    meta: { ...baseMeta, viewMode: 'partner' },
    investor,
    properties: propertyStatements,
    portfolio,
    actions,
    localization,
  } satisfies PartnerFacingStatementDTO
}
