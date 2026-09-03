import { Client } from 'pg';
import { fetchOwnerFinancial } from '@/lib/owners/ownerFinancialAdapter';
import { acctMap, changes, vmSectionId, present, find, Change } from './t38.accounting';

const FX = process.env.T38_FIXTURE!;
const P = ['Villa Mazotos'];
const D = 18.21;
const near = (x: number, y: number) => Math.abs(x - y) <= 0.001;

async function pgAs<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
  await c.query(`SELECT set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, false)`, [process.env.T38_STAFF_UID]);
  try { return await fn(c); } finally { await c.end(); }
}
async function applyFixtureViaRpc() {
  return pgAs(async c => {
    const tx = (await c.query(`SELECT tx_id FROM regtest.fixture_tx WHERE fixture=$1`, [FX])).rows[0].tx_id;
    const prop = FX === 'reclass' ? null : 'Villa Mazotos';
    const b = (await c.query(`SELECT statements.open_review_batch($1,$2,NULL,NULL,'t38') id`, [`t38-${FX}`, prop])).rows[0].id;
    const q = FX==='amount'  ? [`SELECT statements.open_register_correction_case($1,'amount_correction','t38',$2,'normal','{}'::jsonb,200.00,false,NULL) id`, [tx,b]]
            : FX==='reclass' ? [`SELECT statements.open_register_correction_case($1,'reclassification','t38',$2,'normal','{"payer":"Jacob"}'::jsonb,NULL,false,NULL) id`, [tx,b]]
            :                  [`SELECT statements.open_register_correction_case($1,'amount_correction','t38',$2,'normal','{}'::jsonb,NULL,true,NULL) id`, [tx,b]];
    const cid = (await c.query(q[0] as string, q[1] as any[])).rows[0].id;
    await c.query(`SELECT statements.transition_register_correction_case($1,'under_review')`, [cid]);
    await c.query(`SELECT statements.transition_register_correction_case($1,'approved')`, [cid]);
    const res = (await c.query(`SELECT statements.apply_register_correction_case($1) r`, [cid])).rows[0].r;
    await c.query(`INSERT INTO regtest.evidence VALUES ($1,$2,$3,$4)`, [FX, cid, res.reversal_transaction_id, res.forward_transaction_id]);
    return res;
  });
}

test(`t38 ${process.env.T38_FIXTURE}: OwnerFinancialDTO contract`, async () => {
  const before = acctMap(await fetchOwnerFinancial({ properties: P }));
  expect(changes(before, acctMap(await fetchOwnerFinancial({ properties: P })))).toEqual([]);   // determinism
  const vm = vmSectionId(before);                                                                 // DISCOVERED, not guessed
  const secExp = `$.sections[${vm}].expensesEur`, secNet = `$.sections[${vm}].netEur`, secClose = `$.sections[${vm}].closingBalanceEur`;

  await applyFixtureViaRpc();
  const ch = changes(before, acctMap(await fetchOwnerFinancial({ properties: P })));

  if (FX === 'amount') {
    // EXACT allowed-path contract built from the baseline - NO startsWith() subtree allowlist [FIX #2].
    // Each allowed path carries a pinned expectation: a fixed signed delta, or (only where the field's
    // direction is genuinely convention-dependent) |D|=D. Every path is listed BY NAME.
    if (!present(before, secExp)) throw new Error('[t38] VM section has no expensesEur baseline');
    // expect: path -> { d } fixed signed delta, or {} meaning "|D|=D, sign convention-dependent"
    const expect = new Map<string, { d?: number }>();
    expect.set(secExp, { d: D });                                            // primary, +D
    for (const [p, d] of [[secNet, -D], ['$.position.expensesEur', D], ['$.position.netEur', -D], ['$.position.closingBalanceEur', -D]] as [string, number][])
      if (present(before, p)) expect.set(p, { d });                          // invariants, exact sign, where computed
    for (const p of [secClose, '$.overallNet.netEur'])                       // closing/overall: |D|=D where populated
      if (present(before, p)) expect.set(p, {});
    const secOwnerDir = `$.sections[${vm}].ownerDirectionAmountEur`;
    for (const [p, d] of [
      [secOwnerDir, D],
      ['$.overallNet.displayAmountEur', D],
      ['$.overallNet.departments[rental].closingBalanceEur', -D],
      ['$.overallNet.departments[rental].normalizedEur', -D],
      ['$.overallNet.departments[rental].displayAmountEur', D],
    ] as [string, number][])
      if (present(before, p)) expect.set(p, { d });
    const ALLOWED = new Set(expect.keys());

    // (a) every CHANGED path must be explicitly allowed and match its pinned expectation
    for (const c of ch) {
      if (!ALLOWED.has(c.path))
        throw new Error(`[t38] unexpected changed path: ${c.path} - if this is a legitimate engine roll-up, add it to ALLOWED with its expected sign (do NOT widen with startsWith)`);
      if (c.kind !== 'delta') throw new Error(`[t38] ${c.path} unexpected ${c.kind} (amount correction only shifts values)`);
      const e = expect.get(c.path)!;
      if (e.d !== undefined) { if (c.delta !== e.d) throw new Error(`[t38] ${c.path} expected delta ${e.d}, got ${c.delta}`); }
      else if (!near(Math.abs(c.delta), D)) throw new Error(`[t38] ${c.path} expected |D|=${D}, got ${c.delta}`);
    }
    // (b) COMPLETENESS: every allowed path must actually have changed (none silently missing)
    for (const p of Array.from(ALLOWED)) if (!find(ch, p)) throw new Error(`[t38] required path ${p} did not change`);
  } else if (FX === 'reclass') {
    expect(ch).toEqual([]);                                              // payer move is P&L-neutral  DTO unchanged
  } else {
    // cc: seed has client_charge === amount_eur (1005.04). Clearing charge leaves
    // COALESCE(client_charge, amount_eur) unchanged (P-LEDGER-6), so the owner-facing
    // DTO cannot show the clear: rows have no clientChargeEur, and marginEur is null
    // both before and after (margin only when charge differs from cost). Ledger clear
    // is asserted by t38_assert_cc.sql, not by OwnerFinancialDTO.
    expect(ch).toEqual([]);
  }
}, 120_000);
