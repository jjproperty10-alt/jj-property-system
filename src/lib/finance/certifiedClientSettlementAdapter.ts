/**
 * Server-only adapter for public.read_certified_client_settlement.
 * Service-role path only. Never imported by Client Components.
 * Fail-closed: missing/ambiguous identity or reader failure → unavailable, never a fake €0.
 * Does not read finance tables or call a finance-schema RPC.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import { isValidUUID } from '@/lib/owners/validation'
import { resolveProperty } from '@/lib/identity'
import { CLIENT_SETTLEMENT_CERTIFICATION_RPC } from './clientSettlementCertificationTypes'
import {
  certifiedCents,
  closingDirectionFromDueToJj,
  composeCertifiedClosingDueToJj,
  roundCertifiedEur,
} from './certifiedClientSettlementPresentation'
import type {
  CertifiedClientSettlementAvailable,
  CertifiedClientSettlementDto,
  CertifiedClientSettlementUnavailable,
  CertifiedExclusionLine,
  CertifiedFifoCreditLine,
  CertifiedPropertyObligationLine,
  CertifiedUnavailableReason,
} from './certifiedClientSettlementTypes'

const AS_OF_RE = /^\d{4}-\d{2}-\d{2}$/

function unavailable(
  reason: CertifiedUnavailableReason,
  entityId: string | null,
  asOf: string | null,
): CertifiedClientSettlementUnavailable {
  return { unavailable: true, reason, entityId, asOf }
}

function asIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  const day = value.slice(0, 10)
  return AS_OF_RE.test(day) ? day : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return roundCertifiedEur(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return roundCertifiedEur(n)
  }
  return null
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function record(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function parseLines(raw: unknown): CertifiedPropertyObligationLine[] | null {
  if (!Array.isArray(raw)) return null
  const lines: CertifiedPropertyObligationLine[] = []
  for (const item of raw) {
    const row = record(item)
    if (!row) return null
    const lineOrder = asNumber(row.line_order)
    const propertyKey = asText(row.property_key)
    const propertyName = asText(row.property_name)
    const componentCode = asText(row.component_code)
    const amountDueToJj = asNumber(row.amount_due_to_jj)
    const reason = asText(row.reason)
    const evidenceRef = asText(row.evidence_ref)
    if (
      lineOrder == null ||
      !Number.isInteger(lineOrder) ||
      lineOrder < 1 ||
      !propertyKey ||
      !propertyName ||
      !componentCode ||
      amountDueToJj == null ||
      certifiedCents(amountDueToJj) == null ||
      !reason ||
      !evidenceRef
    ) {
      return null
    }
    lines.push({
      lineOrder,
      propertyKey,
      propertyName,
      componentCode,
      amountDueToJj,
      reason,
      evidenceRef,
    })
  }
  lines.sort((a, b) => a.lineOrder - b.lineOrder)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].lineOrder !== i + 1) return null
  }
  return lines
}

function parseFifoCredits(raw: unknown): CertifiedFifoCreditLine[] | null {
  if (!Array.isArray(raw)) return null
  const credits: CertifiedFifoCreditLine[] = []
  for (const item of raw) {
    const row = record(item)
    if (!row) return null
    const eventType = asText(row.event_type)
    if (
      eventType !== 'noncash_settlement_credit' &&
      eventType !== 'include_transaction_in_settlement'
    ) {
      return null
    }
    const eventId = asText(row.event_id)
    const settlementAmount = asNumber(row.settlement_amount)
    const effectiveDate = asIsoDate(row.effective_date)
    if (
      !eventId ||
      !isValidUUID(eventId) ||
      settlementAmount == null ||
      certifiedCents(settlementAmount) == null ||
      !effectiveDate
    ) {
      return null
    }
    const sourceRaw = row.source_transaction_id
    const sourceTransactionId =
      sourceRaw == null || sourceRaw === ''
        ? null
        : asText(sourceRaw)
    if (sourceTransactionId != null && !isValidUUID(sourceTransactionId)) return null
    credits.push({
      eventId,
      eventType,
      settlementAmount,
      effectiveDate,
      sourceTransactionId,
      cash: eventType === 'include_transaction_in_settlement',
    })
  }
  return credits
}

function parseExclusions(raw: unknown): CertifiedExclusionLine[] | null {
  if (!Array.isArray(raw)) return null
  const exclusions: CertifiedExclusionLine[] = []
  for (const item of raw) {
    const row = record(item)
    if (!row) return null
    if (asText(row.event_type) !== 'exclude_transaction_from_settlement') return null
    const eventId = asText(row.event_id)
    const settlementAmount = asNumber(row.settlement_amount)
    const effectiveDate = asIsoDate(row.effective_date)
    const reason = asText(row.reason)
    const evidenceRef = asText(row.evidence_ref)
    if (
      !eventId ||
      !isValidUUID(eventId) ||
      settlementAmount == null ||
      certifiedCents(settlementAmount) == null ||
      !effectiveDate ||
      !reason ||
      !evidenceRef
    ) {
      return null
    }
    const sourceRaw = row.source_transaction_id
    const sourceTransactionId =
      sourceRaw == null || sourceRaw === ''
        ? null
        : asText(sourceRaw)
    if (sourceTransactionId != null && !isValidUUID(sourceTransactionId)) return null
    exclusions.push({
      eventId,
      eventType: 'exclude_transaction_from_settlement',
      settlementAmount,
      effectiveDate,
      sourceTransactionId,
      reason,
      evidenceRef,
      arithmeticEffect: 0,
    })
  }
  return exclusions
}

/**
 * Parse the JSONB reader payload. Malformed → unavailable (never a fabricated zero).
 * Trust the reader's certified_closing_due_to_jj after verifying it equals opening − FIFO
 * and that exclusions have not been subtracted.
 */
