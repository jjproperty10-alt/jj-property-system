/**
 * Unit tests for getModuleStatus()
 *
 * Tests the balance-convention-aware status derivation.
 * Follows repo convention: src/__tests__/<module>/filename.test.ts
 *
 * Run: npx jest moduleStatus
 */

import { getModuleStatus } from '../../lib/report/moduleStatus'
import type { BalanceConvention } from '../../lib/report/types'
import type { ModuleStatus } from '../../lib/report/reportTypes'

// ── owner_credit convention (rental / airbnb) ─────────────────────────────────

describe('getModuleStatus — owner_credit convention', () => {
  const convention: BalanceConvention = 'owner_credit'

  test('positive balance → payable_to_you (JJ owes owner)', () => {
    expect(getModuleStatus(1000, convention)).toBe<ModuleStatus>('payable_to_you')
  })

  test('negative balance → payable_by_you (owner owes JJ)', () => {
    expect(getModuleStatus(-1000, convention)).toBe<ModuleStatus>('payable_by_you')
  })

  test('zero balance → settled', () => {
    expect(getModuleStatus(0, convention)).toBe<ModuleStatus>('settled')
  })

  test('tiny positive → payable_to_you (no rounding in status)', () => {
    expect(getModuleStatus(0.01, convention)).toBe<ModuleStatus>('payable_to_you')
  })

  test('tiny negative → payable_by_you (no rounding in status)', () => {
    expect(getModuleStatus(-0.01, convention)).toBe<ModuleStatus>('payable_by_you')
  })
})

// ── client_debt convention (sale / renovation) ────────────────────────────────

describe('getModuleStatus — client_debt convention', () => {
  const convention: BalanceConvention = 'client_debt'

  test('positive balance → payable_by_you (client owes JJ)', () => {
    expect(getModuleStatus(1000, convention)).toBe<ModuleStatus>('payable_by_you')
  })

  test('negative balance → payable_to_you (JJ owes client)', () => {
    expect(getModuleStatus(-1000, convention)).toBe<ModuleStatus>('payable_to_you')
  })

  test('zero balance → settled', () => {
    expect(getModuleStatus(0, convention)).toBe<ModuleStatus>('settled')
  })

  test('tiny positive → payable_by_you (no rounding in status)', () => {
    expect(getModuleStatus(0.01, convention)).toBe<ModuleStatus>('payable_by_you')
  })

  test('tiny negative → payable_to_you (no rounding in status)', () => {
    expect(getModuleStatus(-0.01, convention)).toBe<ModuleStatus>('payable_to_you')
  })
})

// ── Symmetry invariant ────────────────────────────────────────────────────────
// Conventions are mirror images: same non-zero balance must yield opposite statuses.

describe('getModuleStatus — convention symmetry', () => {
  test('same positive balance yields opposite statuses across conventions', () => {
    const balance = 500
    const ownerResult = getModuleStatus(balance, 'owner_credit')
    const debtResult  = getModuleStatus(balance, 'client_debt')
    expect(ownerResult).toBe<ModuleStatus>('payable_to_you')
    expect(debtResult).toBe<ModuleStatus>('payable_by_you')
    expect(ownerResult).not.toBe(debtResult)
  })

  test('zero always yields settled regardless of convention', () => {
    expect(getModuleStatus(0, 'owner_credit')).toBe<ModuleStatus>('settled')
    expect(getModuleStatus(0, 'client_debt')).toBe<ModuleStatus>('settled')
  })
})
