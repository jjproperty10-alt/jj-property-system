/**
 * Gate cert - INSERT-only correction rows builder tests (append model).
 * LOCKED: corrections become NEW rows referencing the original; original metadata
 * is inherited; reverse negates; void_and_replace = reversal + replacement;
 * reclassify is money-neutral; category (NOT NULL) required; fail-closed.
 */
import {
  buildCorrectionInsertRows,
  insertRowsNet,
  CorrectionInsertError,
  type OriginalTxRow,
} from '@/lib/statements/correctionInsertRows'
import { buildCorrectionPlan, type CorrectionSourceRow } from '@/lib/statements/correctionPlan'

const ORIG_TX: OriginalTxRow = {
  id: 'tx-1', date: '2026-03-01', property_id: 'p-1', property_name: 'Villa X',
  category: 'rental', subcategory: 'rent', description: 'March rent',
  payer: 'Tenant', payee: 'JJ', amount_eur: 1000, client_charge: 1200, notes: 'n', k_note: 'k',
}
const ORIG_SRC: CorrectionSourceRow = {
  id: 'tx-1', date: '2026-03-01', account_type: 'rental', category: 'rental',
  subcategory: 'rent', amount_eur: 1000, client_charge: 1200, description: 'March rent',
}

describe('reverse -> single negating row referencing the original', () => {
  const plan = buildCorrectionPlan(ORIG_SRC, { kind: 'reverse' })
  const rows = buildCorrectionInsertRows(plan, ORIG_TX)
  test('one row, negated, references original, inherits metadata', () => {
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      role: 'reversal', corrects_transaction_id: 'tx-1',
      property_id: 'p-1', property_name: 'Villa X', payer: 'Tenant', payee: 'JJ',
      category: 'rental', amount_eur: -1000, client_charge: -1200,
    })
  })
  test('net with original nets to zero', () => {
    expect(ORIG_TX.amount_eur + insertRowsNet(rows)).toBe(0)
  })
})

describe('void_and_replace -> reversal + replacement rows', () => {
  const plan = buildCorrectionPlan(ORIG_SRC, { kind: 'void_and_replace', newValues: { amount_eur: 800, description: 'corrected' } })
  const rows = buildCorrectionInsertRows(plan, ORIG_TX)
  test('two rows in order, both reference the original', () => {
    expect(rows.map(r => r.role)).toEqual(['reversal', 'replacement'])
    expect(rows.every(r => r.corrects_transaction_id === 'tx-1')).toBe(true)
    expect(rows[1].amount_eur).toBe(800)
    expect(rows[1].description).toBe('corrected')
  })
  test('net ledger effect (original + rows) equals corrected amount', () => {
    expect(ORIG_TX.amount_eur + insertRowsNet(rows)).toBe(800)
  })
})

describe('reclassify -> money-neutral move, category changes', () => {
  const plan = buildCorrectionPlan(ORIG_SRC, { kind: 'reclassify', newValues: { account_type: 'airbnb', category: 'str' } })
  const rows = buildCorrectionInsertRows(plan, ORIG_TX)
  test('reversal in old category + rebook in new category, amount preserved', () => {
    expect(rows.map(r => r.role)).toEqual(['reversal', 'rebook'])
    expect(rows[0].category).toBe('rental')
    expect(rows[1].category).toBe('str')
    expect(rows[1].amount_eur).toBe(1000)
  })
  test('money-neutral: rows net to 0', () => {
    expect(insertRowsNet(rows)).toBe(0)
  })
})

describe('append -> standalone new row (original may be null)', () => {
  test('books a new row with no original reference', () => {
    const plan = buildCorrectionPlan(null, { kind: 'append', effectiveDate: '2026-04-01', newValues: { account_type: 'renovation', category: 'repair', amount_eur: 500, description: 'missing charge' } })
    const rows = buildCorrectionInsertRows(plan, null)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ role: 'append', corrects_transaction_id: null, category: 'repair', amount_eur: 500, property_id: null })
  })
})

describe('fail-closed', () => {
  test('reverse/void/reclassify without original throw', () => {
    const plan = buildCorrectionPlan(ORIG_SRC, { kind: 'reverse' })
    expect(() => buildCorrectionInsertRows(plan, null)).toThrow(CorrectionInsertError)
  })
  test('original id mismatch throws', () => {
    const plan = buildCorrectionPlan(ORIG_SRC, { kind: 'reverse' })
    expect(() => buildCorrectionInsertRows(plan, { ...ORIG_TX, id: 'other' })).toThrow(CorrectionInsertError)
  })
  test('missing category fails closed (table requires NOT NULL)', () => {
    const plan = buildCorrectionPlan(null, { kind: 'append', effectiveDate: '2026-04-01', newValues: { amount_eur: 5, category: '' } })
    expect(() => buildCorrectionInsertRows(plan, null)).toThrow(CorrectionInsertError)
  })

  test('missing date fails closed', () => {
    // hand-craft a plan whose entry has an empty date (bypass builder defaulting)
    const plan = buildCorrectionPlan(ORIG_SRC, { kind: 'reverse' })
    const broken = { ...plan, entries: [{ ...plan.entries[0], date: '' }] }
    expect(() => buildCorrectionInsertRows(broken, ORIG_TX)).toThrow(CorrectionInsertError)
  })

  test('non-finite amount fails closed (P-ARCH-1: Unknown != 0)', () => {
    const plan = buildCorrectionPlan(ORIG_SRC, { kind: 'reverse' })
    const nan = { ...plan, entries: [{ ...plan.entries[0], amount_eur: Number.NaN }] }
    expect(() => buildCorrectionInsertRows(nan, ORIG_TX)).toThrow(CorrectionInsertError)
    const inf = { ...plan, entries: [{ ...plan.entries[0], amount_eur: Infinity }] }
    expect(() => buildCorrectionInsertRows(inf, ORIG_TX)).toThrow(CorrectionInsertError)
  })

  test('invalid role fails closed', () => {
    const plan = buildCorrectionPlan(ORIG_SRC, { kind: 'reverse' })
    const bad = { ...plan, entries: [{ ...plan.entries[0], role: 'bogus' }] }
    // @ts-expect-error deliberately invalid role
    expect(() => buildCorrectionInsertRows(bad, ORIG_TX)).toThrow(CorrectionInsertError)
  })
})
