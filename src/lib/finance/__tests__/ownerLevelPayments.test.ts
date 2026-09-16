/**
 * Owner-level payments — 17 required proofs + regression.
 * Fixtures only. No Production Apply. No C1/C3 insert.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

import {
  C1_CANDIDATE,
  C1_FIXTURE_TRANSACTION_ID,
  HISTORICAL_PROPERTY_BPO,
  TAMIR_LIVE_PREIMAGE_EUR,
  TAMIR_PROPERTY_BALANCES_UNCHANGED,
  buildC3HostawayFixtures,
} from '../__fixtures__/tamirOwnerLevel'
import {
  applyOwnerLevelBpoToRc3Net,
  applyOwnerLevelToPosition,
  applyPropertyLinkedBpo,
  assertClientWriteAllowed,
  canRoleReadOwnerLinks,
  canRoleWriteOwnerLinks,
  composeOwnerLevelSettlement,
  isCountableOwnerLevelPayment,
  isExcludedFromLtr,
  isExcludedFromPropertyPl,
  isExcludedFromStr,
  isOwnerLevelConflict,
  OwnerTransactionLinkStore,
} from '../ownerLevelPaymentComposition'
import { classifyOwnerLevelDbError, parseOwnerLevelAmount } from '../ownerLevelFetchStatus'
import { assertOwnerLinkRpcAuthorized } from '../ownerLevelRpcAuth'
import {
  C1_AMOUNT_EUR,
  C1_IDEMPOTENCY_KEY,
  C3_ROW_COUNT,
  C3_TOTAL_EUR,
  CERTIFIED_DUE_TO_TAMIR_EUR,
  DuplicateActiveOwnerLinkError,
  DuplicateIdempotencyError,
  OWNER_TRANSACTION_LINKS_ACCESS,
  TAMIR_CANONICAL_NAME,
  TAMIR_OWNER_ENTITY_ID,
  TAMIR_PROPERTIES,
  UnauthorizedClientWriteError,
  type OwnerLevelPaymentCandidate,
} from '../ownerLevelPaymentTypes'
import {
  applyOnce,
  C2_OVERLAY_NET_EUR,
  C3_DELTA_EUR,
  GROUP_A_ALREADY_IN_LIVE_EUR,
  hiddenC3BaselineError,
  LIVE_PRODUCTION_PREIMAGE_EUR,
  sumLivePreimage,
  TAMIR_RECONCILIATION_LINES,
} from '../tamirCertifiedReconciliation'

function composeTamir(
  candidates: readonly OwnerLevelPaymentCandidate[],
  propertyLevelDueToOwnerEur = TAMIR_LIVE_PREIMAGE_EUR,
) {
  return composeOwnerLevelSettlement({
    ownerEntityId: TAMIR_OWNER_ENTITY_ID,
    propertyLevelDueToOwnerEur,
    propertyBalances: TAMIR_PROPERTY_BALANCES_UNCHANGED,
    candidates,
    jacobClearingEur: 0,
  })
}

describe('owner-level payments — Tamir C1 composition', () => {
  test('1. C1 resolves to Tamir canonical owner identity', () => {
    expect(C1_CANDIDATE.ownerEntityId).toBe(TAMIR_OWNER_ENTITY_ID)
    expect(C1_CANDIDATE.ownerCanonicalName).toBe(TAMIR_CANONICAL_NAME)
    const result = composeTamir([C1_CANDIDATE])
    expect(result.ownerEntityId).toBe(TAMIR_OWNER_ENTITY_ID)
    expect(result.ownerCanonicalName).toBe(TAMIR_CANONICAL_NAME)
  })

  test('2. C1 is counted exactly once', () => {
    const duplicateCopy: OwnerLevelPaymentCandidate = { ...C1_CANDIDATE }
    const result = composeTamir([C1_CANDIDATE, duplicateCopy])
    expect(result.countable).toHaveLength(1)
    expect(result.countedTransactionIds).toEqual([C1_FIXTURE_TRANSACTION_ID])
    expect(result.countableTotalEur).toBe(C1_AMOUNT_EUR)
  })

  test('3. Tamir closing changes by exactly −€10,000 from live pre-image (not certified)', () => {
    const result = composeTamir([C1_CANDIDATE])
    expect(result.dueToOwnerDeltaEur).toBe(-C1_AMOUNT_EUR)
    expect(result.dueToOwnerEur).toBe(3095.71)
    expect(TAMIR_LIVE_PREIMAGE_EUR - result.dueToOwnerEur).toBe(C1_AMOUNT_EUR)
    expect(result.dueToOwnerEur).not.toBe(CERTIFIED_DUE_TO_TAMIR_EUR)
  })

  test('4. Jacob clearing changes by exactly +€10,000', () => {
    const result = composeTamir([C1_CANDIDATE])
    expect(C1_CANDIDATE.payer).toBe('Jacob')
    expect(result.jacobClearingDeltaEur).toBe(C1_AMOUNT_EUR)
    expect(result.jacobClearingEur).toBe(C1_AMOUNT_EUR)
  })

  test('5. JJ P&L delta = €0', () => {
    const result = composeTamir([C1_CANDIDATE])
    expect(result.jjPnLDeltaEur).toBe(0)
  })

  test('6. every Tamir property balance delta from C1 = €0', () => {
    const result = composeTamir([C1_CANDIDATE])
    expect(result.propertyDeltas).toHaveLength(TAMIR_PROPERTIES.length)
    for (const slice of result.propertyDeltas) {
      expect(TAMIR_PROPERTIES).toContain(slice.propertyName)
      expect(slice.dueToOwnerEur).toBe(0)
    }
    expect(result.excludedFromPropertyPl).toBe(true)
    expect(isExcludedFromPropertyPl(C1_CANDIDATE)).toBe(true)
  })

  test('7. C1 is absent from STR activity', () => {
    expect(isExcludedFromStr(C1_CANDIDATE)).toBe(true)
    expect(C1_CANDIDATE.category).not.toBe('Airbnb')
    expect(C1_CANDIDATE.propertyName).toBeNull()
    const strSrc = readFileSync(
      join(process.cwd(), 'src/lib/report/str/ownerStrStatementService.ts'),
      'utf8',
    )
    expect(strSrc).not.toMatch(/v_owner_level_payments/)
    expect(strSrc).toContain('fetchCertifiedLedgerRows(sb, {')
    expect(strSrc).toMatch(/propertyNames:\s*names/)
  })

  test('8. C1 is absent from LTR activity', () => {
    expect(isExcludedFromLtr(C1_CANDIDATE)).toBe(true)
    const ltrSrc = readFileSync(
      join(process.cwd(), 'src/lib/owners/ownerLtrStatementAdapter.ts'),
      'utf8',
    )
    expect(ltrSrc).not.toMatch(/v_owner_level_payments/)
    expect(ltrSrc).not.toMatch(/owner_transaction_links/)
  })

  test('9. existing property-linked BPO behaviour is unchanged', () => {
    const before = 5000
    const after = applyPropertyLinkedBpo(before, HISTORICAL_PROPERTY_BPO.amountEur)
    expect(after).toBe(4000)
    const withC1 = composeTamir([C1_CANDIDATE])
    const radisson = withC1.propertyDeltas.find(p => p.propertyName === HISTORICAL_PROPERTY_BPO.propertyName)
    expect(radisson?.dueToOwnerEur).toBe(0)
    expect(isCountableOwnerLevelPayment({
      ...C1_CANDIDATE,
      transactionId: HISTORICAL_PROPERTY_BPO.transactionId,
      propertyName: HISTORICAL_PROPERTY_BPO.propertyName,
      amountEur: HISTORICAL_PROPERTY_BPO.amountEur,
    })).toBe(false)
  })

  test('10. duplicate idempotency is rejected', () => {
    const store = new OwnerTransactionLinkStore()
    store.insert({
      transactionId: C1_FIXTURE_TRANSACTION_ID,
      ownerEntityId: TAMIR_OWNER_ENTITY_ID,
      idempotencyKey: C1_IDEMPOTENCY_KEY,
    })
    expect(() => store.insert({
      transactionId: 'other-tx',
      ownerEntityId: TAMIR_OWNER_ENTITY_ID,
      idempotencyKey: C1_IDEMPOTENCY_KEY,
    })).toThrow(DuplicateIdempotencyError)
  })

  test('11. duplicate active owner link is rejected', () => {
    const store = new OwnerTransactionLinkStore()
    store.insert({
      transactionId: C1_FIXTURE_TRANSACTION_ID,
      ownerEntityId: TAMIR_OWNER_ENTITY_ID,
      idempotencyKey: C1_IDEMPOTENCY_KEY,
    })
    expect(() => store.insert({
      transactionId: C1_FIXTURE_TRANSACTION_ID,
      ownerEntityId: TAMIR_OWNER_ENTITY_ID,
      idempotencyKey: 'tamir_owner_pmt_other_key',
    })).toThrow(DuplicateActiveOwnerLinkError)
  })

  test('12. a softly deleted link is not counted', () => {
    const deleted: OwnerLevelPaymentCandidate = { ...C1_CANDIDATE, isDeletedLink: true }
    expect(isCountableOwnerLevelPayment(deleted)).toBe(false)
    const result = composeTamir([deleted])
    expect(result.countable).toHaveLength(0)
    expect(result.dueToOwnerEur).toBe(TAMIR_LIVE_PREIMAGE_EUR)

    const store = new OwnerTransactionLinkStore()
    const link = store.insert({
      transactionId: C1_FIXTURE_TRANSACTION_ID,
      ownerEntityId: TAMIR_OWNER_ENTITY_ID,
      idempotencyKey: C1_IDEMPOTENCY_KEY,
    })
    store.softDelete(link.id)
    expect(store.active()).toHaveLength(0)
    const restored = store.insert({
      transactionId: C1_FIXTURE_TRANSACTION_ID,
      ownerEntityId: TAMIR_OWNER_ENTITY_ID,
      idempotencyKey: 'tamir_owner_pmt_replacement',
    })
    expect(restored.idempotencyKey).toBe('tamir_owner_pmt_replacement')
  })

  test('13. unauthorized client write is rejected', () => {
    expect(canRoleWriteOwnerLinks('anon')).toBe(false)
    expect(OWNER_TRANSACTION_LINKS_ACCESS.anon.insert).toBe(false)
    expect(OWNER_TRANSACTION_LINKS_ACCESS.authenticated.insert).toBe(false)
    expect(OWNER_TRANSACTION_LINKS_ACCESS.authenticated.execute_write_rpc).toBe(true)
    expect(() => assertClientWriteAllowed('anon')).toThrow(UnauthorizedClientWriteError)
    const store = new OwnerTransactionLinkStore()
    expect(() => store.insert({
      transactionId: C1_FIXTURE_TRANSACTION_ID,
      ownerEntityId: TAMIR_OWNER_ENTITY_ID,
      idempotencyKey: C1_IDEMPOTENCY_KEY,
      role: 'anon',
    })).toThrow(UnauthorizedClientWriteError)
  })

  test('14. authorized report path can read', () => {
    expect(canRoleReadOwnerLinks('service_role')).toBe(true)
    expect(OWNER_TRANSACTION_LINKS_ACCESS.service_role.select).toBe(true)
    expect(OWNER_TRANSACTION_LINKS_ACCESS.service_role.execute_read_rpc).toBe(true)
    expect(OWNER_TRANSACTION_LINKS_ACCESS.authorizedReportPath.readVia).toContain(
      'finance.get_owner_level_payments',
    )
    expect(OWNER_TRANSACTION_LINKS_ACCESS.authorizedReportPath.readVia).toContain(
      'finance.v_owner_level_payments',
    )
  })

  test('15. property association + owner link is NEEDS REVIEW and not double-counted', () => {
    const conflict: OwnerLevelPaymentCandidate = {
      ...C1_CANDIDATE,
      propertyName: 'Tamir Dekelia',
      reviewStatus: 'needs_review',
    }
    expect(isOwnerLevelConflict(conflict)).toBe(true)
    expect(isCountableOwnerLevelPayment(conflict)).toBe(false)
    const result = composeTamir([conflict])
    expect(result.countable).toHaveLength(0)
    expect(result.needsReview).toEqual([
      { transactionId: C1_FIXTURE_TRANSACTION_ID, reason: 'property_and_owner_link' },
    ])
    expect(result.dueToOwnerEur).toBe(TAMIR_LIVE_PREIMAGE_EUR)
    const store = new OwnerTransactionLinkStore()
    const link = store.insert({
      transactionId: C1_FIXTURE_TRANSACTION_ID,
      ownerEntityId: TAMIR_OWNER_ENTITY_ID,
      idempotencyKey: C1_IDEMPOTENCY_KEY,
      propertyName: 'Tamir Dekelia',
    })
    expect(link.reviewStatus).toBe('needs_review')
  })

  test('16. C3 remains 29 rows, €1,160, no duplicates', () => {
    const rows = buildC3HostawayFixtures()
    expect(rows).toHaveLength(C3_ROW_COUNT)
    const keys = rows.map(r => r.idempotencyKey)
    expect(new Set(keys).size).toBe(C3_ROW_COUNT)
    const total = rows.reduce((s, r) => s + r.clientChargeEur, 0)
    expect(total).toBe(C3_TOTAL_EUR)
    expect(rows.every(r => r.amountEur === 0)).toBe(true)
  })

  test('17. certified close is live − C1 − C3 + C2 overlay, C3 counted once', () => {
    const c3 = buildC3HostawayFixtures()
    expect(c3.reduce((s, r) => s + r.amountEur, 0)).toBe(0)
    expect(c3.reduce((s, r) => s + r.clientChargeEur, 0)).toBe(C3_TOTAL_EUR)
    const withC1 = composeTamir([C1_CANDIDATE])
    expect(withC1.dueToOwnerEur).toBe(3095.71)
    expect(applyOwnerLevelBpoToRc3Net(TAMIR_LIVE_PREIMAGE_EUR, C1_AMOUNT_EUR)).toBe(3095.71)
  })
})

describe('owner-level payments — regressions for other owners', () => {
  test('unrelated owner is not credited Tamir C1', () => {
    const result = composeOwnerLevelSettlement({
      ownerEntityId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      propertyLevelDueToOwnerEur: 500,
      propertyBalances: [{ propertyName: 'Villa Mazotos', dueToOwnerEur: 500 }],
      candidates: [C1_CANDIDATE],
      jacobClearingEur: 0,
    })
    expect(result.countable).toHaveLength(0)
    expect(result.dueToOwnerEur).toBe(500)
    expect(result.jacobClearingDeltaEur).toBe(0)
  })

  test('empty candidate list leaves property-level due unchanged', () => {
    const result = composeTamir([], 900)
    expect(result.dueToOwnerEur).toBe(900)
    expect(result.countableTotalEur).toBe(0)
  })
})

describe('Tamir C3 reconciliation — live pre-image to €3,248.75 once', () => {
  test('live views sum to Production pre-image €13,095.71', () => {
    expect(sumLivePreimage()).toBe(LIVE_PRODUCTION_PREIMAGE_EUR)
    expect(LIVE_PRODUCTION_PREIMAGE_EUR).toBe(13095.71)
  })

  test('Group A €1,029 is already in live views (delta 0)', () => {
    const line = TAMIR_RECONCILIATION_LINES.find(l => l.id === 'group_a')
    expect(line?.liveViewsEur).toBe(-GROUP_A_ALREADY_IN_LIVE_EUR)
    expect(line?.overlayEur).toBe(0)
    expect(line?.ledgerOnceEur).toBe(0)
  })

  test('C3 is labeled as missing Hostaway, not inside live €800', () => {
    const liveHostaway = TAMIR_RECONCILIATION_LINES.find(l => l.id === 'hostaway_live')
    const c3 = TAMIR_RECONCILIATION_LINES.find(l => l.id === 'c3')
    expect(liveHostaway?.liveViewsEur).toBe(-800)
    expect(c3?.liveViewsEur).toBe(0)
    expect(c3?.ledgerOnceEur).toBe(C3_DELTA_EUR)
    expect(c3?.overlayEur).toBe(0)
    expect(c3?.layer).toBe('c3_hostaway_missing_once')
  })

  test('C2 overlay net is +€1,313.04 with zero ledger rows', () => {
    const overlays = TAMIR_RECONCILIATION_LINES.filter(l => l.layer === 'c2_evidence_overlay_zero_rows')
    const net = overlays.reduce((s, l) => s + l.overlayEur + l.ledgerOnceEur, 0)
    expect(Number(net.toFixed(2))).toBe(C2_OVERLAY_NET_EUR)
    expect(overlays.every(l => l.ledgerOnceEur === 0)).toBe(true)
  })

  test('cent-exact identity: 13095.71 − 10000 − 1160 + 1313.04 = 3248.75', () => {
    const once = applyOnce()
    expect(once.ok).toBe(true)
    if (!once.ok) return
    expect(once.closingEur).toBe(CERTIFIED_DUE_TO_TAMIR_EUR)
    expect(once.doubleCountedC3).toBe(false)
  })

  test('C3 overlay + C3 ledger together is forbidden', () => {
    const twice = applyOnce(TAMIR_RECONCILIATION_LINES, {
      applyC3AsLedger: true,
      applyC3AsOverlay: true,
    })
    expect(twice.ok).toBe(false)
    expect(twice.doubleCountedC3).toBe(true)
    expect(twice.closingEur).toBeNull()
  })

  test('certified + C1 = €13,248.75 hid C3 and is rejected as a baseline', () => {
    expect(hiddenC3BaselineError()).toBe(13248.75)
    expect(hiddenC3BaselineError()).not.toBe(LIVE_PRODUCTION_PREIMAGE_EUR)
  })
})

describe('owner-level composition guards', () => {
  test('property-linked BPO is not countable as owner-level', () => {
    const propertyBpo: OwnerLevelPaymentCandidate = {
      ...C1_CANDIDATE,
      transactionId: HISTORICAL_PROPERTY_BPO.transactionId,
      propertyName: HISTORICAL_PROPERTY_BPO.propertyName,
      amountEur: HISTORICAL_PROPERTY_BPO.amountEur,
    }
    expect(isCountableOwnerLevelPayment(propertyBpo)).toBe(false)
    expect(isOwnerLevelConflict(propertyBpo)).toBe(true)
  })

  test('paidToOwner and closing use the same countable total', () => {
    const composed = composeTamir([C1_CANDIDATE], 13095.71)
    const before = {
      paidToOwnerEur: '9100',
      netEur: '13095.71',
      closingBalanceEur: '13095.71',
    }
    const after = applyOwnerLevelToPosition(before, composed, 'rc3')
    expect(composed.countableTotalEur).toBe(C1_AMOUNT_EUR)
    expect(after.paidToOwnerEur).toBe('19100')
    expect(after.closingBalanceEur).toBe('3095.71')
    expect(Number(before.paidToOwnerEur) + composed.countableTotalEur).toBe(19100)
    expect(applyOwnerLevelBpoToRc3Net(Number(before.closingBalanceEur), composed.countableTotalEur)).toBe(3095.71)
  })

  test('cutoff through 2026-08-31 includes C1; after cutoff excludes it', () => {
    const inRange = composeOwnerLevelSettlement({
      ownerEntityId: TAMIR_OWNER_ENTITY_ID,
      propertyLevelDueToOwnerEur: TAMIR_LIVE_PREIMAGE_EUR,
      propertyBalances: TAMIR_PROPERTY_BALANCES_UNCHANGED,
      candidates: [C1_CANDIDATE],
      jacobClearingEur: 0,
      periodStart: '2026-06-01',
      periodEnd: '2026-08-31',
    })
    expect(inRange.countableTotalEur).toBe(C1_AMOUNT_EUR)
    const afterCutoff = composeOwnerLevelSettlement({
      ownerEntityId: TAMIR_OWNER_ENTITY_ID,
      propertyLevelDueToOwnerEur: TAMIR_LIVE_PREIMAGE_EUR,
      propertyBalances: TAMIR_PROPERTY_BALANCES_UNCHANGED,
      candidates: [{ ...C1_CANDIDATE, date: '2026-09-01' }],
      jacobClearingEur: 0,
      periodStart: '2026-06-01',
      periodEnd: '2026-08-31',
    })
    expect(afterCutoff.countable).toHaveLength(0)
    expect(afterCutoff.dueToOwnerEur).toBe(TAMIR_LIVE_PREIMAGE_EUR)
  })

  test('amount_eur must be positive to count', () => {
    const zero = { ...C1_CANDIDATE, amountEur: 0 }
    const negative = { ...C1_CANDIDATE, amountEur: -10000 }
    expect(isCountableOwnerLevelPayment(zero)).toBe(false)
    expect(isCountableOwnerLevelPayment(negative)).toBe(false)
    const result = composeTamir([zero, negative])
    expect(result.countable).toHaveLength(0)
    expect(result.needsReview.map(f => f.reason).sort()).toEqual([
      'non_positive_amount',
      'non_positive_amount',
    ])
  })

  test('transaction/link owner mismatch is NEEDS REVIEW and not counted', () => {
    const mismatch: OwnerLevelPaymentCandidate = {
      ...C1_CANDIDATE,
      transactionLinkedOwnerEntityId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    }
    const result = composeTamir([mismatch])
    expect(result.countable).toHaveLength(0)
    expect(result.needsReview).toEqual([
      { transactionId: C1_FIXTURE_TRANSACTION_ID, reason: 'owner_mismatch' },
    ])
    expect(result.dueToOwnerEur).toBe(TAMIR_LIVE_PREIMAGE_EUR)
  })

  test('Owner Workspace PDF does not compose owner-level overlay (no double path)', () => {
    const pdf = readFileSync(join(process.cwd(), 'src/app/(app)/owners/[slug]/report/pdf/route.ts'), 'utf8')
    expect(pdf).toMatch(/fetchRC3Report/)
    expect(pdf).not.toMatch(/fetchOwnerLevelPaymentsForEntity/)
    expect(pdf).not.toMatch(/composeOwnerLevelSettlement/)
    expect(pdf).toMatch(/'Cache-Control': 'no-store'/)
    const settlement = readFileSync(join(process.cwd(), 'src/lib/owners/ownerSettlementAdapter.ts'), 'utf8')
    expect(settlement).toMatch(/v_contact_settlement_summary/)
    expect(settlement).not.toMatch(/v_owner_level_payments/)
    expect(settlement).not.toMatch(/owner_transaction_links/)
  })

  test('service_role cannot INSERT/UPDATE the table directly', () => {
    expect(OWNER_TRANSACTION_LINKS_ACCESS.service_role.insert).toBe(false)
    expect(OWNER_TRANSACTION_LINKS_ACCESS.service_role.update).toBe(false)
    expect(OWNER_TRANSACTION_LINKS_ACCESS.service_role.select).toBe(true)
    expect(canRoleWriteOwnerLinks('service_role')).toBe(true)
  })
})

describe('owner-level fail-closed classification', () => {
  test('missing relation is not_deployed', () => {
    expect(classifyOwnerLevelDbError({ code: '42P01', message: 'relation does not exist' }).kind).toBe('not_deployed')
    expect(classifyOwnerLevelDbError({ code: 'PGRST205', message: 'could not find the table' }).kind).toBe('not_deployed')
  })

  test('permission, timeout, malformed, unexpected are blocked', () => {
    expect(classifyOwnerLevelDbError({ code: '42501', message: 'permission denied' }).kind).toBe('blocked')
    expect(classifyOwnerLevelDbError({ message: 'ETIMEDOUT' }).kind).toBe('blocked')
    expect(classifyOwnerLevelDbError({ code: '22P02', message: 'invalid input syntax' }).kind).toBe('blocked')
    expect(classifyOwnerLevelDbError({ message: 'something exploded' }).kind).toBe('blocked')
    expect(parseOwnerLevelAmount('not-a-number').ok).toBe(false)
  })
})

describe('owner-level RPC authorization reachability', () => {
  test('staff authenticated succeeds', () => {
    expect(() => assertOwnerLinkRpcAuthorized({ jwtRole: 'authenticated', staffRole: 'ceo' })).not.toThrow()
    expect(() => assertOwnerLinkRpcAuthorized({ jwtRole: 'authenticated', staffRole: 'finance_admin' })).not.toThrow()
    const store = new OwnerTransactionLinkStore()
    const link = store.insert({
      transactionId: C1_FIXTURE_TRANSACTION_ID,
      ownerEntityId: TAMIR_OWNER_ENTITY_ID,
      idempotencyKey: C1_IDEMPOTENCY_KEY,
      jwtRole: 'authenticated',
      staffRole: 'ceo',
    })
    expect(link.isDeleted).toBe(false)
  })

  test('non-staff authenticated rejected', () => {
    expect(() => assertOwnerLinkRpcAuthorized({ jwtRole: 'authenticated', staffRole: 'viewer' })).toThrow(
      UnauthorizedClientWriteError,
    )
    const store = new OwnerTransactionLinkStore()
    expect(() => store.insert({
      transactionId: C1_FIXTURE_TRANSACTION_ID,
      ownerEntityId: TAMIR_OWNER_ENTITY_ID,
      idempotencyKey: C1_IDEMPOTENCY_KEY,
      jwtRole: 'authenticated',
      staffRole: null,
    })).toThrow(UnauthorizedClientWriteError)
  })

  test('anon rejected', () => {
    expect(() => assertOwnerLinkRpcAuthorized({ jwtRole: 'anon' })).toThrow(UnauthorizedClientWriteError)
    expect(canRoleWriteOwnerLinks('anon')).toBe(false)
    expect(OWNER_TRANSACTION_LINKS_ACCESS.anon.execute_write_rpc).toBe(false)
  })

  test('service_role succeeds', () => {
    expect(() => assertOwnerLinkRpcAuthorized({ jwtRole: 'service_role' })).not.toThrow()
    const store = new OwnerTransactionLinkStore()
    const link = store.insert({
      transactionId: 'svc-role-tx',
      ownerEntityId: TAMIR_OWNER_ENTITY_ID,
      idempotencyKey: 'svc-role-key',
      jwtRole: 'service_role',
    })
    expect(link.transactionId).toBe('svc-role-tx')
  })

  test('missing JWT role rejected', () => {
    expect(() => assertOwnerLinkRpcAuthorized({ jwtRole: null })).toThrow(UnauthorizedClientWriteError)
    expect(() => assertOwnerLinkRpcAuthorized({ jwtRole: undefined })).toThrow(UnauthorizedClientWriteError)
  })

  test('spoofed role parameter cannot bypass', () => {
    expect(() => assertOwnerLinkRpcAuthorized({
      jwtRole: 'authenticated',
      staffRole: 'viewer',
      spoofedRoleParam: 'service_role',
      createdBy: 'service_role',
    })).toThrow(UnauthorizedClientWriteError)
    expect(() => assertOwnerLinkRpcAuthorized({
      jwtRole: 'anon',
      spoofedRoleParam: 'service_role',
      createdBy: 'ceo',
    })).toThrow(UnauthorizedClientWriteError)
    const store = new OwnerTransactionLinkStore()
    expect(() => store.insert({
      transactionId: C1_FIXTURE_TRANSACTION_ID,
      ownerEntityId: TAMIR_OWNER_ENTITY_ID,
      idempotencyKey: C1_IDEMPOTENCY_KEY,
      jwtRole: 'authenticated',
      staffRole: 'intern',
      spoofedRoleParam: 'service_role',
      createdBy: 'service_role',
    })).toThrow(UnauthorizedClientWriteError)
  })
})
