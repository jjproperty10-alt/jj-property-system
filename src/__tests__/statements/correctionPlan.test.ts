/**
 * G7 - Immutable correction / reclassification plan tests.
 * LOCKED: original is NEVER mutated; reverse nets to 0 with the original;
 * void_and_replace = reversal + replacement; reclassify is money-neutral and
 * changes only classification; every entry references the original; DB vocabulary
 * is valid; incoherent requests fail closed.
 */
import {
  buildCorrectionPlan,
  netLedgerEffect,
  isDbCorrectionType,
  DB_CORRECTION_TYPES,
  KIND_DEFAULT_DB_TYPE,
  CorrectionError,
  buildApplyContract,
  isNonDestructiveApply,
  type CorrectionSourceRow,
} from '@/lib/statements/correctionPlan'

const ORIG: CorrectionSourceRow = {
  id: 'tx-1',
  date: '2026-03-01',
  account_type: 'rental',
  category: 'management',
  subcategory: 'rent',
  amount_eur: 1000,
  client_charge: 1200,
  description: 'March rent',
}

function frozenCopy(o: CorrectionSourceRow) { return JSON.parse(JSON.stringify(o)) }

describe('G7 - immutability', () => {
  test('the original row is never mutated by any correction kind', () => {
    const before = frozenCopy(ORIG)
    buildCorrectionPlan(ORIG, { kind: 'reverse' })
    buildCorrectionPlan(ORIG, { kind: 'void_and_replace', newValues: { amount_eur: 800 } })
    buildCorrectionPlan(ORIG, { kind: 'reclassify', newValues: { account_type: 'airbnb' } })
    expect(ORIG).toEqual(before)
  })
  test('every produced entry references the original transaction id', () => {
    for (const kind of ['reverse', 'void_and_replace', 'reclassify'] as const) {
      const nv = kind === 'reverse' ? undefined : { account_type: 'airbnb', amount_eur: kind === 'reclassify' ? 1000 : 800 }
      const plan = buildCorrectionPlan(ORIG, { kind, newValues: nv })
      for (const e of plan.entries) expect(e.original_transaction_id).toBe('tx-1')
    }
  })
})

describe('G7 - reverse', () => {
  test('one reversal entry that negates the original (net 0 with original)', () => {
    const plan = buildCorrectionPlan(ORIG, { kind: 'reverse' })
    expect(plan.entries).toHaveLength(1)
    expect(plan.entries[0].role).toBe('reversal')
    expect(plan.entries[0].amount_eur).toBe(-1000)
    expect(plan.entries[0].client_charge).toBe(-1200)
    expect(plan.netAmountEur).toBe(-1000)
    expect(netLedgerEffect(ORIG, plan)).toBe(0) // original + reversal = 0
    expect(plan.dbCorrectionType).toBe('amount_correction')
  })
  test('null client_charge negates to null', () => {
    const plan = buildCorrectionPlan({ ...ORIG, client_charge: null }, { kind: 'reverse' })
    expect(plan.entries[0].client_charge).toBeNull()
  })
})

describe('G7 - void_and_replace', () => {
  const plan = buildCorrectionPlan(ORIG, { kind: 'void_and_replace', newValues: { amount_eur: 800, description: 'corrected rent' } })
  test('produces reversal + replacement', () => {
    expect(plan.entries.map(e => e.role)).toEqual(['reversal', 'replacement'])
    expect(plan.entries[0].amount_eur).toBe(-1000)
    expect(plan.entries[1].amount_eur).toBe(800)
    expect(plan.entries[1].description).toBe('corrected rent')
  })
  test('net ledger effect equals the corrected amount', () => {
    // original(1000) + reversal(-1000) + replacement(800) = 800
    expect(netLedgerEffect(ORIG, plan)).toBe(800)
  })
  test('records original + corrected field snapshots', () => {
    expect(plan.original_field_values).toMatchObject({ amount_eur: 1000 })
    expect(plan.corrected_field_values).toMatchObject({ amount_eur: 800 })
  })
})

describe('G7 - reclassify (money-neutral move)', () => {
  const plan = buildCorrectionPlan(ORIG, { kind: 'reclassify', newValues: { account_type: 'airbnb', category: 'str' } })
  test('reversal in old class + rebook in new class, amount preserved', () => {
    expect(plan.entries.map(e => e.role)).toEqual(['reversal', 'rebook'])
    expect(plan.entries[0].account_type).toBe('rental')   // reversal of old
    expect(plan.entries[1].account_type).toBe('airbnb')   // rebook in new
    expect(plan.entries[1].amount_eur).toBe(1000)         // amount preserved exactly
  })
  test('money-neutral: plan net is 0 and ledger effect unchanged', () => {
    expect(plan.netAmountEur).toBe(0)
    expect(netLedgerEffect(ORIG, plan)).toBe(1000) // original amount, only moved
    expect(plan.dbCorrectionType).toBe('reclassification')
  })
  test('rejects an amount change under reclassify', () => {
    expect(() => buildCorrectionPlan(ORIG, { kind: 'reclassify', newValues: { account_type: 'airbnb', amount_eur: 900 } }))
      .toThrow(CorrectionError)
  })
  test('rejects a no-op reclassify (identical classification)', () => {
    expect(() => buildCorrectionPlan(ORIG, { kind: 'reclassify', newValues: { account_type: 'rental', category: 'management', subcategory: 'rent' } }))
      .toThrow(CorrectionError)
  })
})

