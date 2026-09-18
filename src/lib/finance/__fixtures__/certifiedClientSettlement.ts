/**
 * Test-only certified settlement fixtures.
 * Application code must not import production client IDs or amounts from here.
 */

import type { CertifiedClientSettlementAvailable } from '../certifiedClientSettlementTypes'

const ENTITY = '11111111-1111-4111-8111-111111111111'
const CERT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const AS_OF = '2026-08-31'

function line(
  order: number,
  amount: number,
  name: string,
): CertifiedClientSettlementAvailable['propertyLines'][number] {
  return {
    lineOrder: order,
    propertyKey: `00000000-0000-4000-8000-${String(order).padStart(12, '0')}`,
    propertyName: name,
    componentCode: 'opening_property_obligation',
    amountDueToJj: amount,
    reason: `fixture line ${order}`,
    evidenceRef: `ev-${order}`,
  }
}

/** Opening 119677.42 − FIFO 69000 = closing 50677.42. Exclusion 13900 has arithmetic 0. */
export const URIEL_SHAPED_CERTIFIED: CertifiedClientSettlementAvailable = {
  unavailable: false,
  certificationId: CERT,
  entityId: ENTITY,
  asOf: AS_OF,
  openingDueToJj: 119677.42,
  propertyLines: [
    line(1, 20000, 'Property A'),
    line(2, 15000, 'Property B'),
    line(3, 4099, 'Property C'),
    line(4, 25000, 'Property D'),
    line(5, 18000, 'Property E'),
    line(6, 12000, 'Property F'),
    line(7, 20578.42, 'Property G'),
    line(8, 5000, 'Property H'),
  ],
  fifoCredits: [
    {
      eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
      eventType: 'noncash_settlement_credit',
      settlementAmount: 55000,
      effectiveDate: '2026-05-01',
      sourceTransactionId: null,
      cash: false,
    },
    {
      eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      eventType: 'include_transaction_in_settlement',
      settlementAmount: 14000,
      effectiveDate: '2026-08-05',
      sourceTransactionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      cash: true,
    },
  ],
  exclusions: [
    {
      eventId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      eventType: 'exclude_transaction_from_settlement',
      settlementAmount: 13900,
      effectiveDate: '2026-08-12',
      sourceTransactionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      reason: 'double representation',
      evidenceRef: 'ev-ex',
      arithmeticEffect: 0,
    },
  ],
  fifoCreditsTotal: 69000,
  closingDueToJj: 50677.42,
  closingDirection: 'client_owes_jj',
}

export function readerPayloadFromDto(
  dto: CertifiedClientSettlementAvailable,
): Record<string, unknown> {
  return {
    unavailable: false,
    certification: {
      id: dto.certificationId,
      entity_id: dto.entityId,
      as_of: dto.asOf,
      total_due_to_jj: dto.openingDueToJj,
    },
    lines: dto.propertyLines.map((l) => ({
      line_order: l.lineOrder,
      property_key: l.propertyKey,
      property_name: l.propertyName,
      component_code: l.componentCode,
      amount_due_to_jj: l.amountDueToJj,
      reason: l.reason,
      evidence_ref: l.evidenceRef,
    })),
    fifo_credits: dto.fifoCredits.map((c) => ({
      event_id: c.eventId,
      event_type: c.eventType,
      settlement_amount: c.settlementAmount,
      effective_date: c.effectiveDate,
      source_transaction_id: c.sourceTransactionId,
    })),
    exclusions: dto.exclusions.map((e) => ({
      event_id: e.eventId,
      event_type: e.eventType,
      settlement_amount: e.settlementAmount,
      effective_date: e.effectiveDate,
      source_transaction_id: e.sourceTransactionId,
      reason: e.reason,
      evidence_ref: e.evidenceRef,
    })),
    certified_opening_due_to_jj: dto.openingDueToJj,
    fifo_credits_total: dto.fifoCreditsTotal,
    certified_closing_due_to_jj: dto.closingDueToJj,
  }
}
