/* Isolated Postgres tests for 20260928190000_str_monthly_certification_definer_privileges.
 * Applies the 20260924000000 bootstrap + original migration, then the repair migration, and
 * exercises the REAL PostgREST call path: SET LOCAL ROLE <api role> + COMMIT, so the
 * DEFERRABLE INITIALLY DEFERRED sum-check triggers actually fire as the session role.
 * (The 20260924000000 matrix ran its successful apply as postgres and never committed as
 * authenticated, which is why the defect was not caught.)
 * Nothing here touches Production.
 */
const fs = require('fs')
const path = require('path')
const { execSync, spawnSync } = require('child_process')
const { Client } = require('pg')
const net = require('net')

const HERE = __dirname
const REPO = path.resolve(HERE, '..', '..', '..')
const PORT = process.env.JJ_PG_PORT || '15498'
const CONTAINER = 'jj-str-monthly-definer-pg'
const BOOTSTRAP = path.join(REPO, 'supabase/tests/20260924000000_str_monthly_settlement_certifications/00_bootstrap.sql')
const BASE_MIGRATION = path.join(REPO, 'supabase/migrations/20260924000000_str_monthly_settlement_certifications.sql')
const MIGRATION = path.join(REPO, 'supabase/migrations/20260928190000_str_monthly_certification_definer_privileges.sql')

const CEO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const FIN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const OPS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ENT_A = '11111111-1111-4111-8111-111111111111'
const ENT_B = '22222222-2222-4222-8222-222222222222'
const PROP_A = '12121212-1212-4212-8212-121212121212'
const PROP_B = '13131313-1313-4313-8313-131313131313'
const FROM = '2026-06-01'
const TO = '2026-08-31'
const TOTAL = 15.35
const LINES = [
  { line_order: 1, month_start: '2026-06-01', reservation_count: 2, nights: 5, owner_net: 10.1, source_authority: 'approved_reconstruction', evidence_ref: 'ev', evidence_note: 'june', component_reconciliation_status: 'partial' },
  { line_order: 2, month_start: '2026-07-01', reservation_count: 1, nights: 2, owner_net: 5.25, source_authority: 'approved_reconstruction', evidence_ref: 'ev', evidence_note: 'july', component_reconciliation_status: 'partial' },
]
const APPLY_SIG = 'public.apply_str_monthly_settlement_certification(uuid,uuid,date,date,integer,uuid,numeric,text,text,text,jsonb)'
const VOID_SIG = 'public.void_str_monthly_settlement_certification(uuid,text,text)'
const PUB_READ_SIG = 'public.read_certified_str_monthly_settlement(uuid,uuid,date,date)'
const TRG_SIG = 'finance.trg_str_monthly_settlement_sum_deferred()'
const AUTH_SIG = 'finance.assert_str_monthly_settlement_authorized()'

function ddlOnly(sql) {
  return sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
}

