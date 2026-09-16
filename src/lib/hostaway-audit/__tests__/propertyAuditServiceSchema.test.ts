/**
 * Regression: PropertyAuditService must read pms.* through public SECURITY DEFINER RPCs
 * (pms is NOT exposed to PostgREST and service_role has no grants on it). Before this fix it
 * queried pms tables directly, which silently returned empty → blank Reservations + STR screens.
 */
import { PropertyAuditService } from '../propertyAuditService';

describe('PropertyAuditService pms access via RPC', () => {
  it('resolves the mapping through pms_resolve_mapping RPC, never a direct pms table read', async () => {
    const rpcCalls: string[] = [];
    const fromCalls: string[] = [];
    const schemaCalls: string[] = [];
    const client = {
      rpc: (name: string) => {
        rpcCalls.push(name);
        // Return an awaitable that resolves to an empty result (mapping not found).
        return Promise.resolve({ data: [], error: null });
      },
      from: (t: string) => { fromCalls.push(t); throw new Error('direct .from should not be used for pms in the audit path'); },
      schema: (n: string) => { schemaCalls.push(n); return { from: () => { throw new Error('pms schema not exposed'); } }; },
    };

    const svc = new PropertyAuditService(client as never);
    const res = await svc.auditProperty({ jjPropertyName: 'Orit Rob Pingodes', dateFrom: '2026-08-01', dateTo: '2026-08-31' });

    expect(rpcCalls).toContain('pms_resolve_mapping');
    expect(schemaCalls).not.toContain('pms'); // no direct pms schema access on the live path
    expect(res.success).toBe(false); // empty mapping → audit reports failure, as designed
  });

  it('keeps Hostaway reservations when the certified ledger cannot be loaded', async () => {
    const client = {
      rpc: (name: string) => {
        if (name === 'pms_resolve_mapping') {
          return Promise.resolve({
            data: [{
              external_id: 'h1',
              jj_property_name: 'Orit Rob Pingodes',
              status: 'approved',
              confidence_label: 'high',
              property_id: '11111111-1111-1111-1111-111111111111',
              hostaway_name: 'Orit',
              hostaway_internal_name: null,
            }],
            error: null,
          });
        }
        if (name === 'pms_reservations_for_property') {
          return Promise.resolve({
            data: [{
              external_id: 'r1',
              external_property_id: 'h1',
              channel: 'airbnb',
              channel_raw: 'airbnb',
              status: 'confirmed',
              guest_name: 'Guest A',
              check_in: '2026-08-02',
              check_out: '2026-08-16',
              nights: 14,
              guests: 2,
              currency_code: 'EUR',
              total_price: 1026,
              cleaning_fee: 60,
              raw: { totalPrice: '1026', cleaningFee: '60' },
            }],
            error: null,
          });
        }
        return Promise.resolve({ data: [], error: null });
      },
      from: () => {
        const q: Record<string, unknown> = {};
        const self = () => q;
        q.select = self;
        q.in = self;
        q.eq = self;
        q.gte = self;
        q.lte = self;
        q.then = (resolve: (v: { data: null; error: { message: string } }) => void) =>
          Promise.resolve({ data: null, error: { message: 'relation missing' } }).then(resolve);
        return q;
      },
      schema: () => ({ from: () => { throw new Error('pms schema not exposed'); } }),
    };

    const svc = new PropertyAuditService(client as never);
    const res = await svc.auditProperty({ jjPropertyName: 'Orit Rob Pingodes', dateFrom: '2026-08-01', dateTo: '2026-08-31' });

    expect(res.success).toBe(true);
    expect(res.audit).not.toBeNull();
    expect(res.audit?.reservations.length).toBe(1);
    expect(res.audit?.limitations.notes.join(' ')).toMatch(/Certified JJ ledger was unavailable/);
  });
});
