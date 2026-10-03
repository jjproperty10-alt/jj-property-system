import { propertyTotalDirection } from '../../../pdf/ClientAccountPdf'
import { certifiedDirectionCopy } from '../../../pdf/CertifiedSettlementPdf'
import type { ClientAccountDocument } from '../types'
import type { CertifiedClientSettlementAvailable } from '../../../finance/certifiedClientSettlementTypes'

// Approved display rule (Yossi): positive = JJ owes the owner, negative = the owner owes JJ.
// Internal due_to_jj is the opposite sign, so a negative due_to_jj must read as a credit
// to the client. Amounts on these rows are printed unsigned; the label carries direction.

function doc(propertyDue: number[], ownerLevel: number[], opening: number): ClientAccountDocument {
  return {
    properties: propertyDue.map((amountDueToJj) => ({ amountDueToJj })),
    ownerLevelObligations: ownerLevel.length
      ? ownerLevel.map((amountDueToJj, i) => ({ id: `o${i}`, effectiveDate: '2026-08-24', amountDueToJj, label: 'x', dateLabel: 'x' }))
      : undefined,
    openingDueToJj: opening,
  } as unknown as ClientAccountDocument
}

describe('page-1 property total direction (ClientAccountPdf)', () => {
  test('Tamir shape: property total -13,968.75 with owner-level +10,000 is a credit to the client', () => {
    expect(propertyTotalDirection(doc([-13248.75, -720], [10000], -3968.75))).toBe('jj_owes_client')
  })
  test('negative total without owner-level is a credit, not settled', () => {
    expect(propertyTotalDirection(doc([-720], [], -720))).toBe('jj_owes_client')
  })
  test('positive total is payable to JJ (unchanged)', () => {
    expect(propertyTotalDirection(doc([100, 452.52], [], 552.52))).toBe('client_owes_jj')
  })
  test('zero total is settled (unchanged)', () => {
    expect(propertyTotalDirection(doc([10, -10], [], 0))).toBe('settled')
  })
})

describe('certified cover direction copy', () => {
  const dto = (closingDirection: 'jj_owes_client' | 'client_owes_jj' | 'settled') =>
    ({ closingDirection }) as unknown as CertifiedClientSettlementAvailable
  // DirectionLine renders: prefix + " JJ " + suffix.
  const line = (prefix: string, suffix?: string) => `${prefix} JJ ${suffix ?? ''}`.replace(/\s+/g, ' ').trim()

  test('JJ owes the client: hero says payable to the client by JJ (he)', () => {
    const c = certifiedDirectionCopy(dto('jj_owes_client'), 'he', 'תמיר')
    expect(line(c.heroPrefix, c.heroSuffix)).toBe('לתשלום לתמיר על ידי JJ')
    expect(line(c.directionPrefix, c.directionSuffix)).toBe('JJ חייב לתמיר')
    expect(c.totalLabel).toContain('על ידי JJ')
  })
  test('JJ owes the client: hero says payable to the client by JJ (en)', () => {
    const c = certifiedDirectionCopy(dto('jj_owes_client'), 'en', 'Tamir')
    expect(line(c.heroPrefix, c.heroSuffix)).toBe('Payable to Tamir by JJ')
    expect(line(c.directionPrefix, c.directionSuffix)).toBe('JJ owes Tamir')
  })
  test('client owes JJ copy is unchanged', () => {
    const c = certifiedDirectionCopy(dto('client_owes_jj'), 'he', 'אורית')
    expect(c.heroPrefix).toBe('לתשלום ל')
    expect(c.heroSuffix).toBe('על ידי אורית')
    expect(c.directionPrefix).toBe('אורית חייב ל')
  })
})