function assertMigrationGuards(sql) {
  const ddl = ddlOnly(sql)
  if (/\b(INSERT\s+INTO|UPDATE\s+\w+(\.\w+)?\s+SET|DELETE\s+FROM|TRUNCATE)\b/i.test(ddl)) throw new Error('migration writes data')
  if (/\bpms\./i.test(ddl)) throw new Error('migration references pms schema')
  if (/public\.transactions/i.test(ddl)) throw new Error('migration references public.transactions')
  if (/DISABLE\s+ROW\s+LEVEL\s+SECURITY|NO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY|DROP\s+POLICY/i.test(ddl)) throw new Error('migration weakens RLS')
  if (/GRANT\s+(ALL|SELECT|INSERT|UPDATE|DELETE)[^;]*ON\s+(TABLE\s+)?finance\./i.test(ddl)) throw new Error('migration grants table access on finance')
  const applyGrant = ddl.match(/GRANT EXECUTE ON FUNCTION public\.apply_str_monthly_settlement_certification\([\s\S]*?TO authenticated;/)
  if (!applyGrant || /service_role|anon/.test(applyGrant[0])) throw new Error('apply must be authenticated-only')
  const readerGrant = ddl.match(/GRANT EXECUTE ON FUNCTION public\.read_certified_str_monthly_settlement\([\s\S]*?TO service_role;/)
  if (!readerGrant || /\b(anon|authenticated)\b/.test(readerGrant[0])) throw new Error('public reader must be service_role-only')
  if (!/CREATE OR REPLACE FUNCTION finance\.trg_str_monthly_settlement_sum_deferred\(\)[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path TO ''/.test(ddl)) throw new Error('trigger function must be SECURITY DEFINER with empty search_path')
}

async function waitClosed(port) {
  for (let i = 0; i < 20; i++) {
    const open = await new Promise((resolve) => {
      const socket = net.connect({ host: '127.0.0.1', port: Number(port) }, () => { socket.end(); resolve(true) })
      socket.on('error', () => resolve(false))
    })
    if (!open) return
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('port still open after container removal: ' + port)
}

const results = []
function record(name, passed, detail) { results.push({ test_name: name, passed: Boolean(passed), detail: String(detail ?? '') }) }

/** Real API call path: one transaction, session role = api role, JWT claims as PostgREST sets them, COMMIT. */
async function asApi(client, role, uid, fn) {
  await client.query('BEGIN')
  try {
    const claims = uid ? { sub: uid, role } : { role }
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true), set_config('request.jwt.claims', $3, true)`, [uid || '', role, JSON.stringify(claims)])
    await client.query(`SET LOCAL ROLE ${role}`)
    const value = await fn(client)
    await client.query('COMMIT')
    return { ok: true, value }
  } catch (e) {
    try { await client.query('ROLLBACK') } catch (_) { /* aborted */ }
    return { ok: false, error: e.message, code: e.code }
  }
}

const applyArgs = (ent, prop, key, total = TOTAL, lines = LINES, reason = 'r') =>
  ['SELECT public.apply_str_monthly_settlement_certification($1,$2,$3,$4,1,NULL,$5,$6,$7,$8,$9::jsonb) AS j', [ent, prop, FROM, TO, total, reason, 'ev', key, JSON.stringify(lines)]]

async function count(client, table, where = '', params = []) {
  const r = await client.query(`SELECT count(*)::int AS n FROM ${table} ${where}`, params)
  return r.rows[0].n
}

async function main() {
  const migrationSql = fs.readFileSync(MIGRATION, 'utf8')
  assertMigrationGuards(migrationSql)

  try { execSync(`docker rm -f ${CONTAINER}`, { stdio: 'ignore' }) } catch (_) { /* none */ }
  execSync(`docker run -d --name ${CONTAINER} -e POSTGRES_PASSWORD=testonly -p 127.0.0.1:${PORT}:5432 postgres:17-alpine`, { stdio: 'inherit' })

  let client
  for (let i = 0; i < 30; i++) {
    client = new Client({ host: '127.0.0.1', port: Number(PORT), user: 'postgres', password: 'testonly', database: 'postgres' })
    try { await client.connect(); break } catch (err) { await client.end().catch(() => {}); client = null; if (i === 29) throw err; await new Promise((r) => setTimeout(r, 1000)) }
  }
  if (!client) throw new Error('postgres did not become ready')

  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    await client.query(fs.readFileSync(BOOTSTRAP, 'utf8'))
    await client.query(fs.readFileSync(BASE_MIGRATION, 'utf8'))

    // Prove the defect exists BEFORE the repair (regression anchor).
    const before = await asApi(client, 'authenticated', CEO, async (c) => (await c.query(...applyArgs(ENT_A, PROP_A, 'k-before-fix'))).rows[0].j)
    record('defect_reproduced_before_repair', !before.ok && /permission denied for table str_monthly_settlement_certifications/.test(before.error) && (await count(client, 'finance.str_monthly_settlement_certifications')) === 0, before.error || 'NO ERROR')

    // Baseline fingerprints of everything the repair must not touch.
    const views = ['public.v_cashbox_audit', 'public.v_certified_ledger_transactions', 'public.v_rc3_classified', 'public.v_contact_settlement_summary']
    const viewDefs = {}
    for (const v of views) viewDefs[v] = (await client.query('SELECT pg_get_viewdef($1::regclass, true) AS d', [v])).rows[0].d
    const txFp = async () => (await client.query(`SELECT count(*)::text || ':' || md5(COALESCE(string_agg(t.id::text || '|' || t.review_status || '|' || t.amount_eur::text || '|' || t.payer || '|' || t.payee, E'\n' ORDER BY t.id), '')) AS fp FROM public.transactions t`)).rows[0].fp
    const optionalCount = async (table) => ((await client.query('SELECT to_regclass($1) IS NOT NULL AS ok', [table])).rows[0].ok ? count(client, table) : null)
    const guarded = ['finance.client_settlement_certifications', 'finance.client_settlement_events', 'finance.client_settlement_certification_lines']
    const txBefore = await txFp()
    const guardedBefore = {}
    for (const t of guarded) guardedBefore[t] = await optionalCount(t)

    console.log('apply', path.basename(MIGRATION))
    await client.query(migrationSql)
    console.log('apply', path.basename(MIGRATION), 'again (idempotency)')
    await client.query(migrationSql)

    for (const v of views) {
      const after = (await client.query('SELECT pg_get_viewdef($1::regclass, true) AS d', [v])).rows[0].d
      if (after !== viewDefs[v]) throw new Error('view definition changed: ' + v)
    }
    console.log('VIEW_DEFS_UNCHANGED')

    // ── Catalog: definer + empty search_path + owner privileges ──────────────────
    const fnRows = (await client.query(`
      SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS sig, p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) AS owner
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.oid IN ($1::regprocedure, $2::regprocedure, $3::regprocedure, $4::regprocedure, $5::regprocedure)`,
      [APPLY_SIG, VOID_SIG, PUB_READ_SIG, TRG_SIG, AUTH_SIG])).rows
    record('five_functions_present', fnRows.length === 5, fnRows.map((r) => r.sig).join(','))
    for (const r of fnRows) {
      record('definer_and_empty_search_path:' + r.sig.split('(')[0], r.prosecdef === true && Array.isArray(r.proconfig) && r.proconfig.includes('search_path=""'), JSON.stringify([r.prosecdef, r.proconfig]))
    }
    const own = (await client.query(`
      SELECT pg_get_userbyid(p.proowner) AS fn_owner,
             pg_get_userbyid(c1.relowner) AS cert_owner, pg_get_userbyid(c2.relowner) AS lines_owner,
             has_schema_privilege(pg_get_userbyid(p.proowner), 'finance', 'USAGE') AS schema_usage,
             has_table_privilege(pg_get_userbyid(p.proowner), 'finance.str_monthly_settlement_certifications', 'SELECT') AS cert_select,
             has_table_privilege(pg_get_userbyid(p.proowner), 'finance.str_monthly_settlement_lines', 'SELECT') AS lines_select,
             c1.relrowsecurity AND c1.relforcerowsecurity AS cert_force_rls,
             c2.relrowsecurity AND c2.relforcerowsecurity AS lines_force_rls,
             (SELECT count(*)::int FROM pg_policies WHERE schemaname='finance' AND tablename LIKE 'str_monthly_settlement%') AS policies
      FROM pg_proc p, pg_class c1, pg_class c2
      WHERE p.oid = $1::regprocedure AND c1.oid = 'finance.str_monthly_settlement_certifications'::regclass AND c2.oid = 'finance.str_monthly_settlement_lines'::regclass`, [TRG_SIG])).rows[0]
    record('trigger_fn_owner_is_table_owner_with_select', own.fn_owner === own.cert_owner && own.fn_owner === own.lines_owner && own.schema_usage && own.cert_select && own.lines_select, JSON.stringify(own))
    record('force_rls_and_deny_all_policies_preserved', own.cert_force_rls && own.lines_force_rls && own.policies === 3, JSON.stringify([own.cert_force_rls, own.lines_force_rls, own.policies]))
    const trg = (await client.query(`SELECT count(*)::int AS n FROM pg_trigger t WHERE t.tgfoid = $1::regprocedure AND t.tgdeferrable AND t.tginitdeferred AND NOT t.tgisinternal`, [TRG_SIG])).rows[0].n
    record('deferred_constraint_triggers_still_attached', trg === 2, String(trg))

    // ── Table access remains denied to API roles ────────────────────────────────
    for (const role of ['authenticated', 'anon']) {
      for (const t of ['finance.str_monthly_settlement_certifications', 'finance.str_monthly_settlement_lines', 'finance.str_monthly_settlement_audit']) {
        const r = await asApi(client, role, role === 'anon' ? null : CEO, async (c) => (await c.query(`SELECT count(*) FROM ${t}`)).rows[0])
        record(`table_select_denied:${role}:${t.split('.')[1]}`, !r.ok && /permission denied/.test(r.error), r.error || 'NO ERROR')
      }
    }
    const svcIns = await asApi(client, 'service_role', CEO, async (c) => c.query(`INSERT INTO finance.str_monthly_settlement_certifications DEFAULT VALUES`))
    record('service_role_table_insert_denied', !svcIns.ok && /permission denied/.test(svcIns.error), svcIns.error || 'NO ERROR')
    const priv = (await client.query(`
      SELECT bool_or(has_table_privilege(r, t, 'SELECT') OR has_table_privilege(r, t, 'INSERT') OR has_table_privilege(r, t, 'UPDATE') OR has_table_privilege(r, t, 'DELETE')) AS any_priv
      FROM unnest(ARRAY['anon','authenticated']) r, unnest(ARRAY['finance.str_monthly_settlement_certifications','finance.str_monthly_settlement_lines','finance.str_monthly_settlement_audit']) t`)).rows[0]
    record('api_roles_have_no_table_privileges', priv.any_priv === false, String(priv.any_priv))

    // ── Apply through the real call path ────────────────────────────────────────
    const ceo = await asApi(client, 'authenticated', CEO, async (c) => (await c.query(...applyArgs(ENT_A, PROP_A, 'k-ceo'))).rows[0].j)
    const ceoRows = await count(client, 'finance.str_monthly_settlement_certifications', 'WHERE idempotency_key = $1 AND status = $2', ['k-ceo', 'applied'])
    const ceoLines = ceo.ok ? await count(client, 'finance.str_monthly_settlement_lines', 'WHERE certification_id = $1', [ceo.value.id]) : 0
    record('ceo_authenticated_apply_commits', ceo.ok && ceo.value.status === 'applied' && ceo.value.replay === false && ceo.value.inserted_count === 2 && ceo.value.actor === CEO && ceoRows === 1 && ceoLines === 2, ceo.ok ? JSON.stringify(ceo.value) : ceo.error)

    const fin = await asApi(client, 'authenticated', FIN, async (c) => (await c.query(...applyArgs(ENT_B, PROP_B, 'k-fin'))).rows[0].j)
    record('finance_admin_authenticated_apply_commits', fin.ok && fin.value.status === 'applied' && fin.value.actor === FIN && (await count(client, 'finance.str_monthly_settlement_certifications', 'WHERE idempotency_key = $1', ['k-fin'])) === 1, fin.ok ? JSON.stringify(fin.value) : fin.error)

    const ops = await asApi(client, 'authenticated', OPS, async (c) => (await c.query(...applyArgs(ENT_A, PROP_B, 'k-ops'))).rows[0].j)
    record('operations_apply_denied', !ops.ok && /not permitted/i.test(ops.error), ops.error || 'NO ERROR')
    const anon = await asApi(client, 'anon', null, async (c) => (await c.query(...applyArgs(ENT_A, PROP_B, 'k-anon'))).rows[0].j)
    record('anon_apply_denied', !anon.ok && /permission denied/.test(anon.error), anon.error || 'NO ERROR')
    const svc = await asApi(client, 'service_role', CEO, async (c) => (await c.query(...applyArgs(ENT_A, PROP_B, 'k-svc'))).rows[0].j)
    record('service_role_apply_denied', !svc.ok && /permission denied/.test(svc.error), svc.error || 'NO ERROR')
    const nullActor = await asApi(client, 'authenticated', null, async (c) => (await c.query(...applyArgs(ENT_A, PROP_B, 'k-null'))).rows[0].j)
    record('null_actor_apply_denied', !nullActor.ok && /Authenticated session required/i.test(nullActor.error), nullActor.error || 'NO ERROR')
    record('denied_calls_persisted_nothing', (await count(client, 'finance.str_monthly_settlement_certifications')) === 2, 'expected 2 (ceo + fin)')

    // ── Deferred sum check still enforced as definer ────────────────────────────
    const badSum = await asApi(client, 'authenticated', CEO, async (c) => (await c.query(...applyArgs(ENT_B, PROP_A, 'k-badsum', 99.99))).rows[0].j)
    record('sum_mismatch_rejected_after_repair', !badSum.ok && /does not equal/.test(badSum.error) && (await count(client, 'finance.str_monthly_settlement_certifications', 'WHERE idempotency_key = $1', ['k-badsum'])) === 0, badSum.error || 'NO ERROR')

    // ── Replay semantics ────────────────────────────────────────────────────────
    const replay = await asApi(client, 'authenticated', CEO, async (c) => (await c.query(...applyArgs(ENT_A, PROP_A, 'k-ceo'))).rows[0].j)
    record('exact_replay_idempotent', replay.ok && replay.value.replay === true && replay.value.id === ceo.value.id && replay.value.inserted === false && (await count(client, 'finance.str_monthly_settlement_certifications')) === 2, replay.ok ? JSON.stringify(replay.value) : replay.error)
    const conflict = await asApi(client, 'authenticated', CEO, async (c) => (await c.query(...applyArgs(ENT_A, PROP_A, 'k-ceo', 20.35, [{ ...LINES[0], owner_net: 15.1 }, LINES[1]]))).rows[0].j)
    record('conflicting_replay_rejected', !conflict.ok && (await count(client, 'finance.str_monthly_settlement_certifications')) === 2, conflict.error || 'NO ERROR')

    // ── Forced audit failure rolls everything back ──────────────────────────────
    await client.query(`CREATE OR REPLACE FUNCTION pg_temp.boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced audit failure'; END $$`)
    await client.query(`CREATE TRIGGER zz_test_boom BEFORE INSERT ON finance.str_monthly_settlement_audit FOR EACH ROW EXECUTE FUNCTION pg_temp.boom()`)
    const boom = await asApi(client, 'authenticated', CEO, async (c) => (await c.query(...applyArgs(ENT_B, PROP_A, 'k-boom'))).rows[0].j)
    await client.query(`DROP TRIGGER zz_test_boom ON finance.str_monthly_settlement_audit`)
    record('forced_audit_failure_rolls_back', !boom.ok && /forced audit failure/.test(boom.error) && (await count(client, 'finance.str_monthly_settlement_certifications')) === 2 && (await count(client, 'finance.str_monthly_settlement_lines')) === 4 && (await count(client, 'finance.str_monthly_settlement_audit', 'WHERE certification_id NOT IN (SELECT id FROM finance.str_monthly_settlement_certifications)')) === 0, boom.error || 'NO ERROR')

    // ── Void authorization ──────────────────────────────────────────────────────
    const voidOps = await asApi(client, 'authenticated', OPS, async (c) => (await c.query('SELECT public.void_str_monthly_settlement_certification($1,$2,$3) AS j', [fin.value.id, 'x', 'ev'])).rows[0].j)
    record('operations_void_denied', !voidOps.ok && /not permitted/i.test(voidOps.error), voidOps.error || 'NO ERROR')
    const voidSvc = await asApi(client, 'service_role', CEO, async (c) => (await c.query('SELECT public.void_str_monthly_settlement_certification($1,$2,$3) AS j', [fin.value.id, 'x', 'ev'])).rows[0].j)
    record('service_role_void_denied', !voidSvc.ok && /permission denied/.test(voidSvc.error), voidSvc.error || 'NO ERROR')
    const voidCeo = await asApi(client, 'authenticated', CEO, async (c) => (await c.query('SELECT public.void_str_monthly_settlement_certification($1,$2,$3) AS j', [fin.value.id, 'rollback test', 'ev'])).rows[0].j)
    const voided = await count(client, 'finance.str_monthly_settlement_certifications', 'WHERE id = $1 AND status = $2', [fin.value.id, 'void'])
    record('ceo_void_commits', voidCeo.ok && voidCeo.value.status === 'void' && voided === 1, voidCeo.ok ? JSON.stringify(voidCeo.value) : voidCeo.error)

    // ── Public reader remains service_role-only and reads the CEO certification ──
    for (const role of ['authenticated', 'anon']) {
      const r = await asApi(client, role, role === 'anon' ? null : CEO, async (c) => (await c.query('SELECT public.read_certified_str_monthly_settlement($1,$2,$3,$4) AS j', [ENT_A, PROP_A, FROM, TO])).rows[0].j)
      record(`public_reader_denied:${role}`, !r.ok && /permission denied/.test(r.error), r.error || 'NO ERROR')
    }
    const read = await asApi(client, 'service_role', null, async (c) => (await c.query('SELECT public.read_certified_str_monthly_settlement($1,$2,$3,$4) AS j', [ENT_A, PROP_A, FROM, TO])).rows[0].j)
    record('service_role_public_reader_returns_certification', read.ok && read.value.unavailable === false && read.value.certification_id === ceo.value.id && Number(read.value.total_owner_net) === TOTAL && read.value.months.length === 2 && read.value.reconciliation.status === 'exact', read.ok ? JSON.stringify(read.value.reconciliation) : read.error)
    const finRead = await asApi(client, 'service_role', null, async (c) => (await c.query('SELECT finance.read_certified_str_monthly_settlement($1,$2,$3,$4) AS j', [ENT_A, PROP_A, FROM, TO])).rows[0].j)
    record('finance_reader_not_exposed_to_service_role', !finRead.ok && /permission denied/.test(finRead.error), finRead.error || 'NO ERROR')

    // ── Nothing else changed ────────────────────────────────────────────────────
    record('transactions_fingerprint_unchanged', (await txFp()) === txBefore, txBefore)
    for (const t of guarded) record('unchanged:' + t, (await optionalCount(t)) === guardedBefore[t], String(guardedBefore[t]))

    console.table(results)
    const failed = results.filter((r) => !r.passed)
    if (failed.length) throw new Error('ROLE_MATRIX_FAIL count=' + failed.length + ' ' + JSON.stringify(failed))
    console.log('ROLE_MATRIX_PASS count=' + results.length)
  } finally {
    await client.end().catch(() => {})
    spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' })
  }

  await waitClosed(PORT)
  const leftover = spawnSync('docker', ['ps', '-a', '--filter', `name=${CONTAINER}`, '--format', '{{.ID}}'], { encoding: 'utf8' })
  if (leftover.stdout && leftover.stdout.trim()) throw new Error('container still present: ' + leftover.stdout)
  console.log('CONTAINER_REMOVED port_closed=' + PORT)
}

main().catch((err) => {
  console.error(err)
  spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' })
  process.exit(1)
})
