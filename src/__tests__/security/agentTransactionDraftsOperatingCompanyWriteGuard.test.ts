import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '../../..')
const migration = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/20260927160000_agent_transaction_drafts_operating_company_write_guard.sql',
  ),
  'utf8',
)
const rollback = fs.readFileSync(
  path.join(
    root,
    'supabase/rollbacks/20260927160000_agent_transaction_drafts_operating_company_write_guard_rollback.sql',
  ),
  'utf8',
)
const matrix = fs.readFileSync(
  path.join(
    root,
    'supabase/tests/20260927160000_agent_transaction_drafts_operating_company_write_guard_matrix.sql',
  ),
  'utf8',
)

function functionBody(source: string) {
  const open = 'AS $enforce$'
  const start = source.indexOf(open)
  const end = source.indexOf('$enforce$;', start)
  return source.slice(start + open.length, end)
}

describe('agent transaction draft company write guard', () => {
  it('installs a separate enforcement function only after the production guards', () => {
    const body = functionBody(migration)
    const guards = migration.slice(0, migration.indexOf('CREATE FUNCTION finance.enforce_agent_transaction_draft_company'))
    expect(migration.match(/CREATE FUNCTION finance\.enforce_agent_transaction_draft_company/g)).toHaveLength(1)
    expect(migration).not.toContain('CREATE OR REPLACE')
    expect(migration).not.toContain('session_replication_role')
    expect(migration).not.toContain('DISABLE TRIGGER')
    expect(body).not.toContain('10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    expect(body).toContain('BLOCKED_BY_COMPANY_CONTEXT')
    expect(body).toContain('BLOCKED_BY_COMPANY_REASSIGNMENT')
    expect(body).toContain('NEW.operating_company_id := sole_company')
    expect(body).not.toContain('EXECUTE')
    expect(guards).toContain('SHARE ROW EXCLUSIVE')
    expect(guards.indexOf('LOCK TABLE finance.agent_transaction_drafts')).toBeLessThan(
      guards.indexOf('LOCK TABLE registry.companies'),
    )
    expect(guards).toContain('BLOCKED_BY_HISTORY')
    expect(guards).toContain('BLOCKED_BY_TRIGGER')
    expect(guards).toContain('BLOCKED_BY_SCHEMA_DRIFT')
    expect(guards).toContain('BLOCKED_BY_GLOBAL_PIN')
    expect(guards).toContain('BLOCKED_BY_REAPPLY')
    expect(guards).toContain('<> 184')
    expect(guards).toContain('20260927140000')
    expect(guards).toContain('20260927160000')
    expect(guards).toContain('d7d613bf138b734626f9a82df3ac7075')
    expect(guards).toContain('6c97411f192611b3070d9df7369435d8')
    expect(guards).toContain('58e808d265aa0589a021c7dd15bdfcf6')
    expect(guards).toContain('e85ac033cf3a30443ecbbe777e1c81ff')
    expect(guards).toContain('68b7d11d856c6c9065984bdbeb85daad')
    expect(migration).toContain('dfcbb8a5bf1cd56e62b2cb9870870eb5')
    expect(migration).toContain('7dcd0c77d19854e707bbaa59bbf752cd')
    expect(migration).toContain('SET search_path = pg_catalog')
    expect(migration).toContain('SECURITY DEFINER')
    expect(migration).toContain('REVOKE ALL ON FUNCTION finance.enforce_agent_transaction_draft_company() FROM PUBLIC')
    expect(migration).toContain('FROM anon, authenticated, service_role')
    expect(migration).toContain('trg_agent_tx_drafts_company')
    expect(migration).not.toContain('resolve_child_operating_company(')
  })

  it('drops only the new trigger and function after the rollback guards', () => {
    const drops = rollback.slice(rollback.indexOf('DROP TRIGGER trg_agent_tx_drafts_company'))
    const guards = rollback.slice(0, rollback.indexOf('DROP TRIGGER trg_agent_tx_drafts_company'))
    expect(rollback.match(/DROP TRIGGER/g)).toHaveLength(1)
    expect(rollback.match(/DROP FUNCTION/g)).toHaveLength(1)
    expect(drops).toContain('DROP FUNCTION finance.enforce_agent_transaction_draft_company()')
    expect(guards).toContain('BLOCKED_BY_ROLLBACK')
    expect(guards).toContain('dfcbb8a5bf1cd56e62b2cb9870870eb5')
    expect(guards).toContain('7dcd0c77d19854e707bbaa59bbf752cd')
    expect(guards).toContain('58e808d265aa0589a021c7dd15bdfcf6')
    expect(guards).toContain('d7d613bf138b734626f9a82df3ac7075')
    expect(guards).toContain('6c97411f192611b3070d9df7369435d8')
    expect(guards).toContain('68b7d11d856c6c9065984bdbeb85daad')
    expect(rollback).not.toContain('DROP COLUMN')
    expect(rollback).not.toContain('DROP INDEX')
    expect(rollback).not.toContain('DROP CONSTRAINT')
    expect(rollback).not.toContain('session_replication_role')
    expect(rollback).not.toContain('DISABLE TRIGGER')
    expect(rollback).not.toContain('CREATE OR REPLACE')
    expect(drops.startsWith('DROP TRIGGER trg_agent_tx_drafts_company')).toBe(true)
  })

  it('keeps the matrix inside an outer rollback and covers the write probes', () => {
    const { buildSql, assertNoDirectNestedDo } = require(path.join(
      root,
      'scripts/run-agent-transaction-drafts-operating-company-write-guard-matrix.cjs',
    )) as { buildSql: () => string; assertNoDirectNestedDo: (sql: string) => void }
    const sql = buildSql()
    expect(() => assertNoDirectNestedDo(sql)).not.toThrow()
    expect(sql.startsWith('BEGIN;')).toBe(true)
    expect(sql.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    expect(sql).not.toContain('@@MIGRATION@@')
    expect(sql).not.toContain('@@ROLLBACK@@')
    expect(sql).not.toContain('session_replication_role')
    for (const step of [
      'history_present',
      'row_count',
      'null_assignment',
      'other_company',
      'second_company',
      'column_drift',
      'fk_drift',
      'index_drift',
      'rpc_drift',
      'rls_drift',
      'trigger_disabled',
      'trigger_drift',
      'rpc_omitted',
      'direct_omitted',
      'explicit_null',
      'explicit_canonical',
      'unknown_company',
      'inactive_company',
      'zero_omitted',
      'zero_explicit',
      'two_omitted',
      'two_explicit_canonical',
      'two_explicit_other',
      'service_role_assigns',
      'service_role_rejects',
      'update_reassign',
      'update_null',
      'ordinary_update',
      'guard_delete',
      'guard_identity',
      'direct_execute_anon',
      'direct_execute_authenticated',
      'direct_execute_service_role',
      'reapply',
      'rollback_missing_trigger',
      'rollback_drifted_function',
      'clean_rollback',
    ]) {
      expect(matrix).toContain(step)
    }
  })
})
