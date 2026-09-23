/* Isolated Postgres tests for owner-level client obligations.
 * Uses docker exec psql. Nothing here touches Production.
 */
const fs = require('fs')
const path = require('path')
const { execSync, spawnSync } = require('child_process')
const net = require('net')

const HERE = __dirname
const REPO = path.resolve(HERE, '..', '..', '..')
const PORT = process.env.JJ_PG_PORT || '15452'
const CONTAINER = 'jj-owner-level-obligation-pg'
const SETTLEMENT = path.join(REPO, 'supabase/migrations/20260919140000_client_settlement_layer.sql')
const CERTS = path.join(REPO, 'supabase/migrations/20260919160000_client_settlement_certifications.sql')
const FIFO = path.join(REPO, 'supabase/migrations/20260919170000_client_obligation_fifo_foundation.sql')
const PUBLIC_READ = path.join(REPO, 'supabase/migrations/20260919180000_public_read_certified_client_settlement.sql')
const CASH = path.join(REPO, 'supabase/migrations/20260919190000_client_cash_settlement_execution.sql')
const PARTNER = path.join(REPO, 'supabase/migrations/20260919200000_partner_current_account_foundation.sql')
const MIGRATION = path.join(REPO, 'supabase/migrations/20260923233000_owner_level_client_obligation.sql')
const BOOTSTRAP = path.join(REPO, 'supabase/tests/20260919160000_client_settlement_certifications/00_bootstrap.sql')
const FIFO_DELTA = path.join(REPO, 'supabase/tests/20260919170000_client_obligation_fifo_foundation/01_delta.sql')
const CASH_DELTA = path.join(REPO, 'supabase/tests/20260919190000_client_cash_settlement_execution/01_delta.sql')
const PARTNER_DELTA = path.join(REPO, 'supabase/tests/20260919200000_partner_current_account_foundation/01_delta.sql')

function ddlOnly(sql) {
  return sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
}

function psql(sql) {
  const result = spawnSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'],
    { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'psql failed').slice(0, 4000))
  }
  return result.stdout || ''
}

function psqlFile(file) {
  console.log('apply', path.basename(file))
  return psql(fs.readFileSync(file, 'utf8'))
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
  if (/CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.(v_rc3_classified|v_certified_ledger_transactions|v_cashbox_audit|v_contact_settlement_summary)/i.test(ddl)) {
    throw new Error('migration replaces a forbidden public view')
  }
  if (/INSERT\s+INTO\s+public\.transactions/i.test(ddl) || /UPDATE\s+public\.transactions/i.test(ddl)) {
    throw new Error('migration writes public.transactions')
  }
  if (/\bTamir\b/.test(ddl) || /0f352012-1403-4e3b-982a-7c019ee89f1b/i.test(ddl)) {
    throw new Error('production client identity forbidden in migration')
  }
  if (!/SET search_path TO ''/.test(ddl)) throw new Error('empty search_path required')
  if (!/FORCE ROW LEVEL SECURITY/.test(ddl)) throw new Error('FORCE RLS required')
  if (!/REVOKE ALL ON FUNCTION public\.apply_owner_level_client_obligation[\s\S]*FROM anon, service_role/.test(ddl)) {
    throw new Error('apply must revoke anon and service_role')
  }
  if (!/component_code = 'owner_general_payment'/.test(ddl)) {
    throw new Error('only owner_general_payment may be null-property')
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

  let ready = false
  for (let i = 0; i < 30; i++) {
    const probe = spawnSync(
      'docker',
      ['exec', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', 'SELECT 1'],
      { encoding: 'utf8' },
    )
    if (probe.status === 0) {
      ready = true
      break
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  if (!ready) throw new Error('postgres did not become ready')

  try {
    psql('CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;')
    const files = [
      BOOTSTRAP, FIFO_DELTA, SETTLEMENT, CERTS, FIFO, PUBLIC_READ, CASH_DELTA, CASH, PARTNER_DELTA, PARTNER,
    ]
    for (const file of files) psqlFile(file)
    psql(`
      CREATE TABLE public._view_defs_before (name text PRIMARY KEY, def text NOT NULL);
      INSERT INTO public._view_defs_before (name, def)
      SELECT c.relname, pg_get_viewdef(c.oid, true)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN (
          'v_cashbox_audit', 'v_certified_ledger_transactions',
          'v_rc3_classified', 'v_contact_settlement_summary'
        );
    `)
    console.log('apply', path.basename(MIGRATION))
    psql(migrationSql)
    psql(`
      DO $$
      DECLARE r record;
      BEGIN
        FOR r IN
          SELECT b.name, b.def AS before_def, pg_get_viewdef(format('public.%I', b.name)::regclass, true) AS after_def
          FROM public._view_defs_before b
        LOOP
          IF r.before_def IS DISTINCT FROM r.after_def THEN
            RAISE EXCEPTION 'view definition changed: %', r.name;
          END IF;
        END LOOP;
      END $$;
    `)
    console.log('VIEW_DEFS_UNCHANGED')
    const out = psqlFile(path.join(HERE, '99_matrix.sql'))
    console.log(out)
    if (!/t\s+\|/.test(out) && !/\|\s+t\s+\|/.test(out) && !/\| t \|/.test(out)) {
      if (/\| f \|/.test(out)) throw new Error('ROLE_MATRIX_FAIL')
    }
    if (/\| f \|/.test(out)) throw new Error('ROLE_MATRIX_FAIL\n' + out)
    if (!/balance_before_owner_payment/.test(out)) throw new Error('matrix did not print results')
    console.log('ROLE_MATRIX_PASS')
  } finally {
    spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' })
  }

  await waitClosed(PORT)
  console.log('CONTAINER_REMOVED port_closed=' + PORT)
}

main().catch((err) => {
  console.error(err)
  spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' })
  process.exit(1)
})
