/**
 * Public apply_correction_case wrapper — pure guards used by tests and the
 * C3/C4/C6 dry-run. The SQL RPC is the authority at apply time; this module
 * does not write.
 */
export const FROZEN_MONEY_FIELDS = [
  'amount_eur',
  'client_charge',
  'payer',
  'payee',
  'date',
] as const

export const STAFF_GATE_ROLES = ['ceo', 'finance_admin'] as const

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class PublicApplyCorrectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PublicApplyCorrectionError'
    Object.setPrototypeOf(this, PublicApplyCorrectionError.prototype)
  }
}

export interface SourceTransaction {
  readonly id: string
  readonly date: string
  readonly property_id: string | null
  readonly property_name: string | null
  readonly category: string
  readonly subcategory: string | null
  readonly description: string | null
  readonly payer: string | null
  readonly payee: string | null
  readonly amount_eur: number
  readonly client_charge: number | null
}

export interface CorrectionRowPayload {
  readonly role: 'reversal' | 'replacement' | 'rebook' | 'append'
  readonly date: string
  readonly property_id: string | null
  readonly property_name: string | null
  readonly category: string
  readonly subcategory: string | null
  readonly description: string | null
  readonly payer: string | null
  readonly payee: string | null
  readonly amount_eur: number
  readonly client_charge: number | null
  readonly corrects_transaction_id?: string | null
  readonly id?: string
  readonly op?: string
  readonly delete?: unknown
}

export interface WrapperApplyResult {
  readonly correction_case_id: string
  readonly reversal_id: string | null
  readonly rebook_id: string | null
  readonly replay: boolean
  readonly idempotent: boolean
  readonly inserted_count: number
  readonly applied_transaction_ids: readonly string[]
}

export interface LineageRow {
  readonly sequence_no: number
  readonly entry_role: string
  readonly applied_transaction_id: string
  readonly amount_eur: number
  readonly payer: string | null
  readonly payee: string | null
  readonly date: string
}

export function assertUuid(id: unknown, label: string): string {
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    throw new PublicApplyCorrectionError(`${label} must be a UUID`)
  }
  return id
}

export function assertNonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PublicApplyCorrectionError(`${label} must be non-empty`)
  }
  return value.trim()
}

export function assertCallerAuthorized(input: {
  readonly hasSession: boolean
  readonly staffRole: string | null
  readonly isActive: boolean
}): void {
  if (!input.hasSession) {
    throw new PublicApplyCorrectionError('unauthorized: no session')
  }
  if (!input.isActive || !input.staffRole || !STAFF_GATE_ROLES.includes(input.staffRole as typeof STAFF_GATE_ROLES[number])) {
    throw new PublicApplyCorrectionError('unauthorized: require_jj_staff ceo/finance_admin')
  }
}

export function naturalKey(input: {
  readonly sourceId: string | null
  readonly correctionType: string
  readonly correctedFieldValues: unknown
}): string {
  const type = assertNonEmpty(input.correctionType, 'correction_type')
  const source = input.sourceId ? assertUuid(input.sourceId, 'source id') : ''
  const fields = input.correctedFieldValues == null ? '' : JSON.stringify(input.correctedFieldValues)
  const key = `${source}|${type}|${fields}`
  if (key === '||' || type === '') {
    throw new PublicApplyCorrectionError('natural key must be non-empty')
  }
  return key
}

export function assertNoDelete(rows: readonly CorrectionRowPayload[]): void {
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    if (row.delete !== undefined || row.op === 'delete' || row.op === 'update') {
      throw new PublicApplyCorrectionError(`row ${i + 1}: DELETE/UPDATE is not permitted`)
    }
  }
}

