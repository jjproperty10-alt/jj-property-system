import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const MIGRATION = '20261002150000_certified_settlement_sequence_reader.sql'
const DRAFT = join(process.cwd(), 'supabase', 'drafts', MIGRATION)
const sql = readFileSync(DRAFT, 'utf8')

function stripComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
}

const executable = stripComments(sql)
const rollback = sql.slice(sql.indexOf('-- ROLLBACK-BEGIN'), sql.indexOf('-- ROLLBACK-END'))

describe('20261002150000 certified settlement sequence reader', () => {
  test('stays in drafts so a migration runner cannot apply it', () => {
    expect(existsSync(DRAFT)).toBe(true)
    expect(existsSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION))).toBe(false)
    expect(sql).toMatch(/UNAPPROVED DRAFT/)
    expect(sql).toMatch(/supabase\/drafts/)
  })

  test('replaces only the finance reader and keeps its security contract', () => {
    expect(executable).toMatch(
      /CREATE OR REPLACE FUNCTION finance\.read_certified_client_settlement\(\s*p_entity_id UUID,\s*p_as_of\s+DATE\s*\)/,
    )
    expect(executable).toMatch(/RETURNS JSONB/)
    expect(executable).toMatch(/STABLE/)
    expect(executable).toMatch(/SECURITY DEFINER/)
    expect(executable).toMatch(/SET search_path TO ''/)
    expect(executable).not.toMatch(/CREATE OR REPLACE FUNCTION public\.read_certified_client_settlement/)
    expect(executable).not.toMatch(/CREATE OR REPLACE FUNCTION public\.read_client_settlement_balance/)
    expect(executable).not.toMatch(/CREATE OR REPLACE VIEW/)
    expect(executable).not.toMatch(/ALTER TABLE/)
    expect(executable).not.toMatch(/ADD COLUMN/)
  })

  test('keeps service_role execute only', () => {
    expect(executable).toMatch(
      /REVOKE ALL ON FUNCTION finance\.read_certified_client_settlement\(UUID, DATE\) FROM PUBLIC;/,
    )
    expect(executable).toMatch(
      /REVOKE ALL ON FUNCTION finance\.read_certified_client_settlement\(UUID, DATE\) FROM anon, authenticated;/,
    )
    expect(executable).toMatch(
      /GRANT EXECUTE ON FUNCTION finance\.read_certified_client_settlement\(UUID, DATE\) TO service_role;/,
    )
    expect(executable).not.toMatch(/GRANT EXECUTE[\s\S]*TO authenticated/)
    expect(executable).not.toMatch(/GRANT EXECUTE[\s\S]*TO anon/)
    expect(executable).not.toMatch(/GRANT SELECT ON TABLE finance\./i)
  })

  test('sums included certs and owner-level obligations and does not double-count partner funding', () => {
    expect(executable).toMatch(/client_owner_level_obligations/)
    expect(executable).toMatch(/supersedes_id/)
    expect(executable).toMatch(/certification_id = ANY \(v_cert_ids\)/)
    expect(executable).not.toMatch(/partner_funding_events/)
    expect(executable).not.toMatch(/COALESCE\s*\(\s*client_charge/i)
    expect(executable).toMatch(/owner_level_obligations/)
    expect(executable).toMatch(/jsonb_array_length\(v_owner_lines\) > 0/)
    expect(executable).toMatch(/'certified_opening_due_to_jj', v_opening/)
    expect(executable).toMatch(/'certified_remaining_due_to_jj', v_remaining_due/)
    expect(executable).toMatch(/'cash_executions', v_cash_exec/)
  })

  test('rollback restores the previous latest-header body', () => {
    expect(rollback).toMatch(/LIMIT 1/)
    expect(rollback).toMatch(/l\.certification_id = v_header\.id/)
    expect(rollback).toMatch(/'certified_opening_due_to_jj', v_header\.total_due_to_jj/)
    expect(rollback).not.toMatch(/client_owner_level_obligations/)
    expect(rollback).not.toMatch(/v_cert_ids/)
  })

  test('does not embed production identities', () => {
    expect(sql).not.toMatch(/Tamir/i)
    expect(sql).not.toMatch(/Uriel/i)
    expect(sql).not.toMatch(/Orit/i)
    expect(sql).not.toMatch(/0f352012-1403-4e3b-982a-7c019ee89f1b/i)
    expect(sql).not.toMatch(/890e86f9/i)
    expect(sql).not.toMatch(/280b7fbf/i)
    expect(sql).not.toMatch(/4bf0018e/i)
    expect(sql).not.toMatch(/e055e8ec/i)
    expect(sql).not.toMatch(/465d2199/i)
    expect(sql).not.toMatch(/b736a77b/i)
  })
})
