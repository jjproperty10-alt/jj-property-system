/**
 * Unit tests for pure money aggregation (Jest / ts-jest, node). No DB.
 * Mirrors the certified live v_money_position V2 (clients + employee custodian).
 */

import {
  summarizeDirection,
  normCounterpartyType,
  UNSUPPORTED_COUNTERPARTY_TYPES,
  type MoneyPositionLineDTO,
  type CounterpartyType,
} from '../moneyAggregate'

function line(
  id: string,
  type: CounterpartyType,
  open: number,
  confidence: string,
  direction: 'RECEIVABLE_TO_JJ' | 'PAYABLE_BY_JJ' = 'RECEIVABLE_TO_JJ',
): MoneyPositionLineDTO {
  return {
    moneyPositionId: id,
    direction,
    counterpartyCanonicalId: id,
    counterpartyName: id,
    counterpartyType: type,
    canonicalOwnerId: null,
    canonicalPropertyId: null,
    amountEur: String(open),
    originalAmountEur: null,
    settledAmountEur: null,
    openAmountEur: String(open),
    category: 'x',
    subcategory: null,
    businessReason: null,
    obligationDate: null,
    dueDate: null,
    agingDays: null,
    confidenceStatus: confidence,
    settlementStatus: 'OPEN',
    sourceSystem: 's',
    sourceReference: id,
    drillDownReference: null,
    asOfDate: null,
  }
}

describe('summarizeDirection — receivable (certified live shape)', () => {
  const receivable = [
    line('Uriel', 'CLIENT', 57015.89, 'OBSERVED'),
    line('Oshrit', 'CLIENT', 11400, 'OBSERVED'),
    line('Liora', 'CLIENT', 3577.45, 'OBSERVED'),
    line('IlanIlana', 'CLIENT', 1981.54, 'OBSERVED'),
    line('OritRob', 'CLIENT', 183.35, 'OBSERVED'),
    line('Anastasia', 'CASH_CUSTODIAN', 10074.88, 'CERTIFIED'),
  ]
  const s = summarizeDirection(receivable)

  it('headline total = clients + employee custodian', () => {
    expect(s.total).toBe('84233.11')
    expect(s.count).toBe(6)
    expect(s.counterparties).toBe(6)
  })

  it('byCounterpartyType groups CLIENT and EMPLOYEE (no fabricated empties)', () => {
    const byType = Object.fromEntries(s.byCounterpartyType.map(b => [b.counterpartyType, b.total]))
    expect(byType['CLIENT']).toBe('74158.23')
    expect(byType['CASH_CUSTODIAN']).toBe('10074.88') // custodial cash, NOT employee reimbursement
    expect(s.byCounterpartyType.length).toBe(2) // only real types present
  })

  it('partial-certified is zero here (all OBSERVED/CERTIFIED)', () => {
    expect(s.partialCertified.count).toBe(0)
    expect(s.partialCertified.amountEur).toBe('0.00')
  })
})

describe('summarizeDirection — payable exposes PARTIAL_CERTIFIED', () => {
  const payable = [
    line('LironAlon', 'CLIENT', 8005.25, 'OBSERVED', 'PAYABLE_BY_JJ'),
    line('Oren', 'CLIENT', 7421.92, 'OBSERVED', 'PAYABLE_BY_JJ'),
    line('Tamir', 'CLIENT', 7397.36, 'PARTIAL_CERTIFIED', 'PAYABLE_BY_JJ'),
    line('Roni', 'CLIENT', 5813.41, 'OBSERVED', 'PAYABLE_BY_JJ'),
    line('Sharon', 'CLIENT', 5314.85, 'OBSERVED', 'PAYABLE_BY_JJ'),
    line('Vard', 'CLIENT', 500, 'OBSERVED', 'PAYABLE_BY_JJ'),
  ]
  const s = summarizeDirection(payable)

  it('headline total matches certified payable', () => {
    expect(s.total).toBe('34452.79')
  })

  it('partial-certified is surfaced, not hidden behind the headline', () => {
    expect(s.partialCertified.count).toBe(1)
    expect(s.partialCertified.amountEur).toBe('7397.36')
  })
})

describe('no double-count / distinct counterparties', () => {
  it('same counterparty appearing twice counts once in counterparties', () => {
    const s = summarizeDirection([
      line('Uriel', 'CLIENT', 100, 'OBSERVED'),
      line('Uriel', 'CLIENT', 50, 'OBSERVED'),
    ])
    expect(s.count).toBe(2)
    expect(s.counterparties).toBe(1)
    expect(s.total).toBe('150.00')
  })
})

describe('normCounterpartyType', () => {
  it('normalizes known types and defaults unknown to OTHER', () => {
    expect(normCounterpartyType('client')).toBe('CLIENT')
    expect(normCounterpartyType('EMPLOYEE')).toBe('EMPLOYEE')
    expect(normCounterpartyType('weird')).toBe('OTHER')
    expect(normCounterpartyType(null)).toBe('OTHER')
  })
})

describe('unsupported counterparty types are documented, not invented', () => {
  it('partner/supplier/tenant carry explicit reasons', () => {
    const types = UNSUPPORTED_COUNTERPARTY_TYPES.map(u => u.counterpartyType)
    expect(types).toEqual(expect.arrayContaining(['PARTNER', 'SUPPLIER', 'TENANT']))
    for (const u of UNSUPPORTED_COUNTERPARTY_TYPES) {
      expect(u.reason.length).toBeGreaterThan(20)
    }
  })
})
