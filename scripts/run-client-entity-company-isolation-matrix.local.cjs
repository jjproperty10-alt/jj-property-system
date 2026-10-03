// Local-only retarget of scripts/run-client-entity-company-isolation-matrix.cjs.
// The original runner calls `supabase db query --linked` against Production.
// This copy never invokes the Supabase CLI. It refuses any non-local host,
// any Supabase CLI flag, and any known project ref.
//
// Usage:
//   JJ_THROWAWAY_PG='host=/tmp port=55432 user=postgres' \
//   node scripts/run-client-entity-company-isolation-matrix.local.cjs \
//     --fixture supabase/tests/fixtures/throwaway_company_base.sql \
//     --fixture supabase/tests/fixtures/throwaway_slice_a_preconditions.sql
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const execTag = '$clientent_run$'
const forbiddenRefs = ['vsiiprzjrstjcmjpwcrd', 'vaevswwojwalsuradohu', 'qoeaqjjlkzclzrkeaglj']

function body(file) {
  return fs
    .readFileSync(path.join(root, file), 'utf8')
    .split(/\r?\n/)
    .filter((line) => !/^\s*(BEGIN|COMMIT)\s*;\s*$/i.test(line))
    .join('\n')
}

function dollarTagAt(sql, index) {
  const match = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(index))
  return match ? match[0] : null
}

function assertPlpgsqlHasNoBareDo(bodySql) {
  let index = 0
  let quote = null
  while (index < bodySql.length) {
    if (!quote && bodySql.startsWith('--', index)) {
      const newline = bodySql.indexOf('\n', index)
      index = newline < 0 ? bodySql.length : newline + 1
      continue
    }
    const tag = bodySql[index] === '$' ? dollarTagAt(bodySql, index) : null
    if (tag) {
      quote = quote === tag ? null : quote || tag
      index += tag.length
      continue
    }
    if (
      !quote &&
      /^DO\s+\$/i.test(bodySql.slice(index)) &&
      (index === 0 || /[^A-Za-z0-9_]/.test(bodySql[index - 1]))
    ) {
      throw new Error('BLOCKED_BY_HARNESS: nested DO')
    }
    index += 1
  }
}

function assertNoDirectNestedDo(sql) {
  let index = 0
  while (index < sql.length) {
    if (sql.startsWith('--', index)) {
      const newline = sql.indexOf('\n', index)
      index = newline < 0 ? sql.length : newline + 1
      continue
    }
    const opener = /^DO\s+(\$[A-Za-z0-9_]*\$)/i.exec(sql.slice(index))
    const atBoundary = index === 0 || /[^A-Za-z0-9_]/.test(sql[index - 1])
    if (opener && atBoundary) {
      const tag = opener[1]
      const bodyStart = index + opener[0].length
      const bodyEnd = sql.indexOf(tag, bodyStart)
      if (bodyEnd < 0) throw new Error('BLOCKED_BY_HARNESS: unclosed DO')
      assertPlpgsqlHasNoBareDo(sql.slice(bodyStart, bodyEnd))
      index = bodyEnd + tag.length
      continue
    }
    index += 1
  }
}

function buildSql() {
  const migration = body('supabase/migrations/20260930220000_client_entity_company_isolation.sql')
  const rollback = body('supabase/rollbacks/20260930220000_client_entity_company_isolation_rollback.sql')
  if (migration.includes(execTag) || rollback.includes(execTag)) {
    throw new Error('BLOCKED_BY_HARNESS: execution tag collides with migration body')
  }
  const matrix = body('supabase/tests/20260930220000_client_entity_company_isolation_matrix.sql')
    .replaceAll('@@MIGRATION@@', () => migration)
    .replaceAll('@@ROLLBACK@@', () => rollback)
  return `BEGIN;\n${matrix}\nROLLBACK;\n`
}

