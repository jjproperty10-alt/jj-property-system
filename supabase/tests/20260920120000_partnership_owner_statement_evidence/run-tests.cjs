/* Isolated Postgres tests for 20260920120000.
 * Nothing here touches Production.
 */
const fs = require('fs')
const path = require('path')
const { execSync, spawnSync } = require('child_process')
const { Client } = require('pg')
const net = require('net')

const HERE = __dirname
const REPO = path.resolve(HERE, '..', '..', '..')
const PORT = process.env.JJ_PG_PORT || '15439'
const CONTAINER = 'jj-partnership-os-store-pg'
const MIGRATION = path.join(REPO, 'supabase/migrations/20260920120000_partnership_owner_statement_evidence.sql')
const CASH_BOOTSTRAP = path.join(REPO, 'supabase/tests/20260919160000_client_settlement_certifications/00_bootstrap.sql')
const FIFO_DELTA = path.join(REPO, 'supabase/tests/20260919170000_client_obligation_fifo_foundation/01_delta.sql')
const SETTLEMENT = path.join(REPO, 'supabase/migrations/20260919140000_client_settlement_layer.sql')
const CERTS = path.join(REPO, 'supabase/migrations/20260919160000_client_settlement_certifications.sql')
const FIFO = path.join(REPO, 'supabase/migrations/20260919170000_client_obligation_fifo_foundation.sql')
const PUBLIC_READ = path.join(REPO, 'supabase/migrations/20260919180000_public_read_certified_client_settlement.sql')
const CASH_DELTA = path.join(REPO, 'supabase/tests/20260919190000_client_cash_settlement_execution/01_delta.sql')
const CASH_MIGRATION = path.join(REPO, 'supabase/migrations/20260919190000_client_cash_settlement_execution.sql')
const CASH_WRAPPERS = [
  'public.preview_client_obligation_fifo(uuid,text,numeric,date)',
  'public.preview_client_cash_settlement(uuid,text,numeric,date)',
  'public.execute_client_cash_settlement(uuid,text,numeric,date,text,jsonb,text)',
  'public.reverse_client_cash_settlement(uuid,text)',
  'public.list_client_settlement_entities()',
  'public.read_client_settlement_balance(uuid,date)',
  'finance.read_certified_client_settlement(uuid,date)',
]
const CEO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const FORBIDDEN = [
  'guest_name',
  'guestName',
  'OWNER_MINIMAL',
  '594.25',
  'b2945e7f',
]

function ddlOnly(sql) {
  return sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
}

async function waitClosed(port) {
  for (let i = 0; i < 20; i++) {
    const open = await new Promise((resolve) => {
      const socket = net.connect({ host: '127.0.0.1', port: Number(port) }, () => {
        socket.end()
        resolve(true)
      })
      socket.on('error', () => resolve(false))
    })
    if (!open) return
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('port still open after container removal: ' + port)
}

function assertMigrationGuards(sql) {
  const ddl = ddlOnly(sql)
  const hits = FORBIDDEN.filter((token) => ddl.includes(token))
  if (hits.length) throw new Error('migration contains forbidden tokens: ' + hits.join(','))
  if (/INSERT\s+INTO\s+public\.transactions/i.test(ddl) || /UPDATE\s+public\.transactions/i.test(ddl)) {
    throw new Error('migration writes public.transactions')
  }
  if (!/ENABLE ROW LEVEL SECURITY/.test(ddl) || !/FORCE ROW LEVEL SECURITY/.test(ddl)) {
    throw new Error('migration must ENABLE + FORCE RLS')
  }
  if (!/SET search_path TO ''/.test(ddl)) {
    throw new Error('migration must set empty search_path on SECURITY DEFINER functions')
  }
  if (/listing_id\s+TEXT NOT NULL/.test(ddl.split('owner_statement_line')[1] || '')) {
    throw new Error('line table must not contain listing_id')
  }
}

function line(res, ci, co, gross, net) {
  return {
    reservation_id: res,
    check_in: ci,
    check_out: co,
    reservation_status: 'confirmed',
    gross_rental_revenue: gross,
    platform_fee: 0,
    guest_cleaning: 0,
    total_taxes: 0,
    management_charge: 0,
    net_owner_payout: net,
    currency: 'EUR',
    source_row_reference: 'Sheet1:R99',
    reconciliation_status: 'admitted_candidate',
  }
}

async function setJwt(client, uid) {
  await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid])
  await client.query("SELECT set_config('request.jwt.claim.role', 'authenticated', false)")
  await client.query("SELECT set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub: uid, role: 'authenticated' }),
  ])
}

