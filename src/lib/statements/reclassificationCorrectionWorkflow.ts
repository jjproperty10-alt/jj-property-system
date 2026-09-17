/**
 * Atomic public reclassification workflow (C3/C4/C6).
 * Pure simulation + payload builder. The SQL RPC is the apply-time authority.
 */
import {
  PublicApplyCorrectionError,
  assertCallerAuthorized,
  assertNonEmpty,
  assertNoDelete,
  assertNoFrozenMoneyMutation,
  assertReclassNetZero,
  assertUuid,
  buildReclassRows,
  cashboxSignedDelta,
  jjPnlSignedDelta,
  originalUnchanged,
  replayResult,
  type CorrectionRowPayload,
  type LineageRow,
  type SourceTransaction,
  type WrapperApplyResult,
} from './publicApplyCorrectionCase'

export const RECLASS_WHITELIST = ['property_id', 'subcategory', 'description'] as const
export type ReclassField = (typeof RECLASS_WHITELIST)[number]
export type ReclassFields = Partial<Record<ReclassField, string>>

export const WORKFLOW_RPC = 'apply_reclassification_correction'
export const WORKFLOW_RPC_ARGS = [
  'p_source_id',
  'p_correction_type',
  'p_corrected_fields',
  'p_reason',
  'p_natural_key',
] as const

export function canonicalizeReclassFields(fields: ReclassFields): ReclassFields {
  const out: ReclassFields = {}
  for (const key of RECLASS_WHITELIST) {
    if (fields[key] !== undefined) {
      const v = String(fields[key]).trim()
      if (!v) throw new PublicApplyCorrectionError(`${key} must be non-empty when provided`)
      out[key] = key === 'property_id' ? assertUuid(v, 'property_id') : v
    }
  }
  if (Object.keys(out).length === 0) {
    throw new PublicApplyCorrectionError('corrected_fields must include property_id, subcategory, and/or description')
  }
  for (const key of Object.keys(fields)) {
    if (!(RECLASS_WHITELIST as readonly string[]).includes(key)) {
      throw new PublicApplyCorrectionError(`corrected field "${key}" is not allowed`)
    }
  }
  return out
}

export function workflowNaturalKey(sourceId: string, fields: ReclassFields): string {
  const id = assertUuid(sourceId, 'source_id')
  const c = canonicalizeReclassFields(fields)
  return [
    id,
    'reclassification',
    c.property_id ?? '',
    c.subcategory ?? '',
    c.description ?? '',
  ].join('|')
}

export interface WorkflowRequest {
  readonly sourceId: string
  readonly correctionType: string
  readonly correctedFields: ReclassFields
  readonly reason: string
  readonly naturalKey: string
}

export function buildWorkflowRequest(
  original: SourceTransaction,
  correctedFields: ReclassFields,
  reason: string,
): { request: WorkflowRequest; rows: CorrectionRowPayload[] } {
  const fields = canonicalizeReclassFields(correctedFields)
  const request: WorkflowRequest = {
    sourceId: assertUuid(original.id, 'source_id'),
    correctionType: 'reclassification',
    correctedFields: fields,
    reason: assertNonEmpty(reason, 'reason'),
    naturalKey: workflowNaturalKey(original.id, fields),
  }
  const rows = buildReclassRows(original, fields)
  assertNoDelete(rows)
  assertNoFrozenMoneyMutation(original, rows, 'reclassification')
  assertReclassNetZero(rows)
  return { request, rows }
}

export type WorkflowStage = 'authorize' | 'validate' | 'create' | 'approve' | 'apply'

export interface WorkflowStore {
  cases: Array<{
    id: string
    sourceId: string
    status: 'open' | 'under_review' | 'approved' | 'applied' | 'rejected' | 'void'
    correctedFields: ReclassFields
    openedBy: string | null
    resolvedBy: string | null
    events: string[]
  }>
  transactions: string[]
}

export function emptyWorkflowStore(): WorkflowStore {
  return { cases: [], transactions: [] }
}

export function evaluateReclassificationWorkflow(input: {
  readonly caller: { hasSession: boolean; staffRole: string | null; isActive: boolean }
  readonly actorId: string
  readonly original: SourceTransaction
  readonly request: WorkflowRequest
  readonly store: WorkflowStore
  readonly failAt?: WorkflowStage
  readonly existingLineage?: readonly LineageRow[]
}): WrapperApplyResult & { store: WorkflowStore; created_case: boolean; actor: string } {
  const store: WorkflowStore = {
    cases: input.store.cases.map(c => ({ ...c, events: [...c.events] })),
    transactions: [...input.store.transactions],
  }
  const fail = (stage: WorkflowStage) => {
    if (input.failAt === stage) {
      throw new PublicApplyCorrectionError(`atomic rollback at ${stage}`)
    }
  }

  fail('authorize')
  assertCallerAuthorized(input.caller)
  const actor = assertUuid(input.actorId, 'actor')

  fail('validate')
  if (input.request.correctionType !== 'reclassification') {
    throw new PublicApplyCorrectionError('correction_type must be reclassification')
  }
  const built = buildWorkflowRequest(input.original, input.request.correctedFields, input.request.reason)
  if (input.request.naturalKey !== built.request.naturalKey) {
    throw new PublicApplyCorrectionError('natural key mismatch')
  }
  if (input.request.sourceId !== input.original.id) {
    throw new PublicApplyCorrectionError('source transaction does not exist')
  }

  const match = store.cases.find(c =>
    c.sourceId === input.original.id
    && JSON.stringify(c.correctedFields) === JSON.stringify(built.request.correctedFields)
    && c.status !== 'rejected'
    && c.status !== 'void',
  )

  if (match?.status === 'applied') {
    const lineage = input.existingLineage ?? []
    return { ...replayResult(match.id, lineage), store, created_case: false, actor }
  }

  let caseId = match?.id
  let created = false
  fail('create')
  if (!match) {
    caseId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    store.cases.push({
      id: caseId,
      sourceId: input.original.id,
      status: 'open',
      correctedFields: built.request.correctedFields,
      openedBy: actor,
      resolvedBy: null,
      events: ['opened'],
    })
    created = true
  }
  const current = store.cases.find(c => c.id === caseId)!

  fail('approve')
  if (current.status === 'open' || current.status === 'under_review') {
    current.status = 'approved'
    current.resolvedBy = actor
    current.events.push('approved')
  }
  if (current.status !== 'approved') {
    throw new PublicApplyCorrectionError(`denied: case status ${current.status}`)
  }

  fail('apply')
  current.status = 'applied'
  current.events.push('applied')
  const reversalId = '11111111-1111-4111-8111-111111111111'
  const rebookId = '22222222-2222-4222-8222-222222222222'
  store.transactions.push(reversalId, rebookId)

  return {
    correction_case_id: current.id,
    reversal_id: reversalId,
    rebook_id: rebookId,
    replay: false,
    idempotent: false,
    inserted_count: 2,
    applied_transaction_ids: [reversalId, rebookId],
    store,
    created_case: created,
    actor,
  }
}
