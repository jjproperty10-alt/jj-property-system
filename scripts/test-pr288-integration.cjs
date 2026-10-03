'use strict'

// Opt-in #288 integration runner. Refuses unless JJ_THROWAWAY_PG names a
// local throwaway server. Does not call the Supabase CLI and does not open
// a connection until the host check passes.
const { spawnSync } = require('child_process')
const path = require('path')
const { assertThrowaway } = require('./run-throwaway-pg-matrix.cjs')

try {
  assertThrowaway(process.env.JJ_THROWAWAY_PG)
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
}

const result = spawnSync(
  process.execPath,
  [
    path.join(__dirname, 'run-throwaway-pg-matrix.cjs'),
    '--fixture',
    'supabase/tests/fixtures/throwaway_company_base.sql',
    '--fixture',
    'supabase/tests/fixtures/pr288_minimum_schema.sql',
    '--matrix',
    'supabase/tests/20261003_pr288_session_alias_matrix.sql',
  ],
  { stdio: 'inherit' },
)

if (result.error) {
  process.stderr.write(`${result.error.message}\n`)
  process.exit(1)
}
process.exit(result.status === null ? 1 : result.status)
