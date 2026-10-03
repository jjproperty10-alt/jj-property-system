import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..', '..', '..')

function read(file: string): string {
  return readFileSync(path.join(root, file), 'utf8')
}

function productionFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      productionFiles(full, out)
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      out.push(full)
    }
  }
  return out
}

describe('client and entity company isolation database slice', () => {
  const migration = read('supabase/migrations/20260930220000_client_entity_company_isolation.sql')
  const rollback = read('supabase/rollbacks/20260930220000_client_entity_company_isolation_rollback.sql')
  const matrix = read('supabase/tests/20260930220000_client_entity_company_isolation_matrix.sql')
  const runner = read('scripts/run-client-entity-company-isolation-matrix.cjs')
  const gate = read('src/lib/auth/serviceRoleCompanyGate.ts')
  const ownerDraft = read('supabase/migrations/20260810_001_pr4_wizard_foundation.sql')

  test('fills only the sole company and leaves application code unchanged', () => {
    for (const file of [migration, rollback, matrix, runner]) {
      expect(file.includes('\r')).toBe(false)
      expect(file).not.toContain('10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    }
    expect(migration).toContain('<> 193')
    expect(migration).toContain("version = '20260930200000'")
    expect(migration).toContain('ADD COLUMN operating_company_id uuid')
    expect(migration).toContain('WHERE operating_company_id IS NULL')
    expect(migration).toContain('ALTER COLUMN operating_company_id SET NOT NULL')
    expect(migration).toContain('entity_identity_canonical_name_uq remains global')
    expect(migration).not.toContain('DROP INDEX lifecycle.entity_identity_canonical_name_uq')
    expect(migration).not.toContain('set_config(')
    expect(migration).not.toContain('INSERT INTO registry.companies')
    expect(migration).not.toContain('UPDATE registry.parties')
    expect(migration).not.toContain('session_replication_role')
    expect(migration).toContain('CREATE POLICY company_member_read')
    expect(migration).not.toContain('AS PERMISSIVE')
    expect(rollback).toContain('DROP COLUMN operating_company_id')
    expect(rollback).toContain('DROP FUNCTION lifecycle.enforce_client_entity_company();')
    expect(rollback).not.toContain('DELETE FROM lifecycle.entity_identity')
    expect(rollback).not.toContain('DELETE FROM registry.parties')
    expect(matrix).toContain('null_insert_inherits_sole')
    expect(matrix).toContain('two_company_insert_blocked')
    expect(matrix).toContain('company_reassignment_blocked')
    expect(matrix).toContain('party_reassignment_blocked')
    expect(runner).toContain(".replaceAll('@@MIGRATION@@', () => migration)")
    expect(runner).toContain('BEGIN;')
    expect(runner).toContain('ROLLBACK;')

    expect(gate).not.toContain('entity_identity')
    expect(gate).not.toContain('management_relationship')
    expect(gate).not.toContain("'parties'")

    const insertAt = ownerDraft.indexOf('INSERT INTO lifecycle.entity_identity (')
    const draftInsert = ownerDraft.slice(insertAt, ownerDraft.indexOf(') VALUES (', insertAt))
    expect(draftInsert).not.toContain('operating_company_id')

    for (const file of productionFiles(path.join(root, 'src'))) {
      const source = readFileSync(file, 'utf8')
      if (source.includes('entity_identity') || source.includes('management_relationship')) {
        expect(source).not.toContain('operating_company_id')
      }
    }
  })
})
