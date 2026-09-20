/* Isolated Postgres tests for 20260919200000 partner current-account foundation.
 * Nothing here touches Production.
 */
const fs = require('fs')
const path = require('path')
const { execSync, spawnSync } = require('child_process')
const { Client } = require('pg')
const net = require('net')

const HERE = __dirname
const REPO = path.resolve(HERE, '..', '..', '..')
const PORT = process.env.JJ_PG_PORT || '15450'
const CONTAINER = 'jj-partner-ca-pg'
const SETTLEMENT = path.join(REPO, 'supabase/migrations/20260919140000_client_settlement_layer.sql')
const CERTS = path.join(REPO, 'supabase/migrations/20260919160000_client_settlement_certifications.sql')
const FIFO = path.join(REPO, 'supabase/migrations/20260919170000_client_obligation_fifo_foundation.sql')
const PUBLIC_READ = path.join(REPO, 'supabase/migrations/20260919180000_public_read_certified_client_settlement.sql')
const CASH = path.join(REPO, 'supabase/migrations/20260919190000_client_cash_settlement_execution.sql')
const MIGRATION = path.join(REPO, 'supabase/migrations/20260919200000_partner_current_account_foundation.sql')
const BOOTSTRAP = path.join(REPO, 'supabase/tests/20260919160000_client_settlement_certifications/00_bootstrap.sql')
const FIFO_DELTA = path.join(REPO, 'supabase/tests/20260919170000_client_obligation_fifo_foundation/01_delta.sql')
const CASH_DELTA = path.join(REPO, 'supabase/tests/20260919190000_client_cash_settlement_execution/01_delta.sql')

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
  if (/CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.(v_rc3_classified|v_certified_ledger_transactions)/i.test(ddl)) {
    throw new Error('migration replaces RC3 or certified-ledger')
  }
  if (/noncash_settlement_credit/i.test(ddl)) throw new Error('overlay credit forbidden')
  if (/\bTamir\b/.test(ddl) || /0f352012-1403-4e3b-982a-7c019ee89f1b/i.test(ddl)) {
    throw new Error('Tamir data forbidden')
  }
  if (/4de83e15-e8cd-4abc-a104-5ddf8a2a3a4d/i.test(ddl)) {
    throw new Error('Production Yossi UUID forbidden')
  }
  if (!/SET search_path TO ''/.test(ddl)) throw new Error('empty search_path required')
  if (!/REVOKE ALL ON FUNCTION public.execute_partner_funded_client_settlement[\s\S]*FROM anon, service_role/.test(ddl)) {
    throw new Error('execute must revoke anon and service_role')
  }
  if (!/FORCE ROW LEVEL SECURITY/.test(ddl)) throw new Error('FORCE RLS required')
  if (/GRANT SELECT ON TABLE finance\.partner_funding_events/.test(ddl)
      || /GRANT SELECT ON TABLE finance\.partner_current_account_entries/.test(ddl)) {
    throw new Error('must not grant SELECT on deny-all partner tables')
  }
  if (/CREATE TABLE public\.business_events/.test(ddl) || /ALTER TABLE public\.business_events/.test(ddl)) {
    throw new Error('must not extend legacy public.business_events')
  }
}

