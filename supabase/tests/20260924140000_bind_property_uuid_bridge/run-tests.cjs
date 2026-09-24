/* Isolated Postgres tests for the bind UUID bridge. No Production. */
const fs = require('fs')
const path = require('path')
const { execSync, spawnSync } = require('child_process')

const HERE = __dirname
const REPO = path.resolve(HERE, '..', '..', '..')
const PORT = process.env.JJ_PG_PORT || '15453'
const CONTAINER = 'jj-bind-uuid-bridge-pg'

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
  const migration = path.join(REPO, 'supabase/migrations/20260924140000_bind_property_uuid_bridge.sql')
  const ddl = fs.readFileSync(migration, 'utf8').replace(/--.*$/gm, '')
  if (/canonical_name|property_name|fuzzy/i.test(ddl)) {
    throw new Error('migration body must not match by name')
  }
  if (!/external_id = p_property_id::text/.test(ddl)) {
    throw new Error('bridge must compare external_id to the public UUID')
  }
  if (!/SET search_path TO ''/.test(ddl)) throw new Error('empty search_path required')
  if (!/FROM anon, service_role/.test(ddl)) throw new Error('anon and service_role must be revoked')
  if (!/GRANT EXECUTE ON FUNCTION public.bind_client_obligation_property/.test(ddl)) {
    throw new Error('authenticated grant missing')
  }

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
