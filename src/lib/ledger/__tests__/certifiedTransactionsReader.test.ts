import { CERTIFIED_LEDGER_VIEW } from '../certifiedLedger'
import { fetchCertifiedLedgerRows } from '../certifiedTransactionsReader'

function thenable(result: { data: unknown; error: { message?: string } | null }) {
  const q: Record<string, unknown> = {}
  const self = () => q
  q.select = self
  q.in = self
  q.eq = self
  q.gte = self
  q.lte = self
  q.then = (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve)
  return q
}

describe('fetchCertifiedLedgerRows', () => {
  it('reads v_certified_ledger_transactions, not public.transactions', async () => {
    const from = jest.fn(() => thenable({ data: [{ id: 'a' }], error: null }))
    const rows = await fetchCertifiedLedgerRows({ from: from as never }, { select: 'id', propertyNames: ['P'] })
    expect(from).toHaveBeenCalledWith(CERTIFIED_LEDGER_VIEW)
    expect(rows).toEqual([{ id: 'a' }])
  })

  it('fails closed when the certified view cannot be loaded', async () => {
    const from = jest.fn(() => thenable({ data: null, error: { message: 'relation missing' } }))
    await expect(
      fetchCertifiedLedgerRows({ from: from as never }, { select: 'id', propertyNames: ['P'] }),
    ).rejects.toMatchObject({ name: 'CertifiedLedgerUnavailableError', reason: 'LEDGER_SOURCE_UNAVAILABLE' })
  })

  it('returns no rows when property name list is empty (no unscoped dump)', async () => {
    const from = jest.fn()
    const rows = await fetchCertifiedLedgerRows({ from: from as never }, { select: 'id', propertyNames: [] })
    expect(from).not.toHaveBeenCalled()
    expect(rows).toEqual([])
  })
})