async function concurrencyTest(port) {
  const a = new Client({
    host: '127.0.0.1',
    port: Number(port),
    user: 'postgres',
    password: 'testonly',
    database: 'postgres',
  })
  const b = new Client({
    host: '127.0.0.1',
    port: Number(port),
    user: 'postgres',
    password: 'testonly',
    database: 'postgres',
  })
  await a.connect()
  await b.connect()
  try {
    const linesA = [line('88888881', '2026-11-01', '2026-11-02', 10, 10)]
    const linesB = [line('88888881', '2026-11-01', '2026-11-02', 11, 11)]
    const hashA = (await a.query('SELECT partnership.owner_statement_payload_hash($1::jsonb) AS h', [JSON.stringify(linesA)])).rows[0].h
    const hashB = (await b.query('SELECT partnership.owner_statement_payload_hash($1::jsonb) AS h', [JSON.stringify(linesB)])).rows[0].h
    const payload = (docHash, lines, norm) => ({
      canonical_property_id: '4eb09c84-907a-404c-b19a-7856f73fadff',
      listing_id: '412148',
      source_kind: 'hostaway_owner_statement',
      document_hash: docHash,
      parser_version: 'hostaway_owner_minimal_xlsx_v1',
      normalized_payload_hash: norm,
      statement_from: '2026-08-30',
      statement_to: '2026-11-30',
      source_assertion: 'staff_confirmed_hostaway_download',
      lines,
    })
    const pa = payload('aa'.repeat(32), linesA, hashA)
    const pb = payload('bb'.repeat(32), linesB, hashB)

    await setJwt(a, CEO)
    await setJwt(b, CEO)
    await a.query("SET statement_timeout = '8s'")
    await b.query("SET statement_timeout = '8s'")

    const run = async (client, body) => {
      await client.query('BEGIN')
      await client.query('SET ROLE authenticated')
      const res = await client.query('SELECT public.ingest_partnership_owner_statement_document($1::jsonb) AS r', [body])
      await client.query('COMMIT')
      await client.query('RESET ROLE')
      return res.rows[0].r
    }

    const started = Date.now()
    const results = await Promise.allSettled([run(a, pa), run(b, pb)])
    const elapsed = Date.now() - started
    const values = results.map((r) => (r.status === 'fulfilled' ? r.value : { ok: false, reason: String(r.reason) }))
    const oks = values.filter((r) => r && r.ok === true)
    const conflicts = values.filter(
      (r) =>
        r &&
        r.ok === false &&
        (r.reason === 'reservation_conflict' || r.reason === 'cent_conflict'),
    )
    const effective = await a.query(
      `SELECT count(*)::int AS n
       FROM partnership.owner_statement_line l
       JOIN partnership.owner_statement_document d ON d.id = l.document_id
       WHERE l.reservation_id = '88888881'
         AND partnership.owner_statement_document_is_effective(d.id)`,
    )
    if (oks.length !== 1 || conflicts.length !== 1 || effective.rows[0].n !== 1) {
      throw new Error(
        'CONCURRENCY_FAIL oks=' +
          oks.length +
          ' conflicts=' +
          conflicts.length +
          ' effective=' +
          effective.rows[0].n +
          ' values=' +
          JSON.stringify(values) +
          ' elapsed_ms=' +
          elapsed,
      )
    }
    console.log('CONCURRENCY_SESSIONS ' + JSON.stringify(values))
    console.log('CONCURRENCY_PASS elapsed_ms=' + elapsed + ' effective_leaves=1')
  } finally {
    await a.end().catch(() => {})
    await b.end().catch(() => {})
  }
}

