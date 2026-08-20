/**
 * G5 - Report mode + protected-field authorization boundary tests.
 * LOCKED: fail closed to owner_client; jj_internal only for authorized JJ staff;
 * Purchase + margin/evidence only in jj_internal; owner_client output structurally
 * carries no protected field; a client cannot elevate by "requesting".
 */
import {
  REPORT_MODES,
  DEFAULT_REPORT_MODE,
  INTERNAL_MODE_ROLES,
  PROTECTED_INTERNAL_FIELDS,
  canUseInternalMode,
  isReportMode,
  resolveReportMode,
  isPurchaseVisible,
  isInternalFieldVisible,
  isProtectedField,
  projectForMode,
  findProtectedLeaks,
} from '@/lib/report/reportMode'

describe('G5 - mode basics', () => {
  test('owner_client is the safe default and is listed first', () => {
    expect(DEFAULT_REPORT_MODE).toBe('owner_client')
    expect(REPORT_MODES[0]).toBe('owner_client')
    expect(REPORT_MODES).toEqual(['owner_client', 'jj_internal'])
  })
  test('only superadmin (JJ staff) may enter internal mode', () => {
    expect(INTERNAL_MODE_ROLES).toEqual(['superadmin'])
    expect(canUseInternalMode('superadmin')).toBe(true)
    expect(canUseInternalMode('partner')).toBe(false)
    expect(canUseInternalMode('viewer')).toBe(false)
    expect(canUseInternalMode(null)).toBe(false)
    expect(canUseInternalMode(undefined)).toBe(false)
  })
  test('isReportMode guards the union', () => {
    expect(isReportMode('owner_client')).toBe(true)
    expect(isReportMode('jj_internal')).toBe(true)
    expect(isReportMode('admin')).toBe(false)
  })
})

describe('G5 - resolveReportMode fails closed', () => {
  test('authorized role + explicit request -> jj_internal', () => {
    expect(resolveReportMode({ requestedMode: 'jj_internal', role: 'superadmin' })).toBe('jj_internal')
  })
  test('partner/owner requesting internal is denied -> owner_client', () => {
    expect(resolveReportMode({ requestedMode: 'jj_internal', role: 'partner' })).toBe('owner_client')
  })
  test('no role, unknown role, or no request -> owner_client', () => {
    expect(resolveReportMode({ requestedMode: 'jj_internal' })).toBe('owner_client')
    expect(resolveReportMode({ requestedMode: 'jj_internal', role: 'ghost' })).toBe('owner_client')
    expect(resolveReportMode({ role: 'superadmin' })).toBe('owner_client')
    expect(resolveReportMode({})).toBe('owner_client')
    expect(resolveReportMode()).toBe('owner_client')
  })
  test('malformed requestedMode never elevates', () => {
    expect(resolveReportMode({ requestedMode: 'JJ_INTERNAL', role: 'superadmin' })).toBe('owner_client')
    expect(resolveReportMode({ requestedMode: 1, role: 'superadmin' })).toBe('owner_client')
    expect(resolveReportMode({ requestedMode: true, role: 'superadmin' })).toBe('owner_client')
  })
})

describe('G5 - Purchase visibility', () => {
  test('Purchase hidden in owner_client, shown in jj_internal', () => {
    expect(isPurchaseVisible('owner_client')).toBe(false)
    expect(isPurchaseVisible('jj_internal')).toBe(true)
  })
})

describe('G5 - protected field visibility', () => {
  test('margin/actual_cost/evidence are protected', () => {
    for (const f of ['margin', 'jj_margin', 'actual_cost', 'evidence', 'payer', 'payee']) {
      expect(isProtectedField(f)).toBe(true)
      expect(isInternalFieldVisible(f, 'owner_client')).toBe(false)
      expect(isInternalFieldVisible(f, 'jj_internal')).toBe(true)
    }
  })
  test('a client-safe field is visible in both modes', () => {
    expect(isInternalFieldVisible('client_amount', 'owner_client')).toBe(true)
    expect(isInternalFieldVisible('display_label', 'owner_client')).toBe(true)
  })
  test('the protected set covers the client-safe DTO forbidden fields', () => {
    for (const f of ['description', 'notes', 'k_note', 'memo']) {
      expect(PROTECTED_INTERNAL_FIELDS).toContain(f)
    }
  })
})

describe('G5 - projectForMode strips protected fields for owner_client', () => {
  const record = {
    id: 'tx1',
    date: '2026-01-01',
    client_amount: 1200,
    display_label: 'Rent Collected',
    // protected:
    amount_eur: 1000,
    client_charge: 1200,
    margin: 200,
    payer: 'JJ',
    payee: 'Owner',
    evidence: 'https://internal/evidence/1',
    description: 'raw internal description',
  }

  test('owner_client output structurally omits every protected field', () => {
    const out = projectForMode(record, 'owner_client')
    expect(findProtectedLeaks(out as Record<string, unknown>)).toEqual([])
    expect(out).toEqual({ id: 'tx1', date: '2026-01-01', client_amount: 1200, display_label: 'Rent Collected' })
    expect('margin' in out).toBe(false)
    expect('payer' in out).toBe(false)
    expect('evidence' in out).toBe(false)
  })

  test('jj_internal output preserves everything', () => {
    const out = projectForMode(record, 'jj_internal')
    expect(out).toEqual(record)
    expect(out.margin).toBe(200)
  })

  test('projection never mutates the input', () => {
    const copy = { ...record }
    projectForMode(record, 'owner_client')
    expect(record).toEqual(copy)
  })

  test('findProtectedLeaks flags a leaking payload', () => {
    expect(findProtectedLeaks({ id: 'x', margin: 5 })).toEqual(['margin'])
  })
})
