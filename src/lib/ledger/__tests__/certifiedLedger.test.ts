import {
  assembleCertifiedLedgerRows,
  isCertifiedLedgerRow,
} from '../certifiedLedger'

const EMPTY = new Set<string>()

const YOGEV_GENUINE = '9ed86eb8-81cd-4bd6-af43-5bd3e10d3a2c'
const YOGEV_DUPLICATE = '919037b1-5509-4ee1-b821-a3370093d82a'
const URIEL_1800 = 'ba646d2d-9122-4909-ae02-8a67739a0172'

function row(
  over: Partial<{ id: string; is_deleted: boolean | null; review_status: string | null }>,
) {
  return {
    id: over.id ?? 'x',
    is_deleted: over.is_deleted,
    review_status: over.review_status ?? 'active',
  }
}

describe('certified ledger predicate', () => {
  it('includes an active normal transaction once', () => {
    expect(isCertifiedLedgerRow(row({ id: 'ok' }), EMPTY)).toBe(true)
  })

  it('excludes is_deleted=true', () => {
    expect(isCertifiedLedgerRow(row({ id: 'd', is_deleted: true }), EMPTY)).toBe(false)
  })

  it('excludes an active transaction_exclusions id', () => {
    expect(isCertifiedLedgerRow(row({ id: 'e' }), new Set(['e']))).toBe(false)
  })

  it('excludes a row that is both deleted and excluded once', () => {
    expect(isCertifiedLedgerRow(row({ id: 'both', is_deleted: true }), new Set(['both']))).toBe(false)
  })

  it('does not remove a row for an inactive historical exclusion', () => {
    expect(isCertifiedLedgerRow(row({ id: 'keep' }), EMPTY)).toBe(true)
  })

  it('admits billing-only amount_eur=0 client_charge>0', () => {
    expect(isCertifiedLedgerRow(row({ id: 'bill' }), EMPTY)).toBe(true)
  })

  it('excludes inactive review_status', () => {
    expect(isCertifiedLedgerRow(row({ id: 'dup', review_status: 'confirmed_duplicate' }), EMPTY)).toBe(false)
  })

  it('keeps Yogev genuine €11,905 and excludes the excluded duplicate', () => {
    const excluded = new Set([YOGEV_DUPLICATE])
    expect(isCertifiedLedgerRow(row({ id: YOGEV_GENUINE, is_deleted: false, review_status: 'active' }), excluded)).toBe(true)
    expect(isCertifiedLedgerRow(row({
      id: YOGEV_DUPLICATE,
      is_deleted: false,
      review_status: 'confirmed_duplicate',
    }), excluded)).toBe(false)
  })

  it('excludes Uriel Kamares deleted €1,800', () => {
    expect(isCertifiedLedgerRow(row({ id: URIEL_1800, is_deleted: true, review_status: 'active' }), EMPTY)).toBe(false)
  })
})

describe('VM1 / VM2 stay separate under the predicate', () => {
  it('does not merge Villa Mazotos with Villa Mazotos 2', () => {
    const admitted = [
      { id: 'vm1', property_name: 'Villa Mazotos', is_deleted: false, review_status: 'active' },
      { id: 'vm2', property_name: 'Villa Mazotos 2', is_deleted: false, review_status: 'active' },
    ].filter(r => isCertifiedLedgerRow(r, EMPTY))
    const names = admitted.map(r => r.property_name)
    expect(names).toEqual(['Villa Mazotos', 'Villa Mazotos 2'])
    expect(names).not.toContain('Villa Mazotos / Villa Mazotos 2')
  })
})

describe('assembleCertifiedLedgerRows fail-closed', () => {
  it('fails closed when exclusion lookup fails', () => {
    const r = assembleCertifiedLedgerRows({
      txData: [row({ id: 'keep' })],
      txError: null,
      exData: null,
      exError: new Error('unavailable'),
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('EXCLUSIONS_SOURCE_UNAVAILABLE')
  })

  it('fails closed when ledger lookup fails', () => {
    const r = assembleCertifiedLedgerRows({
      txData: null,
      txError: new Error('boom'),
      exData: [],
      exError: null,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('LEDGER_SOURCE_UNAVAILABLE')
  })
})
