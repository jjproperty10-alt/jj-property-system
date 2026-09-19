import {
  allocateObligationFifo,
  applyPaymentToR,
  sFromR,
  type ObligationSlice,
} from '@/lib/finance/clientObligationFifoModel'

const P = 3260

describe('client obligation FIFO model', () => {
  it('JJ pays client €3,260 against R=5000', () => {
    expect(applyPaymentToR('JJ_TO_CLIENT', 5000, P)).toBe(1740)
    expect(sFromR(5000)).toBe(-5000)
    expect(sFromR(1740)).toBe(-1740)
  })

  it('client pays JJ €3,260 against R=-5000', () => {
    expect(applyPaymentToR('CLIENT_TO_JJ', -5000, P)).toBe(-1740)
    expect(sFromR(-5000)).toBe(5000)
    expect(sFromR(-1740)).toBe(1740)
  })

  it('allocates three properties oldest-first', () => {
    const slices: ObligationSlice[] = [
      { propertyId: 'A', sourceLineIdentity: 'la', remainingSignedAmount: 1000, effectiveDate: '2026-01-01', certificationVersion: 1 },
      { propertyId: 'B', sourceLineIdentity: 'lb', remainingSignedAmount: 2500, effectiveDate: '2026-01-02', certificationVersion: 1 },
      { propertyId: 'C', sourceLineIdentity: 'lc', remainingSignedAmount: 900, effectiveDate: '2026-01-03', certificationVersion: 1 },
    ]
    const fifo = allocateObligationFifo(slices, 'JJ_TO_CLIENT', P)
    expect(fifo.allocations.map((a) => a.propertyId)).toEqual(['A', 'B'])
    expect(fifo.allocations[0].amountApplied).toBe(1000)
    expect(fifo.allocations[1].amountApplied).toBe(2260)
    expect(fifo.allocations[1].remainingAfter).toBe(240)
    expect(fifo.unappliedRemainder).toBe(0)
    expect(fifo.allocatedTotal + fifo.unappliedRemainder).toBe(P)
  })

  it('blocks remainder when matching obligations are insufficient', () => {
    const slices: ObligationSlice[] = [
      { propertyId: 'A', sourceLineIdentity: 'la', remainingSignedAmount: 2000, effectiveDate: '2026-01-01', certificationVersion: 1 },
    ]
    const fifo = allocateObligationFifo(slices, 'JJ_TO_CLIENT', P)
    expect(fifo.allocatedTotal).toBe(2000)
    expect(fifo.unappliedRemainder).toBe(1260)
  })

  it('never consumes the opposite sign', () => {
    const slices: ObligationSlice[] = [
      { propertyId: 'A', sourceLineIdentity: 'la', remainingSignedAmount: -4000, effectiveDate: '2026-01-01', certificationVersion: 1 },
      { propertyId: 'B', sourceLineIdentity: 'lb', remainingSignedAmount: 900, effectiveDate: '2026-01-02', certificationVersion: 1 },
    ]
    const toClient = allocateObligationFifo(slices, 'JJ_TO_CLIENT', P)
    expect(toClient.allocations.every((a) => a.propertyId === 'B')).toBe(true)
    const toJj = allocateObligationFifo(slices, 'CLIENT_TO_JJ', P)
    expect(toJj.allocations.every((a) => a.propertyId === 'A')).toBe(true)
  })

  it('canonical JSON snapshots hash to 64 lowercase hex and reject delimiter collisions', () => {
    const { createHash } = require('crypto') as typeof import('crypto')
    const hex = (value: unknown) =>
      createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')
    const a = { policy_version: 'client-obligation-fifo-v2', payment_amount: '3260.00' }
    const b = { policy_version: 'client-obligation-fifo-v2', payment_amount: '3260.00' }
    expect(hex(a)).toBe(hex(b))
    expect(hex(a)).toMatch(/^[a-f0-9]{64}$/)
    expect(hex({ k: 'a|b' })).not.toBe(hex({ k: 'a', x: 'b' }))
    expect(hex({ payment_amount: '3260.00' })).not.toBe(hex({ payment_amount: '3261.00' }))
    const reversed = [
      { propertyId: 'B', sourceLineIdentity: 'lb', remainingSignedAmount: 2500, effectiveDate: '2026-01-02', certificationVersion: 1 },
      { propertyId: 'A', sourceLineIdentity: 'la', remainingSignedAmount: 1000, effectiveDate: '2026-01-01', certificationVersion: 1 },
    ]
    const forward = [
      { propertyId: 'A', sourceLineIdentity: 'la', remainingSignedAmount: 1000, effectiveDate: '2026-01-01', certificationVersion: 1 },
      { propertyId: 'B', sourceLineIdentity: 'lb', remainingSignedAmount: 2500, effectiveDate: '2026-01-02', certificationVersion: 1 },
    ]
    expect(allocateObligationFifo(reversed, 'JJ_TO_CLIENT', P)).toEqual(
      allocateObligationFifo(forward, 'JJ_TO_CLIENT', P),
    )
  })
})
