/* Isolated real-Postgres proof for public.apply_reclassification_correction.
 * Uses the same embedded-postgres replica pattern as the Tamir packs.
 * No Production, no Uriel rows, no PostgREST.
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

const M = require('embedded-postgres')
const EmbeddedPostgres = M.default || M

const HERE = __dirname
const REPO = process.env.JJ_REPO_ROOT || path.resolve(HERE, '..', '..', '..')
const HARNESS = path.join(REPO, 'supabase', 'tests', '20260917223000_tamir_kiti_cutoff', 'harness.sql')
const STATEMENTS = path.join(REPO, 'supabase', 'tests', '20260917224500_tamir_kiti_september', 'harness-statements.sql')
const MIGRATION = path.join(REPO, 'supabase', 'migrations', '20260918100000_public_apply_reclassification_correction.sql')

const CEO = '277f81e0-3b89-41ed-a099-22585959b77a'
const OPS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const STRANGER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const PROP_A = '11111111-1111-4111-8111-111111111111'
const PROP_B = '22222222-2222-4222-8222-222222222222'
const TX1 = '33333333-3333-4333-8333-333333333333'
const TX2 = '44444444-4444-4444-8444-444444444444'
const PARTY = '55555555-5555-4555-8555-555555555555'
const SERIES = '66666666-6666-4666-8666-666666666666'

const results = []
function record(id, name, passed, detail) {
  results.push({ id, name, passed, detail: detail || null })
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${id} ${name}${detail ? ' :: ' + detail : ''}`)
}

async function main() {
  const dataDir = path.join(os.tmpdir(), 'jj-pg-reclass-' + Date.now())
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'testonly-local',
    port: Number(process.env.JJ_PG_PORT || 54500 + (process.pid % 150)),
    persistent: false,
    onLog: () => {},
    onError: () => {},
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  })
  console.log('initialising isolated cluster at', dataDir)
  await pg.initialise()
  await pg.start()
  const client = pg.getPgClient()
  await client.connect()
  const version = (await client.query('SELECT version()')).rows[0].version.split(',')[0]
  console.log('server:', version)

  const one = async (sql, params) => (await client.query(sql, params)).rows[0]
  const many = async (sql, params) => (await client.query(sql, params)).rows
  const asIdentity = async (role, claims) => {
    await client.query(`SET LOCAL ROLE ${role}`)
    if (claims === null) await client.query(`SELECT set_config('request.jwt.claims','',true)`)
    else await client.query(`SELECT set_config('request.jwt.claims',$1,true)`, [JSON.stringify(claims)])
  }
  const ceoClaims = { role: 'authenticated', sub: CEO }
  const opsClaims = { role: 'authenticated', sub: OPS }
  const strangerClaims = { role: 'authenticated', sub: STRANGER }

  const expectFail = async (fn, needle, id, name) => {
    let msg = null
    try { await fn() } catch (e) { msg = e.message }
    const ok = !!msg && (needle instanceof RegExp ? needle.test(msg) : msg.includes(needle))
    record(id, name, ok, msg ? msg.split('\n')[0].slice(0, 220) : 'NO ERROR RAISED')
  }

  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    await client.query(fs.readFileSync(HARNESS, 'utf8'))
    await client.query(fs.readFileSync(STATEMENTS, 'utf8'))
    await client.query(`
      GRANT authenticated, anon, service_role TO CURRENT_USER;
      GRANT EXECUTE ON FUNCTION public.require_jj_staff(text[]) TO postgres, authenticated, anon, service_role;
      GRANT EXECUTE ON FUNCTION statements.open_correction_case(uuid, uuid, text, text, numeric, numeric, text, jsonb, jsonb) TO postgres;
      GRANT EXECUTE ON FUNCTION statements.transition_correction_case(uuid, text, text, uuid) TO postgres;
      GRANT EXECUTE ON FUNCTION statements.apply_correction_case(uuid, jsonb) TO postgres;
    `)

    await client.query(`
      INSERT INTO auth.users (id, email) VALUES
        ('${CEO}', 'ceo@example.test'),
        ('${OPS}', 'ops@example.test'),
        ('${STRANGER}', 'stranger@example.test');
      INSERT INTO public.jj_staff_config (user_id, staff_role, is_active) VALUES
        ('${CEO}', 'ceo', true),
        ('${OPS}', 'operations', true);
      INSERT INTO public.properties (id, name) VALUES
        ('${PROP_A}', 'Fixture A'),
        ('${PROP_B}', 'Fixture B');
      INSERT INTO public.transactions (
        id, date, property_id, property_name, category, subcategory, description,
        payer, payee, amount_eur, client_charge
      ) VALUES
        ('${TX1}', '2026-01-15', '${PROP_A}', 'Fixture A', 'Management', 'Plumber', 'seed-one',
         'Anastasia', 'company', 29.37, NULL),
        ('${TX2}', '2026-02-01', '${PROP_A}', 'Fixture A', 'Management', 'Plumber', 'seed-two',
         'Anastasia', 'company', 10.00, NULL);
      INSERT INTO registry.parties (party_id, company_id, canonical_name, party_type)
        VALUES ('${PARTY}', '${PARTY}', 'Fixture Owner', 'owner');
      INSERT INTO statements.statement_series (
        series_id, owner_party_id, owner_display_name, property_display_name
      ) VALUES ('${SERIES}', '${PARTY}', 'Fixture Owner', 'Fixture A');
    `)

    const beforeTx = Number((await one('SELECT count(*)::int AS n FROM public.transactions')).n)
    const beforeCases = Number((await one('SELECT count(*)::int AS n FROM statements.correction_cases')).n)

    try {
      await client.query(fs.readFileSync(MIGRATION, 'utf8'))
      record('M1', 'migration SQL compiles and applies', true, MIGRATION)
    } catch (e) {
      record('M1', 'migration SQL compiles and applies', false, e.message.split('\n')[0].slice(0, 240))
      throw e
    }

    const cat = await one(`
      SELECT
        p.prosecdef AS security_definer,
        p.proconfig AS config,
        pg_get_function_identity_arguments(p.oid) AS args,
        (SELECT count(*) FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid=p2.pronamespace
          WHERE n2.nspname='public' AND p2.proname='apply_correction_case') AS generic_wrapper_count
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='apply_reclassification_correction'
    `)
    record('C1', 'catalog signature', cat.args === 'p_source_id uuid, p_correction_type text, p_corrected_fields jsonb, p_reason text, p_natural_key text', cat.args)
    record('C2', 'SECURITY DEFINER', cat.security_definer === true, String(cat.security_definer))
    record('C3', 'search_path empty', Array.isArray(cat.config) && cat.config.includes('search_path=""'), JSON.stringify(cat.config))
    record('C4', 'generic public.apply_correction_case absent', Number(cat.generic_wrapper_count) === 0, String(cat.generic_wrapper_count))

    const grants = await many(`
      SELECT r.rolname,
             has_function_privilege(r.oid, p.oid, 'EXECUTE') AS can_execute
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_roles r ON r.rolname IN ('anon','authenticated','service_role')
      WHERE n.nspname='public' AND p.proname='apply_reclassification_correction'
      ORDER BY r.rolname
    `)
    const grantMap = Object.fromEntries(grants.map(g => [g.rolname, g.can_execute]))
    record('G1', 'authenticated EXECUTE', grantMap.authenticated === true, JSON.stringify(grantMap))
    record('G2', 'anon no EXECUTE', grantMap.anon === false, JSON.stringify(grantMap))
    record('G3', 'service_role no EXECUTE', grantMap.service_role === false, JSON.stringify(grantMap))

    const rpc = `SELECT public.apply_reclassification_correction($1,$2,$3,$4,$5) AS j`
    const args1 = [
      TX1,
      'reclassification',
      JSON.stringify({ subcategory: 'Lock Replacement' }),
      'fixture reclass one',
      `${TX1}|reclassification||Lock Replacement|`,
    ]

    await client.query('BEGIN')
    await asIdentity('authenticated', ceoClaims)
    const first = (await client.query(rpc, args1)).rows[0].j
    await client.query('COMMIT')
    record('S1', 'authenticated CEO succeeds', first && first.replay === false && first.inserted_count === 2, JSON.stringify(first))

    const orig = await one(`SELECT id, amount_eur, payer, payee, date::text, subcategory, description FROM public.transactions WHERE id=$1`, [TX1])
    record('S2', 'original row unchanged', orig.amount_eur === '29.37' && orig.payer === 'Anastasia' && orig.payee === 'company' && orig.subcategory === 'Plumber' && orig.description === 'seed-one', JSON.stringify(orig))

    const events = (await many(
      `SELECT event_type FROM statements.correction_events
        WHERE case_id=$1
        ORDER BY created_at,
                 CASE event_type WHEN 'opened' THEN 1 WHEN 'approved' THEN 2 WHEN 'applied' THEN 3 ELSE 9 END`,
      [first.correction_case_id],
    )).map(r => r.event_type)
    record('S3', 'opened→approved→applied events written', events.join(',') === 'opened,approved,applied', events.join(','))

    const net = await one(
      `SELECT coalesce(sum(t.amount_eur),0) AS net
         FROM statements.correction_applied_transactions cat
         JOIN public.transactions t ON t.id = cat.applied_transaction_id
        WHERE cat.case_id=$1`,
      [first.correction_case_id],
    )
    record('S4', 'reversal/rebook net zero', Number(net.net) === 0, String(net.net))

    await client.query('BEGIN')
    await asIdentity('authenticated', ceoClaims)
    const replay = (await client.query(rpc, args1)).rows[0].j
    await client.query('COMMIT')
    const txAfterReplay = Number((await one('SELECT count(*)::int AS n FROM public.transactions')).n)
    record('S5', 'replay inserts zero', replay.replay === true && replay.inserted_count === 0 && txAfterReplay === beforeTx + 2, JSON.stringify({ replay: replay.replay, inserted_count: replay.inserted_count, tx: txAfterReplay, before: beforeTx }))

    await client.query('BEGIN')
    await expectFail(async () => {
      await asIdentity('anon', null)
      await client.query(rpc, args1)
    }, /permission denied|must be owner/i, 'R1', 'anon fails')
    await client.query('ROLLBACK')

    await client.query('BEGIN')
    await expectFail(async () => {
      await asIdentity('authenticated', opsClaims)
      await client.query(rpc, args1)
    }, /jj_auth|not permitted/, 'R2', 'non-staff (operations) fails')
    await client.query('ROLLBACK')

    await client.query('BEGIN')
    await expectFail(async () => {
      await asIdentity('authenticated', strangerClaims)
      await client.query(rpc, args1)
    }, /jj_auth|not in jj_staff_config/, 'R3', 'authenticated non-staff fails')
    await client.query('ROLLBACK')

    await client.query('BEGIN')
    await expectFail(async () => {
      await asIdentity('service_role', { role: 'service_role', sub: CEO })
      await client.query(rpc, args1)
    }, /permission denied|must be owner/i, 'R4', 'service_role fails')
    await client.query('ROLLBACK')

    const casesBeforeFail = Number((await one('SELECT count(*)::int AS n FROM statements.correction_cases')).n)
    const txBeforeFail = Number((await one('SELECT count(*)::int AS n FROM public.transactions')).n)
    await client.query('BEGIN')
    await client.query(`
      CREATE OR REPLACE FUNCTION statements.apply_correction_case(p_case_id uuid, p_rows jsonb)
      RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
      BEGIN
        RAISE EXCEPTION 'forced apply failure';
      END;
      $f$;
    `)
    let forcedMsg = null
    try {
      await asIdentity('authenticated', ceoClaims)
      await client.query(rpc, [
        TX2,
        'reclassification',
        JSON.stringify({ subcategory: 'Lock Replacement' }),
        'fixture reclass two',
        `${TX2}|reclassification||Lock Replacement|`,
      ])
    } catch (e) {
      forcedMsg = e.message
    }
    await client.query('ROLLBACK')
    const casesAfterFail = Number((await one('SELECT count(*)::int AS n FROM statements.correction_cases')).n)
    const txAfterFail = Number((await one('SELECT count(*)::int AS n FROM public.transactions')).n)
    record(
      'A1',
      'forced apply failure rolls back all rows',
      !!forcedMsg && /forced apply failure/.test(forcedMsg) && casesAfterFail === casesBeforeFail && txAfterFail === txBeforeFail,
      JSON.stringify({ forcedMsg: forcedMsg ? forcedMsg.split('\n')[0] : null, casesBeforeFail, casesAfterFail, txBeforeFail, txAfterFail, seedCases: beforeCases }),
    )
  } finally {
    try { await client.end() } catch {}
    try { await pg.stop() } catch {}
  }

  const failed = results.filter(r => !r.passed)
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    mode: 'REAL_POSTGRES_INTEGRATION',
    applied_to_production: false,
    passed: results.filter(r => r.passed).length,
    failed: failed.length,
    results,
  }, null, 2))
  if (failed.length) process.exit(1)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
