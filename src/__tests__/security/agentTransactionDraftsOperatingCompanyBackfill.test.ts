import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '../../..')
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260927140000_agent_transaction_drafts_operating_company_jj_backfill.sql'),
  'utf8',
)
const rollback = fs.readFileSync(
  path.join(root, 'supabase/rollbacks/20260927140000_agent_transaction_drafts_operating_company_jj_backfill_rollback.sql'),
  'utf8',
)
const matrix = fs.readFileSync(
  path.join(root, 'supabase/tests/20260927140000_agent_transaction_drafts_operating_company_backfill_matrix.sql'),
  'utf8',
)
const runner = fs.readFileSync(
  path.join(root, 'scripts/run-agent-transaction-drafts-operating-company-backfill-matrix.cjs'),
  'utf8',
)

function statementAt(source: string, marker: string) {
  const at = source.indexOf(marker)
  expect(at).toBeGreaterThan(0)
  return source.slice(at, source.indexOf(';', at))
}

describe('agent transaction draft company backfill', () => {
  it('assigns the two null keys only after the production guards', () => {
    const update = statementAt(migration, 'UPDATE finance.agent_transaction_drafts')
    const guards = migration.slice(0, migration.indexOf('UPDATE finance.agent_transaction_drafts'))
    expect(migration.match(/UPDATE finance\.agent_transaction_drafts/g)).toHaveLength(1)
    expect(update).toContain('SET operating_company_id = canonical')
    expect(update).toContain('WHERE operating_company_id IS NULL')
    expect(update).not.toContain('10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    expect(guards.indexOf('SELECT company_id')).toBeGreaterThan(guards.indexOf('BLOCKED_BY_BACKFILL: company registry'))
    expect(guards).toContain('SHARE ROW EXCLUSIVE')
    expect(guards.indexOf('LOCK TABLE finance.agent_transaction_drafts')).toBeLessThan(
      guards.indexOf('LOCK TABLE registry.companies'),
    )
    expect(guards).toContain('BLOCKED_BY_HISTORY')
    expect(guards).toContain('BLOCKED_BY_TRIGGER')
    expect(guards).toContain('BLOCKED_BY_SCHEMA_DRIFT')
    expect(guards).toContain('BLOCKED_BY_BACKFILL: row count')
    expect(guards).toContain('BLOCKED_BY_BACKFILL: preexisting assignment')
    expect(guards).toContain('BLOCKED_BY_BACKFILL: other company')
    expect(guards).toContain('BLOCKED_BY_BACKFILL: fingerprint')
    expect(guards).toContain('BLOCKED_BY_BACKFILL: business fingerprint')
    expect(guards).toContain('20260927120000')
    expect(guards).toContain('20260927140000')
    expect(guards).toContain('<> 183')
    expect(guards).toContain('ca713ec102eb2bda0bdfe72fe53a4847')
    expect(guards).toContain('6c97411f192611b3070d9df7369435d8')
    expect(guards).toContain('58e808d265aa0589a021c7dd15bdfcf6')
    expect(guards).toContain('e85ac033cf3a30443ecbbe777e1c81ff')
    expect(guards).toContain('tgtype = 31')
    expect(guards).toContain("tgenabled = 'O'")
    expect(guards).toContain('NEW.updated_at := now();')
    expect(guards).toContain('68b7d11d856c6c9065984bdbeb85daad')
    expect(migration).not.toContain('session_replication_role')
    expect(migration).not.toContain('DISABLE TRIGGER')
    expect(migration).not.toContain('CREATE OR REPLACE')
    expect(migration).not.toContain('SET NOT NULL')
    expect(migration).not.toMatch(/\bDEFAULT\b/)
  })

  it('clears only the canonical assignment and leaves the column in place', () => {
    const update = statementAt(rollback, 'UPDATE finance.agent_transaction_drafts')
    const guards = rollback.slice(0, rollback.indexOf('UPDATE finance.agent_transaction_drafts'))
    expect(rollback.match(/UPDATE finance\.agent_transaction_drafts/g)).toHaveLength(1)
    expect(update).toContain('SET operating_company_id = NULL')
    expect(update).toContain('WHERE operating_company_id = canonical')
    expect(update).not.toContain('10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    expect(guards).toContain('BLOCKED_BY_ROLLBACK: mixed company')
    expect(guards).toContain('BLOCKED_BY_ROLLBACK: null assignment')
    expect(guards).toContain('6c97411f192611b3070d9df7369435d8')
    expect(guards).toContain('58e808d265aa0589a021c7dd15bdfcf6')
    expect(guards).toContain('20260927140000')
    expect(rollback).not.toContain('DROP COLUMN')
    expect(rollback).not.toContain('DROP INDEX')
    expect(rollback).not.toContain('DROP CONSTRAINT')
    expect(rollback).not.toContain('ca713ec102eb2bda0bdfe72fe53a4847')
    expect(rollback).not.toContain('session_replication_role')
    expect(rollback).not.toContain('DISABLE TRIGGER')
    expect(rollback).not.toContain('CREATE OR REPLACE')
  })

  it('keeps the matrix inside an outer rollback and covers the drift probes', () => {
    const { buildSql, assertNoDirectNestedDo } = require(path.join(
      root,
      'scripts/run-agent-transaction-drafts-operating-company-backfill-matrix.cjs',
    )) as { buildSql: () => string; assertNoDirectNestedDo: (sql: string) => void }
    const sql = buildSql()
    expect(() => assertNoDirectNestedDo(sql)).not.toThrow()
    expect(sql.startsWith('BEGIN;')).toBe(true)
    expect(sql.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    expect(sql).not.toContain('@@MIGRATION@@')
    expect(sql).not.toContain('@@ROLLBACK@@')
    expect(sql).not.toContain('session_replication_role')
    expect(matrix).toContain('6c97411f192611b3070d9df7369435d8')
    expect(matrix).toContain('ca713ec102eb2bda0bdfe72fe53a4847')
    for (const step of [
      'history_present',
      'row_count',
      'preexisting_canonical',
      'other_company',
      'second_company',
      'column_drift',
      'fk_drift',
      'index_drift',
      'rpc_drift',
      'rls_drift',
      'trigger_disabled',
      'trigger_drift',
      'audit_timestamp',
      'business_fingerprint',
      'reapply',
      'rollback_one_null',
      'rollback_mixed',
      'clean_rollback',
    ]) {
      expect(matrix).toContain(step)
    }
    expect(runner).toContain('jj-s4-backfill-matrix-run.sql')
    expect(runner).toContain('process.env.TEMP')
    expect(matrix).toContain('DISABLE TRIGGER trg_agent_tx_drafts_guard')
  })
})
