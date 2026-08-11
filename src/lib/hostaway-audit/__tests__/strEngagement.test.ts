/**
 * P2 — STR service-engagement resolution. Identity is property_id; never name.
 */
import { resolveActiveStrEngagement } from '../strEngagement';
import type { StrEngagementRow } from '../strEngagement';

const PID = '47f53dde-9882-4f7c-ba49-3effeb937848';
const OTHER = '20d9571e-6bf7-4307-ba4b-59ae5eb21241';
const ENT = '0f352012-1403-4e3b-982a-7c019ee89f1b';

const row = (o: Partial<StrEngagementRow>): StrEngagementRow => ({
  propertyId: PID, entityId: ENT, serviceType: 'airbnb_str', status: 'active',
  effectiveFrom: '2025-07-24', effectiveTo: null, ...o,
});

describe('resolveActiveStrEngagement (P2)', () => {
  it('resolves the single active airbnb_str engagement by property_id', () => {
    const r = resolveActiveStrEngagement(PID, [row({})]);
    expect(r.resolved).toBe(true);
    if (r.resolved) { expect(r.entityId).toBe(ENT); expect(r.effectiveFrom).toBe('2025-07-24'); }
  });

  it('resolution is keyed by property_id only (ignores rows for other properties / any name)', () => {
    const rows = [row({ propertyId: OTHER, entityId: 'other' }), row({})];
    const r = resolveActiveStrEngagement(PID, rows);
    expect(r.resolved).toBe(true);
    if (r.resolved) expect(r.entityId).toBe(ENT);
  });

  it('unresolved when there is no active engagement (no silent fallback)', () => {
    const r = resolveActiveStrEngagement(PID, [row({ status: 'draft' }), row({ status: 'closed' })]);
    expect(r.resolved).toBe(false);
    if (!r.resolved) expect(r.reason).toBe('no_active_engagement');
  });

  it('flags overlapping active engagements as ambiguous (never silently picks one)', () => {
    const rows = [row({ effectiveFrom: '2025-01-01', effectiveTo: null }),
                  row({ effectiveFrom: '2025-06-01', effectiveTo: null })];
    const r = resolveActiveStrEngagement(PID, rows);
    expect(r.resolved).toBe(false);
    if (!r.resolved) expect(r.reason).toBe('ambiguous_overlap');
  });

  it('resolves non-overlapping active engagements to the earliest', () => {
    const rows = [row({ effectiveFrom: '2025-01-01', effectiveTo: '2025-05-31' }),
                  row({ effectiveFrom: '2025-06-01', effectiveTo: null })];
    const r = resolveActiveStrEngagement(PID, rows);
    expect(r.resolved).toBe(true);
    if (r.resolved) expect(r.effectiveFrom).toBe('2025-01-01');
  });
});
