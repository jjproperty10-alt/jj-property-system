// Runs a migration + rollback matrix on a THROWAWAY local PostgreSQL only.
// Refuses any Supabase host or any non-local host. Never point this at
// Production, Staging, or any shared database.
//
// Usage:
//   JJ_THROWAWAY_PG='host=/tmp port=55432 user=postgres' \
//   node scripts/run-throwaway-pg-matrix.cjs \
//     --fixture supabase/tests/fixtures/throwaway_company_base.sql \
//     [--fixture <more fixtures>] \
//     [--migration <file>] [--rollback <file>] --matrix <file>
//
// The matrix may contain @@MIGRATION@@ and @@ROLLBACK@@; BEGIN/COMMIT lines
// of the migration and rollback are stripped so the whole run is one
// transaction that ends in ROLLBACK. A fresh database is created per run and
// dropped afterwards.
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')

function parseArgs(argv) {
  const out = { fixture: [], migration: null, rollback: null, matrix: null }
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '')
    const value = argv[i + 1]
    if (!value) throw new Error(`BLOCKED_BY_HARNESS: missing value for ${argv[i]}`)
    if (key === 'fixture') out.fixture.push(value)
    else if (key in out) out[key] = value
    else throw new Error(`BLOCKED_BY_HARNESS: unknown flag ${argv[i]}`)
  }
  if (!out.matrix) throw new Error('BLOCKED_BY_HARNESS: --matrix is required')
  return out
}

function assertThrowaway(conninfo) {
  if (!conninfo) throw new Error('BLOCKED_BY_HARNESS: set JJ_THROWAWAY_PG to a local throwaway server')
  const lower = conninfo.toLowerCase()
  if (lower.includes('supabase') || lower.includes('pooler') || lower.includes('vsiiprzjrstjcmjpwcrd')
      || lower.includes('vaevswwojwalsuradohu') || lower.includes('qoeaqjjlkzclzrkeaglj')) {
    throw new Error('BLOCKED_BY_HARNESS: refusing a Supabase target')
  }
  const host = /host=([^\s]+)/.exec(conninfo)
  if (!host || !(host[1].startsWith('/') || host[1] === 'localhost' || host[1] === '127.0.0.1')) {
    throw new Error('BLOCKED_BY_HARNESS: host must be a local socket, localhost or 127.0.0.1')
  }
}

function body(file) {
  return fs
    .readFileSync(path.join(root, file), 'utf8')
    .split(/\r?\n/)
    .filter((line) => !/^\s*(BEGIN|COMMIT)\s*;\s*$/i.test(line))
    .join('\n')
}

function buildMatrixSql(args) {
  const migration = args.migration ? body(args.migration) : ''
  const rollback = args.rollback ? body(args.rollback) : ''
  const matrix = body(args.matrix)
    .replaceAll('@@MIGRATION@@', () => migration)
    .replaceAll('@@ROLLBACK@@', () => rollback)
  return `BEGIN;\n${matrix}\nROLLBACK;\n`
}

function psql(conninfo, db, extra, input) {
  return spawnSync('psql', [`${conninfo} dbname=${db}`, '-X', '-q', '-v', 'ON_ERROR_STOP=1', ...extra], {
    encoding: 'utf8',
    input,
    maxBuffer: 20 * 1024 * 1024,
  })
}

function run(argv) {
  const conninfo = process.env.JJ_THROWAWAY_PG
  assertThrowaway(conninfo)
  const args = parseArgs(argv)
  const db = `jj_throwaway_${process.pid}_${Date.now()}`
  const created = psql(conninfo, 'postgres', ['-c', `CREATE DATABASE ${db}`])
  if (created.status !== 0) throw new Error(`BLOCKED_BY_HARNESS: ${created.stderr}`)
  try {
    for (const fixture of args.fixture) {
      const loaded = psql(conninfo, db, ['-f', path.join(root, fixture)])
      if (loaded.status !== 0) throw new Error(`fixture ${fixture} failed: ${loaded.stderr}`)
    }
    const result = psql(conninfo, db, ['-A', '-F', '|', '-t'], buildMatrixSql(args))
    process.stdout.write(result.stdout || '')
    if (result.stderr) process.stderr.write(result.stderr)
    const rows = (result.stdout || '').split('\n').filter((line) => /^[^|]+\|(t|f)\|/.test(line))
    const passed = rows.filter((line) => line.split('|')[1] === 't').length
    process.stdout.write(`MATRIX ${passed}/${rows.length} passed\n`)
    return result.status === 0 && rows.length > 0 && passed === rows.length ? 0 : 1
  } finally {
    psql(conninfo, 'postgres', ['-c', `DROP DATABASE IF EXISTS ${db}`])
  }
}

if (require.main === module) {
  try {
    process.exit(run(process.argv.slice(2)))
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exit(1)
  }
}

module.exports = { assertThrowaway, buildMatrixSql, parseArgs }
