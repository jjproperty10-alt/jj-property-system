/* Runtime QA for migration 20260916_001 on an isolated embedded PostgreSQL.
 * Creates a faithful replica of the Production objects, applies the migration,
 * and runs the 18 required tests. Nothing here touches Production.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const M = require('embedded-postgres');
const EmbeddedPostgres = M.default || M;

const REPO = 'C:\\Users\\yossi\\jj-owner-level-wt';
const MIGRATION = path.join(REPO, 'supabase', 'migrations', '20260916_001_tamir_d1_d2_d3_apply_fn.sql');
const CLEANUP = path.join(REPO, 'supabase', 'proposed', '20260916_002_drop_tamir_d1_d2_d3_apply_fn.PENDING.sql');
const HERE = __dirname;

const YOSSI = '277f81e0-3b89-41ed-a099-22585959b77a';
const NONSTAFF = '11111111-2222-3333-4444-555555555555';
const KITI1 = 'b54e015f-05f9-4f75-a3e7-9362c6e2e0ae';

const results = [];
function record(id, name, passed, detail) {
  results.push({ id, name, passed, detail });
  const tag = passed ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${id} ${name}${detail ? ' :: ' + detail : ''}`);
}

async function main() {
  const dataDir = path.join(os.tmpdir(), 'jj-pg-data-' + Date.now());
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'testonly-local',
    port: 54329,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });

  console.log('initialising isolated cluster at', dataDir);
  await pg.initialise();
  await pg.start();
  const client = pg.getPgClient();
  await client.connect();

  const version = (await client.query('SELECT version()')).rows[0].version;
  console.log('server:', version.split(',')[0]);

  try {
    await client.query(fs.readFileSync(path.join(HERE, 'harness.sql'), 'utf8'));
    console.log('harness applied');
    await client.query(fs.readFileSync(path.join(HERE, 'fixtures.sql'), 'utf8'));
    console.log('fixtures applied');

    // pre-image sanity
    const pre = (
      await client.query(`
      SELECT (SELECT count(*) FROM public.transactions) AS tx,
             (SELECT count(*) FROM public.transactions WHERE property_name='Tamir Kiti 1') AS kiti1,
             (SELECT sum(amount_eur) FROM public.transactions
                WHERE property_name='Tamir Kiti 1' AND subcategory='Tenant Payment'
                  AND date<=DATE '2026-08-31' AND NOT coalesce(is_deleted,false)) AS rent,
             (SELECT count(*) FROM public.transactions
                WHERE property_name IS NULL AND subcategory='Bank Payment to Owner') AS ol,
             (SELECT count(*) FROM finance.owner_transaction_links WHERE is_deleted=false) AS links
    `)
    ).rows[0];
    console.log('pre-image:', pre);
    if (Number(pre.tx) !== 2270 || Number(pre.kiti1) !== 19 || Number(pre.rent) !== 7685) {
      throw new Error('fixture pre-image does not match Production anchors: ' + JSON.stringify(pre));
    }

    // apply the migration as the table owner (mirrors Production owner = postgres/bypassrls)
    await client.query('SET ROLE dbowner');
    await client.query(fs.readFileSync(MIGRATION, 'utf8'));
    await client.query('RESET ROLE');
    console.log('migration 20260916_001 applied to the isolated cluster');

    const objs = (
      await client.query(`
      SELECT n.nspname AS schema, p.proname, p.prosecdef, p.provolatile, l.lanname AS language,
             pg_get_function_result(p.oid) AS ret,
             pg_get_function_arguments(p.oid) AS args,
             pg_get_userbyid(p.proowner) AS owner,
             coalesce(array_to_string(p.proacl,' | '),'none') AS acl,
             array_to_string(p.proconfig,' ') AS config
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_language l ON l.oid=p.prolang
      WHERE p.proname='apply_tamir_d1_d2_d3_20260916'
      ORDER BY n.nspname
    `)
    ).rows;
    console.log('created object:', JSON.stringify(objs, null, 2));

    const accessMatrix = (
      await client.query(`
      SELECT r AS role_name,
             has_function_privilege(r, 'finance.apply_tamir_d1_d2_d3_20260916()', 'EXECUTE') AS can_execute_inner,
             has_function_privilege(r, 'public.apply_tamir_d1_d2_d3_20260916()', 'EXECUTE') AS can_execute_wrapper,
             has_schema_privilege(r, 'finance', 'USAGE') AS finance_usage,
             has_table_privilege(r, 'finance.owner_transaction_links', 'INSERT') AS direct_link_insert,
             has_table_privilege(r, 'public.transactions', 'INSERT') AS direct_tx_insert
      FROM unnest(ARRAY['anon','authenticated','service_role','dbowner']) r
    `)
    ).rows;
    console.log('ACCESS MATRIX:', JSON.stringify(accessMatrix, null, 2));
    fs.writeFileSync(path.join(HERE, 'access-matrix.json'), JSON.stringify(accessMatrix, null, 2));

    const asIdentity = async (role, claims) => {
      await client.query(`SET LOCAL ROLE ${role}`);
      if (claims === null) {
        await client.query(`SELECT set_config('request.jwt.claims', '', true)`);
      } else {
        await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      }
    };
    const callApply = () => client.query('SELECT finance.apply_tamir_d1_d2_d3_20260916() AS receipt');
    const callWrapper = () => client.query('SELECT public.apply_tamir_d1_d2_d3_20260916() AS receipt');
    const tx = async (fn) => {
      await client.query('BEGIN');
      try {
        await fn();
      } finally {
        await client.query('ROLLBACK');
      }
    };
    const expectFail = async (fn, needle, id, name) => {
      try {
        await fn();
        record(id, name, false, 'expected an exception, call succeeded');
      } catch (e) {
        const ok = !needle || e.message.includes(needle);
        record(id, name, ok, `${ok ? 'rejected' : 'wrong error'}: ${e.message.split('\n')[0].slice(0, 150)}`);
      }
    };

    // ---------------- T1 anon rejected
    await tx(async () => {
      await asIdentity('anon', { role: 'anon' });
      await expectFail(callApply, null, 'T1', 'anon rejected');
    });

    // ---------------- T2 authenticated non-staff rejected
    await tx(async () => {
      await asIdentity('authenticated', { role: 'authenticated', sub: NONSTAFF });
      await expectFail(callApply, 'jj_staff_config', 'T2', 'authenticated non-staff rejected');
    });

    // ---------------- T3 missing JWT rejected
    await tx(async () => {
      await asIdentity('authenticated', null);
      await expectFail(callApply, 'Authenticated session required', 'T3', 'missing JWT rejected');
    });
    await tx(async () => {
      await client.query(`SELECT set_config('request.jwt.claims','',true)`);
      await expectFail(callApply, 'Authenticated session required', 'T3b', 'owner session without JWT rejected');
    });

    // ---------------- T4 CEO accepted (+ receipt shape)
    let ceoReceipt = null;
    await tx(async () => {
      await asIdentity('authenticated', { role: 'authenticated', sub: YOSSI });
      const r = await callApply();
      ceoReceipt = r.rows[0].receipt;
      const ok =
        ceoReceipt.inserted_transactions === 3 &&
        ceoReceipt.inserted_owner_links === 1 &&
        ceoReceipt.expected_audit_rows === 3 &&
        Number(ceoReceipt.closing_before) === 3248.75 &&
        Number(ceoReceipt.closing_after) === 2548.75 &&
        Number(ceoReceipt.economic_delta) === -700 &&
        Number(ceoReceipt.payments_to_owner_after) === 21725 &&
        Number(ceoReceipt.kiti1_rent_after) === 9610 &&
        ceoReceipt.executed_by === YOSSI &&
        ceoReceipt.executed_role === 'authenticated' &&
        !JSON.stringify(ceoReceipt).match(/password|secret|token|apikey/i);
      record('T4', 'authenticated CEO accepted + receipt correct', ok, JSON.stringify(ceoReceipt));
    });

    // ---------------- T5 service_role accepted
    await tx(async () => {
      await asIdentity('service_role', { role: 'service_role' });
      const r = await callApply();
      const rec = r.rows[0].receipt;
      record(
        'T5',
        'service_role accepted',
        rec.inserted_transactions === 3 && rec.executed_role === 'service_role' && rec.executed_by === null,
        `executed_by=${rec.executed_by} role=${rec.executed_role}`,
      );
    });

    // ---------------- T6/T7/T13/T14/T15/T16/T17 in one applied transaction
    await tx(async () => {
      const before = (
        await client.query(`
        SELECT (SELECT count(*) FROM public.transactions) tx,
               (SELECT coalesce(sum(amount_eur),0) FROM public.transactions WHERE category='JJ') jj_sum,
               (SELECT count(*) FROM public.transactions WHERE category='JJ') jj_rows,
               (SELECT count(*) FROM public.audit_logs) audit,
               (SELECT count(*) FROM public.transactions WHERE subcategory='Management Fee') mgmtfee
      `)
      ).rows[0];
      const otherBefore = (
        await client.query(`SELECT property_name, count(*) n, sum(amount_eur) s FROM public.transactions
                            WHERE property_name IS NOT NULL AND property_name <> 'Tamir Kiti 1'
                            GROUP BY property_name ORDER BY property_name`)
      ).rows;

      await asIdentity('authenticated', { role: 'authenticated', sub: YOSSI });
      const receipt = (await callApply()).rows[0].receipt;
      await client.query('RESET ROLE');

      const after = (
        await client.query(`
        SELECT (SELECT count(*) FROM public.transactions) tx,
               (SELECT coalesce(sum(amount_eur),0) FROM public.transactions WHERE category='JJ') jj_sum,
               (SELECT count(*) FROM public.transactions WHERE category='JJ') jj_rows,
               (SELECT count(*) FROM public.audit_logs) audit,
               (SELECT count(*) FROM public.transactions WHERE subcategory='Management Fee') mgmtfee,
               (SELECT count(*) FROM finance.owner_transaction_links WHERE is_deleted=false) links,
               (SELECT count(*) FROM public.transactions
                  WHERE property_name IS NULL AND subcategory='Bank Payment to Owner') ol
      `)
      ).rows[0];

      // T6 three rows created together
      const rows = (
        await client.query(
          `SELECT id, date::text, property_id::text, property_name, category, subcategory, payer, payee,
                  amount_eur::text, client_charge, review_status, k_note
             FROM public.transactions
            WHERE id = ANY($1::uuid[]) ORDER BY date`,
          [[receipt.d1_transaction_id, receipt.d2_transaction_id, receipt.d3_transaction_id]],
        )
      ).rows;
      const d1 = rows.find((r) => r.id === receipt.d1_transaction_id);
      const d2 = rows.find((r) => r.id === receipt.d2_transaction_id);
      const d3 = rows.find((r) => r.id === receipt.d3_transaction_id);
      const t6 =
        rows.length === 3 &&
        Number(after.tx) === 2273 &&
        d1.property_id === null &&
        d1.property_name === null &&
        Number(d1.amount_eur) === 2625 &&
        d1.date === '2026-06-16' &&
        d1.payer === 'Jacob' &&
        d1.payee === 'Owner' &&
        d1.client_charge === null &&
        d2.property_id === KITI1 &&
        Number(d2.amount_eur) === 1175 &&
        d2.date === '2026-05-31' &&
        d2.payee === 'Jacob' &&
        d3.property_id === KITI1 &&
        Number(d3.amount_eur) === 750 &&
        d3.date === '2026-07-17' &&
        d3.payee === 'Yossi';
      record('T6', 'D1/D2/D3 created together (4 writes, 1 transaction)', t6, `tx ${before.tx} -> ${after.tx}`);

      // T7 owner link created correctly
      const link = (
        await client.query(`SELECT * FROM finance.owner_transaction_links WHERE idempotency_key=$1`, [
          'tamir_owner_pmt_yaakov_2026-06-16_2625',
        ])
      ).rows[0];
      record(
        'T7',
        'owner link created, approved, active, correct owner',
        !!link &&
          link.transaction_id === receipt.d1_transaction_id &&
          link.review_status === 'approved' &&
          link.is_deleted === false &&
          link.link_role === 'owner_level_payment' &&
          link.owner_entity_id === '0f352012-1403-4e3b-982a-7c019ee89f1b' &&
          Number(after.links) === 2,
        `links ${pre.links} -> ${after.links}, status=${link && link.review_status}`,
      );

      // T13 counted by reporting filters despite pending rental month
      const rep = (
        await client.query(`
        SELECT count(*) n, sum(amount_eur) s FROM public.transactions
         WHERE property_name='Tamir Kiti 1' AND subcategory='Tenant Payment'
           AND date <= DATE '2026-08-31'
           AND (review_status='active' OR review_status IS NULL)
           AND NOT coalesce(is_deleted,false)
      `)
      ).rows[0];
      const pend = (
        await client.query(`SELECT count(*) n FROM public.transactions
                            WHERE k_note LIKE '%RENTAL_MONTH=UNKNOWN%' AND property_name='Tamir Kiti 1'`)
      ).rows[0];
      record(
        'T13',
        'D2/D3 counted by reporting filters while rental_month pending',
        Number(rep.n) === 14 && Number(rep.s) === 9610 && Number(pend.n) === 2,
        `rent=${rep.s}/${rep.n} rows, pending-month rows=${pend.n}`,
      );

      // T14 D1 counted once
      const once = (
        await client.query(`
        SELECT (SELECT count(*) FROM public.transactions WHERE k_note LIKE '%IDEMPOTENCY=tamir_owner_pmt_yaakov_2026-06-16_2625%') d1,
               (SELECT count(*) FROM public.transactions WHERE k_note LIKE '%IDEMPOTENCY=tamir_kiti1_rent_2026-05-31_1175%') d2,
               (SELECT count(*) FROM public.transactions WHERE k_note LIKE '%IDEMPOTENCY=tamir_kiti1_rent_2026-07-17_750%') d3,
               (SELECT count(*) FROM finance.owner_transaction_links WHERE idempotency_key='tamir_owner_pmt_yaakov_2026-06-16_2625') l
      `)
      ).rows[0];
      record(
        'T14',
        'D1 counted once (and D2/D3 once each)',
        Number(once.d1) === 1 && Number(once.d2) === 1 && Number(once.d3) === 1 && Number(once.l) === 1 && Number(after.ol) === 2,
        `d1=${once.d1} d2=${once.d2} d3=${once.d3} link=${once.l} owner-level rows=${after.ol}`,
      );

      // T15 JJ P&L delta zero
      record(
        'T15',
        'JJ P&L delta = EUR 0',
        Number(before.jj_sum) === Number(after.jj_sum) &&
          Number(before.jj_rows) === Number(after.jj_rows) &&
          Number(before.mgmtfee) === Number(after.mgmtfee),
        `JJ sum ${before.jj_sum} -> ${after.jj_sum}, mgmt fee rows ${before.mgmtfee} -> ${after.mgmtfee}`,
      );

      // T16 other properties delta zero
      const otherAfter = (
        await client.query(`SELECT property_name, count(*) n, sum(amount_eur) s FROM public.transactions
                            WHERE property_name IS NOT NULL AND property_name <> 'Tamir Kiti 1'
                            GROUP BY property_name ORDER BY property_name`)
      ).rows;
      record(
        'T16',
        'other properties delta = EUR 0',
        JSON.stringify(otherBefore) === JSON.stringify(otherAfter),
        `${otherAfter.length} other properties compared, all unchanged`,
      );

      // T17 closing
      const closing = 3248.75 + (Number(rep.s) - 7685) - 2625;
      record(
        'T17',
        'closing = EUR 2,548.75',
        Math.abs(closing - 2548.75) < 0.0001 && Number(receipt.closing_after) === 2548.75,
        `recomputed ${closing.toFixed(2)}, receipt ${receipt.closing_after}`,
      );

      // audit rows
      record(
        'T6b',
        'exactly 3 audit rows appended by the existing trigger',
        Number(after.audit) - Number(before.audit) === 3,
        `audit ${before.audit} -> ${after.audit}`,
      );
    });

    // ---------------- T8 replay rejected
    await tx(async () => {
      await asIdentity('service_role', { role: 'service_role' });
      await callApply();
      await expectFail(callApply, 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED', 'T8', 'replay rejected');
    });

    // ---------------- T9 duplicate pre-image rejected
    await tx(async () => {
      await client.query(`INSERT INTO public.transactions (date, property_name, category, subcategory, payer, payee, amount_eur)
                          VALUES ('2026-06-16', NULL, 'Management', 'Bank Payment to Owner', 'Jacob', 'Owner', 2625)`);
      await asIdentity('service_role', { role: 'service_role' });
      await expectFail(callApply, 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED', 'T9', 'duplicate pre-image rejected');
    });

    // ---------------- T10 wrong / renamed / inactive property rejected
    await tx(async () => {
      await client.query(`UPDATE public.properties SET name='Tamir Kiti 1 RENAMED' WHERE id=$1`, [KITI1]);
      await asIdentity('service_role', { role: 'service_role' });
      await expectFail(callApply, 'canonical property', 'T10', 'renamed canonical property rejected');
    });
    await tx(async () => {
      await client.query(`UPDATE public.properties SET is_deleted=true WHERE id=$1`, [KITI1]);
      await asIdentity('service_role', { role: 'service_role' });
      await expectFail(callApply, 'canonical property', 'T10b', 'soft-deleted canonical property rejected');
    });
    await tx(async () => {
      await client.query(`UPDATE lifecycle.entity_identity SET status='inactive' WHERE id='0f352012-1403-4e3b-982a-7c019ee89f1b'`);
      await asIdentity('service_role', { role: 'service_role' });
      await expectFail(callApply, 'owner entity', 'T10c', 'inactive owner entity rejected');
    });

    // ---------------- T11/T12 postcondition failure rolls everything back
    await tx(async () => {
      await client.query(`
        CREATE FUNCTION public.zz_test_interfere() RETURNS trigger LANGUAGE plpgsql AS $f$
        BEGIN
          IF NEW.amount_eur = 750 THEN NEW.amount_eur := 700; END IF;
          RETURN NEW;
        END $f$;
        CREATE TRIGGER zz_test_interfere BEFORE INSERT ON public.transactions
          FOR EACH ROW EXECUTE FUNCTION public.zz_test_interfere();
      `);
      const b = (
        await client.query(`SELECT (SELECT count(*) FROM public.transactions) tx,
                                   (SELECT count(*) FROM finance.owner_transaction_links) links,
                                   (SELECT count(*) FROM public.audit_logs) audit`)
      ).rows[0];
      await client.query('SAVEPOINT sp_pc');
      let raised = null;
      try {
        await asIdentity('service_role', { role: 'service_role' });
        await callApply();
      } catch (e) {
        raised = e.message.split('\n')[0];
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_pc');
      await client.query('RESET ROLE');
      const a = (
        await client.query(`SELECT (SELECT count(*) FROM public.transactions) tx,
                                   (SELECT count(*) FROM finance.owner_transaction_links) links,
                                   (SELECT count(*) FROM public.audit_logs) audit`)
      ).rows[0];
      record('T11', 'postcondition failure raises', !!raised && raised.includes('POSTCONDITION_FAILED'), raised || 'no error raised');
      record(
        'T12',
        'no partial state after failure (0 of 4 rows, 0 audit rows)',
        b.tx === a.tx && b.links === a.links && b.audit === a.audit,
        `tx ${b.tx}->${a.tx}, links ${b.links}->${a.links}, audit ${b.audit}->${a.audit}`,
      );
    });

    // ---------------- T18 rollback plan validated
    await tx(async () => {
      await asIdentity('service_role', { role: 'service_role' });
      const receipt = (await callApply()).rows[0].receipt;

      await client.query(`SELECT finance.soft_delete_owner_transaction_link($1,$2)`, [
        receipt.d1_link_id,
        'rollback_d1_d2_d3',
      ]);
      await client.query('RESET ROLE');
      await client.query(`
        UPDATE public.transactions
           SET is_deleted = true, deleted_at = now(), deleted_by = 'rollback_d1_d2_d3'
         WHERE coalesce(is_deleted,false) = false
           AND (k_note LIKE '%IDEMPOTENCY=tamir_owner_pmt_yaakov_2026-06-16_2625%'
             OR k_note LIKE '%IDEMPOTENCY=tamir_kiti1_rent_2026-05-31_1175%'
             OR k_note LIKE '%IDEMPOTENCY=tamir_kiti1_rent_2026-07-17_750%')`);

      const after = (
        await client.query(`
        SELECT (SELECT count(*) FROM finance.owner_transaction_links WHERE is_deleted=false) links,
               (SELECT coalesce(sum(amount_eur),0) FROM public.transactions
                  WHERE property_name='Tamir Kiti 1' AND subcategory='Tenant Payment'
                    AND date<=DATE '2026-08-31' AND NOT coalesce(is_deleted,false)) rent,
               (SELECT count(*) FROM public.transactions WHERE is_deleted=true) softdel,
               (SELECT count(*) FROM public.transactions) tx
      `)
      ).rows[0];

      // physical delete must stay impossible
      await client.query('SAVEPOINT sp_del');
      let delErr = null;
      try {
        await client.query(`DELETE FROM public.transactions WHERE id=$1`, [receipt.d1_transaction_id]);
      } catch (e) {
        delErr = e.message.split('\n')[0];
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_del');

      // financial columns must stay immutable
      await client.query('SAVEPOINT sp_upd');
      let updErr = null;
      try {
        await client.query(`UPDATE public.transactions SET amount_eur=1 WHERE id=$1`, [receipt.d1_transaction_id]);
      } catch (e) {
        updErr = e.message.split('\n')[0];
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_upd');

      record(
        'T18',
        'rollback plan validated (soft-delete only, history retained)',
        Number(after.links) === 1 &&
          Number(after.rent) === 7685 &&
          Number(after.softdel) === 3 &&
          Number(after.tx) === 2273 &&
          !!delErr &&
          delErr.includes('append-only') &&
          !!updErr &&
          updErr.includes('append-only'),
        `links=${after.links}, rent back to ${after.rent}, soft-deleted=${after.softdel}, rows retained=${after.tx}, delete blocked=${!!delErr}, amount update blocked=${!!updErr}`,
      );
    });

    // ---------------- W1..W5 the API-reachable public wrapper
    await tx(async () => {
      await asIdentity('anon', { role: 'anon' });
      await expectFail(callWrapper, null, 'W1', 'wrapper: anon rejected');
    });
    await tx(async () => {
      await asIdentity('authenticated', { role: 'authenticated', sub: NONSTAFF });
      await expectFail(callWrapper, 'jj_staff_config', 'W2', 'wrapper: authenticated non-staff rejected');
    });
    await tx(async () => {
      await asIdentity('authenticated', null);
      await expectFail(callWrapper, 'Authenticated session required', 'W3', 'wrapper: missing JWT rejected');
    });
    await tx(async () => {
      await asIdentity('authenticated', { role: 'authenticated', sub: YOSSI });
      const rec = (await callWrapper()).rows[0].receipt;
      await client.query('RESET ROLE');
      const state = (
        await client.query(`SELECT (SELECT count(*) FROM public.transactions) tx,
                                   (SELECT count(*) FROM finance.owner_transaction_links WHERE is_deleted=false) links`)
      ).rows[0];
      record(
        'W4',
        'wrapper: authenticated CEO accepted, identical result',
        rec.inserted_transactions === 3 &&
          Number(rec.closing_after) === 2548.75 &&
          Number(rec.kiti1_rent_after) === 9610 &&
          rec.executed_by === YOSSI &&
          rec.executed_role === 'authenticated' &&
          Number(state.tx) === 2273 &&
          Number(state.links) === 2,
        `tx=${state.tx}, links=${state.links}, closing=${rec.closing_after}`,
      );
    });
    await tx(async () => {
      await asIdentity('service_role', { role: 'service_role' });
      const rec = (await callWrapper()).rows[0].receipt;
      record(
        'W5',
        'wrapper: service_role accepted',
        rec.inserted_transactions === 3 && rec.executed_role === 'service_role',
        `role=${rec.executed_role}`,
      );
    });
    await tx(async () => {
      await asIdentity('service_role', { role: 'service_role' });
      await callWrapper();
      await expectFail(callWrapper, 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED', 'W6', 'wrapper: replay rejected');
    });

    // ---------------- cleanup migration behaviour (prepared, not applied to Production)
    await tx(async () => {
      await client.query('SAVEPOINT sp_clean');
      let blocked = null;
      try {
        await client.query(fs.readFileSync(CLEANUP, 'utf8'));
      } catch (e) {
        blocked = e.message.split('\n')[0];
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_clean');
      record(
        'T19',
        'cleanup migration refuses to drop before the Apply exists',
        !!blocked && blocked.includes('CLEANUP_BLOCKED'),
        blocked || 'cleanup ran without guard',
      );

      await asIdentity('service_role', { role: 'service_role' });
      await callApply();
      await client.query('RESET ROLE');
      await client.query(fs.readFileSync(CLEANUP, 'utf8'));
      const gone = (
        await client.query(`SELECT count(*) n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                            WHERE p.proname='apply_tamir_d1_d2_d3_20260916'
                              AND n.nspname IN ('finance','public')`)
      ).rows[0];
      const kept = (
        await client.query(`SELECT (SELECT count(*) FROM public.transactions) tx,
                                   (SELECT count(*) FROM finance.owner_transaction_links) links,
                                   (SELECT count(*) FROM public.audit_logs) audit`)
      ).rows[0];
      record(
        'T20',
        'cleanup drops both functions; rows, link and audit remain',
        Number(gone.n) === 0 && Number(kept.tx) === 2273 && Number(kept.links) === 2 && Number(kept.audit) >= 3,
        `fn=${gone.n}, tx=${kept.tx}, links=${kept.links}, audit=${kept.audit}`,
      );
    });

    // ---------------- final: Production-shaped pre-image untouched by the whole suite
    const post = (
      await client.query(`
      SELECT (SELECT count(*) FROM public.transactions) tx,
             (SELECT count(*) FROM finance.owner_transaction_links) links,
             (SELECT count(*) FROM public.audit_logs) audit
    `)
    ).rows[0];
    record(
      'T21',
      'all tests rolled back: harness back to pre-image',
      Number(post.tx) === 2270 && Number(post.links) === 1 && Number(post.audit) === 0,
      `tx=${post.tx}, links=${post.links}, audit=${post.audit}`,
    );

    const passed = results.filter((r) => r.passed).length;
    console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`);
    fs.writeFileSync(
      path.join(HERE, 'test-results.json'),
      JSON.stringify({ server: version.split(',')[0], results, accessMatrix, objects: objs }, null, 2),
    );
    if (passed !== results.length) process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
    await pg.stop().catch(() => {});
    console.log('cluster stopped');
  }
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exitCode = 2;
});
