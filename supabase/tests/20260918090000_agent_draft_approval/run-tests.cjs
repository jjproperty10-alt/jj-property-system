/* Isolated Postgres role matrix for 20260918090000. Nothing here touches Production. */
const fs = require('fs')
const path = require('path')
const { execSync, spawnSync } = require('child_process')
const { Client } = require('pg')

const HERE = __dirname
const REPO = path.resolve(HERE, '..', '..', '..')
const PORT = process.env.JJ_PG_PORT || '15433'
const CONTAINER = 'jj-draft-approval-pg'

function sql(rel) {
  return fs.readFileSync(path.join(REPO, rel), 'utf8')
}

async function main() {
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
    path.join(REPO, 'supabase/migrations/20260917090100_agent_transaction_drafts.sql'),
    path.join(REPO, 'supabase/migrations/20260917120000_agent_transaction_draft_public_rpcs.sql'),
    path.join(REPO, 'supabase/migrations/20260918090000_agent_draft_approval_rpcs.sql'),
    path.join(HERE, '99_matrix.sql'),
  ]

  try {
    let lastResult = null
    for (const file of files) {
      console.log('apply', path.basename(file))
      lastResult = await client.query(fs.readFileSync(file, 'utf8'))
    }
    const rows = Array.isArray(lastResult) ? lastResult[lastResult.length - 1].rows : lastResult.rows
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
}

main().catch((err) => {
  console.error(err)
  spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' })
  process.exit(1)
})
