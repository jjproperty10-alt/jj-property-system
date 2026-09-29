const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const execTag = '$slice2_run$'

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
  const migration = body(
    'supabase/migrations/20260929200000_internal_operating_company_path.sql',
  )
  const rollback = body(
    'supabase/rollbacks/20260929200000_internal_operating_company_path_rollback.sql',
  )
  if (migration.includes(execTag) || rollback.includes(execTag)) {
    throw new Error('BLOCKED_BY_HARNESS: execution tag collides with migration body')
  }
  const matrix = body(
    'supabase/tests/20260929200000_internal_operating_company_path_matrix.sql',
  )
    .replaceAll('@@MIGRATION@@', () => migration)
    .replaceAll('@@ROLLBACK@@', () => rollback)
  return `BEGIN;\n${matrix}\nROLLBACK;\n`
}

if (require.main === module) {
  const sql = buildSql()
  assertNoDirectNestedDo(sql)
  const out = path.join(process.env.TEMP || '/tmp', 'jj-internal-company-path-matrix-run.sql')
  fs.writeFileSync(out, sql)
  const cli =
    process.env.SUPABASE_CLI ||
    'C:\\Users\\yossi\\AppData\\Local\\Temp\\cursor-sandbox-cache\\04f7fae1b342e3211352aac80795db1a\\npm\\_npx\\aa8e5c70f9d8d161\\node_modules\\.bin\\supabase.cmd'
  const workdir =
    process.env.SUPABASE_WORKDIR ||
    'C:\\Users\\yossi\\AppData\\Local\\Temp\\jj-uuid-guard-2600'
  const result = spawnSync(
    cli,
    [
      'db',
      'query',
      '--linked',
      '--workdir',
      workdir,
      '--project-ref',
      'vsiiprzjrstjcmjpwcrd',
      '-f',
      out,
      '-o',
      'json',
    ],
    { encoding: 'utf8', shell: true, maxBuffer: 20 * 1024 * 1024 },
  )
  process.stdout.write(result.stdout || '')
  if (result.stderr) process.stderr.write(result.stderr)
  process.exit(result.status === null ? 1 : result.status)
}

module.exports = { buildSql, assertNoDirectNestedDo }