export function parseCertifiedReaderPayload(
  raw: unknown,
  entityId: string,
  asOf: string,
): CertifiedClientSettlementDto {
  const payload = record(raw)
  if (!payload) return unavailable('malformed_payload', entityId, asOf)

  if (payload.unavailable === true) {
    const reason = asText(payload.reason)
    if (reason === 'settlement_layer_unavailable') {
      return unavailable('settlement_layer_unavailable', entityId, asOf)
    }
    return unavailable('no_applied_certification', entityId, asOf)
  }

  const header = record(payload.certification)
  const certificationId = asText(header?.id) ?? asText(payload.certification_id)
  const headerEntity = asText(header?.entity_id) ?? entityId
  const headerAsOf = asIsoDate(header?.as_of) ?? asOf
  const opening = asNumber(payload.certified_opening_due_to_jj)
  const fifoTotal = asNumber(payload.fifo_credits_total)
  const closing = asNumber(payload.certified_closing_due_to_jj)
  const lines = parseLines(payload.lines)
  const fifoCredits = parseFifoCredits(payload.fifo_credits)
  const exclusions = parseExclusions(payload.exclusions)

  if (
    payload.unavailable !== false ||
    !certificationId ||
    !isValidUUID(certificationId) ||
    !isValidUUID(headerEntity) ||
    headerEntity !== entityId ||
    headerAsOf !== asOf ||
    opening == null ||
    fifoTotal == null ||
    closing == null ||
    certifiedCents(opening) == null ||
    certifiedCents(fifoTotal) == null ||
    certifiedCents(closing) == null ||
    lines == null ||
    fifoCredits == null ||
    exclusions == null
  ) {
    return unavailable('malformed_payload', entityId, asOf)
  }

  const fifoSum = roundCertifiedEur(
    fifoCredits.reduce((sum, c) => sum + c.settlementAmount, 0),
  )
  if (certifiedCents(fifoSum) !== certifiedCents(fifoTotal)) {
    return unavailable('malformed_payload', entityId, asOf)
  }

  const expectedClosing = composeCertifiedClosingDueToJj(opening, fifoTotal)
  if (certifiedCents(expectedClosing) !== certifiedCents(closing)) {
    return unavailable('malformed_payload', entityId, asOf)
  }

  const exclusionEffect = exclusions.reduce((sum, e) => sum + e.arithmeticEffect, 0)
  if (exclusionEffect !== 0) {
    return unavailable('malformed_payload', entityId, asOf)
  }

  const available: CertifiedClientSettlementAvailable = {
    unavailable: false,
    certificationId,
    entityId,
    asOf,
    openingDueToJj: opening,
    propertyLines: lines,
    fifoCredits,
    exclusions,
    fifoCreditsTotal: fifoTotal,
    closingDueToJj: closing,
    closingDirection: closingDirectionFromDueToJj(closing),
  }
  return available
}

export function normalizeCertifiedAsOf(asOf: string | null | undefined): string | null {
  if (!asOf || !AS_OF_RE.test(asOf)) return null
  return asOf
}

