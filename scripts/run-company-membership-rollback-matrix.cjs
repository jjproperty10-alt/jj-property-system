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
${body('supabase/migrations/20260924210000_access_company_memberships.sql')}
${body('supabase/tests/20260924210000_company_membership_matrix.sql')}
${body('supabase/rollbacks/20260924210000_access_company_memberships_rollback.sql')}
SELECT json_build_object(
  'failed', (SELECT count(*) FROM phase1_matrix WHERE NOT ok),
  'access_after_explicit_rollback', to_regnamespace('access') IS NULL,
  'steps', (
    SELECT coalesce(json_agg(json_build_object('step', step, 'ok', ok, 'detail', detail) ORDER BY step), '[]'::json)
    FROM phase1_matrix
  )
) AS matrix;
ROLLBACK;
`
const out = path.join(process.env.TEMP || '/tmp', 'jj-mc-matrix-run.sql')
fs.writeFileSync(out, sql)
process.stdout.write(out)
