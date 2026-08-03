/**
 * @module statements/constitutionalTrace
 * @description VS1 — Builds the 7-stage constitutional trace from StatementBuilderOutput.
 *
 * Pure function. No DB access. No side effects.
 * Takes the already-computed StatementBuilderOutput and produces a
 * ConstitutionalTrace reflecting the honest state of each stage.
 *
 * RC-4: Every status is real. NOT_IMPLEMENTED means the code doesn't exist.
 * NOT_POPULATED means the infrastructure exists but has no data.
 * RECORDING_ONLY means data is captured but unstructured.
 * UNTYPED means the field exists but has no semantic type system.
 *
 * @see constitutionalTraceTypes.ts — type definitions
 * @see VS1_PHASE1_REVISED.md — approved plan, Section 7 (RC-4)
 */

import type { StatementBuilderOutput } from './types'
import type {
  ConstitutionalTrace,
  EvidenceTrace,
  BusinessEventTrace,
  ClassificationTrace,
  ComputationTrace,
  ProjectionTrace,
  InterpretationTrace,
  AuthorityTrace,
  TraceGap,
  TraceStageStatus,
} from './constitutionalTraceTypes'

/**
 * Build a constitutional trace from a completed StatementBuilderOutput.
 *
 * Pure function — no DB, no side effects, no async.
 * The trace reflects the real implementation state of each stage.
 *
 * @param output  The StatementBuilderOutput from buildStatementPreview()
 * @returns       ConstitutionalTrace with honest statuses and visible gaps
 */
export function buildConstitutionalTrace(
  output: StatementBuilderOutput,
): ConstitutionalTrace {
  const evidence = buildEvidenceTrace(output)
  const businessEvent = buildBusinessEventTrace()
  const classification = buildClassificationTrace(output)
  const computation = buildComputationTrace(output)
  const projection = buildProjectionTrace(output)
  const interpretation = buildInterpretationTrace()
  const authority = buildAuthorityTrace()

  const stages: Array<{ stage: string; status: TraceStageStatus }> = [
    { stage: 'evidence', status: evidence.status },
    { stage: 'business_event', status: businessEvent.status },
    { stage: 'classification', status: classification.status },
    { stage: 'computation', status: computation.status },
    { stage: 'projection', status: projection.status },
    { stage: 'interpretation', status: interpretation.status },
    { stage: 'authority', status: authority.status },
  ]

  const implementedCount = stages.filter(s => s.status === 'IMPLEMENTED').length

  const gaps: TraceGap[] = stages
    .filter(s => s.status !== 'IMPLEMENTED')
    .map(s => ({
      stage: s.stage,
      status: s.status,
      description: getGapDescription(s.stage, s.status),
    }))

  return {
    computedAt: new Date().toISOString(),
    evidence,
    businessEvent,
    classification,
    computation,
    projection,
    interpretation,
    authority,
    implementedCount,
    totalStages: 7,
    gaps,
  }
}

// ─── Stage Builders (pure) ─────────────────────────────────────────────────────

function buildEvidenceTrace(output: StatementBuilderOutput): EvidenceTrace {
  // Evidence links exist in finance.evidence_links (PR #70) but are
  // NOT populated for transactions. Zero rows have evidence links.
  const totalRows = output.disposition.sourceRows
  return {
    stage: 'evidence',
    status: 'NOT_POPULATED',
    linkedCount: 0,
    unlinkedCount: totalRows,
    explanation:
      'finance.evidence_links table exists (PR #70, Production Certified) but no ' +
      'transaction-level evidence links have been created. All source transactions ' +
      'are unlinked. Evidence infrastructure is ready; population is a future milestone.',
  }
}

function buildBusinessEventTrace(): BusinessEventTrace {
  // business_event_id does NOT exist on transactions.
  // Migration 014 has NOT been applied. events schema does NOT exist.
  // BEM v1.1 is APPROVED but not implemented.
  return {
    stage: 'business_event',
    status: 'UNTYPED',
    fieldExists: false,
    explanation:
      'business_event_id column does not exist on public.transactions. ' +
      'Migration 014 has not been applied. The events schema does not exist. ' +
      'BEM v1.1 is approved as foundational spec (31 July 2026) but has no ' +
      'code implementation. Transactions are individual rows without event grouping.',
  }
}