export function assertNoFrozenMoneyMutation(
  original: SourceTransaction,
  rows: readonly CorrectionRowPayload[],
  correctionType: string,
): void {
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    if (row.id === original.id) {
      throw new PublicApplyCorrectionError(`row ${i + 1}: must not target the original transaction id`)
    }
    if (row.role === 'append') continue
    if (row.corrects_transaction_id && row.corrects_transaction_id !== original.id) {
      throw new PublicApplyCorrectionError(`row ${i + 1}: source id mismatch`)
    }
    if (row.payer !== original.payer) {
      throw new PublicApplyCorrectionError(`row ${i + 1}: payer is frozen`)
    }
    if (row.payee !== original.payee) {
      throw new PublicApplyCorrectionError(`row ${i + 1}: payee is frozen`)
    }
    if (String(row.date).slice(0, 10) !== String(original.date).slice(0, 10)) {
      throw new PublicApplyCorrectionError(`row ${i + 1}: date is frozen`)
    }
    if (row.role === 'reversal' && row.amount_eur !== -original.amount_eur) {
      throw new PublicApplyCorrectionError(`row ${i + 1}: reversal must negate amount_eur`)
    }
    if (
      (row.role === 'rebook' || row.role === 'replacement')
      && ['reclassification', 'description_fix', 'date_correction'].includes(correctionType)
      && row.amount_eur !== original.amount_eur
    ) {
      throw new PublicApplyCorrectionError(`row ${i + 1}: rebook must preserve amount_eur`)
    }
  }
}

