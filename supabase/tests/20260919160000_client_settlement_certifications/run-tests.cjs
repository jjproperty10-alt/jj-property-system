/* Isolated Postgres tests for 20260919160000.
 * Applies 20260919140000 first (FIFO/settlement reader dependency).
 * Nothing here touches Production.
 */
const fs = require('fs')
const path = require('path')
const { execSync, spawnSync } = require('child_process')
const { Client } = require('pg')
const net = require('net')

const HERE = __dirname
const REPO = path.resolve(HERE, '..', '..', '..')
const PORT = process.env.JJ_PG_PORT || '15438'
const CONTAINER = 'jj-client-settlement-cert-pg'
const SETTLEMENT = path.join(REPO, 'supabase/migrations/20260919140000_client_settlement_layer.sql')
const MIGRATION = path.join(REPO, 'supabase/migrations/20260919160000_client_settlement_certifications.sql')
const FORBIDDEN = [
  '2944e9ad',
  '09e99dfa',
  '27546e91',
  'c43ba2d0',
  '55000',
  '50677',
  '119677',
  '182098',
  'Uriel',
  'Sharon',
  'Kamares',
  'Oroklini',
  'Kitty',
  'Debenhams',
  'Kokkines',
  'Dekelia',
  'Neer',
  'Yoav',
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
  if (
    /CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.(v_cashbox_audit|v_certified_ledger_transactions|v_rc3_|v_contact_settlement_summary)/i.test(
      ddl,
    )
  ) {
    throw new Error('migration replaces a forbidden public view')
  }
  if (/INSERT\s+INTO\s+public\.transactions/i.test(ddl) || /UPDATE\s+public\.transactions/i.test(ddl)) {
    throw new Error('migration writes public.transactions')
  }
  if (!/ENABLE ROW LEVEL SECURITY/.test(ddl) || !/FORCE ROW LEVEL SECURITY/.test(ddl)) {
    throw new Error('migration must ENABLE + FORCE RLS')
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

  const files = [
    path.join(HERE, '00_bootstrap.sql'),
    SETTLEMENT,
    MIGRATION,
    path.join(HERE, '99_matrix.sql'),
  ]

  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    const defsBefore = {}
    await client.query(fs.readFileSync(files[0], 'utf8'))
    for (const view of [
      'public.v_cashbox_audit',
      'public.v_certified_ledger_transactions',
      'public.v_rc3_classified',
      'public.v_contact_settlement_summary',
    ]) {
      defsBefore[view] = (await client.query('SELECT pg_get_viewdef($1::regclass, true) AS d', [view])).rows[0].d
    }
    console.log('apply', path.basename(files[1]))
    await client.query(fs.readFileSync(files[1], 'utf8'))
    console.log('apply', path.basename(files[2]))
    await client.query(fs.readFileSync(files[2], 'utf8'))
    for (const [view, before] of Object.entries(defsBefore)) {
      const after = (await client.query('SELECT pg_get_viewdef($1::regclass, true) AS d', [view])).rows[0].d
      if (before !== after) throw new Error('view definition changed: ' + view)
    }
    console.log('VIEW_DEFS_UNCHANGED')
    console.log('apply', path.basename(files[3]))
    const lastResult = await client.query(fs.readFileSync(files[3], 'utf8'))
    const resultSets = Array.isArray(lastResult) ? lastResult : [lastResult]
    const rows = resultSets.find((r) => r.rows && r.rows[0] && 'passed' in r.rows[0])?.rows
    console.table(rows)
    const failed = (rows || []).filter((r) => r.passed !== true)
    if (failed.length > 0) {
      throw new Error('ROLE_MATRIX_FAIL count=' + failed.length + ' ' + JSON.stringify(failed))
    }
    console.log('ROLE_MATRIX_PASS')
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
