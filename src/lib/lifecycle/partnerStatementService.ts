/**
 * @module lifecycle/partnerStatementService
 * @description Server-side service: loads PartnerStatementDTO from lifecycle + RC3.
 *
 * SECURITY:
 * - Uses createServiceClient() (service_role) for all lifecycle reads.
 *   lifecycle schema has RLS deny-all; service role is required.
 * - Slug-based authorization: unknown slug → null (no error detail leaked).
 * - viewMode controls whether verification block is included in output.
 * - NEVER import this module on the client side. Server Component only.
 *
 * COMPOSITION:
 * - Lifecycle data (capital, ownership, timeline): loaded via service client.
 * - RC3 financial data: loaded via fetchRC3Report (uses anon client on server).
 * - PartnerStatementDTO is assembled entirely server-side — UI receives only output.
 * - No joins between lifecycle schema and public schema in this service.
 *   lifecycle → PartnerPropertyStatement.capital/ownership/timeline
 *   public    → PartnerPropertyStatement.financial (via RC3 engine)
 *   Both are fetched independently, then composed here.
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
 * @see PartnerStatementDTO Contract v1.0 (partnerStatementTypes.ts)
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
 *   'partner'    → Yossi, Jacob (JJ principals)
 *   'jj_company' → JJ Property 10 (the company entity)
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
 * Build cross-property portfolio summary from per-property statements.
 * P-ARCH-1: if ANY property has unknown capital, the total is null (not 0).
 */
export function buildPortfolioSummary(
  properties: readonly PartnerPropertyStatement[],
): PortfolioSummary {
  let totalAgreedValuation: number | null = 0
  let totalCapitalPaid: number | null = 0
  let totalCapitalRemaining: number | null = 0

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
  }

  return {
    totalPropertiesCount: properties.length,
    totalAgreedValuationEur: totalAgreedValuation,
    totalCapitalPaidEur: totalCapitalPaid,
    totalCapitalRemainingEur: totalCapitalRemaining,
    // TODO M9-C: Replace all four fields below with Settlement Engine values.
    // Settlement Engine is out of scope for PR 44 / M9-A.
    totalReceivableFromJJ: 0,
    totalPayableToJJ: 0,
    finalNetBalance: 0,
    direction: 'unknown',
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
 *   1. Resolve slug → entity_id via lifecycle.entity_identity (case-insensitive)
 *      Filters entity_type IN ('partner', 'investor') — only loadable investor types.
 *      entity_type 'jj_company' and 'external' are not accessible via partner routes.
 *   2. Verify at least one active partner_entry exists for this entity
 *   3. For each property: load capital events, ownership, timeline (lifecycle)
 *      and RC3 financial data (public schema, fetched independently)
 *   4. Compose PortfolioSummary from per-property statements
 *   5. Return discriminated union based on viewMode
 *
 * Returns null when:
 *   - Slug does not match any entity in lifecycle.entity_identity
 *   - Entity exists but has no active partner_entry rows
 *
 * @param investorSlug  URL slug (e.g. 'avi' for /partner/avi)
 * @param options       View mode, language, date range
 */
export async function loadPartnerStatement(
  investorSlug: string,
  options: PartnerStatementOptions = {},
): Promise<PartnerStatementDTO | null> {
  const { viewMode = 'partner', lang = 'en', fromDate, toDate } = options
  const db = createServiceClient()

  // ── Step 1: resolve entity from slug (case-insensitive) ──────────────────
  // Load all investor-type entities and match by slug — avoids case-sensitivity
  // issues with .eq('canonical_name', ...) across different DB collations.
  //
  // entity_type filter: 'partner' (Yossi, Jacob) and 'investor' (Avi, Oren).
  // 'jj_company' (JJ itself) and 'external' (Anastasia, Fabi) are excluded —
  // they are never the subject of a partner-facing statement.
  //
  // Schema note: lifecycle.entity_identity has NO owner_type column.
  // Use entity_type (text, NOT NULL) as the classification field.
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
  // ownerType populated from entity_type — owner_type column does not exist.
  // 'partner' for JJ principals (Yossi, Jacob); 'investor' for external investors (Avi, Oren).
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
    const { data: capitalRows } = await db
      .schema('lifecycle')
      .from('capital_event')
      .select(
        'id, amount_eur, effective_date, effective_date_confidence, description, payer_name, payee_name, direction',
      )
      .eq('entity_id', entityId)
      .eq('property_name', propertyName)
      .neq('status', 'void')
      .eq('direction', 'in')
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
      capitalPaidEur,      // P-ARCH-1: null = unknown, not 0
      capitalRemainingEur, // P-ARCH-1: null = unknown, not 0
      capitalStatus: resolveCapitalStatus(capitalPaidEur, capitalRemainingEur, requiredCapitalEur, payments.length > 0),
      payments,
    }

    // ── 4b: Ownership + co-owners ────────────────────────────────────────────
    // Query all active ownership periods for this property (not just this entity)
    // to find co-owners. 'Active' = no effective_to (open-ended period).
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

    // Co-owners: all other entities with active ownership in this property
    const otherOwners = allOwners.filter(r => r.entity_id !== entityId)
    const coOwners: CoOwner[] = []

    if (otherOwners.length > 0) {
      const { data: coOwnerEntities } = await db
        .schema('lifecycle')
        .from('entity_identity')
        .select('id, canonical_name, entity_type')
        .in('id', otherOwners.map(o => o.entity_id))

      // JJ group classification uses entity_type (owner_type column does not exist):
      //   'partner'    → Yossi, Jacob → isJj = true  → shown as "JJ Group"
      //   'jj_company' → JJ           → isJj = true  → shown as "JJ Group"
      //   'investor'   → Avi, Oren    → isJj = false → shown by canonical name
      //   'external'   → Anastasia    → isJj = false → shown by canonical name
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
    // RC3 uses `reporting_name`, which in the current schema equals property_name.
    // If no RC3 rows exist for this name, financial is null.
    // Lifecycle and RC3 data are fetched independently (P-ARCH-5).
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
      // Logged upstream; not a fatal error for the DTO.
    }

    // ── 4d: Settlement (M9-C scope) ──────────────────────────────────────────
    // TODO M9-C: Replace currentBalanceEur with Settlement Engine value.
    const settlement: SettlementStatement = {
      currentBalanceEur: null, // null = Settlement Engine not yet run (P-ARCH-1)
      totalDistributionsPaidEur: s
        ? (s.total_distributions_eur as number) ?? 0
        : 0,
    }

    // ── 4e: Timeline — reuse loadInvestmentTimeline from timelineService ─────
    // Admin mode includes internal events (acquisition payments, expenses).
    // Partner mode includes only partner-visible events.
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
        }
      : { events: [], openVerificationTasks: 0, hasPendingDates: false }

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
    entityId,    // internal only — never expose in URLs
    canonicalName,
    slug: investorSlug,
    ownerType,   // populated from entity_type (owner_type column does not exist)
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
    schemaVersion: 'PartnerStatementDTO/1.0' as const,
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

  // Partner view — verification block ABSENT (not empty, not present)
  return {
    meta: { ...baseMeta, viewMode: 'partner' },
    investor,
    properties: propertyStatements,
    portfolio,
    actions,
    localization,
    // `verification` intentionally absent — discriminated union enforces this (P-ARCH-6)
  } satisfies PartnerFacingStatementDTO
}
