/**
 * @module partner-settlement/partnerReportBService
 * @description READ-ONLY Stage 2 orchestrator. Wires the certified transaction ledger
 * through the partner-ledger engine to produce Layer-A partner current accounts, a
 * runtime classification summary, per-property partner positions, and the UNRESOLVED
 * queue — then gates the Yossi↔Jacob headline.
 *
 * The consolidated debtor/creditor headline stays BLOCKED whenever any hard gate
 * fails: unresolved items (unknown transfer purpose, loan/capital unproven, identity,
 * custodian, cap violation), pending ownership/profit, owner-balance unreconciled, or
 * asymmetric equalization. Stage 2 does not manufacture a certified consolidated EP
 * (profit authority + settlement purposes are absent), so it stays PENDING/PARTIAL.
 * No writes. Server-only.
 */

import 'server-only'
import { createServiceClient } from '@/lib/supabase'
import { readCashboxes } from './adapters/cashboxReader'
import { readReceivables } from './adapters/receivablesReader'
import { readOwnership } from './adapters/ownershipReader'
import { readPartnerScopeProperties, readPropertyScopeSets } from './adapters/propertyReader'
import { readPropertyAccounts } from './adapters/accountReaders'
import { readPartnerLedger } from './adapters/transactionsReader'
import { readExternalOwnerPropertyNames } from './adapters/ownerScopeReader'
import { buildPartnerLedger } from './partnerLedgerEngine'
import { resolvePartnerSplit, type ConfirmedShare } from './ownershipRules'
import { buildConflictSet, isOwnableRelationshipType, type PropertyScopeSets } from './scope'
import { evaluateHeadlineGate } from './headlineGate'
import type {
  PartnerReportB, PropertyView, UnresolvedItem, CashboxView, JjPosition,
  EqualizationView, OwnershipShare, PartnerPropertyPosition, ExplainNode,
} from './partnerReportBTypes'

export interface BuildOptions {
  readonly periodStart: string
  readonly periodEnd: string
  readonly generatedAt: string // pass in (no Date.now in pure paths); route supplies it
  readonly maxProperties?: number
}

