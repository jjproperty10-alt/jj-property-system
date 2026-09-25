const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const execTag = '$phase22_run$'

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
      /^DO\b/i.test(bodySql.slice(index)) &&
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
  const migration = body('supabase/migrations/20260925140000_properties_operating_company_jj_backfill.sql')
  const rollback = body('supabase/rollbacks/20260925140000_properties_operating_company_jj_backfill_rollback.sql')
  if (migration.includes(execTag) || rollback.includes(execTag)) {
    throw new Error('BLOCKED_BY_HARNESS: execution tag collides with migration body')
  }
  const matrix = body('supabase/tests/20260925140000_properties_operating_company_backfill_matrix.sql')
    .replaceAll('@@MIGRATION@@', migration)
    .replaceAll('@@ROLLBACK@@', rollback)
  return `
BEGIN;
CREATE TEMP TABLE phase22_fp AS
SELECT
  (SELECT md5(string_agg((to_jsonb(properties) - 'operating_company_id')::text, ',' ORDER BY id)) FROM public.properties) AS properties_fp,
  (SELECT md5(string_agg((to_jsonb(property_definitions) - 'operating_company_id')::text, ',' ORDER BY property_name)) FROM public.property_definitions) AS definitions_fp;
${migration}
${matrix}
SELECT json_build_object(
  'failed', (SELECT count(*) FROM phase22_matrix WHERE NOT ok),
  'company_rows', (SELECT count(*) FROM registry.companies),
  'null_properties', (SELECT count(*) FROM public.properties WHERE operating_company_id IS NULL),
  'null_definitions', (SELECT count(*) FROM public.property_definitions WHERE operating_company_id IS NULL),
  'steps', (
    SELECT coalesce(json_agg(json_build_object('step', step, 'ok', ok, 'detail', detail) ORDER BY step), '[]'::json)
    FROM phase22_matrix
  )
) AS matrix;
ROLLBACK;
`
}

if (require.main === module) {
  const sql = buildSql()
  assertNoDirectNestedDo(sql)
  const out = path.join(process.env.TEMP || '/tmp', 'jj-p22-matrix-run.sql')
  fs.writeFileSync(out, sql)
  process.stdout.write(out + '\n')
}

module.exports = { buildSql, assertNoDirectNestedDo }
