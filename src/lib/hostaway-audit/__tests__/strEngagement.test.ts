/**
 * P2 — STR service-engagement resolution (effective-period aware; identity = property_id, never name).
 */
import { resolveActiveStrEngagement } from '../strEngagement';
import type { StrEngagementRow } from '../strEngagement';

const PID = '47f53dde-9882-4f7c-ba49-3effeb937848';
const OTHER = '20d9571e-6bf7-4307-ba4b-59ae5eb21241';
const ENT = '0f352012-1403-4e3b-982a-7c019ee89f1b';
const ENT2 = 'aaaaaaaa-1403-4e3b-982a-7c019ee89f1b';
const AS_OF = '2026-08-11';

const row = (o: Partial<StrEngagementRow>): StrEngagementRow => ({
  propertyId: PID, entityId: ENT, serviceType: 'airbnb_str', status: 'active',
  effectiveFrom: '2025-07-24', effectiveTo: null, ...o,
});

describe('resolveActiveStrEngagement (P2, effective-period aware)', () => {
  it('resolves the single currently-effective engagement by property_id', () => {
    const r = resolveActiveStrEngagement(PID, [row({})], AS_OF);
    expect(r.resolved).toBe(true);
    if (r.resolved) { expect(r.entityId).toBe(ENT); expect(r.effectiveFrom).toBe('2025-07-24'); }
  });

  it('is keyed by property_id only (ignores other properties / any name)', () => {
    const rows = [row({ propertyId: OTHER, entityId: 'other' }), row({})];
    const r = resolveActiveStrEngagement(PID, rows, AS_OF);
    expect(r.resolved).toBe(true);
    if (r.resolved) expect(r.entityId).toBe(ENT);
  });

  it('unresolved when there is no active engagement (no silent fallback)', () => {
    const r = resolveActiveStrEngagement(PID, [row({ status: 'draft' }), row({ status: 'closed' })], AS_OF);
    expect(r.resolved).toBe(false);
    if (!r.resolved) expect(r.reason).toBe('no_active_engagement');
  });

  it('a historical period that ended before asOfDate does NOT win; the current open period does', () => {
    const rows = [
      row({ entityId: ENT, effectiveFrom: '2025-01-01', effectiveTo: '2025-05-31' }), // ended
      row({ entityId: ENT2, effectiveFrom: '2025-06-01', effectiveTo: null }),         // current
    ];
    const r = resolveActiveStrEngagement(PID, rows, AS_OF);
    expect(r.resolved).toBe(true);
    if (r.resolved) { expect(r.entityId).toBe(ENT2); expect(r.effectiveFrom).toBe('2025-06-01'); }
  });

  it('ignores a future engagement (effective_from after asOfDate)', () => {
    const r = resolveActiveStrEngagement(PID, [row({ effectiveFrom: '2027-01-01', effectiveTo: null })], AS_OF);
    expect(r.resolved).toBe(false);
    if (!r.resolved) expect(r.reason).toBe('no_active_engagement');
  });

  it('an expired engagement with no current one is unresolved', () => {
    const r = resolveActiveStrEngagement(PID, [row({ effectiveFrom: '2024-01-01', effectiveTo: '2025-05-31' })], AS_OF);
    expect(r.resolved).toBe(false);
    if (!r.resolved) expect(r.reason).toBe('no_active_engagement');
  });

  it('two engagements both effective on asOfDate -> ambiguous_overlap (never silently choose)', () => {
    const rows = [
      row({ entityId: ENT, effectiveFrom: '2025-01-01', effectiveTo: null }),
      row({ entityId: ENT2, effectiveFrom: '2026-06-01', effectiveTo: null }),
    ];
    const r = resolveActiveStrEngagement(PID, rows, AS_OF);
    expect(r.resolved).toBe(false);
    if (!r.resolved) expect(r.reason).toBe('ambiguous_overlap');
  });

  it('includes the exact effective_from boundary (from == asOfDate)', () => {
    const r = resolveActiveStrEngagement(PID, [row({ effectiveFrom: AS_OF, effectiveTo: null })], AS_OF);
    expect(r.resolved).toBe(true);
  });

  it('includes the exact effective_to boundary (to == asOfDate; inclusive per JJ lifecycle convention)', () => {
    const r = resolveActiveStrEngagement(PID, [row({ effectiveFrom: '2025-01-01', effectiveTo: AS_OF })], AS_OF);
    expect(r.resolved).toBe(true);
  });
});