export async function buildPartnerReportB(opts: BuildOptions): Promise<PartnerReportB> {
  const { periodStart, periodEnd, generatedAt } = opts

  const [cashboxes, receivables, ownershipByProp, properties, ledgerRead, scopeSets, externalOwnerNames] = await Promise.all([
    readCashboxes(),
    readReceivables(),
    readOwnership(),
    readPartnerScopeProperties(),
    readPartnerLedger(periodStart, periodEnd),
    readPropertyScopeSets(),
    readExternalOwnerPropertyNames(),
  ])

  const unresolved: UnresolvedItem[] = []

  // Fail-closed source blockers (QA #185-1/2): a ledger/exclusions/identity source
  // failure blocks certification and is surfaced traceably — never a silent zero.
  for (const f of ledgerRead.sourceFailures) {
    unresolved.push({
      kind: f.kind,
      ref: f.kind === 'IDENTITY_SOURCE_UNAVAILABLE' ? 'registry.parties'
        : f.kind === 'EXCLUSIONS_SOURCE_UNAVAILABLE' ? 'transaction_exclusions' : 'public.transactions',
      reason: f.reason,
      sourceRef: { system: 'partner-settlement/transactionsReader' },
    })
  }

  // Property scope (QA #185-3). If the scope source is unavailable, fail closed with
  // EMPTY sets so no client/unknown property transaction can be silently included.
  const baseScope = scopeSets ?? { partner: new Set<string>(), client: new Set<string>(), conflictEligibleGroups: [] }
  if (scopeSets == null) {
    unresolved.push({
      kind: 'PROPERTY_SCOPE_UNRESOLVED',
      ref: 'property_definitions',
      reason: 'property scope source unavailable — scope cannot be enforced; failing closed',
      sourceRef: { system: 'property_definitions' },
    })
  }

  // ── Stage 2.2 defensive scope guard ──────────────────────────────────────────────
  // A partner-tagged property with an external owner in contact_properties is a CLIENT
  // (definition conflict). Exclude it from every partner total and surface it — never
  // silently included, even if property_definitions mislabels it (e.g. Yogev Port).
  // Conflict guard is relationship-aware: only jj / jj_company (conflictEligible) with an
  // external owner is a conflict. Partnership co-owners (Avi/Oren) are legitimate — a
  // partnership with an external owner stays IN_SCOPE (Villa Mazotos / Villa Mazotos 2).
  const { conflict, ownerSourceUnavailable } = buildConflictSet(
    baseScope.conflictEligibleGroups ?? [], externalOwnerNames,
  )
  if (ownerSourceUnavailable) {
    // FAIL-CLOSED: cannot verify ownership → ALL jj / jj_company (conflict-eligible)
    // properties are excluded from every total (their transactions never enter current
    // accounts / positions / subtotals), and the headline stays blocked. Partnership
    // properties are unaffected (never conflict-eligible).
    unresolved.push({
      kind: 'OWNER_SOURCE_UNAVAILABLE',
      ref: 'contact_properties',
      reason: 'external-owner source unavailable — cannot verify property scope against ownership; failing closed by excluding ALL jj/jj_company properties from partner totals until the source is restored',
      sourceRef: { system: 'contact_properties' },
    })
  } else {
    // Genuine per-property conflicts (owner source available): surface each explicitly.
    conflict.forEach(name => {
      unresolved.push({
        kind: 'SCOPE_DEFINITION_CONFLICT',
        ref: name,
        reason: `"${name}" is tagged partner-scope in property_definitions but has an external owner in contact_properties → treated as a client and EXCLUDED from the Partner Report`,
        sourceRef: { system: 'property_definitions vs contact_properties', ref: name },
      })
    })
  }
  const effectiveScope: PropertyScopeSets = { partner: baseScope.partner, client: baseScope.client, conflict }

  // ── Runtime partner-ledger engine (Layer A + classification + per-property) ──────
  // Ownership split resolver (whole-property) from confirmed canonical shares +
  // authorized facts. Capital allocation uses it; never assumes 50/50.
  const splitFor = (propertyName: string | null) => {
    const shares: ConfirmedShare[] = propertyName
      ? (ownershipByProp.get(propertyName)?.shares ?? []).map((s: OwnershipShare) => ({
          party: s.party, pct: s.pct, confidence: s.confidence,
        }))
      : []
    return resolvePartnerSplit(propertyName ?? '', shares)
  }
  const engine = buildPartnerLedger(ledgerRead.txns, { splitFor, propertyScope: effectiveScope })

  const propertyViews: PropertyView[] = []

  const propList = opts.maxProperties ? properties.slice(0, opts.maxProperties) : properties
  for (const p of propList) {
    // Stage 2.2: definition-conflict properties (external owner) are excluded entirely —
    // already surfaced as SCOPE_DEFINITION_CONFLICT above.
    if (conflict.has(p.reportingName.trim().toLowerCase())) continue

    const isOwnable = isOwnableRelationshipType(p.relationshipType)
    const propUnresolved: UnresolvedItem[] = []
    const partnerPositions: PartnerPropertyPosition[] =
      engine.partnerPositionsByProperty.get(p.reportingName) ?? []

    if (isOwnable) {
      // Genuine partner/JJ property: demand ownership + owner-facing RC3 accounts.
      const accounts = await readPropertyAccounts(p.reportingName, periodStart, periodEnd)
      const own = ownershipByProp.get(p.reportingName)
      const shares: readonly OwnershipShare[] = own?.shares ?? []
      if (!own || own.pending || shares.length === 0) {
        propUnresolved.push({
          kind: 'OWNERSHIP_PENDING',
          ref: p.reportingName,
          reason: shares.length === 0
            ? 'no confirmed ownership_period rows'
            : 'ownership pending_verification / missing effective dates',
          sourceRef: { system: 'lifecycle.ownership_period', ref: p.reportingName },
        })
      }
      for (const a of accounts) propUnresolved.push(...a.unresolved)

      propertyViews.push({
        propertyName: p.reportingName,
        relationshipType: p.relationshipType,
        ownership: shares,
        accounts,
        partnerPositions,
        unresolved: propUnresolved,
        status: 'PENDING',
      })
    } else {
      // Stage 2.2: jj_company internal account / cost-centre — NOT ownable. No ownership
      // demand and no owner-facing RC3 accounts, so no artificial OWNERSHIP_PENDING /
      // ACCOUNT_PROFIT_PENDING noise. Its transactions still feed the current accounts
      // (partner-funded JJ expenses); it is shown under "Internal accounts / cost centres".
      propertyViews.push({
        propertyName: p.reportingName,
        relationshipType: p.relationshipType,
        ownership: [],
        accounts: [],
        partnerPositions,
        unresolved: [],
        status: 'PENDING',
      })
    }
    unresolved.push(...propUnresolved)
  }

  // Engine-surfaced unresolved (transfer purpose, loan/capital, identity, custodian, cap)
  unresolved.push(...engine.unresolved)

  // Receivables scope caveat (12c)
  unresolved.push({
    kind: 'MONEY_POSITION_SCOPE_PARTIAL',
    ref: 'v_money_position',
    reason: `receivables/payables authoritative only for covered scope: [${receivables.coveredCounterpartyTypes.join(', ') || 'n/a'}]; partner accounts / suppliers / forward commitments not fully covered`,
    sourceRef: { system: 'v_money_position' },
  })
  unresolved.push({
    kind: 'FORWARD_COMMITMENT_SOURCE_MISSING',
    ref: 'forward-commitments',
    reason: 'no certified source for future rent payable / forward receivables',
  })
  if (cashboxes.some(c => c.verificationStatus === 'LEDGER_ONLY')) {
    unresolved.push({
      kind: 'CASH_UNVERIFIED',
      ref: 'cashboxes',
      reason: 'ledger positions not reconciled to bank/physical count',
      sourceRef: { system: 'v_cashbox_audit' },
    })
  }
  if (receivables.unknownRows > 0) {
    unresolved.push({
      kind: 'RECEIVABLE_AMOUNT_UNKNOWN',
      ref: 'v_money_position',
      reason: `${receivables.unknownRows} receivable/payable row(s) have unknown amount (null) — excluded from totals, not coerced to 0`,
      sourceRef: { system: 'v_money_position' },
    })
  }
  // Profit distribution authority not wired (v_jj_profit_distributions) — EP cannot be certified.
  unresolved.push({
    kind: 'PROFIT_DISTRIBUTION_UNCERTIFIED',
    ref: 'v_jj_profit_distributions',
    reason: 'certified partner profit-distribution authority not wired; consolidated EP not certifiable (Stage 3)',
    sourceRef: { system: 'v_jj_profit_distributions' },
  })

  const jjPosition = await buildJjPosition(cashboxes, receivables)

  const partnerCurrentAccounts = engine.partnerAccounts

  // ── Equalization (Layer B) — gated ──────────────────────────────────────────────
  // Stage 2 does not certify a consolidated EP: profit distribution authority is
  // unwired and most inter-partner movements are unresolved. The certified inter-partner
  // nets (direct transfers + capital) are surfaced as informational components only; the
  // headline stays blocked (equalization not computed).
  const certifiedInterPartnerNet = engine.interPartnerTransferNetEur + engine.capitalEqualizationNetEur
  const gate = evaluateHeadlineGate({
    unresolvedItems: unresolved,
    ownershipPending: propertyViews.some(pv => pv.unresolved.some(u => u.kind === 'OWNERSHIP_PENDING')),
    accountProfitPending: unresolved.some(u => u.kind === 'ACCOUNT_PROFIT_PENDING'),
    ownerBalanceUnreconciled: true, // 3 differing owner-balance sources (11k blocker 3)
    cashUnverified: true,
    moneyPositionPartial: true,
    symmetryResidualEur: null, // consolidated EP not computed in Stage 2
  })

  const components: ExplainNode[] = [
    { label: 'Certified direct partner-transfer net (Jacob owes Yossi +)', amountEur: engine.interPartnerTransferNetEur, tracesTo: [{ system: 'public.transactions', note: 'certified-purpose direct transfers' }] },
    { label: 'Certified capital equalization net (Jacob owes Yossi +)', amountEur: engine.capitalEqualizationNetEur, tracesTo: [{ system: 'partner-settlement/ownershipRules' }] },
  ]

  const equalization: EqualizationView = {
    epYossi: null,
    epJacob: null,
    symmetryResidual: null,
    headline: {
      debtor: null,
      creditor: null,
      amountEur: null,
      certificationStatus: gate.certificationStatus,
      canAssertDebtorCreditor: gate.canAssertDebtorCreditor,
      blockingReasons: gate.blockingReasons,
    },
    certifiedSubtotalEur: certifiedInterPartnerNet,
    unresolvedCount: unresolved.length,
    unresolvedAmountEur: null,
    components,
  }

  return {
    meta: {
      schemaVersion: 'PartnerReportB/stage2',
      periodStart, periodEnd, generatedAt, currency: 'EUR', stage: 2,
    },
    properties: propertyViews,
    cashboxes,
    jjPosition,
    partnerCurrentAccounts,
    classificationSummary: engine.classificationSummary,
    equalization,
    opening: { value: null, status: 'PENDING_RECONCILIATION' },
    closing: { value: null, status: 'PENDING_RECONCILIATION' },
    unresolved,
    explain: [],
  }
}

async function buildJjPosition(
  cashboxes: readonly CashboxView[],
  receivables: { receivableToJjEur: number | null; payableByJjEur: number | null },
): Promise<JjPosition> {
  const db = createServiceClient()
  let economicProfit: number | null = null
  try {
    const { data } = await db.from('v_jj_company_pl').select('net_company_pl').maybeSingle()
    economicProfit = (data as { net_company_pl: number | null } | null)?.net_company_pl ?? null
  } catch {
    economicProfit = null
  }
  const jjBox = cashboxes.find(c => c.name.toLowerCase() === 'jj')
  return {
    economicProfit,
    economicProfitStatus: 'PENDING', // v_jj_company_pl not the authoritative partner-profit basis (unwired)
    actualCashLedger: jjBox?.ledgerCashPosition ?? null,
    cashVerificationStatus: jjBox?.verificationStatus ?? 'LEDGER_ONLY',
    receivables: receivables.receivableToJjEur,
    payables: receivables.payableByJjEur,
    receivablesScope: 'PARTIAL',
    sourceRefs: [
      { system: 'v_jj_company_pl' },
      { system: 'v_cashbox_audit', ref: 'JJ' },
      { system: 'v_money_position' },
    ],
  }
}
