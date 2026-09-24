/* Isolated Postgres tests for the partner-funded staff note. No Production. */
const fs = require('fs')
const path = require('path')
const { execSync, spawnSync } = require('child_process')

const HERE = __dirname
const REPO = path.resolve(HERE, '..', '..', '..')
const PORT = process.env.JJ_PG_PORT || '15454'
const CONTAINER = 'jj-staff-note-pg'

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function psqlFile(file) {
  const sql = fs.readFileSync(file)
  let last = ''
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = spawnSync(
      'docker',
      ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
      { input: sql, encoding: 'utf8' },
    )
    last = (result.stderr || '') + (result.stdout || '')
    if (result.status === 0) return result.stdout
    if (!/starting up|connection refused/.test(last)) throw new Error(last)
    sleep(1000)
  }
  throw new Error(last)
}

function main() {
  const migration = path.join(REPO, 'supabase/migrations/20260924190000_partner_funded_staff_note.sql')
  const ddl = fs.readFileSync(migration, 'utf8').replace(/--.*$/gm, '')
  if (/0f352012-1403-4e3b-982a-7c019ee89f1b|4de83e15-e8cd-4abc-a104-5ddf8a2a3a4d/.test(ddl)) {
    throw new Error('production identities forbidden in migration')
  }
  if (!/p_staff_note TEXT DEFAULT NULL/.test(ddl)) throw new Error('default note parameter missing')
  if (!/char_length\(staff_note\) <= 2000/.test(ddl)) throw new Error('length check missing')

  try { execSync(`docker rm -f ${CONTAINER}`, { stdio: 'ignore' }) } catch (_) {}
  execSync(
    `docker run -d --name ${CONTAINER} -e POSTGRES_PASSWORD=testonly -p 127.0.0.1:${PORT}:5432 postgres:17-alpine`,
    { stdio: 'inherit' },
  )
  let ready = false
  for (let i = 0; i < 30; i++) {
    const again = spawnSync('docker', ['exec', CONTAINER, 'pg_isready', '-U', 'postgres'], { encoding: 'utf8' })
    if (again.status === 0) { ready = true; break }
    sleep(1000)
  }
  if (!ready) throw new Error('postgres did not become ready')

  const files = [
    path.join(REPO, 'supabase/tests/20260919160000_client_settlement_certifications/00_bootstrap.sql'),
    path.join(REPO, 'supabase/tests/20260919170000_client_obligation_fifo_foundation/01_delta.sql'),
    path.join(REPO, 'supabase/migrations/20260919140000_client_settlement_layer.sql'),
    path.join(REPO, 'supabase/migrations/20260919160000_client_settlement_certifications.sql'),
    path.join(REPO, 'supabase/migrations/20260919170000_client_obligation_fifo_foundation.sql'),
    path.join(REPO, 'supabase/migrations/20260919180000_public_read_certified_client_settlement.sql'),
    path.join(REPO, 'supabase/tests/20260919190000_client_cash_settlement_execution/01_delta.sql'),
    path.join(REPO, 'supabase/migrations/20260919190000_client_cash_settlement_execution.sql'),
    path.join(REPO, 'supabase/tests/20260919200000_partner_current_account_foundation/01_delta.sql'),
    path.join(REPO, 'supabase/migrations/20260919200000_partner_current_account_foundation.sql'),
    migration,
    path.join(HERE, '99_matrix.sql'),
  ]
  try {
    for (const file of files) {
      console.log('apply', path.basename(file))
      const out = psqlFile(file)
      if (file.endsWith('99_matrix.sql')) {
        console.log(out)
        if (/\|\s+f\s+\|/.test(out)) throw new Error('ROLE_MATRIX_FAIL')
      }
    }
    console.log('ROLE_MATRIX_PASS')
  } finally {
    execSync(`docker rm -f ${CONTAINER}`, { stdio: 'inherit' })
  }
}

main()
