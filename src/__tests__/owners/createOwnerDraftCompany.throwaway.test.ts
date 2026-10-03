/**
 * Opt-in: runs the 20261003130000 migration + rollback matrix on a THROWAWAY
 * local PostgreSQL. Skipped unless JJ_THROWAWAY_PG is set, e.g.
 *   JJ_THROWAWAY_PG='host=/tmp port=55432 user=postgres' npx jest createOwnerDraftCompany.throwaway
 * The runner refuses Supabase and non-local hosts.
 */
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const maybe = process.env.JJ_THROWAWAY_PG ? describe : describe.skip
const root = path.resolve(__dirname, '..', '..', '..')

maybe('20261003130000 matrix on throwaway Postgres', () => {
  test('all matrix steps pass', () => {
    const result = spawnSync(
      'node',
      [
        'scripts/run-throwaway-pg-matrix.cjs',
        '--fixture', 'supabase/tests/fixtures/throwaway_company_base.sql',
        '--fixture', 'supabase/tests/fixtures/throwaway_slice_a_preconditions.sql',
        '--fixture', 'supabase/migrations/20260930220000_client_entity_company_isolation.sql',
        '--fixture', 'supabase/tests/fixtures/20261003130000_create_owner_draft_fixture.sql',
        '--migration', 'supabase/migrations/20261003130000_create_owner_draft_operating_company.sql',
        '--rollback', 'supabase/rollbacks/20261003130000_create_owner_draft_operating_company_rollback.sql',
        '--matrix', 'supabase/tests/20261003130000_create_owner_draft_operating_company_matrix.sql',
      ],
      { cwd: root, encoding: 'utf8', env: process.env },
    )
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain('MATRIX 21/21 passed')
    expect(result.status).toBe(0)
  })
})
