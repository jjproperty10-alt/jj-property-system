/**
 * Regression: PropertyAuditService must read pms.* tables via .schema('pms').
 * Before the fix it queried unqualified public.property_mappings (which does not exist),
 * so every audit returned empty → Reservations tab + STR reconciliation were blank.
 */
import { PropertyAuditService } from '../propertyAuditService';

function makeChain(singleResult: unknown) {
  const chain: Record<string, unknown> = {};
  const passthrough = () => chain;
  for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'or', 'order', 'limit']) chain[m] = passthrough;
  chain.single = () => Promise.resolve(singleResult);
  chain.maybeSingle = () => Promise.resolve(singleResult);
  chain.then = (res: (v: unknown) => void) => res({ data: [], error: null }); // awaited non-single queries
  return chain;
}

describe('PropertyAuditService pms schema routing', () => {
  it("reads property_mappings through .schema('pms'), never unqualified public", async () => {
    const schemaCalls: string[] = [];
    const topLevelFrom: string[] = [];
    const client = {
      schema: (name: string) => {
        schemaCalls.push(name);
        return { from: () => makeChain({ data: null, error: null }) };
      },
      from: (t: string) => {
        topLevelFrom.push(t);
        return makeChain({ data: null, error: null });
      },
      rpc: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
    };

    const svc = new PropertyAuditService(client as never);
    const res = await svc.auditProperty({ jjPropertyName: 'Orit Rob Pingodes', dateFrom: '2026-08-01', dateTo: '2026-08-31' });

    // Mapping resolves to null in this mock → audit reports failure, but the point is the ROUTING:
    expect(schemaCalls).toContain('pms');
    // property_mappings must NOT be queried on the default public schema.
    expect(topLevelFrom).not.toContain('property_mappings');
    expect(res.success).toBe(false); // null mapping, as designed
  });
});