async function main() {
  const migrationSql = fs.readFileSync(MIGRATION, 'utf8')
  assertMigrationGuards(migrationSql)

  try {
    execSync(`docker rm -f ${CONTAINER}`, { stdio: 'ignore' })
  } catch (_) {}

  execSync(
    `docker run -d --name ${CONTAINER} -e POSTGRES_PASSWORD=testonly -p 127.0.0.1:${PORT}:5432 postgres:17-alpine`,
    { stdio: 'inherit' },
  )

  let client
  for (let i = 0; i < 30; i++) {
    client = new Client({
      host: '127.0.0.1',
      port: Number(PORT),
      user: 'postgres',
      password: 'testonly',
      database: 'postgres',
    })
    try {
      await client.connect()
      break
    } catch (err) {
      await client.end().catch(() => {})
      client = null
      if (i === 29) throw err
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  if (!client) throw new Error('postgres did not become ready')

  async function grantsFor(idents) {
    const out = {}
    for (const ident of idents) {
      const res = await client.query(
        `SELECT n.nspname || '.' || p.proname AS name,
                COALESCE(array_agg(r.rolname ORDER BY r.rolname) FILTER (WHERE acl.privilege_type = 'EXECUTE'), ARRAY[]::text[]) AS execute_roles
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl ON true
         JOIN pg_roles r ON r.oid = acl.grantee
         WHERE p.oid = $1::regprocedure
         GROUP BY 1`,
        [ident],
      )
      out[ident] = res.rows[0] || { name: ident, execute_roles: [] }
    }
    return out
  }

  const files = [
    CASH_BOOTSTRAP,
    FIFO_DELTA,
    SETTLEMENT,
    CERTS,
    FIFO,
    PUBLIC_READ,
    CASH_DELTA,
    CASH_MIGRATION,
    path.join(HERE, '00_bootstrap.sql'),
    MIGRATION,
    path.join(HERE, '99_matrix.sql'),
  ]

  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS extensions')
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions')
    let grantsBefore = null
    for (const file of files) {
      console.log('apply', path.basename(file))
      if (path.basename(file) === path.basename(MIGRATION)) {
        grantsBefore = await grantsFor(CASH_WRAPPERS)
        console.log('CASH_WRAPPER_GRANTS_BEFORE ' + JSON.stringify(grantsBefore))
      }
      const lastResult = await client.query(fs.readFileSync(file, 'utf8'))
      if (path.basename(file) === path.basename(MIGRATION)) {
        const grantsAfter = await grantsFor(CASH_WRAPPERS)
        console.log('CASH_WRAPPER_GRANTS_AFTER ' + JSON.stringify(grantsAfter))
        if (JSON.stringify(grantsBefore) !== JSON.stringify(grantsAfter)) {
          throw new Error('PR243 wrapper grants changed after Owner Statement migration')
        }
        console.log('PR243_WRAPPER_GRANTS_UNCHANGED')
        const osGrants = await grantsFor([
          'public.ingest_partnership_owner_statement_document(jsonb)',
          'public.read_partnership_owner_statement_for_listing(text,date,date)',
          'public.void_partnership_owner_statement_document(uuid,text,text)',
        ])
        console.log('OS_WRAPPER_GRANTS ' + JSON.stringify(osGrants))
        const cashObjs = await client.query(
          `SELECT to_regclass('finance.client_cash_settlement_executions') IS NOT NULL AS exec_tbl,
                  to_regclass('finance.client_obligation_fifo_allocations') IS NOT NULL AS alloc_tbl,
                  to_regclass('partnership.owner_statement_document') IS NOT NULL AS os_tbl`,
        )
        console.log('COMBINED_OBJECTS ' + JSON.stringify(cashObjs.rows[0]))
      }
      if (file.endsWith('99_matrix.sql')) {
        const resultSets = Array.isArray(lastResult) ? lastResult : [lastResult]
        const rows = resultSets.find((r) => r.rows && r.rows[0] && 'passed' in r.rows[0])?.rows
        console.table(rows)
        const failed = (rows || []).filter((r) => r.passed !== true)
        if (failed.length > 0) {
          throw new Error('ROLE_MATRIX_FAIL count=' + failed.length + ' ' + JSON.stringify(failed))
        }
        console.log('ROLE_MATRIX_PASS')
      }
    }
    await concurrencyTest(PORT)
  } finally {
    await client.end().catch(() => {})
    spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' })
  }

  await waitClosed(PORT)
  const leftover = spawnSync(
    'docker',
    ['ps', '-a', '--filter', `name=${CONTAINER}`, '--format', '{{.ID}}'],
    { encoding: 'utf8' },
  )
  if (leftover.stdout && leftover.stdout.trim()) {
    throw new Error('container still present: ' + leftover.stdout)
  }
  console.log('CONTAINER_REMOVED port_closed=' + PORT)
}

main().catch((err) => {
  console.error(err)
  spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' })
  process.exit(1)
})
