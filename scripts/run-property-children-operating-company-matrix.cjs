const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const execTag = '$phase3_run$'

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

function childFingerprint(table, orderSql) {
  return `coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY ${orderSql})) FROM ${table} AS row_alias), 'empty')`
}

function buildSql() {
  const migration = body('supabase/migrations/20260926140000_property_children_operating_company_id.sql')
  const rollback = body('supabase/rollbacks/20260926140000_property_children_operating_company_id_rollback.sql')
  if (migration.includes(execTag) || rollback.includes(execTag)) {
    throw new Error('BLOCKED_BY_HARNESS: execution tag collides with migration body')
  }
  const matrix = body('supabase/tests/20260926140000_property_children_operating_company_matrix.sql')
    .replaceAll('@@MIGRATION@@', migration)
    .replaceAll('@@ROLLBACK@@', rollback)
  return `
BEGIN;
CREATE TEMP TABLE phase3_fp AS
SELECT md5(concat(
  ${childFingerprint('public.property_owners', 'row_alias.id')},
  '|',
  ${childFingerprint('public.property_ownership', 'row_alias.id')},
  '|',
  ${childFingerprint('public.ownership', 'row_alias.id')},
  '|',
  ${childFingerprint('public.property_name_aliases', 'row_alias.raw_name')},
  '|',
  ${childFingerprint('public.property_reporting_map', 'row_alias.raw_name')},
  '|',
  ${childFingerprint('lifecycle.property_acquisition', 'row_alias.id')},
  '|',
  ${childFingerprint('lifecycle.service_engagements', 'row_alias.id')},
  '|',
  ${childFingerprint('lifecycle.management_fee_configs', 'row_alias.id')},
  '|',
  ${childFingerprint('pms.property_mappings', 'row_alias.id')}
)) AS children_fp,
(SELECT md5(string_agg(external_id, ',' ORDER BY id)) FROM pms.property_mappings) AS external_fp,
(SELECT count(*) FROM pms.property_mappings) AS mappings_n,
(SELECT count(*) FROM pms.connections) AS connections_n;
${migration}
${matrix}
SELECT json_build_object(
  'failed', (SELECT count(*) FROM phase3_matrix WHERE NOT ok),
  'child_columns', (
    SELECT count(*)
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE attribute.attname = 'operating_company_id'
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND (namespace.nspname, relation.relname) IN (
        ('public', 'property_owners'),
        ('public', 'property_ownership'),
        ('public', 'ownership'),
        ('public', 'property_name_aliases'),
        ('public', 'property_reporting_map'),
        ('lifecycle', 'property_acquisition'),
        ('lifecycle', 'service_engagements'),
        ('lifecycle', 'management_fee_configs'),
        ('pms', 'property_mappings')
      )
  ),
  'migration_26140000', (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926140000'),
  'steps', (
    SELECT coalesce(json_agg(json_build_object('step', step, 'ok', ok, 'detail', detail) ORDER BY step), '[]'::json)
    FROM phase3_matrix
  )
) AS matrix;
ROLLBACK;
`
}

if (require.main === module) {
  const sql = buildSql()
  assertNoDirectNestedDo(sql)
  const out = path.join(process.env.TEMP || '/tmp', 'jj-p3-matrix-run.sql')
  fs.writeFileSync(out, sql)
  process.stdout.write(out + '\n')
}

module.exports = { buildSql, assertNoDirectNestedDo }