export function netCorrectingAmount(rows: readonly CorrectionRowPayload[]): number {
  const n = rows.reduce((s, r) => s + r.amount_eur, 0)
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function assertReclassNetZero(rows: readonly CorrectionRowPayload[]): void {
  if (netCorrectingAmount(rows) !== 0) {
    throw new PublicApplyCorrectionError('reclassification correcting rows must net to 0')
  }
}

const CASHBOXES = new Set(['yossi', 'jacob', 'yaacov', 'jj', 'anastasia'])

export function cashboxSignedDelta(rows: readonly CorrectionRowPayload[]): number {
  let delta = 0
  for (const row of rows) {
    const payee = (row.payee || '').toLowerCase()
    const payer = (row.payer || '').toLowerCase()
    if (CASHBOXES.has(payee) || payee === 'yaacov') delta += row.amount_eur
    if (CASHBOXES.has(payer) || payer === 'yaacov') delta -= row.amount_eur
  }
  return Math.round((delta + Number.EPSILON) * 100) / 100
}

export function jjPnlSignedDelta(rows: readonly CorrectionRowPayload[]): number {
  let delta = 0
  for (const row of rows) {
    if (row.category === 'JJ') delta += row.amount_eur
  }
  return Math.round((delta + Number.EPSILON) * 100) / 100
}

export function originalUnchanged<T extends object>(before: T, after: T): boolean {
  return JSON.stringify(before) === JSON.stringify(after)
}

/**
 * Server-side reclass identity: NFKC, strip separators (punct/dashes/euro),
 * collapse whitespace, lower. Mirrors public.reclass_canonical_text.
 */
export function reclassCanonicalText(value: string | null | undefined): string {
  if (value == null) return ''
  const nfkc = value.normalize('NFKC')
  const stripped = nfkc.replace(
    /[\u0001-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u00BF\u2010-\u2015\u20AC\u2212]+/g,
    ' ',
  )
  return stripped.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function reclassSemanticIdentity(input: {
  readonly sourceId: string
  readonly correctionType: string
  readonly correctedFields: {
    readonly property_id?: string | null
    readonly subcategory?: string | null
    readonly description?: string | null
  } | null
}): string {
  const source = assertUuid(input.sourceId, 'source id')
  const type = assertNonEmpty(input.correctionType, 'correction_type')
  const fields = input.correctedFields ?? {}
  let propertyId = ''
  if (fields.property_id != null && String(fields.property_id).trim() !== '') {
    propertyId = assertUuid(String(fields.property_id).trim(), 'property_id')
  }
  return [
    source,
    type,
    propertyId,
    reclassCanonicalText(fields.subcategory ?? ''),
    reclassCanonicalText(fields.description ?? ''),
  ].join('|')
}

export function isReplayMatch(
  rows: readonly CorrectionRowPayload[],
  lineage: readonly LineageRow[],
): boolean {
  if (rows.length === 0 || rows.length !== lineage.length) return false
  return rows.every((row, i) => {
    const line = lineage[i]
    return (
      line.sequence_no === i + 1
      && line.entry_role === row.role
      && Number(line.amount_eur) === row.amount_eur
      && line.payer === row.payer
      && line.payee === row.payee
      && String(line.date).slice(0, 10) === String(row.date).slice(0, 10)
    )
  })
}

export function replayResult(
  caseId: string,
  lineage: readonly LineageRow[],
): WrapperApplyResult {
  const reversal = lineage.find(l => l.entry_role === 'reversal')
  const rebook = lineage.find(l => l.entry_role === 'rebook' || l.entry_role === 'replacement')
  return {
    correction_case_id: caseId,
    reversal_id: reversal?.applied_transaction_id ?? null,
    rebook_id: rebook?.applied_transaction_id ?? null,
    replay: true,
    idempotent: true,
    inserted_count: 0,
    applied_transaction_ids: lineage.map(l => l.applied_transaction_id),
  }
}

export function evaluatePublicApply(input: {
  readonly caller: { hasSession: boolean; staffRole: string | null; isActive: boolean }
  readonly caseId: string
  readonly reason: string
  readonly correctionType: string
  readonly original: SourceTransaction | null
  readonly rows: readonly CorrectionRowPayload[]
  readonly caseStatus: 'open' | 'under_review' | 'approved' | 'applied' | 'rejected' | 'void'
  readonly existingAppliedNaturalKeyCaseId?: string | null
  readonly existingLineage?: readonly LineageRow[]
}): WrapperApplyResult {
  assertCallerAuthorized(input.caller)
  const caseId = assertUuid(input.caseId, 'p_case_id')
  assertNonEmpty(input.reason, 'reason')
  if (!input.rows.length) throw new PublicApplyCorrectionError('p_rows must be non-empty')
  assertNoDelete(input.rows)
  const sourceId = input.original ? assertUuid(input.original.id, 'source id') : null
  naturalKey({
    sourceId,
    correctionType: input.correctionType,
    correctedFieldValues: {},
  })
  if (!input.original && input.correctionType !== 'missing_charge') {
    throw new PublicApplyCorrectionError('source transaction does not exist')
  }
  if (input.original) {
    assertNoFrozenMoneyMutation(input.original, input.rows, input.correctionType)
  }
  if (['reclassification', 'description_fix', 'date_correction'].includes(input.correctionType)) {
    assertReclassNetZero(input.rows)
  }
  if (input.existingAppliedNaturalKeyCaseId && input.existingAppliedNaturalKeyCaseId !== caseId) {
    throw new PublicApplyCorrectionError('idempotent: natural key already applied')
  }
  if (input.caseStatus === 'applied') {
    const lineage = input.existingLineage ?? []
    if (!isReplayMatch(input.rows, lineage)) {
      throw new PublicApplyCorrectionError('idempotent: replay payload does not match lineage')
    }
    return replayResult(caseId, lineage)
  }
  if (input.caseStatus !== 'approved') {
    throw new PublicApplyCorrectionError(`denied: case status ${input.caseStatus}`)
  }
  const reversal = input.rows.find(r => r.role === 'reversal')
  const rebook = input.rows.find(r => r.role === 'rebook' || r.role === 'replacement')
  return {
    correction_case_id: caseId,
    reversal_id: reversal ? '11111111-1111-4111-8111-111111111111' : null,
    rebook_id: rebook ? '22222222-2222-4222-8222-222222222222' : null,
    replay: false,
    idempotent: false,
    inserted_count: input.rows.length,
    applied_transaction_ids: [
      ...(reversal ? ['11111111-1111-4111-8111-111111111111'] : []),
      ...(rebook ? ['22222222-2222-4222-8222-222222222222'] : []),
    ],
  }
}

export function buildReclassRows(
  original: SourceTransaction,
  corrected: Partial<Pick<CorrectionRowPayload, 'property_id' | 'property_name' | 'category' | 'subcategory' | 'description'>>,
): CorrectionRowPayload[] {
  const base = {
    date: String(original.date).slice(0, 10),
    property_id: original.property_id,
    property_name: original.property_name,
    category: original.category,
    subcategory: original.subcategory,
    description: original.description,
    payer: original.payer,
    payee: original.payee,
    corrects_transaction_id: original.id,
  }
  return [
    {
      ...base,
      role: 'reversal',
      amount_eur: -original.amount_eur,
      client_charge: original.client_charge == null ? null : -original.client_charge,
    },
    {
      ...base,
      ...corrected,
      role: 'rebook',
      amount_eur: original.amount_eur,
      client_charge: original.client_charge,
    },
  ]
}
