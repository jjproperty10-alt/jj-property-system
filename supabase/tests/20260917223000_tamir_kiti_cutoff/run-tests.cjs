/* Runtime QA for migration 20260917223000 (Tamir Kiti cutoff pack, 5 events + owner link),
 * applied on top of the currently deployed 20260916_001 pair, against an isolated embedded
 * PostgreSQL replica of the Production objects. Nothing here touches Production.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const M = require('embedded-postgres');
const EmbeddedPostgres = M.default || M;

const HERE = __dirname;
// supabase/tests/<suite> -> repo root
const REPO = process.env.JJ_REPO_ROOT || path.resolve(HERE, '..', '..', '..');
// The pair currently deployed in Production. This suite applies it first, so the
// tests prove the new migration removes it as well as what it creates.
const OLD_MIGRATION = path.join(REPO, 'supabase', 'migrations', '20260916_001_tamir_d1_d2_d3_apply_fn.sql');
const NEW_MIGRATION = path.join(REPO, 'supabase', 'migrations', '20260917223000_tamir_kiti_cutoff_correction_apply_fn.sql');
// QA artefacts are run output, not source: they stay outside the tree unless asked for.
const OUT = process.env.JJ_QA_OUT || os.tmpdir();

const YOSSI = '277f81e0-3b89-41ed-a099-22585959b77a';
const NONSTAFF = '11111111-2222-3333-4444-555555555555';
const KITI1 = 'b54e015f-05f9-4f75-a3e7-9362c6e2e0ae';
const KITI2 = '4dc5c26c-ce0c-49ec-8f44-a525f68f0b8a';
const OWNER = '0f352012-1403-4e3b-982a-7c019ee89f1b';
const OLD_FN = 'apply_tamir_d1_d2_d3_20260916';
const NEW_FN = 'apply_tamir_kiti_cutoff_20260831';

const KEYS = {
  e1: 'tamir_owner_pmt_yaakov_2026-06-16_2625',
  e2: 'tamir_kiti1_rent_2026-05-19_1175',
  e3: 'tamir_kiti1_rent_2026-07-07_750',
  e4: 'tamir_kiti2_rent_2026-07-17_800',
  e5: 'tamir_kiti2_plumbing_2026-07-17_85',
};

const results = [];
function record(id, name, passed, detail) {
  results.push({ id, name, passed, detail });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${id} ${name}${detail ? ' :: ' + detail : ''}`);
}

async function main() {
  const dataDir = path.join(os.tmpdir(), 'jj-pg-data-' + Date.now());
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'testonly-local',
    port: 54337,
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

  const fnRows = async (name) =>
    (
      await client.query(
        `SELECT n.nspname AS schema, p.proname AS name, p.prosecdef,
                pg_get_userbyid(p.proowner) AS owner,
                coalesce(array_to_string(p.proacl, ' | '), 'default') AS acl,
                coalesce(array_to_string(p.proconfig, ' '), 'none') AS config,
                l.lanname AS language,
                encode(sha256(convert_to(pg_get_functiondef(p.oid), 'UTF8')), 'hex') AS body_sha256
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           JOIN pg_language l ON l.oid = p.prolang
          WHERE p.proname = $1 ORDER BY n.nspname`,
        [name],
      )
    ).rows;

  const snapshot = async () =>
    (
      await client.query(`
      SELECT (SELECT count(*) FROM public.transactions) AS tx,
             (SELECT count(*) FROM public.audit_logs) AS audit,
             (SELECT count(*) FROM finance.owner_transaction_links WHERE is_deleted=false) AS links,
             (SELECT coalesce(sum(amount_eur),0) FROM public.transactions
                WHERE property_name='Tamir Kiti 1' AND subcategory='Tenant Payment'
                  AND date<=DATE '2026-08-31' AND NOT coalesce(is_deleted,false)) AS k1_rent,
             (SELECT count(*) FROM public.transactions
                WHERE property_name='Tamir Kiti 1' AND subcategory='Tenant Payment'
                  AND date<=DATE '2026-08-31' AND NOT coalesce(is_deleted,false)) AS k1_rows,
             (SELECT coalesce(sum(amount_eur),0) FROM public.transactions
                WHERE property_name='Tamir Kiti 2' AND subcategory='Tenant Payment'
                  AND date<=DATE '2026-08-31' AND NOT coalesce(is_deleted,false)) AS k2_rent,
             (SELECT count(*) FROM public.transactions
                WHERE property_name='Tamir Kiti 2' AND subcategory='Tenant Payment'
                  AND date<=DATE '2026-08-31' AND NOT coalesce(is_deleted,false)) AS k2_rows,
             (SELECT coalesce(sum(amount_eur),0) FROM public.transactions WHERE category='JJ') AS jj_sum,
             (SELECT count(*) FROM public.transactions WHERE category='JJ') AS jj_rows,
             (SELECT count(*) FROM public.transactions WHERE subcategory='Management Fee') AS mgmtfee,
             (SELECT count(*) FROM public.transactions WHERE subcategory IN ('Deposit','Deposit refund')) AS dep_rows,
             (SELECT coalesce(sum(amount_eur),0) FROM public.transactions
                WHERE subcategory IN ('Deposit','Deposit refund')) AS dep_sum,
             (SELECT count(*) FROM public.transactions
                WHERE property_name IN ('Tamir Kiti 1','Tamir Kiti 2') AND date > DATE '2026-08-31') AS post_rows,
             (SELECT count(*) FROM public.transactions
                WHERE property_name IS NULL AND subcategory='Bank Payment to Owner') AS ol_rows,
             (SELECT coalesce(sum(amount_eur),0) FROM public.transactions
                WHERE property_name='Tamir Kiti 2' AND subcategory='Plumber') AS plumb_sum,
             (SELECT count(*) FROM public.transactions
                WHERE property_name='Tamir Kiti 2' AND subcategory='Tenant Payment'
                  AND property_id IS NULL AND NOT coalesce(is_deleted,false)) AS k2_hist_null_active,
             (SELECT count(*) FROM public.transactions
                WHERE property_name='Tamir Kiti 2' AND subcategory='Tenant Payment'
                  AND property_id IS NULL) AS k2_hist_null_all,
             (SELECT count(*) FROM public.transactions
                WHERE property_name='Tamir Kiti 1' AND subcategory='Tenant Payment'
                  AND property_id IS NULL AND NOT coalesce(is_deleted,false)) AS k1_hist_null_active
    `)
    ).rows[0];

  const otherProps = async () =>
    (
      await client.query(`SELECT property_name, count(*) n, sum(amount_eur) s FROM public.transactions
                          WHERE property_name IS NOT NULL
                            AND property_name NOT IN ('Tamir Kiti 1','Tamir Kiti 2')
                          GROUP BY property_name ORDER BY property_name`)
    ).rows;

  try {
    await client.query(fs.readFileSync(path.join(HERE, 'harness.sql'), 'utf8'));
    await client.query(fs.readFileSync(path.join(HERE, 'fixtures.sql'), 'utf8'));
    console.log('harness + fixtures applied');

    const pre = await snapshot();
    console.log('pre-image:', pre);
    record(
      'F0',
      'fixture matches the fresh Production anchors (Kiti 1 EUR 7,685/12, Kiti 2 EUR 11,716.86/14, links 1)',
      Number(pre.k1_rent) === 7685 && Number(pre.k1_rows) === 12 &&
        Number(pre.k2_rent) === 11716.86 && Number(pre.k2_rows) === 14 &&
        Number(pre.links) === 1 && Number(pre.ol_rows) === 1 && Number(pre.plumb_sum) === 0,
      `k1=${pre.k1_rent}/${pre.k1_rows}, k2=${pre.k2_rent}/${pre.k2_rows}, tx=${pre.tx} (context only)`,
    );
    record(
      'F1',
      'fixture reproduces the Production soft-delete shape: 16 Kiti 2 rent rows with NULL property_id, 14 of them active',
      Number(pre.k2_hist_null_active) === 14 && Number(pre.k2_hist_null_all) === 16 &&
        Number(pre.k1_hist_null_active) === 12,
      `Kiti 2 active=${pre.k2_hist_null_active} of ${pre.k2_hist_null_all}; Kiti 1 active=${pre.k1_hist_null_active}`,
    );

    // ---- deploy the state Production is in today, then apply the new pack ----
    await client.query('SET ROLE dbowner');
    await client.query(fs.readFileSync(OLD_MIGRATION, 'utf8'));
    const oldPairBefore = await fnRows(OLD_FN);
    await client.query(fs.readFileSync(NEW_MIGRATION, 'utf8'));
    const oldPairAfter = await fnRows(OLD_FN);
    const newPair = await fnRows(NEW_FN);
    await client.query('RESET ROLE');
    console.log('migration 20260917223000 applied on top of the deployed 20260916_001 pair');

    record(
      'D1',
      'the obsolete Apply pair is dropped atomically by the same migration',
      oldPairBefore.length === 2 && oldPairAfter.length === 0,
      `${OLD_FN}: ${oldPairBefore.length} function(s) -> ${oldPairAfter.length}`,
    );
    const fin = newPair.find((r) => r.schema === 'finance');
    const pub = newPair.find((r) => r.schema === 'public');
    record(
      'D2',
      'new pair created under a new name with the same security shape (DEFINER inner, INVOKER wrapper, empty search_path)',
      newPair.length === 2 && fin.prosecdef === true && pub.prosecdef === false &&
        /^search_path=("")?$/.test(fin.config) && /^search_path=("")?$/.test(pub.config) &&
        fin.owner === 'dbowner' && pub.owner === 'dbowner' &&
        fin.language === 'plpgsql' && pub.language === 'sql',
      `finance secdef=${fin.prosecdef} config=${fin.config}; public secdef=${pub.prosecdef}`,
    );
    record(
      'D3',
      'least privilege: EXECUTE for authenticated + service_role only, never PUBLIC or anon',
      /authenticated=X/.test(fin.acl) && /service_role=X/.test(fin.acl) &&
        !/^=X/.test(fin.acl) && !/\|\s*=X/.test(fin.acl) && !/anon=X/.test(fin.acl) &&
        /authenticated=X/.test(pub.acl) && /service_role=X/.test(pub.acl) && !/anon=X/.test(pub.acl),
      `finance acl=[${fin.acl}]`,
    );

    const src = (
      await client.query(
        `SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='finance' AND p.proname=$1`,
        [NEW_FN],
      )
    ).rows[0].def;
    record(
      'D4',
      'no global transactions count and no bare Kiti row count used as an anchor',
      !/count\(\*\)[\s\S]{0,40}FROM public\.transactions;\s*\r?\n\s*IF/.test(src) &&
        !/v_tx_before \+ 5/.test(src) && !/v_tx_after <>/.test(src) &&
        !/kiti1_rows|kiti2_rows/.test(src) &&
        /row_count_anchors_used', false/.test(src),
      'receipt reports totals but no assertion depends on them',
    );
    // every 'Deposit' mention must be scoped to the ids this pack just created:
    // the function may check that its own rows are not deposits, but may never
    // read, count or sum the deposit layer.
    const depositMentions = (src.match(/^.*'Deposit'.*$/gm) || []).map((l) => l.trim());
    record(
      'D5',
      'the deposit layer is never read or measured (only self-classification guards), and September is not touched',
      !/v_pre_deposit/.test(src) &&
        /date > c_cutoff/.test(src) &&
        depositMentions.length > 0 &&
        depositMentions.every((l) => /v_e[1-5]_id/.test(l)) &&
        !/property_name = c_kiti[12]_name AND subcategory = 'Deposit'/.test(src),
      `${depositMentions.length} 'Deposit' line(s), all scoped to the pack's own row ids`,
    );

    const accessMatrix = (
      await client.query(
        `SELECT r AS role_name,
                has_function_privilege(r, 'finance.${NEW_FN}()', 'EXECUTE') AS can_execute_inner,
                has_function_privilege(r, 'public.${NEW_FN}()', 'EXECUTE') AS can_execute_wrapper,
                has_schema_privilege(r, 'finance', 'USAGE') AS finance_usage,
                has_table_privilege(r, 'finance.owner_transaction_links', 'INSERT') AS direct_link_insert,
                has_table_privilege(r, 'public.transactions', 'INSERT') AS direct_tx_insert
           FROM unnest(ARRAY['anon','authenticated','service_role','dbowner']) r`,
      )
    ).rows;
    console.log('ACCESS MATRIX:', JSON.stringify(accessMatrix, null, 2));
    fs.writeFileSync(path.join(OUT, 'access-matrix-pack1.json'), JSON.stringify(accessMatrix, null, 2));

    const asIdentity = async (role, claims) => {
      await client.query(`SET LOCAL ROLE ${role}`);
      if (claims === null) await client.query(`SELECT set_config('request.jwt.claims','',true)`);
      else await client.query(`SELECT set_config('request.jwt.claims',$1,true)`, [JSON.stringify(claims)]);
    };
    const callApply = () => client.query(`SELECT finance.${NEW_FN}() AS receipt`);
    const callWrapper = () => client.query(`SELECT public.${NEW_FN}() AS receipt`);
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
        record(id, name, ok, `${ok ? 'rejected' : 'wrong error'}: ${e.message.split('\n')[0].slice(0, 170)}`);
      }
    };

    // ---------------- the obsolete function can no longer be called at all
    await tx(async () => {
      await asIdentity('service_role', { role: 'service_role' });
      await expectFail(
        () => client.query(`SELECT finance.${OLD_FN}()`),
        'does not exist',
        'D6',
        'the obsolete D1/D2/D3 Apply can no longer be called',
      );
    });
    await tx(async () => {
      await asIdentity('service_role', { role: 'service_role' });
      await expectFail(
        () => client.query(`SELECT public.${OLD_FN}()`),
        'does not exist',
        'D7',
        'the obsolete public wrapper can no longer be called',
      );
    });

    // ---------------- authorization
    await tx(async () => {
      await asIdentity('anon', { role: 'anon' });
      await expectFail(callApply, null, 'T1', 'anon rejected');
    });
    await tx(async () => {
      await asIdentity('authenticated', { role: 'authenticated', sub: NONSTAFF });
      await expectFail(callApply, 'jj_staff_config', 'T2', 'authenticated non-staff rejected');
    });
    await tx(async () => {
      await asIdentity('authenticated', null);
      await expectFail(callApply, 'Authenticated session required', 'T3', 'missing JWT rejected');
    });

    // ---------------- T4 CEO accepted, receipt v3
    await tx(async () => {
      await asIdentity('authenticated', { role: 'authenticated', sub: YOSSI });
      const r = (await callApply()).rows[0].receipt;
      const ok =
        r.receipt_version === 3 &&
        r.inserted_transactions === 5 &&
        r.inserted_owner_links === 1 &&
        Number(r.closing_before) === 3248.75 &&
        Number(r.economic_delta) === 15 &&
        Number(r.closing_after) === 3263.75 &&
        Number(r.payments_to_owner_before) === 19100 &&
        Number(r.payments_to_owner_after) === 21725 &&
        Number(r.custody_delta.yossi) === 1465 &&
        Number(r.custody_delta.jacob_received) === 1175 &&
        Number(r.custody_delta.jacob_paid_out) === 2625 &&
        Number(r.custody_delta.jacob_net) === -1450 &&
        Number(r.jj_pnl_delta) === 0 &&
        Number(r.other_properties_delta) === 0 &&
        Number(r.kiti1_rent_after) === 9610 &&
        Number(r.kiti2_rent_after) === 12516.86 &&
        r.row_count_anchors_used === false &&
        r.executed_by === YOSSI &&
        r.executed_role === 'authenticated' &&
        !JSON.stringify(r).match(/password|secret|token|apikey/i);
      record('T4', 'CEO accepted; receipt v3 proves 5 + 1 writes, closing EUR 3,263.75, custody +1,465', ok,
        `closing=${r.closing_after}, yossi=${r.custody_delta.yossi}, jacob_net=${r.custody_delta.jacob_net}`);

      const e = r.events;
      record(
        'T4b',
        'receipt itemises the five events with the right owner effect and one row for the EUR 1,175 receipt',
        Number(e.e1_owner_payment.effect_on_owner) === -2625 &&
          Number(e.e2_kiti1_receipt.effect_on_owner) === 1175 && Number(e.e2_kiti1_receipt.rows_created) === 1 &&
          Number(e.e2_kiti1_receipt.allocation.may_partial_2026_05_19_to_2026_05_31) === 425 &&
          Number(e.e2_kiti1_receipt.allocation.june_2026_rent) === 700 &&
          Number(e.e2_kiti1_receipt.allocation.june_2026_electricity_credit) === 50 &&
          Number(e.e3_kiti1_receipt.effect_on_owner) === 750 &&
          Number(e.e3_kiti1_receipt.allocation.july_2026_rent) === 700 &&
          Number(e.e3_kiti1_receipt.allocation.july_2026_electricity_credit) === 50 &&
          Number(e.e4_kiti2_rent_gross.gross_amount) === 800 &&
          Number(e.e4_kiti2_rent_gross.deducted_at_source) === 85 &&
          Number(e.e4_kiti2_rent_gross.net_cash_received) === 715 &&
          Number(e.e5_kiti2_drain_cost.effect_on_owner) === -85,
        `owner effects: -2625, +1175, +750, +800, -85`,
      );
    });

    await tx(async () => {
      await asIdentity('service_role', { role: 'service_role' });
      const r = (await callApply()).rows[0].receipt;
      record('T5', 'service_role accepted', r.inserted_transactions === 5 && r.executed_role === 'service_role',
        `role=${r.executed_role}`);
    });

    // ---------------- writes, custody, neutrality
    await tx(async () => {
      const before = await snapshot();
      const otherBefore = await otherProps();

      await asIdentity('authenticated', { role: 'authenticated', sub: YOSSI });
      const r = (await callApply()).rows[0].receipt;
      await client.query('RESET ROLE');

      const after = await snapshot();
      const ids = [
        r.events.e1_owner_payment.id, r.events.e2_kiti1_receipt.id, r.events.e3_kiti1_receipt.id,
        r.events.e4_kiti2_rent_gross.id, r.events.e5_kiti2_drain_cost.id,
      ];
      const rows = (
        await client.query(
          `SELECT id, date::text AS date, property_id::text AS property_id, property_name, category, subcategory,
                  payer, payee, amount_eur::text AS amount_eur, client_charge, review_status, description, k_note
             FROM public.transactions WHERE id = ANY($1::uuid[])`,
          [ids],
        )
      ).rows;
      const byId = (i) => rows.find((x) => x.id === i);
      const e1 = byId(ids[0]), e2 = byId(ids[1]), e3 = byId(ids[2]), e4 = byId(ids[3]), e5 = byId(ids[4]);

      record(
        'T6',
        'exactly 5 transactions + 1 owner link written in one transaction, with the locked dates',
        rows.length === 5 &&
          Number(after.tx) === Number(before.tx) + 5 &&
          Number(after.links) === Number(before.links) + 1 &&
          e1.date === '2026-06-16' && e1.property_id === null && e1.property_name === null &&
          Number(e1.amount_eur) === 2625 && e1.payer === 'Jacob' && e1.payee === 'Owner' &&
          e2.date === '2026-05-19' && e2.property_id === KITI1 && Number(e2.amount_eur) === 1175 && e2.payee === 'Jacob' &&
          e3.date === '2026-07-07' && e3.property_id === KITI1 && Number(e3.amount_eur) === 750 && e3.payee === 'Yossi' &&
          e4.date === '2026-07-17' && e4.property_id === KITI2 && Number(e4.amount_eur) === 800 && e4.payee === 'Yossi' &&
          e5.date === '2026-07-17' && e5.property_id === KITI2 && Number(e5.amount_eur) === 85 && e5.subcategory === 'Plumber',
        `tx ${before.tx} -> ${after.tx}, links ${before.links} -> ${after.links}`,
      );
      record('T6b', 'exactly 5 audit rows appended', Number(after.audit) - Number(before.audit) === 5,
        `audit ${before.audit} -> ${after.audit}`);
      record(
        'T6c',
        'the corrected receipt dates replace the wrong ones the obsolete function carried (31/05, 17/07)',
        e2.date === '2026-05-19' && e3.date === '2026-07-07',
        `E2 ${e2.date} (was 2026-05-31), E3 ${e3.date} (was 2026-07-17)`,
      );

      // ---- A-CUSTODY-1: gross 800 visible, cost 85 visible, custody grows 715 on the pair
      const yossiPair = (
        await client.query(
          `SELECT coalesce(sum(amount_eur),0) AS received FROM public.transactions
            WHERE id = ANY($1::uuid[]) AND payee='Yossi'`,
          [[ids[2], ids[3]]],
        )
      ).rows[0];
      const netKiti2 = Number(e4.amount_eur) - Number(e5.amount_eur);
      record(
        'A-CUSTODY-1',
        'Kiti 2 shows gross EUR 800 and cost EUR 85 as two rows, yet net cash is EUR 715',
        Number(e4.amount_eur) === 800 && Number(e5.amount_eur) === 85 && netKiti2 === 715 &&
          /GROSS_RENT=800/.test(e4.k_note) && /DEDUCTED_AT_SOURCE=85/.test(e4.k_note) &&
          /NET_CASH_RECEIVED=715/.test(e4.k_note) && /PAID_BY=tenant_at_source/.test(e5.k_note) &&
          Number(after.plumb_sum) === 85,
        `800 - 85 = ${netKiti2}`,
      );
      record(
        'A-CUSTODY-2',
        'custody held by the internal holder grows by EUR 1,465, not EUR 1,550',
        Number(yossiPair.received) === 1550 && Number(yossiPair.received) - Number(e5.amount_eur) === 1465 &&
          Number(r.custody_delta.yossi) === 1465,
        `received ${yossiPair.received} - 85 = ${Number(yossiPair.received) - 85}`,
      );
      record(
        'A-CUSTODY-3',
        'the other holder: EUR 1,175 received and EUR 2,625 paid out stay on separate rows and are not netted',
        e2.payee === 'Jacob' && Number(e2.amount_eur) === 1175 &&
          e1.payer === 'Jacob' && Number(e1.amount_eur) === 2625 &&
          /CUSTODY_HOLDER=Jacob/.test(e2.k_note) && Number(r.custody_delta.jacob_net) === -1450,
        `+1175 received / -2625 paid`,
      );

      // ---- allocation + client-safe wording
      record(
        'A1',
        'the EUR 1,175 receipt stays ONE row carrying 425 + 700 + 50',
        /ALLOCATION_MAY_PARTIAL=425/.test(e2.k_note) && /ALLOCATION_JUNE_RENT=700/.test(e2.k_note) &&
          /ALLOCATION_JUNE_ELECTRICITY=50/.test(e2.k_note) &&
          rows.filter((x) => Number(x.amount_eur) === 1175).length === 1 &&
          /ACTUAL_OCCUPANCY_FROM=2026-05-19/.test(e2.k_note) && /CONTRACT_COMMENCEMENT=2026-05-20/.test(e2.k_note),
        e2.k_note.slice(0, 120),
      );
      record(
        'A2',
        'July receipt allocated 700 rent + 50 electricity credit, no pending month left',
        /ALLOCATION_JULY_RENT=700/.test(e3.k_note) && /ALLOCATION_JULY_ELECTRICITY=50/.test(e3.k_note) &&
          /RENTAL_MONTH=2026-07/.test(e3.k_note) && !/UNKNOWN/.test(e3.k_note) && !/NEEDS_REVIEW/.test(e3.k_note),
        e3.k_note.slice(0, 120),
      );
      record(
        'A3',
        'the EUR 50 legs are electricity credits, never a final bill and never a deposit',
        /ELECTRICITY_CREDIT=general_not_final_bill/.test(e2.k_note) &&
          /ELECTRICITY_CREDIT=general_not_final_bill/.test(e3.k_note) &&
          /DEPOSIT_INCLUDED=false/.test(e2.k_note) && /DEPOSIT_INCLUDED=false/.test(e3.k_note) &&
          e2.subcategory === 'Tenant Payment' && e3.subcategory === 'Tenant Payment',
        'both receipts are Tenant Payment with an explicit electricity-credit marker',
      );
      record(
        'A4',
        'no internal name appears in any client-facing description',
        !rows.some((x) => /yossi|jacob|yaakov|anastasia|custody|idempotenc|ledger|RC3|D1|D2|D3/i.test(x.description || '')),
        rows.map((x) => `"${x.description}"`).join(' '),
      );
      record(
        'A5',
        'this pack creates no deposit row and leaves the whole deposit layer untouched',
        Number(after.dep_rows) === Number(before.dep_rows) && Number(after.dep_sum) === Number(before.dep_sum) &&
          !rows.some((x) => /Deposit/.test(x.subcategory)),
        `deposit rows ${before.dep_rows} -> ${after.dep_rows}, sum ${before.dep_sum} -> ${after.dep_sum}`,
      );
      record(
        'A6',
        'September stays out: no post-cutoff Kiti row added, no brokerage row',
        Number(after.post_rows) === Number(before.post_rows) &&
          !rows.some((x) => x.date > '2026-08-31') && !rows.some((x) => /Brokerage/i.test(x.subcategory)),
        `post-cutoff Kiti rows ${before.post_rows} -> ${after.post_rows}`,
      );

      // ---- each key exactly once
      const once = (
        await client.query(
          `SELECT (SELECT count(*) FROM public.transactions WHERE k_note LIKE '%IDEMPOTENCY='||$1||'%') e1,
                  (SELECT count(*) FROM public.transactions WHERE k_note LIKE '%IDEMPOTENCY='||$2||'%') e2,
                  (SELECT count(*) FROM public.transactions WHERE k_note LIKE '%IDEMPOTENCY='||$3||'%') e3,
                  (SELECT count(*) FROM public.transactions WHERE k_note LIKE '%IDEMPOTENCY='||$4||'%') e4,
                  (SELECT count(*) FROM public.transactions WHERE k_note LIKE '%IDEMPOTENCY='||$5||'%') e5,
                  (SELECT count(*) FROM finance.owner_transaction_links WHERE idempotency_key=$1) l`,
          [KEYS.e1, KEYS.e2, KEYS.e3, KEYS.e4, KEYS.e5],
        )
      ).rows[0];
      record('T7', 'each of the five keys counted exactly once, owner link once',
        Number(once.e1) === 1 && Number(once.e2) === 1 && Number(once.e3) === 1 &&
          Number(once.e4) === 1 && Number(once.e5) === 1 && Number(once.l) === 1 &&
          Number(after.ol_rows) === 2,
        `e1=${once.e1} e2=${once.e2} e3=${once.e3} e4=${once.e4} e5=${once.e5} link=${once.l}`);

      const link = (
        await client.query(`SELECT * FROM finance.owner_transaction_links WHERE idempotency_key=$1`, [KEYS.e1])
      ).rows[0];
      record('T8', 'owner link: approved, active, correct owner, attached to the EUR 2,625 payment',
        !!link && link.transaction_id === ids[0] && link.owner_entity_id === OWNER &&
          link.review_status === 'approved' && link.is_deleted === false &&
          link.link_role === 'owner_level_payment',
        `link ${link && link.id}`);

      record('T9', 'JJ P&L delta = EUR 0',
        Number(before.jj_sum) === Number(after.jj_sum) && Number(before.jj_rows) === Number(after.jj_rows) &&
          Number(before.mgmtfee) === Number(after.mgmtfee),
        `JJ ${before.jj_sum}/${before.jj_rows} -> ${after.jj_sum}/${after.jj_rows}`);

      const otherAfter = await otherProps();
      record('T10', 'other properties delta = EUR 0',
        JSON.stringify(otherBefore) === JSON.stringify(otherAfter),
        `${otherAfter.length} properties compared`);

      // ---- closing recomputed independently of the receipt
      const closing =
        3248.75 +
        (Number(after.k1_rent) - Number(before.k1_rent)) +
        (Number(after.k2_rent) - Number(before.k2_rent)) -
        85 - 2625;
      record('T11', 'closing recomputed from the ledger = EUR 3,263.75',
        Math.abs(closing - 3263.75) < 0.0001 && Number(r.closing_after) === 3263.75 &&
          Number(after.k1_rent) === 9610 && Number(after.k2_rent) === 12516.86,
        `recomputed ${closing.toFixed(2)}, receipt ${r.closing_after}`);
    });

    // ---------------- replay / drift
    await tx(async () => {
      await asIdentity('service_role', { role: 'service_role' });
      await callApply();
      await expectFail(callApply, 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED', 'R1', 'replay rejected');
    });
    await tx(async () => {
      await asIdentity('service_role', { role: 'service_role' });
      await callApply();
      await expectFail(callWrapper, 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED', 'R2', 'replay through the wrapper rejected');
    });
    await tx(async () => {
      await client.query(`INSERT INTO public.transactions (date, property_name, category, subcategory, payer, payee, amount_eur)
                          VALUES ('2026-06-16', NULL, 'Management', 'Bank Payment to Owner', 'Jacob', 'Owner', 2625)`);
      await asIdentity('service_role', { role: 'service_role' });
      await expectFail(callApply, 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED', 'R3', 'a pre-existing EUR 2,625 payment blocks the Apply');
    });
    await tx(async () => {
      await client.query(`INSERT INTO public.transactions (date, property_id, property_name, category, subcategory, payer, payee, amount_eur)
                          VALUES ('2026-07-17', $1, 'Tamir Kiti 2', 'Management', 'Tenant Payment', 'Tenant', 'Yossi', 800)`, [KITI2]);
      await asIdentity('service_role', { role: 'service_role' });
      await expectFail(callApply, 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED', 'R4', 'a pre-existing Kiti 2 July rent row blocks the Apply');
    });
    await tx(async () => {
      await client.query(`INSERT INTO public.transactions (date, property_id, property_name, category, subcategory, payer, payee, amount_eur)
                          VALUES ('2026-07-17', $1, 'Tamir Kiti 2', 'Management', 'Plumber', 'Tenant', 'Plumber', 85)`, [KITI2]);
      await asIdentity('service_role', { role: 'service_role' });
      await expectFail(callApply, 'ALREADY_APPLIED_OR_PREIMAGE_CHANGED', 'R5', 'a pre-existing drain-clearing row blocks the Apply');
    });
    await tx(async () => {
      await client.query(`UPDATE public.properties SET name='Tamir Kiti 2 RENAMED' WHERE id=$1`, [KITI2]);
      await asIdentity('service_role', { role: 'service_role' });
      await expectFail(callApply, 'canonical property', 'R6', 'renamed canonical Kiti 2 rejected');
    });
    await tx(async () => {
      await client.query(`UPDATE public.properties SET is_deleted=true WHERE id=$1`, [KITI1]);
      await asIdentity('service_role', { role: 'service_role' });
      await expectFail(callApply, 'canonical property', 'R7', 'soft-deleted canonical Kiti 1 rejected');
    });
    await tx(async () => {
      await client.query(`UPDATE lifecycle.entity_identity SET status='inactive' WHERE id=$1`, [OWNER]);
      await asIdentity('service_role', { role: 'service_role' });
      await expectFail(callApply, 'owner entity', 'R8', 'inactive owner entity rejected');
    });
    await tx(async () => {
      await client.query(`INSERT INTO public.transaction_exclusions (transaction_id, reason, is_active)
                          SELECT id, 'test', true FROM public.transactions
                           WHERE property_name='Tamir Kiti 2' LIMIT 1`);
      await asIdentity('service_role', { role: 'service_role' });
      await expectFail(callApply, 'active exclusion', 'R9', 'an active exclusion on a Kiti apartment blocks the Apply');
    });

    // ---------------- unrelated drift must NOT block the Apply (the point of dropping row anchors)
    await tx(async () => {
      await client.query(`INSERT INTO public.transactions (date, property_id, property_name, category, subcategory, payer, payee, amount_eur)
        SELECT (DATE '2026-04-01' + g), NULL, 'Unrelated Import ' || g, 'Airbnb', 'Consumable Supplies', 'JJ', 'company', 10
          FROM generate_series(1, 40) g`);
      await client.query(`INSERT INTO public.transactions (date, property_id, property_name, category, subcategory, payer, payee, amount_eur)
                          VALUES ('2026-08-26', $1, 'Tamir Kiti 1', 'Management', 'Deposit', 'Tenant', 'JJ', 200),
                                 ('2026-09-15', $1, 'Tamir Kiti 1', 'Management', 'Deposit', 'Tenant', 'JJ', 750)`, [KITI1]);
      await asIdentity('service_role', { role: 'service_role' });
      const r = (await callApply()).rows[0].receipt;
      await client.query('RESET ROLE');
      record(
        'R10',
        'a 40-row unrelated import batch and new deposit activity do NOT block the Apply',
        r.inserted_transactions === 5 && Number(r.closing_after) === 3263.75 && Number(r.custody_delta.yossi) === 1465,
        `closing=${r.closing_after} with 42 unrelated rows added first`,
      );
    });

    // ---------------- the historical property_id guard counts ACTIVE rows only
    record(
      'G0',
      'the Kiti 2 historical guard filters soft-deleted rows, the Kiti 1 twin is unchanged',
      (src.match(/property_name = c_kiti2_name AND subcategory = 'Tenant Payment' AND property_id IS NULL\s*\r?\n\s*AND NOT coalesce\(is_deleted, false\)/g) || []).length === 2 &&
        (src.match(/property_name = c_kiti1_name AND subcategory = 'Tenant Payment' AND property_id IS NULL;/g) || []).length === 2 &&
        /active historical Kiti 2 rent rows with NULL property_id = % \(expected 14\)/.test(src),
      'pre-check and postcondition both scoped to active rows, expected value still 14',
    );

    await tx(async () => {
      const b = await snapshot();
      await asIdentity('service_role', { role: 'service_role' });
      const r = (await callApply()).rows[0].receipt;
      await client.query('RESET ROLE');
      const ev = r.events;
      record(
        'G1',
        '14 active NULL-property_id rows pass while 2 soft-deleted rows sit in the same scope',
        Number(b.k2_hist_null_active) === 14 && Number(b.k2_hist_null_all) === 16 &&
          r.inserted_transactions === 5 && r.inserted_owner_links === 1 &&
          Number(r.closing_after) === 3263.75,
        `active=${b.k2_hist_null_active} of ${b.k2_hist_null_all}, closing=${r.closing_after}`,
      );
      record(
        'G1b',
        'all five events keep their locked values and the closing stays EUR 3,263.75',
        Number(ev.e1_owner_payment.amount) === 2625 &&
          Number(ev.e2_kiti1_receipt.amount) === 1175 &&
          Number(ev.e2_kiti1_receipt.allocation.may_partial_2026_05_19_to_2026_05_31) === 425 &&
          Number(ev.e2_kiti1_receipt.allocation.june_2026_rent) === 700 &&
          Number(ev.e2_kiti1_receipt.allocation.june_2026_electricity_credit) === 50 &&
          Number(ev.e3_kiti1_receipt.amount) === 750 &&
          Number(ev.e3_kiti1_receipt.allocation.july_2026_rent) === 700 &&
          Number(ev.e3_kiti1_receipt.allocation.july_2026_electricity_credit) === 50 &&
          Number(ev.e4_kiti2_rent_gross.gross_amount) === 800 &&
          Number(ev.e4_kiti2_rent_gross.net_cash_received) === 715 &&
          Number(ev.e5_kiti2_drain_cost.amount) === 85 &&
          Number(r.custody_delta.yossi) === 1465 && Number(r.custody_delta.jacob_received) === 1175 &&
          Number(r.custody_delta.jacob_paid_out) === 2625 && Number(r.economic_delta) === 15,
        `2625 / 1175 (425+700+50) / 750 (700+50) / 800 gross - 85 / closing ${r.closing_after}`,
      );
    });

    await tx(async () => {
      await client.query(
        `INSERT INTO public.transactions (date, property_id, property_name, category, subcategory,
                                          payer, payee, amount_eur, is_deleted, deleted_at, deleted_by)
         VALUES ('2026-02-14', NULL, 'Tamir Kiti 2', 'Management', 'Tenant Payment', 'Tenant', 'Anastasia', 800,
                 true, now(), 'dedupe'),
                ('2026-05-14', NULL, 'Tamir Kiti 2', 'Management', 'Tenant Payment', 'Tenant', 'Anastasia', 800,
                 true, now(), 'dedupe')`,
      );
      const b = await snapshot();
      await asIdentity('service_role', { role: 'service_role' });
      const r = (await callApply()).rows[0].receipt;
      await client.query('RESET ROLE');
      record(
        'G2',
        'two further soft-deleted rows in the same scope do not move the guard or any number',
        Number(b.k2_hist_null_all) === 18 && Number(b.k2_hist_null_active) === 14 &&
          Number(b.k2_rent) === 11716.86 && r.inserted_transactions === 5 &&
          Number(r.closing_after) === 3263.75 && Number(r.custody_delta.yossi) === 1465,
        `18 rows in scope, 14 active, closing=${r.closing_after}`,
      );
    });

    for (const [id, rowId, label] of [
      ['G3', '07859b5d-5d04-4a1b-ba87-c5f51374546d', 'the 2026-06-16 EUR 1,600 row'],
      ['G4', 'c556f764-38c0-49cc-9694-e009e181ae8d', 'the 2026-03-02 EUR 1,600 duplicate'],
    ]) {
      await tx(async () => {
        await client.query(
          `UPDATE public.transactions SET is_deleted=false, deleted_at=NULL, deleted_by=NULL WHERE id=$1`,
          [rowId],
        );
        await asIdentity('service_role', { role: 'service_role' });
        await expectFail(
          callApply,
          'ALREADY_APPLIED_OR_PREIMAGE_CHANGED',
          id,
          `restoring ${label} to active blocks the Apply`,
        );
      });
    }

    await tx(async () => {
      // Dated after the cutoff on purpose: the rent-through-cutoff anchor cannot see it,
      // so only the active-historical guard can catch this drift.
      await client.query(
        `INSERT INTO public.transactions (date, property_id, property_name, category, subcategory,
                                          payer, payee, amount_eur)
         VALUES ('2026-09-20', NULL, 'Tamir Kiti 2', 'Management', 'Tenant Payment', 'Tenant', 'Yossi', 800)`,
      );
      await asIdentity('service_role', { role: 'service_role' });
      await expectFail(
        callApply,
        'active historical Kiti 2 rent rows with NULL property_id = 15',
        'G5',
        'a new ACTIVE unparented Kiti 2 rent row trips exactly this guard',
      );
    });

    // ---------------- atomic rollback
    const rollbackCase = async (id, name, triggerSql, needle) => {
      await tx(async () => {
        await client.query(triggerSql);
        const b = await snapshot();
        await client.query('SAVEPOINT sp');
        let raised = null;
        try {
          await asIdentity('service_role', { role: 'service_role' });
          await callApply();
        } catch (e) {
          raised = e.message.split('\n')[0];
        }
        await client.query('ROLLBACK TO SAVEPOINT sp');
        await client.query('RESET ROLE');
        const a = await snapshot();
        record(id, name, !!raised && raised.includes(needle), raised || 'no error');
        record(
          `${id}b`,
          `${name}: nothing persisted (0 of 5 rows, 0 links, 0 audit rows)`,
          Number(b.tx) === Number(a.tx) && Number(b.links) === Number(a.links) &&
            Number(b.audit) === Number(a.audit) && Number(b.k1_rent) === Number(a.k1_rent) &&
            Number(b.k2_rent) === Number(a.k2_rent),
          `tx ${b.tx}->${a.tx}, links ${b.links}->${a.links}, audit ${b.audit}->${a.audit}`,
        );
      });
    };

    await rollbackCase(
      'X1',
      'a tampered EUR 1,175 allocation raises and rolls back',
      `CREATE FUNCTION public.zz_strip_alloc() RETURNS trigger LANGUAGE plpgsql AS $f$
       BEGIN
         IF NEW.amount_eur = 1175 THEN
           NEW.k_note := replace(NEW.k_note, 'ALLOCATION_JUNE_ELECTRICITY=50', 'ALLOCATION_JUNE_ELECTRICITY=0');
         END IF;
         RETURN NEW;
       END $f$;
       CREATE TRIGGER zz_strip_alloc BEFORE INSERT ON public.transactions
         FOR EACH ROW EXECUTE FUNCTION public.zz_strip_alloc();`,
      'POSTCONDITION_FAILED',
    );

    await rollbackCase(
      'X2',
      'a Kiti 2 rent booked net (715) instead of gross (800) raises and rolls back',
      `CREATE FUNCTION public.zz_net_rent() RETURNS trigger LANGUAGE plpgsql AS $f$
       BEGIN
         IF NEW.amount_eur = 800 AND NEW.property_name = 'Tamir Kiti 2' THEN NEW.amount_eur := 715; END IF;
         RETURN NEW;
       END $f$;
       CREATE TRIGGER zz_net_rent BEFORE INSERT ON public.transactions
         FOR EACH ROW EXECUTE FUNCTION public.zz_net_rent();`,
      'POSTCONDITION_FAILED',
    );

    await rollbackCase(
      'X3',
      'a dropped drain-clearing cost row raises and rolls back',
      `CREATE FUNCTION public.zz_drop_cost() RETURNS trigger LANGUAGE plpgsql AS $f$
       BEGIN
         IF NEW.subcategory = 'Plumber' THEN RETURN NULL; END IF;
         RETURN NEW;
       END $f$;
       CREATE TRIGGER zz_drop_cost BEFORE INSERT ON public.transactions
         FOR EACH ROW EXECUTE FUNCTION public.zz_drop_cost();`,
      'POSTCONDITION_FAILED',
    );

    await rollbackCase(
      'X4',
      'a receipt re-routed to the wrong custody holder raises and rolls back',
      `CREATE FUNCTION public.zz_swap_payee() RETURNS trigger LANGUAGE plpgsql AS $f$
       BEGIN
         IF NEW.amount_eur = 1175 THEN NEW.payee := 'Yossi'; END IF;
         RETURN NEW;
       END $f$;
       CREATE TRIGGER zz_swap_payee BEFORE INSERT ON public.transactions
         FOR EACH ROW EXECUTE FUNCTION public.zz_swap_payee();`,
      'POSTCONDITION_FAILED',
    );

    await rollbackCase(
      'X5',
      'splitting the single EUR 1,175 receipt into two rows raises and rolls back',
      `CREATE FUNCTION public.zz_split() RETURNS trigger LANGUAGE plpgsql AS $f$
       BEGIN
         IF NEW.amount_eur = 1175 AND NEW.k_note LIKE '%tamir_kiti1_rent_2026-05-19_1175%' THEN
           INSERT INTO public.transactions (date, property_id, property_name, category, subcategory,
                                            payer, payee, amount_eur, k_note)
           VALUES (NEW.date, NEW.property_id, NEW.property_name, NEW.category, NEW.subcategory,
                   NEW.payer, NEW.payee, 0, NEW.k_note);
         END IF;
         RETURN NEW;
       END $f$;
       CREATE TRIGGER zz_split AFTER INSERT ON public.transactions
         FOR EACH ROW EXECUTE FUNCTION public.zz_split();`,
      'POSTCONDITION_FAILED',
    );

    // ---------------- wrapper
    await tx(async () => {
      await asIdentity('anon', { role: 'anon' });
      await expectFail(callWrapper, null, 'W1', 'wrapper: anon rejected');
    });
    await tx(async () => {
      await asIdentity('authenticated', { role: 'authenticated', sub: NONSTAFF });
      await expectFail(callWrapper, 'jj_staff_config', 'W2', 'wrapper: authenticated non-staff rejected');
    });
    await tx(async () => {
      await asIdentity('authenticated', { role: 'authenticated', sub: YOSSI });
      const rec = (await callWrapper()).rows[0].receipt;
      await client.query('RESET ROLE');
      const st = await snapshot();
      record('W3', 'wrapper: CEO accepted, identical receipt',
        rec.receipt_version === 3 && rec.inserted_transactions === 5 &&
          Number(rec.closing_after) === 3263.75 && Number(rec.custody_delta.yossi) === 1465 &&
          rec.executed_by === YOSSI && Number(st.links) === 2,
        `closing=${rec.closing_after}, links=${st.links}`);
    });

    // ---------------- rollback plan (soft delete only, history retained)
    await tx(async () => {
      await asIdentity('service_role', { role: 'service_role' });
      const r = (await callApply()).rows[0].receipt;
      await client.query(`SELECT finance.soft_delete_owner_transaction_link($1,$2)`,
        [r.events.e1_owner_payment.link_id, 'rollback_kiti_cutoff']);
      await client.query('RESET ROLE');
      await client.query(
        `UPDATE public.transactions SET is_deleted=true, deleted_at=now(), deleted_by='rollback_kiti_cutoff'
          WHERE coalesce(is_deleted,false)=false
            AND (k_note LIKE '%'||$1||'%' OR k_note LIKE '%'||$2||'%' OR k_note LIKE '%'||$3||'%'
              OR k_note LIKE '%'||$4||'%' OR k_note LIKE '%'||$5||'%')`,
        [KEYS.e1, KEYS.e2, KEYS.e3, KEYS.e4, KEYS.e5],
      );
      const back = await snapshot();
      await client.query('SAVEPOINT sp_del');
      let delErr = null;
      try {
        await client.query(`DELETE FROM public.transactions WHERE id=$1`, [r.events.e1_owner_payment.id]);
      } catch (e) {
        delErr = e.message.split('\n')[0];
      }
      await client.query('ROLLBACK TO SAVEPOINT sp_del');
      record(
        'RB1',
        'rollback plan: soft-delete restores both rent anchors and the link count, physical DELETE stays blocked',
        Number(back.k1_rent) === 7685 && Number(back.k2_rent) === 11716.86 && Number(back.links) === 1 &&
          !!delErr && delErr.includes('append-only'),
        `k1=${back.k1_rent}, k2=${back.k2_rent}, links=${back.links}`,
      );
    });

    const post = await snapshot();
    record('Z1', 'every test rolled back: harness is back to the pre-image',
      Number(post.tx) === Number(pre.tx) && Number(post.links) === Number(pre.links) &&
        Number(post.audit) === 0 && Number(post.k1_rent) === 7685 && Number(post.k2_rent) === 11716.86,
      `tx=${post.tx}, links=${post.links}, audit=${post.audit}`);

    const passed = results.filter((r) => r.passed).length;
    console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`);
    fs.writeFileSync(
      path.join(OUT, 'test-results-pack1.json'),
      JSON.stringify(
        {
          server: version.split(',')[0],
          migrations: [OLD_MIGRATION, NEW_MIGRATION],
          pre_image: pre,
          old_pair_before: oldPairBefore,
          old_pair_after: oldPairAfter,
          new_pair: newPair,
          accessMatrix,
          results,
        },
        null,
        2,
      ),
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