async function main() {
  const migrationSql = fs.readFileSync(MIGRATION, 'utf8')
  assertMigrationGuards(migrationSql)

  try { execSync(`docker rm -f ${CONTAINER}`, { stdio: 'ignore' }) } catch (_) {}

  execSync(
    `docker run -d --name ${CONTAINER} -e POSTGRES_PASSWORD=testonly -p 127.0.0.1:${PORT}:5432 postgres:17-alpine`,
    { stdio: 'inherit' },
  )

  let client
  for (let i = 0; i < 30; i++) {
    client = new Client({
      host: '127.0.0.1', port: Number(PORT), user: 'postgres', password: 'testonly', database: 'postgres',
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

  const views = [
    'public.v_cashbox_audit',
    'public.v_certified_ledger_transactions',
    'public.v_rc3_classified',
    'public.v_contact_settlement_summary',
  ]

  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS extensions')
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions')
    const files = [BOOTSTRAP, FIFO_DELTA, SETTLEMENT, CERTS, FIFO, PUBLIC_READ, CASH_DELTA, CASH]
    for (const file of files) {
      console.log('apply', path.basename(file))
      await client.query(fs.readFileSync(file, 'utf8'))
    }
    console.log('apply', '01_delta.sql')
    await client.query(fs.readFileSync(path.join(HERE, '01_delta.sql'), 'utf8'))
    const defsBefore = {}
    for (const view of views) {
      defsBefore[view] = (await client.query('SELECT pg_get_viewdef($1::regclass, true) AS d', [view])).rows[0].d
    }
    console.log('apply', path.basename(MIGRATION))
    await client.query(migrationSql)
    for (const [view, before] of Object.entries(defsBefore)) {
      const after = (await client.query('SELECT pg_get_viewdef($1::regclass, true) AS d', [view])).rows[0].d
      if (before !== after) throw new Error('view definition changed: ' + view)
    }
    console.log('VIEW_DEFS_UNCHANGED')
    console.log('apply 99_matrix.sql')
    const lastResult = await client.query(fs.readFileSync(path.join(HERE, '99_matrix.sql'), 'utf8'))
    const resultSets = Array.isArray(lastResult) ? lastResult : [lastResult]
    const rows = resultSets.find((r) => r.rows && r.rows[0] && 'passed' in r.rows[0])?.rows
    console.table(rows)
    const failed = (rows || []).filter((r) => r.passed !== true)
    if (failed.length > 0) {
      throw new Error('ROLE_MATRIX_FAIL count=' + failed.length + ' ' + JSON.stringify(failed))
    }
    console.log('ROLE_MATRIX_PASS')

    const fin = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const zeta = '66666666-6666-4666-8666-666666666666'
    const north = '81818181-8181-4818-8818-818181818181'
    const claims = JSON.stringify({ sub: fin, role: 'authenticated' })
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [fin])
    await client.query("SELECT set_config('request.jwt.claim.role', 'authenticated', false)")
    await client.query("SELECT set_config('request.jwt.claims', $1, false)", [claims])
    const mk = () => new Client({
      host: '127.0.0.1', port: Number(PORT), user: 'postgres', password: 'testonly', database: 'postgres',
    })
    await client.query('SET ROLE authenticated')
    const live = await client.query(
      "SELECT public.preview_partner_funded_client_settlement($1::uuid, $2::uuid, 'JJ_TO_CLIENT', 5000.00, '2026-09-17') AS j",
      [zeta, north],
    )
    await client.query('RESET ROLE')
    const livePreview = live.rows[0].j
    if (!livePreview || livePreview.ok !== true) {
      throw new Error('concurrent preview not ok: ' + JSON.stringify(livePreview))
    }
    const left = mk()
    const right = mk()
    await left.connect()
    await right.connect()
    async function arm(c) {
      await c.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [fin])
      await c.query("SELECT set_config('request.jwt.claim.role', 'authenticated', false)")
      await c.query("SELECT set_config('request.jwt.claims', $1, false)", [claims])
      await c.query('SET ROLE authenticated')
      return c.query(
        "SELECT public.execute_partner_funded_client_settlement($1::uuid, $2::uuid, 'JJ_TO_CLIENT', 5000.00, '2026-09-17', $3, $4::jsonb, 'pf-concurrent-5000') AS j",
        [zeta, north, livePreview.preview_hash, JSON.stringify(livePreview.canonical_snapshot)],
      )
    }
    const settled = await Promise.allSettled([arm(left), arm(right)])
    await left.end().catch(() => {})
    await right.end().catch(() => {})
    const bodies = settled.map((s) => {
      if (s.status === 'fulfilled') return s.value.rows[0].j
      return { error: String(s.reason && s.reason.message ? s.reason.message : s.reason) }
    })
    const ids = bodies.map((b) => b.transaction_id).filter(Boolean)
    const unique = new Set(ids)
    if (unique.size !== 1 || ids.length < 1) {
      throw new Error('CONCURRENT_DOUBLE_CLICK_FAIL ' + JSON.stringify(bodies))
    }
    const n = await client.query(
      "SELECT count(*)::int AS n FROM finance.partner_funding_events WHERE idempotency_key = 'pf-concurrent-5000'",
    )
    if (n.rows[0].n !== 1) throw new Error('CONCURRENT_EVENT_FAIL n=' + n.rows[0].n)
    console.log('CONCURRENT_DOUBLE_CLICK_PASS transaction_id=' + ids[0])
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