describe('G7 - append (missing charge)', () => {
  test('books a new entry; original may be null', () => {
    const plan = buildCorrectionPlan(null, { kind: 'append', effectiveDate: '2026-04-01', newValues: { account_type: 'renovation', category: 'repair', amount_eur: 500 } })
    expect(plan.entries).toHaveLength(1)
    expect(plan.entries[0].role).toBe('append')
    expect(plan.entries[0].original_transaction_id).toBeNull()
    expect(plan.entries[0].amount_eur).toBe(500)
    expect(plan.dbCorrectionType).toBe('missing_charge')
    expect(netLedgerEffect(null, plan)).toBe(500)
  })
  test('append without amount fails closed', () => {
    expect(() => buildCorrectionPlan(null, { kind: 'append', effectiveDate: '2026-04-01', newValues: {} }))
      .toThrow(CorrectionError)
  })
})

describe('G7 - fail-closed validation + DB vocabulary', () => {
  test('reverse/void/reclassify without an original throw', () => {
    expect(() => buildCorrectionPlan(null, { kind: 'reverse' })).toThrow(CorrectionError)
    expect(() => buildCorrectionPlan(null, { kind: 'void_and_replace', newValues: { amount_eur: 1 } })).toThrow(CorrectionError)
    expect(() => buildCorrectionPlan(null, { kind: 'reclassify', newValues: { account_type: 'x' } })).toThrow(CorrectionError)
  })
  test('invalid dbCorrectionType override is rejected', () => {
    // @ts-expect-error deliberately invalid
    expect(() => buildCorrectionPlan(ORIG, { kind: 'reverse', dbCorrectionType: 'totally_made_up' })).toThrow(CorrectionError)
  })
  test('all default DB types are valid vocabulary', () => {
    for (const k of Object.keys(KIND_DEFAULT_DB_TYPE) as (keyof typeof KIND_DEFAULT_DB_TYPE)[]) {
      expect(isDbCorrectionType(KIND_DEFAULT_DB_TYPE[k])).toBe(true)
    }
    expect(DB_CORRECTION_TYPES).toContain('reclassification')
    expect(isDbCorrectionType('nope')).toBe(false)
  })
})

describe('G7 - INSERT-only apply contract (no verified apply path yet)', () => {
  test('void_and_replace applies as inserts only + case -> applied', () => {
    const plan = buildCorrectionPlan(ORIG, { kind: 'void_and_replace', newValues: { amount_eur: 800 } })
    const c = buildApplyContract({ caseId: 'case-1', seriesId: 'series-1', plan })
    expect(c.caseTransition).toBe('applied')
    expect(c.inserts).toHaveLength(2)
    expect(c.inserts.every(i => i.op === 'insert_transaction')).toBe(true)
    // every insert references the original it corrects; none is an update/delete
    expect(c.inserts.map(i => i.role)).toEqual(['reversal', 'replacement'])
    expect(c.inserts.every(i => i.corrects_transaction_id === 'tx-1')).toBe(true)
    expect(isNonDestructiveApply(c)).toBe(true)
  })

  test('reclassify applies as reversal + rebook inserts, amount preserved', () => {
    const plan = buildCorrectionPlan(ORIG, { kind: 'reclassify', newValues: { account_type: 'airbnb' } })
    const c = buildApplyContract({ caseId: 'case-2', seriesId: 'series-1', plan })
    expect(c.inserts.map(i => i.role)).toEqual(['reversal', 'rebook'])
    expect(c.inserts[1].values.amount_eur).toBe(1000)
    expect(isNonDestructiveApply(c)).toBe(true)
  })

  test('append applies as a single standalone insert', () => {
    const plan = buildCorrectionPlan(null, { kind: 'append', effectiveDate: '2026-04-01', newValues: { account_type: 'renovation', category: 'repair', amount_eur: 500 } })
    const c = buildApplyContract({ caseId: 'case-3', seriesId: 'series-1', plan })
    expect(c.inserts).toHaveLength(1)
    expect(c.inserts[0].corrects_transaction_id).toBeNull()
    expect(isNonDestructiveApply(c)).toBe(true)
  })

  test('fails closed without case/series id', () => {
    const plan = buildCorrectionPlan(ORIG, { kind: 'reverse' })
    expect(() => buildApplyContract({ caseId: '', seriesId: 's', plan })).toThrow(CorrectionError)
    expect(() => buildApplyContract({ caseId: 'c', seriesId: '', plan })).toThrow(CorrectionError)
  })
})
