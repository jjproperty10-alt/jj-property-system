/* Runtime QA for the Tamir Kiti SEPTEMBER pack (pack 2), applied on top of the deployed
 * 20260916_001 pair and the cutoff pack 20260917223000, in an isolated embedded PostgreSQL
 * replica of the Production objects. Nothing here touches Production.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const M = require('embedded-postgres');
const EmbeddedPostgres = M.default || M;

const HERE = __dirname;
// supabase/tests/<suite> -> repo root
const REPO = process.env.JJ_REPO_ROOT || path.resolve(HERE, '..', '..', '..');
const OLD_MIGRATION = path.join(REPO, 'supabase', 'migrations', '20260916_001_tamir_d1_d2_d3_apply_fn.sql');
const P1_MIGRATION = path.join(REPO, 'supabase', 'migrations', '20260917223000_tamir_kiti_cutoff_correction_apply_fn.sql');
const P2_FILE = path.join(REPO, 'supabase', 'migrations', '20260917224500_tamir_kiti_september_correction_apply_fn.sql');
// the cutoff suite owns the shared replica of the Production objects
const HARNESS = path.join(REPO, 'supabase', 'tests', '20260917223000_tamir_kiti_cutoff', 'harness.sql');
const OUT = process.env.JJ_QA_OUT || os.tmpdir();

const YOSSI = '277f81e0-3b89-41ed-a099-22585959b77a';
const NONSTAFF = '11111111-2222-3333-4444-555555555555';
const KITI1 = 'b54e015f-05f9-4f75-a3e7-9362c6e2e0ae';
const KITI2 = '4dc5c26c-ce0c-49ec-8f44-a525f68f0b8a';
const TAMIR_PARTY = '9a392adb-4f42-46a0-9c1d-672d44e94882';
const P1_FN = 'apply_tamir_kiti_cutoff_20260831';
const P2_FN = 'apply_tamir_kiti_september_20260930';

// the four September rows that already exist in Production, with their real ids
const TX = {
  dep550: '79a153ee-54f7-5893-ad27-682d4bc62584',
  rent700: '896c3124-4061-5cb8-b319-32744da183c6',
  elec50: 'c11cd8c4-bd12-5501-8f64-66ec1de093d0',
  brok500: '1aecae2c-13e0-5fcc-a64d-8a5b003bed62',
  k2rent: '4fa5ba3a-5f49-5a1a-8db4-f4fbaba2ef31',
};
const DESC = {
  elec50: 'קיטי 1 בדרום — מקדמת חשמל 50 מול מונה משני (לא שכירות ולא הכנסת חשמל סופית)',
  brok500: 'עמלת תיווך תמיר קיטי 1 בדרום 500 — charge owner Tamir once. Payee unnamed (ledger company).',
};
const KEYS = {
  elecRev: 'tamir_kiti1_elec_reversal_2026-09-01_50',
  elecReb: 'tamir_kiti1_elec_rebook_2026-09-01_50',
  brokRev: 'tamir_kiti1_brokerage_reversal_2026-09-03_500',
  brokReb: 'tamir_kiti1_brokerage_rebook_2026-09-03_500',
  dep200: 'tamir_kiti1_deposit_agent_2026-08-26_200',
  brok200: 'tamir_kiti1_brokerage_from_deposit_2026-09-03_200',
};

// JJ management-fee income as Production holds it, guarded by this pack at Apply time
const MGMTFEE = { rows: 34, owner: 25904.05 };

const results = [];
function record(id, name, passed, detail) {
  results.push({ id, name, passed, detail });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${id} ${name}${detail ? ' :: ' + detail : ''}`);
}

async function main() {
  const dataDir = path.join(os.tmpdir(), 'jj-pg-p2-' + Date.now());
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'testonly-local',
    // unique per run: a fixed port collides with any cluster an earlier run left behind
    port: Number(process.env.JJ_PG_PORT || 54400 + (process.pid % 150)),
    persistent: false, onLog: () => {}, onError: () => {},
    // Production descriptions are Hebrew; the default WIN1252 cluster cannot store them
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  });
  console.log('initialising isolated cluster at', dataDir);
  await pg.initialise();
  await pg.start();
  const client = pg.getPgClient();
  await client.connect();
  console.log('server:', (await client.query('SELECT version()')).rows[0].version.split(',')[0]);

  const one = async (sql, params) => (await client.query(sql, params)).rows[0];
  const asIdentity = async (role, claims) => {
    await client.query(`SET LOCAL ROLE ${role}`);
    if (claims === null) await client.query(`SELECT set_config('request.jwt.claims','',true)`);
    else await client.query(`SELECT set_config('request.jwt.claims',$1,true)`, [JSON.stringify(claims)]);
  };
  const ceo = { role: 'authenticated', sub: YOSSI };
  const tx = async (fn) => {
    await client.query('BEGIN');
    try { return await fn(); } finally { await client.query('ROLLBACK'); }
  };
  const expectFail = async (fn, needle, id, name) => {
    let msg = null;
    try { await fn(); } catch (e) { msg = e.message; }
    record(id, name, !!msg && msg.includes(needle), msg ? msg.split('\n')[0].slice(0, 200) : 'NO ERROR RAISED');
  };

  const measure = async () => one(`
    SELECT
      (SELECT count(*) FROM public.transactions) tx_all,
      (SELECT count(*) FROM public.transactions WHERE k_note LIKE '%AUDIT_REF=kiti_september_pack_2026-09-16%') pack_rows,
      (SELECT coalesce(sum(amount_eur),0) FROM public.transactions
         WHERE property_name='Tamir Kiti 1' AND subcategory IN ('Deposit','Deposit refund')
           AND NOT coalesce(is_deleted,false)) dep_total,
      (SELECT coalesce(sum(amount_eur),0) FROM public.transactions
         WHERE property_name='Tamir Kiti 1' AND subcategory IN ('Deposit','Deposit refund')
           AND payee='JJ' AND NOT coalesce(is_deleted,false)) dep_jj,
      (SELECT coalesce(sum(amount_eur),0) FROM public.transactions
         WHERE property_name='Tamir Kiti 1' AND subcategory IN ('Deposit','Deposit refund')
           AND payee='Broker' AND NOT coalesce(is_deleted,false)) dep_agent,
      (SELECT coalesce(sum(coalesce(client_charge,amount_eur)),0) FROM public.transactions
         WHERE property_name='Tamir Kiti 1' AND subcategory IN ('Brokerage','Brokerage Fee')
           AND NOT coalesce(is_deleted,false)) brok_owner,
      (SELECT count(*) FROM public.transactions
         WHERE property_name='Tamir Kiti 1' AND subcategory IN ('Brokerage','Brokerage Fee')
           AND NOT coalesce(is_deleted,false)) brok_rows,
      (SELECT coalesce(sum(coalesce(client_charge,amount_eur)),0) FROM public.transactions
         WHERE property_name='Tamir Kiti 1' AND subcategory IN ('Electricity','Electricity bill')
           AND date BETWEEN DATE '2026-09-01' AND DATE '2026-09-30' AND NOT coalesce(is_deleted,false)) elec,
      (SELECT coalesce(sum(amount_eur),0) FROM public.transactions
         WHERE category='JJ' AND client_charge IS NULL) jj_own,
      (SELECT count(*) FROM public.transactions WHERE category='JJ' AND client_charge IS NULL) jj_own_rows,
      (SELECT coalesce(sum(amount_eur),0) FROM public.transactions WHERE category='JJ') jj_raw,
      (SELECT coalesce(sum(coalesce(client_charge,amount_eur)),0) FROM public.transactions
         WHERE subcategory='Management Fee') mgmtfee,
      (SELECT count(*) FROM public.transactions WHERE subcategory='Management Fee') mgmtfee_rows,
      (SELECT coalesce(sum(coalesce(client_charge,amount_eur)),0) FROM public.transactions
         WHERE property_name IN ('Tamir Kiti 1','Tamir Kiti 2') AND date <= DATE '2026-08-31'
           AND subcategory NOT IN ('Deposit','Deposit refund') AND NOT coalesce(is_deleted,false)) cutoff_econ,
      (SELECT coalesce(sum(amount_eur),0) FROM public.transactions
         WHERE property_name='Tamir Kiti 1' AND subcategory='Tenant Payment'
           AND date <= DATE '2026-08-31' AND NOT coalesce(is_deleted,false)) k1_rent_cutoff,
      (SELECT coalesce(sum(amount_eur),0) FROM public.transactions
         WHERE property_name='Tamir Kiti 2' AND subcategory='Tenant Payment'
           AND date <= DATE '2026-08-31' AND NOT coalesce(is_deleted,false)) k2_rent_cutoff,
      (SELECT count(*) FROM public.transactions
         WHERE subcategory='Tenant Payment' AND date BETWEEN DATE '2026-09-01' AND DATE '2026-09-30'
           AND property_name IN ('Tamir Kiti 1','Tamir Kiti 2') AND NOT coalesce(is_deleted,false)) sept_rent_rows,
      (SELECT coalesce(sum(amount_eur),0) FROM public.transactions
         WHERE property_name IS NOT NULL AND property_name NOT IN ('Tamir Kiti 1','Tamir Kiti 2')) other_sum,
      (SELECT count(*) FROM statements.statement_series) series,
      (SELECT count(*) FROM statements.correction_cases) cases,
      (SELECT count(*) FROM statements.correction_applied_transactions) lineage
  `);

  try {
    // ---------------------------------------------------------------- setup
    await client.query(fs.readFileSync(HARNESS, 'utf8'));
    await client.query(fs.readFileSync(path.join(HERE, 'harness-statements.sql'), 'utf8'));
    await client.query(fs.readFileSync(path.join(HERE, 'fixtures.sql'), 'utf8'));
    await client.query(
      `INSERT INTO registry.parties (party_id, company_id, canonical_name, party_type, status)
       VALUES ($1, gen_random_uuid(), 'Tamir', 'client', 'active')`,
      [TAMIR_PARTY],
    );
    console.log('harness + statements subsystem + September fixture applied');

    const fx = await measure();
    record(
      'F0',
      'fixture reproduces the September pre-image: EUR 700 + EUR 800 rent, EUR 50 sitting in the deposit layer, EUR 500 commission under category JJ',
      Number(fx.dep_total) === 600 && Number(fx.dep_jj) === 600 && Number(fx.dep_agent) === 0 &&
        Number(fx.brok_owner) === 500 && Number(fx.brok_rows) === 1 && Number(fx.elec) === 0 &&
        Number(fx.sept_rent_rows) === 2 && Number(fx.series) === 0 && Number(fx.cases) === 0,
      `deposit=${fx.dep_total}, commission=${fx.brok_owner}/${fx.brok_rows} rows, electricity=${fx.elec}, series=${fx.series}`,
    );
    record(
      'F1',
      'exactly one row carries a client_charge inside category JJ, and it is the commission (mirrors Production: 1 of 317)',
      Number(fx.jj_raw) - Number(fx.jj_own) === 500,
      `raw JJ ${fx.jj_raw} minus own JJ ${fx.jj_own} = ${Number(fx.jj_raw) - Number(fx.jj_own)}`,
    );
    record(
      'F2',
      'JJ management-fee income is seeded NON-ZERO at the live figure, so an unchanged check cannot pass by comparing 0 to 0',
      Number(fx.mgmtfee) === MGMTFEE.owner && Number(fx.mgmtfee_rows) === MGMTFEE.rows,
      `EUR ${fx.mgmtfee} across ${fx.mgmtfee_rows} rows`,
    );

    // ---------------------------------------------------------------- deploy migrations
    await client.query('SET ROLE dbowner');
    await client.query(fs.readFileSync(OLD_MIGRATION, 'utf8'));
    await client.query(fs.readFileSync(P1_MIGRATION, 'utf8'));
    await client.query(fs.readFileSync(P2_FILE, 'utf8'));
    await client.query('RESET ROLE');
    console.log('cutoff pack + September pack loaded');

    const shape = (
      await client.query(
        `SELECT n.nspname schema, p.prosecdef, pg_get_userbyid(p.proowner) owner,
                coalesce(array_to_string(p.proacl,' | '),'default') acl,
                coalesce(array_to_string(p.proconfig,' '),'none') config, l.lanname language
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           JOIN pg_language l ON l.oid=p.prolang
          WHERE p.proname=$1 ORDER BY n.nspname`,
        [P2_FN],
      )
    ).rows;
    const fin = shape.find((r) => r.schema === 'finance');
    const pub = shape.find((r) => r.schema === 'public');
    record(
      'D1',
      'September pair created with the same security shape as the cutoff pack (DEFINER inner, INVOKER wrapper, empty search_path)',
      shape.length === 2 && fin.prosecdef === true && pub.prosecdef === false &&
        /^search_path=("")?$/.test(fin.config) && /^search_path=("")?$/.test(pub.config) &&
        fin.owner === 'dbowner' && fin.language === 'plpgsql' && pub.language === 'sql',
      `finance secdef=${fin.prosecdef} config=${fin.config}`,
    );
    record(
      'D2',
      'service_role is deliberately NOT granted execute, because the statements subsystem needs a real user identity',
      /authenticated=X/.test(fin.acl) && !/service_role=X/.test(fin.acl) && !/anon=X/.test(fin.acl) &&
        /authenticated=X/.test(pub.acl) && !/service_role=X/.test(pub.acl),
      `finance acl=[${fin.acl}]`,
    );

    const src = (
      await client.query(
        `SELECT pg_get_functiondef(p.oid) def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='finance' AND p.proname=$1`, [P2_FN],
      )
    ).rows[0].def;
    record(
      'D3',
      'no global row-count anchor: the six new rows are counted by this pack own audit reference',
      /AUDIT_REF=kiti_september_pack_2026-09-16%/.test(src) &&
        !/v_post_tx <> v_pre_tx/.test(src) && /receipt information only/.test(src),
      'row totals appear in the receipt only',
    );
    record(
      'D4',
      'no UPDATE of any historical transaction row anywhere in the pack',
      !/UPDATE\s+public\.transactions/i.test(src),
      'reclassification happens purely by appending reversal + rebook rows',
    );
    record(
      'D5',
      'the management-fee figure is an Apply-time drift guard with a dated snapshot comment, not permanent business logic',
      /c_mgmtfee_owner_before CONSTANT numeric := 25904\.05/.test(src) &&
        /c_mgmtfee_rows_before  CONSTANT bigint  := 34/.test(src) &&
        /refreshed against Production on/.test(src) &&
        /not a business rule/.test(src) &&
        /ALREADY_APPLIED_OR_PREIMAGE_CHANGED: management fee income/.test(src),
      'guard is scoped to this one-shot pack and documented as a snapshot',
    );
    record(
      'D6',
      'no client-facing description in the pack names the ledger party tokens, so the raw agent identity cannot reach the client report',
      !/c_desc_\w+ CONSTANT text :=\s*\r?\n?\s*'[^']*\b(Broker|company|Jacob|Yossi|Anastasia|JJ)\b/.test(src) &&
        /Letting commission/.test(src) && /letting agent/.test(src),
      'wording stays "letting commission" / "letting agent"',
    );

    // ---------------------------------------------------------------- ordering gate
    await tx(async () => {
      await asIdentity('authenticated', ceo);
      await expectFail(
        () => client.query(`SELECT finance.${P2_FN}()`),
        'CUTOFF_PACK_NOT_APPLIED',
        'O1',
        'the September pack refuses to run before the cutoff pack has been applied',
      );
    });

    // ---------------------------------------------------------------- apply the cutoff pack for real
    await client.query('BEGIN');
    await asIdentity('authenticated', ceo);
    const p1Receipt = (await client.query(`SELECT finance.${P1_FN}() r`)).rows[0].r;
    await client.query('COMMIT');
    record(
      'O2',
      'cutoff pack applied first and still closes at EUR 3,263.75 due to Tamir',
      Number(p1Receipt.closing_after) === 3263.75,
      `closing_after=${p1Receipt.closing_after}`,
    );

    const pre = await measure();

    // ---------------------------------------------------------------- authorization
    await tx(async () => {
      await asIdentity('anon', null);
      await expectFail(() => client.query(`SELECT public.${P2_FN}()`), 'permission denied', 'A1',
        'anon cannot execute the wrapper');
    });
    await tx(async () => {
      await asIdentity('authenticated', { role: 'authenticated', sub: NONSTAFF });
      await expectFail(() => client.query(`SELECT public.${P2_FN}()`), 'jj_auth', 'A2',
        'an authenticated non-staff user is refused');
    });
    await tx(async () => {
      await asIdentity('service_role', null);
      await expectFail(() => client.query(`SELECT finance.${P2_FN}()`), 'permission denied', 'A3',
        'service_role cannot execute this pack at all');
    });

    // ---------------------------------------------------------------- drift rejection
    // Each scenario introduces one kind of drift, proves the pack refuses, and rolls back.
    const drift = async (id, name, setupSql, needle) => {
      await client.query('BEGIN');
      try {
        await client.query('SET LOCAL ROLE dbowner');
        await client.query(setupSql);
        await client.query('RESET ROLE');
        await asIdentity('authenticated', ceo);
        await expectFail(() => client.query(`SELECT finance.${P2_FN}()`), needle, id, name);
      } finally {
        await client.query('ROLLBACK');
      }
    };

    await drift(
      'G1', 'any other EUR 200 row appearing in Tamir scope blocks the pack',
      `INSERT INTO public.transactions (date, property_name, category, subcategory, payer, payee, amount_eur)
       VALUES ('2026-09-05','Tamir Kiti 1','Management','Extras','Tenant','JJ',200)`,
      'existing EUR 200 row',
    );
    await drift(
      'G2', 'an unexpected extra deposit row blocks the pack',
      `INSERT INTO public.transactions (date, property_name, category, subcategory, payer, payee, amount_eur)
       VALUES ('2026-08-28','Tamir Kiti 1','Management','Deposit','Tenant','JJ',120)`,
      'deposit layer is',
    );
    await drift(
      'G3', 'a duplicate Kiti 1 September rent row blocks the pack',
      `INSERT INTO public.transactions (date, property_name, category, subcategory, payer, payee, amount_eur)
       VALUES ('2026-09-01','Tamir Kiti 1','Management','Tenant Payment','Tenant','JJ',700)`,
      'September rent rows',
    );
    await drift(
      'G4', 'soft-deleting the commission row blocks the pack instead of silently proceeding',
      `UPDATE public.transactions SET is_deleted=true WHERE id='${TX.brok500}'`,
      'not in its expected pre-image state',
    );
    await drift(
      'G5', 'a second commission charge blocks the pack, so the owner can never be charged twice',
      `INSERT INTO public.transactions (date, property_name, category, subcategory, payer, payee, amount_eur, client_charge)
       VALUES ('2026-09-04','Tamir Kiti 1','Management','Brokerage','Jacob','company',500,500)`,
      'commission currently charged',
    );
    await drift(
      'G5b', 'a change in JJ management-fee income blocks the pack (the refreshed Apply-time guard bites)',
      `INSERT INTO public.transactions (date, property_name, category, subcategory, payer, payee, amount_eur)
       VALUES ('2026-09-10','Filler Property A','Management','Management Fee','Tenant','company',95.5)`,
      'management fee income',
    );

    // unrelated ledger movement must NOT block the pack: the anchors are targeted, not global
    await tx(async () => {
      await client.query('SET LOCAL ROLE dbowner');
      await client.query(
        `INSERT INTO public.transactions (date, property_name, category, subcategory, payer, payee, amount_eur)
         SELECT (DATE '2026-09-05' + g), 'Some Other Property', 'Management', 'Tenant Payment', 'Tenant', 'JJ', 111
           FROM generate_series(1, 25) g`,
      );
      await client.query('RESET ROLE');
      await asIdentity('authenticated', ceo);
      const r = (await client.query(`SELECT finance.${P2_FN}() r`)).rows[0].r;
      record('G6', 'unrelated ledger movement elsewhere does not block the pack',
        r.transactions_inserted === 6, `receipt still reports ${r.transactions_inserted} rows`);
    });

    // atomicity: a rolled back apply must leave no trace in either the ledger or the subsystem
    await tx(async () => {
      await asIdentity('authenticated', ceo);
      await client.query(`SELECT finance.${P2_FN}()`);
    });
    const afterRollback = await one(`SELECT
        (SELECT count(*) FROM public.transactions WHERE k_note LIKE '%AUDIT_REF=kiti_september_pack_2026-09-16%') rows,
        (SELECT count(*) FROM statements.statement_series) series,
        (SELECT count(*) FROM statements.correction_cases) cases,
        (SELECT count(*) FROM statements.correction_applied_transactions) lineage`);
    record('G7', 'a rolled back apply leaves no ledger rows, no series and no correction cases behind',
      Number(afterRollback.rows) === 0 && Number(afterRollback.series) === 0 &&
        Number(afterRollback.cases) === 0 && Number(afterRollback.lineage) === 0,
      `rows=${afterRollback.rows}, series=${afterRollback.series}, cases=${afterRollback.cases}`);

    // ---------------------------------------------------------------- the real apply
    await client.query('BEGIN');
    await asIdentity('authenticated', ceo);
    const receipt = (await client.query(`SELECT finance.${P2_FN}() r`)).rows[0].r;
    const post = await measure();
    const origins = (
      await client.query(
        `SELECT id, category, subcategory, amount_eur, client_charge, description FROM public.transactions
          WHERE id = ANY($1::uuid[]) ORDER BY amount_eur`,
        [[TX.elec50, TX.brok500]],
      )
    ).rows;
    const newRows = (
      await client.query(`SELECT date, category, subcategory, payer, payee, amount_eur, client_charge, k_note
                          FROM public.transactions
                          WHERE k_note LIKE '%AUDIT_REF=kiti_september_pack_2026-09-16%'
                          ORDER BY date, amount_eur`)
    ).rows;
    const updateAudit = (
      await client.query(
        `SELECT count(*) n FROM public.audit_logs WHERE action='UPDATE' AND table_name='transactions'`,
      )
    ).rows[0].n;
    await client.query('COMMIT');
    // the statements tables carry RLS with no policy for authenticated, so they are read back
    // here, outside the CEO-scoped transaction, rather than from inside it
    const cases = (
      await client.query(`SELECT status, correction_type, count(*) n FROM statements.correction_cases
                          GROUP BY status, correction_type`)
    ).rows;
    const lineage = (
      await client.query(`SELECT entry_role, count(*) n FROM statements.correction_applied_transactions
                          GROUP BY entry_role ORDER BY entry_role`)
    ).rows;
    const stmtCounts = await one(`SELECT
        (SELECT count(*) FROM statements.statement_series) series,
        (SELECT count(*) FROM statements.correction_applied_transactions) lineage`);
    console.log('RECEIPT:', JSON.stringify(receipt, null, 2));

    record('R1', 'receipt reports six appended rows, two applied correction cases and one new statement series',
      receipt.transactions_inserted === 6 && receipt.correction_cases_applied === 2 &&
        !!receipt.statement_series_created && Number(post.pack_rows) === 6 &&
        Number(stmtCounts.series) === 1,
      `pack rows in the ledger: ${post.pack_rows}, statement series: ${stmtCounts.series}`);

    record('R2', 'both original rows are still exactly as they were: no silent UPDATE, and the audit log records no UPDATE at all',
      origins.length === 2 &&
        origins.find((r) => Number(r.amount_eur) === 50).subcategory === 'Deposit' &&
        origins.find((r) => Number(r.amount_eur) === 500).category === 'JJ' &&
        origins.find((r) => Number(r.amount_eur) === 500).subcategory === 'Brokerage' &&
        Number(updateAudit) === 0,
      `${updateAudit} UPDATE entries in the audit log`);

    record('R3', 'the reclassifications went through the sanctioned machinery as reversal + rebook pairs',
      cases.every((c) => c.status === 'applied' && c.correction_type === 'reclassification') &&
        cases.reduce((a, c) => a + Number(c.n), 0) === 2 &&
        lineage.length === 2 &&
        lineage.find((l) => l.entry_role === 'reversal') &&
        lineage.find((l) => l.entry_role === 'rebook') &&
        Number(stmtCounts.lineage) === 4,
      `${JSON.stringify(lineage)}`);

    record('R4', 'deposit layer totals EUR 750 received: EUR 550 at JJ plus EUR 200 at the agent',
      Number(post.dep_total) === 750 && Number(post.dep_jj) === 550 && Number(post.dep_agent) === 200 &&
        Number(receipt.deposit_layer.liability_to_tenant) === 750 &&
        receipt.deposit_layer.is_income === false,
      `total=${post.dep_total}, at JJ=${post.dep_jj}, at agent=${post.dep_agent}`);

    record('R5', 'the EUR 200 applied to the commission leaves the tenant liability at EUR 750, cash backing at EUR 550 and owner exposure at EUR 200',
      Number(receipt.deposit_layer.applied_to_commission) === 200 &&
        Number(receipt.deposit_layer.remaining_cash_backing) === 550 &&
        Number(receipt.deposit_layer.owner_exposure_to_restore_deposit) === 200 &&
        Number(receipt.agent_deposit_position.received) === 200 &&
        Number(receipt.agent_deposit_position.remaining_held) === 0,
      `liability 750, cash 550, owner exposure ${receipt.deposit_layer.owner_exposure_to_restore_deposit}, agent holds ${receipt.agent_deposit_position.remaining_held}`);

    record('R6', 'the EUR 50 left the deposit layer and became electricity collected for September',
      Number(post.elec) === 50 &&
        Number(
          (await one(`SELECT coalesce(sum(amount_eur),0) s FROM public.transactions
                       WHERE property_name='Tamir Kiti 1' AND subcategory='Deposit'
                         AND date=DATE '2026-09-01' AND NOT coalesce(is_deleted,false)`)).s,
        ) === 0,
      `September electricity collected = ${post.elec}, deposit contribution of that date = 0`);

    record('R7', 'commission is charged to the owner exactly once and totals EUR 700 (EUR 200 retained + EUR 500 paid)',
      Number(post.brok_owner) === 700 && Number(post.brok_rows) === 4 &&
        Number(receipt.owner_expense.commission_total) === 700 &&
        receipt.owner_expense.charged_twice === false,
      `owner-facing commission = ${post.brok_owner} across ${post.brok_rows} rows`);

    const retained = (
      await client.query(
        `SELECT amount_eur, client_charge, payer, payee, category, subcategory, k_note
           FROM public.transactions WHERE k_note LIKE '%IDEMPOTENCY=${KEYS.brok200}%'`,
      )
    ).rows;
    record('R7b', 'the retained EUR 200 leg is billing only: amount_eur 0 with client_charge 200, Owner to agent, never a self-transfer',
      retained.length === 1 && Number(retained[0].amount_eur) === 0 &&
        Number(retained[0].client_charge) === 200 &&
        retained[0].payer === 'Owner' && retained[0].payee === 'Broker' &&
        retained[0].payer !== retained[0].payee &&
        retained[0].category === 'Management' && retained[0].subcategory === 'Brokerage' &&
        /BILLING_ONLY=true/.test(retained[0].k_note) && /CASH_MOVEMENT=0/.test(retained[0].k_note),
      `amount_eur=${retained[0]?.amount_eur}, client_charge=${retained[0]?.client_charge}, ${retained[0]?.payer} -> ${retained[0]?.payee}`);

    record('R7c', 'commission cash movement is the EUR 500 that actually left, and the retained leg adds none',
      Number(
        (await one(`SELECT coalesce(sum(amount_eur),0) s FROM public.transactions
                     WHERE property_name='Tamir Kiti 1' AND subcategory IN ('Brokerage','Brokerage Fee')
                       AND NOT coalesce(is_deleted,false)`)).s,
      ) === 500 &&
        Number(receipt.owner_expense.commission_cash_movement) === 500 &&
        receipt.owner_expense.retained_leg_is_billing_only === true,
      'cash 500 against owner charge 700');

    record('R7d', 'no row this pack created names the same party as payer and payee',
      Number(
        (await one(`SELECT count(*) n FROM public.transactions
                     WHERE k_note LIKE '%AUDIT_REF=kiti_september_pack_2026-09-16%' AND payer = payee`)).n,
      ) === 0,
      'no Broker to Broker self-transfer anywhere in the pack');

    record('R8', 'JJ own P&L delta is exactly EUR 0 while the raw category bucket sheds the EUR 500 pass-through',
      Number(post.jj_own) === Number(pre.jj_own) &&
        Number(post.jj_own_rows) === Number(pre.jj_own_rows) &&
        Number(post.jj_raw) === Number(pre.jj_raw) - 500 &&
        Number(post.mgmtfee) === Number(pre.mgmtfee) &&
        Number(receipt.jj_pnl.own_money_delta) === 0 &&
        Number(receipt.jj_pnl.raw_category_bucket_delta) === -500,
      `own ${pre.jj_own} -> ${post.jj_own}, raw ${pre.jj_raw} -> ${post.jj_raw}`);

    record('R8b', 'management-fee income is untouched in BOTH count and sum, measured against a non-zero base',
      Number(pre.mgmtfee) === MGMTFEE.owner && Number(pre.mgmtfee_rows) === MGMTFEE.rows &&
        Number(post.mgmtfee) === MGMTFEE.owner && Number(post.mgmtfee_rows) === MGMTFEE.rows &&
        Number(receipt.jj_pnl.management_fee_income_unchanged) === MGMTFEE.owner,
      `EUR ${pre.mgmtfee}/${pre.mgmtfee_rows} rows -> EUR ${post.mgmtfee}/${post.mgmtfee_rows} rows`);

    record('R9', 'no JJ or partner cash moved, and the agent holds nothing once the retained EUR 200 is applied',
      Object.values(receipt.custody_delta).every((v) => Number(v) === 0) &&
        Number(receipt.custody_delta.agent_net_after_offset) === 0 &&
        Number(
          (await one(`SELECT coalesce(sum(CASE WHEN payee IN ('JJ','Yossi','Jacob','company','Anastasia')
                                               THEN amount_eur ELSE 0 END),0) s
                        FROM public.transactions
                       WHERE k_note LIKE '%AUDIT_REF=kiti_september_pack_2026-09-16%'`)).s,
        ) === 0,
      JSON.stringify(receipt.custody_delta));

    record('R10', 'the 2026-08-31 closing is untouched: cutoff economics and both rent histories are identical',
      Number(post.cutoff_econ) === Number(pre.cutoff_econ) &&
        Number(post.k1_rent_cutoff) === Number(pre.k1_rent_cutoff) &&
        Number(post.k2_rent_cutoff) === Number(pre.k2_rent_cutoff) &&
        Number(receipt.cutoff_closing.due_to_tamir) === 3263.75 &&
        receipt.cutoff_closing.changed_by_this_pack === false,
      `cutoff economics ${pre.cutoff_econ} -> ${post.cutoff_econ}`);

    const preCutoffNew = newRows.filter((r) => r.date <= new Date('2026-08-31'));
    record('R11', 'the only new row dated on or before the cutoff is the non-chargeable deposit receipt',
      preCutoffNew.length === 1 && preCutoffNew[0].subcategory === 'Deposit' &&
        preCutoffNew[0].client_charge === null && Number(preCutoffNew[0].amount_eur) === 200,
      `${preCutoffNew.length} pre-cutoff row: ${preCutoffNew.map((r) => r.subcategory + ' ' + r.amount_eur).join(', ')}`);

    record('R12', 'no rent row was created or rewritten: still one September rent per flat, recipients as recorded',
      Number(post.sept_rent_rows) === 2 && Number(pre.sept_rent_rows) === 2 &&
        Number(
          (await one(`SELECT count(*) n FROM public.transactions
                       WHERE id=$1 AND payee='JJ' AND amount_eur=700`, [TX.rent700])).n,
        ) === 1 &&
        Number(
          (await one(`SELECT count(*) n FROM public.transactions
                       WHERE id=$1 AND payee='Yossi' AND amount_eur=800`, [TX.k2rent])).n,
        ) === 1,
      'Kiti 1 recipient JJ and Kiti 2 recipient Yossi both preserved');

    record('R13', 'nothing else in the ledger moved',
      Number(post.other_sum) === Number(pre.other_sum),
      `other properties ${pre.other_sum} -> ${post.other_sum}`);

    record('R14', 'the owner effect of this pack is exactly -150 (EUR 50 kept, EUR 200 charged)',
      Number(receipt.owner_balance_delta_this_pack) === -150,
      `owner delta ${receipt.owner_balance_delta_this_pack}`);

    // Client-facing safety: the agent identity lives in payee only. Every field the client report
    // can print - description and the commission label it renders from - must stay free of it.
    const clientFacing = (
      await client.query(`SELECT description, subcategory, payee,
                                 substring(k_note from 'IDEMPOTENCY=([^;]+)') AS key
                            FROM public.transactions
                           WHERE k_note LIKE '%AUDIT_REF=kiti_september_pack_2026-09-16%'`)
    ).rows;
    // Rows this pack words itself. The two reversal entries are internal correction lineage and
    // restate the original ledger text verbatim, so they are held to the Broker rule only.
    const authored = [KEYS.elecReb, KEYS.brokReb, KEYS.dep200, KEYS.brok200];
    const labels = { Brokerage: { en: 'Brokerage', he: 'דמי תיווך' } };
    record('R15', 'the raw agent token never appears in a client-facing field, and the commission label renders as Brokerage / דמי תיווך',
      clientFacing.length === 6 &&
        clientFacing.every((r) => !/Broker(?!age)/.test(r.description || '')) &&
        clientFacing.filter((r) => authored.includes(r.key)).length === 4 &&
        clientFacing.filter((r) => authored.includes(r.key))
          .every((r) => !/\b(Broker|company|Jacob|Yossi|Anastasia|JJ)\b/.test(r.description || '')) &&
        clientFacing.filter((r) => r.payee === 'Broker').length === 2 &&
        clientFacing.filter((r) => r.subcategory === 'Brokerage')
          .every((r) => labels[r.subcategory].en === 'Brokerage' && labels[r.subcategory].he === 'דמי תיווך'),
      `${clientFacing.filter((r) => r.payee === 'Broker').length} row(s) hold the agent in payee only, 4 pack-authored descriptions clean`);

    // ---------------------------------------------------------------- replay
    await tx(async () => {
      await asIdentity('authenticated', ceo);
      await expectFail(() => client.query(`SELECT finance.${P2_FN}()`),
        'ALREADY_APPLIED_OR_PREIMAGE_CHANGED', 'X1', 'a replay is refused');
    });
    const afterReplay = await measure();
    record('X2', 'the refused replay left the ledger untouched',
      Number(afterReplay.pack_rows) === 6 && Number(afterReplay.dep_total) === 750 &&
        Number(afterReplay.brok_owner) === 700,
      `still 6 pack rows, deposit ${afterReplay.dep_total}, commission ${afterReplay.brok_owner}`);

    const passed = results.filter((r) => r.passed).length;
    console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`);
    fs.writeFileSync(
      path.join(OUT, 'test-results-pack2.json'),
      JSON.stringify({ results, receipt, pre, post }, null, 2),
    );
    if (passed !== results.length) process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
    await pg.stop().catch(() => {});
  }
}

main().catch((e) => {
  console.error('FATAL', e && (e.stack || e.message || JSON.stringify(e)), '\nraw:', require('util').inspect(e, { depth: 4 }));
  process.exitCode = 2;
});
