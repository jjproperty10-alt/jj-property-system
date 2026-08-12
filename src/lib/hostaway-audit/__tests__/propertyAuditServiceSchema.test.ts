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
});