function buildClassificationTrace(output: StatementBuilderOutput): ClassificationTrace {
  const { disposition } = output
  return {
    stage: 'classification',
    status: 'IMPLEMENTED',
    classifierVersion: disposition.provenance.classifierVersion,
    rowsClassified: disposition.sourceRows,
    unresolvedCount: disposition.unresolved,
    reconciled: disposition.reconciled,
    explanation:
      `RC3 engine classifies all ${disposition.sourceRows} source transactions into ` +
      `disposition buckets. Classifier version: ${disposition.provenance.classifierVersion}. ` +
      `Reconciliation invariant: ${disposition.reconciled ? 'HOLDS' : 'BROKEN'}. ` +
      `${disposition.unresolved} unresolved row(s).`,
  }
}

function buildComputationTrace(output: StatementBuilderOutput): ComputationTrace {
  return {
    stage: 'computation',
    status: 'IMPLEMENTED',
    accountSectionCount: output.accountSections.length,
    balanceAffectingRows: output.disposition.balanceAffecting,
    openingBalanceStatus: output.openingBalance.status,
    settlementStatus: output.settlement.status,
    explanation:
      `Statement builder produced ${output.accountSections.length} account section(s) ` +
      `from ${output.disposition.balanceAffecting} balance-affecting rows. ` +
      `Opening balance: ${output.openingBalance.status}. ` +
      `Settlement: ${output.settlement.status}. ` +
      'FPE views exist in business_state schema (bs_cash_position, bs_owner_liabilities, bs_capital_state).',
  }
}

function buildProjectionTrace(output: StatementBuilderOutput): ProjectionTrace {
  return {
    stage: 'projection',
    status: 'IMPLEMENTED',
    built: true,
    canFinalize: false,
    blockerCount: output.finalizationBlockers.length,
    explanation:
      `Statement preview built successfully. ` +
      `canFinalize = false (${output.finalizationBlockers.length} blocker(s)). ` +
      'VS-1A scope: production finalization not authorized.',
  }
}

function buildInterpretationTrace(): InterpretationTrace {
  return {
    stage: 'interpretation',
    status: 'NOT_IMPLEMENTED',
    explanation:
      'No CFO interpretation layer exists. No narrative explanation, ' +
      'no contextual commentary, no AI-generated insights. ' +
      'The UI renders raw financial numbers without business interpretation. ' +
      'CFO Constitution is approved but CFO MVP is not yet built.',
  }
}

function buildAuthorityTrace(): AuthorityTrace {
  return {
    stage: 'authority',
    status: 'IMPLEMENTED',
    chain: [
      'public.transactions (source of truth)',
      'RC3 views (v_rc3_sale, v_rc3_renovation, v_rc3_rental, v_rc3_airbnb)',
      'Disposition Engine (classifyDisposition — pure, deterministic)',
      'Statement Builder (buildStatementPreview — read-only assembly)',
    ],
    explanation:
      'Authority chain is explicit and fully traceable. Every number flows from ' +
      'public.transactions through RC3 classification, disposition bucketing, ' +
      'and statement assembly. No CFO override, no AI interpretation, no manual adjustment. ' +
      'client_amount = COALESCE(client_charge, amount_eur) computed by RC3 views (P-LEDGER-6).',
  }
}

// ─── Gap Descriptions ──────────────────────────────────────────────────────────

function getGapDescription(stage: string, status: TraceStageStatus): string {
  switch (stage) {
    case 'evidence':
      return 'Evidence links infrastructure exists but no transaction evidence has been populated.'
    case 'business_event':
      return 'Business Event Model approved but not implemented. No event grouping exists.'
    case 'interpretation':
      return 'CFO interpretation layer not yet built. Numbers shown without business narrative.'
    default:
      return `Stage "${stage}" is ${status}.`
  }
}