function parseFixtures(argv) {
  const fixtures = []
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--fixture') {
      const value = argv[i + 1]
      if (!value) throw new Error('BLOCKED_BY_HARNESS: missing value for --fixture')
      fixtures.push(value)
      i += 1
      continue
    }
    throw new Error(`BLOCKED_BY_HARNESS: unknown argument ${argv[i]}`)
  }
  if (fixtures.length === 0) throw new Error('BLOCKED_BY_HARNESS: at least one --fixture is required')
  return fixtures
}

function assertLocalOnly(argv, conninfo) {
  const lowerArgs = argv.map((arg) => arg.toLowerCase())
  const joined = lowerArgs.join(' ')
  const cli = lowerArgs.some((arg) => (
    arg === 'supabase'
    || arg.endsWith('/supabase')
    || arg.endsWith('\\supabase')
    || arg.endsWith('supabase.cmd')
    || arg.endsWith('supabase.exe')
  ))
  if (cli || joined.includes('--linked') || joined.includes('--project-ref') || joined.includes('project-ref') || joined.includes('--workdir')) {
    throw new Error('BLOCKED_BY_HARNESS: refusing a Supabase CLI flag or project-ref')
  }
  const conn = (conninfo || '').toLowerCase()
  if (conn.includes('supabase') || conn.includes('pooler')) {
    throw new Error('BLOCKED_BY_HARNESS: refusing a Supabase target')
  }
  for (const ref of forbiddenRefs) {
    if (joined.includes(ref) || conn.includes(ref)) throw new Error('BLOCKED_BY_HARNESS: refusing a Supabase project ref')
  }
  if (!conninfo) throw new Error('BLOCKED_BY_HARNESS: set JJ_THROWAWAY_PG to a local throwaway server')
  const host = /host=([^\s]+)/.exec(conninfo)
  if (!host || !(host[1].startsWith('/') || host[1] === 'localhost' || host[1] === '127.0.0.1')) {
    throw new Error('BLOCKED_BY_HARNESS: host must be a local socket, localhost or 127.0.0.1')
  }
}

function psql(conninfo, db, extra, input) {
  return spawnSync('psql', [`${conninfo} dbname=${db}`, '-X', '-q', '-v', 'ON_ERROR_STOP=1', ...extra], {
    encoding: 'utf8',
    input,
    maxBuffer: 20 * 1024 * 1024,
  })
}

function allTrue(stdout) {
  const line = (stdout || '').split('\n').map((row) => row.trim()).find((row) => row.startsWith('{'))
  if (!line) return { ok: false, parsed: null }
  const parsed = JSON.parse(line)
  const values = Object.values(parsed)
  return { ok: values.length > 0 && values.every((value) => value === true), parsed }
}

function run(argv) {
  const conninfo = process.env.JJ_THROWAWAY_PG
  assertLocalOnly(argv, conninfo)
  const fixtures = parseFixtures(argv)
  const sql = buildSql()
  assertNoDirectNestedDo(sql)
  const db = `jj_throwaway_${process.pid}_${Date.now()}`
  const created = psql(conninfo, 'postgres', ['-c', `CREATE DATABASE ${db}`])
  if (created.status !== 0) throw new Error(`BLOCKED_BY_HARNESS: ${created.stderr}`)
  try {
    for (const fixture of fixtures) {
      const loaded = psql(conninfo, db, ['-f', path.join(root, fixture)])
      if (loaded.status !== 0) throw new Error(`fixture ${fixture} failed: ${loaded.stderr}`)
    }
    const result = psql(conninfo, db, ['-A', '-t'], sql)
    process.stdout.write(result.stdout || '')
    if (result.stderr) process.stderr.write(result.stderr)
    const scored = allTrue(result.stdout)
    const count = scored.parsed ? Object.keys(scored.parsed).length : 0
    const passed = scored.parsed ? Object.values(scored.parsed).filter((value) => value === true).length : 0
    process.stdout.write(`SLICE_A_MATRIX ${passed}/${count} passed\n`)
    return result.status === 0 && scored.ok ? 0 : 1
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

module.exports = { assertLocalOnly, buildSql, assertNoDirectNestedDo, parseFixtures }
