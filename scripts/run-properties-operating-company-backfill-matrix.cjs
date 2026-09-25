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

const migration = body('supabase/migrations/20260925140000_properties_operating_company_jj_backfill.sql')
const rollback = body('supabase/rollbacks/20260925140000_properties_operating_company_jj_backfill_rollback.sql')
const matrix = body('supabase/tests/20260925140000_properties_operating_company_backfill_matrix.sql')
  .replaceAll('@@MIGRATION@@', migration)
  .replaceAll('@@ROLLBACK@@', rollback)

const sql = `
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
const out = path.join(process.env.TEMP || '/tmp', 'jj-p22-matrix-run.sql')
fs.writeFileSync(out, sql)
process.stdout.write(out + '\n')
