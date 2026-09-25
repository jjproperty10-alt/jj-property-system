const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
function body(file) {
  return fs
    .readFileSync(path.join(root, file), 'utf8')
    .split(/\r?\n/)
    .filter((line) => !/^\s*(BEGIN|COMMIT)\s*;\s*$/i.test(line))
    .join('\n')
}

const sql = `
BEGIN;
${body('supabase/migrations/20260925120000_properties_operating_company_id.sql')}
${body('supabase/tests/20260925120000_properties_operating_company_matrix.sql')}
${body('supabase/rollbacks/20260925120000_properties_operating_company_id_rollback.sql')}
SELECT json_build_object(
  'failed', (SELECT count(*) FROM phase2_matrix WHERE NOT ok),
  'column_absent', NOT EXISTS (
    SELECT 1
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('properties', 'property_definitions')
      AND attribute.attname = 'operating_company_id'
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  ),
  'company_rows', (SELECT count(*) FROM registry.companies),
  'steps', (
    SELECT coalesce(json_agg(json_build_object('step', step, 'ok', ok, 'detail', detail) ORDER BY step), '[]'::json)
    FROM phase2_matrix
  )
) AS matrix;
ROLLBACK;
`
const out = path.join(process.env.TEMP || '/tmp', 'jj-p2-slice21-matrix-run.sql')
fs.writeFileSync(out, sql)
process.stdout.write(out + '\n')