export async function readCertifiedClientSettlement(
  entityId: string,
  asOf: string,
): Promise<CertifiedClientSettlementDto> {
  const day = normalizeCertifiedAsOf(asOf)
  if (!isValidUUID(entityId)) return unavailable('missing_entity', null, day)
  if (!day) return unavailable('missing_as_of', entityId, asOf ?? null)

  try {
    const sb = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any).rpc(CLIENT_SETTLEMENT_CERTIFICATION_RPC.read, {
      p_entity_id: entityId,
      p_as_of: day,
    })
    if (error) {
      console.error(
        '[certifiedClientSettlementAdapter] reader failed:',
        error instanceof Error ? error.message : String(error),
      )
      return unavailable('reader_failed', entityId, day)
    }
    return parseCertifiedReaderPayload(data, entityId, day)
  } catch (err) {
    console.error(
      '[certifiedClientSettlementAdapter] reader exception:',
      err instanceof Error ? err.message : String(err),
    )
    return unavailable('reader_failed', entityId, day)
  }
}

export type CertifiedEntityResolution =
  | { readonly status: 'resolved'; readonly entityId: string }
  | { readonly status: 'missing' }
  | { readonly status: 'ambiguous' }
  | { readonly status: 'unavailable' }

function uniqueIds(values: readonly unknown[]): string[] {
  const ids: string[] = []
  const seen: Record<string, true> = {}
  for (const value of values) {
    const id = asText(value)
    if (id && isValidUUID(id) && !seen[id]) {
      seen[id] = true
      ids.push(id)
    }
  }
  return ids
}

/**
 * Resolve the settlement entity from the existing owner/client identity graph.
 * Property name → canonical property_definitions → EPA (active) ∪ management_relationship (open).
 * Fail closed on missing or ambiguous entity identity.
 */
export async function resolveCertifiedSettlementEntityFromProperty(
  propertyName: string,
): Promise<CertifiedEntityResolution> {
  const input = propertyName.trim()
  if (!input) return { status: 'missing' }

  const property = await resolveProperty(input)
  if (property.status === 'source_unavailable') return { status: 'unavailable' }
  if (property.status === 'ambiguous') return { status: 'ambiguous' }
  if (property.status !== 'resolved') return { status: 'missing' }

  try {
    const sb = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const financeDb = sb as any
    const [epaResult, mrResult] = await Promise.all([
      financeDb
        .schema('lifecycle')
        .from('entity_property_associations')
        .select('entity_id')
        .eq('property_id', property.canonicalPropertyId)
        .eq('status', 'active'),
      financeDb
        .schema('lifecycle')
        .from('management_relationship')
        .select('entity_id')
        .eq('property_name', property.canonicalName)
        .is('valid_to', null),
    ])

    if (epaResult.error || mrResult.error) return { status: 'unavailable' }

    const ids = uniqueIds([
      ...((epaResult.data ?? []) as { entity_id: string }[]).map((r) => r.entity_id),
      ...((mrResult.data ?? []) as { entity_id: string }[]).map((r) => r.entity_id),
    ])
    if (ids.length === 0) return { status: 'missing' }
    if (ids.length > 1) return { status: 'ambiguous' }
    return { status: 'resolved', entityId: ids[0] }
  } catch {
    return { status: 'unavailable' }
  }
}

export async function loadCertifiedSettlementForEntity(
  entityId: string | null | undefined,
  asOf: string | null | undefined,
): Promise<CertifiedClientSettlementDto> {
  const day = normalizeCertifiedAsOf(asOf)
  if (!entityId || !isValidUUID(entityId)) return unavailable('missing_entity', entityId ?? null, day)
  if (!day) return unavailable('missing_as_of', entityId, asOf ?? null)
  return readCertifiedClientSettlement(entityId, day)
}

export async function loadCertifiedSettlementForProperty(
  propertyName: string,
  asOf: string | null | undefined,
): Promise<CertifiedClientSettlementDto> {
  const day = normalizeCertifiedAsOf(asOf)
  if (!day) return unavailable('missing_as_of', null, asOf ?? null)

  const resolved = await resolveCertifiedSettlementEntityFromProperty(propertyName)
  if (resolved.status === 'missing') return unavailable('missing_entity', null, day)
  if (resolved.status === 'ambiguous') return unavailable('ambiguous_entity', null, day)
  if (resolved.status === 'unavailable') return unavailable('reader_failed', null, day)
  return readCertifiedClientSettlement(resolved.entityId, day)
}
