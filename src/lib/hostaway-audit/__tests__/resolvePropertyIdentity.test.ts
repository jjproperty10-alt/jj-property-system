/**
 * P1 — Canonical Property UUID identity resolution.
 * property_id is authoritative; jj_property_name is never an identity authority.
 */
import { resolvePropertyIdentity } from '../resolvePropertyIdentity';

// The 8 production-verified Hostaway external_id -> canonical property_id mappings.
const VERIFIED: ReadonlyArray<readonly [string, string]> = [
  ['412145', '47f53dde-9882-4f7c-ba49-3effeb937848'],
  ['412147', '20d9571e-6bf7-4307-ba4b-59ae5eb21241'],
  ['412148', '4eb09c84-907a-404c-b19a-7856f73fadff'],
  ['426237', 'b587f463-279d-4376-bb14-38789f34cbba'],
  ['447075', 'e75eecc5-6379-430a-8799-a374b0c246a3'],
  ['495138', '965bd157-0d6d-409c-b565-9afbb3312fe5'],
  ['510557', 'a48fc1cc-9303-44db-bc18-6730d6270019'],
  ['534350', 'c74e3ff2-cf7c-477a-8dad-ac11e45540ba'],
];

describe('resolvePropertyIdentity (P1)', () => {
  it('resolves an approved mapping through its canonical UUID', () => {
    const r = resolvePropertyIdentity({
      status: 'approved',
      propertyId: '47f53dde-9882-4f7c-ba49-3effeb937848',
      jjPropertyName: 'Tamir Dekelia',
    });
    expect(r.resolved).toBe(true);
    if (r.resolved) expect(r.propertyId).toBe('47f53dde-9882-4f7c-ba49-3effeb937848');
  });

  it('all 8 verified Hostaway mappings resolve through UUID (not name)', () => {
    for (const [, uuid] of VERIFIED) {
      const r = resolvePropertyIdentity({ status: 'approved', propertyId: uuid, jjPropertyName: 'name-should-be-ignored' });
      expect(r.resolved).toBe(true);
      if (r.resolved) expect(r.propertyId).toBe(uuid);
    }
  });

  it('an APPROVED mapping without property_id is UNRESOLVED — no silent name authority', () => {
    const r = resolvePropertyIdentity({ status: 'approved', propertyId: null, jjPropertyName: 'Villa Mazotos' });
    expect(r.resolved).toBe(false);
    if (!r.resolved) {
      expect(r.reason).toContain('Villa Mazotos');
      expect(r.reason).toContain('not an identity authority');
    }
  });

  it('treats empty/whitespace property_id as unresolved (never trusts name)', () => {
    for (const bad of ['', '   ']) {
      const r = resolvePropertyIdentity({ status: 'approved', propertyId: bad, jjPropertyName: 'X' });
      expect(r.resolved).toBe(false);
    }
  });

  it('a non-approved mapping without property_id is unresolved (proposed)', () => {
    const r = resolvePropertyIdentity({ status: 'proposed', propertyId: null, jjPropertyName: 'New Listing' });
    expect(r.resolved).toBe(false);
    if (!r.resolved) expect(r.reason).toContain("status='proposed'");
  });
});
