import { readFileSync } from 'fs'
import { join } from 'path'

const MIGRATION = '20260919180000_public_read_certified_client_settlement.sql'
const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8')
const ddl = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n')

describe('20260919180000 public read certified client settlement wrapper', () => {
  test('creates exactly one public SECURITY DEFINER wrapper', () => {
    expect(ddl).toMatch(
      /CREATE OR REPLACE FUNCTION public\.read_certified_client_settlement\(\s*p_entity_id UUID,\s*p_as_of\s+DATE\s*\)/,
    )
    expect(ddl).toMatch(/RETURNS JSONB/)
    expect(ddl).toMatch(/SECURITY DEFINER/)
    expect(ddl).toMatch(/SET search_path TO ''/)
    expect(ddl).toMatch(/RETURN finance\.read_certified_client_settlement\(p_entity_id, p_as_of\);/)
  })

  test('revokes browser execute and grants service_role only', () => {
    expect(ddl).toMatch(
      /REVOKE ALL ON FUNCTION public\.read_certified_client_settlement\(UUID, DATE\) FROM PUBLIC;/,
    )
    expect(ddl).toMatch(
      /REVOKE ALL ON FUNCTION public\.read_certified_client_settlement\(UUID, DATE\) FROM anon, authenticated;/,
    )
    expect(ddl).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.read_certified_client_settlement\(UUID, DATE\) TO service_role;/,
    )
    expect(ddl).not.toMatch(/GRANT EXECUTE[\s\S]*TO authenticated/)
    expect(ddl).not.toMatch(/GRANT EXECUTE[\s\S]*TO anon/)
  })

  test('does not expose finance or mutate certification', () => {
    expect(ddl).not.toMatch(/GRANT USAGE ON SCHEMA finance/i)
    expect(ddl).not.toMatch(/GRANT SELECT ON TABLE finance\./i)
    expect(ddl).not.toMatch(/GRANT EXECUTE ON FUNCTION finance\./i)
    expect(ddl).not.toMatch(/db_schemas|extra_search_path|PGRST/i)
    expect(ddl).not.toMatch(/INSERT\s+/i)
    expect(ddl).not.toMatch(/UPDATE\s+/i)
    expect(ddl).not.toMatch(/DELETE\s+/i)
    expect(ddl).not.toMatch(/EXECUTE format/i)
    expect(ddl).not.toMatch(/CREATE OR REPLACE VIEW/)
    expect(ddl).not.toMatch(/2944e9ad/)
    expect(ddl).not.toMatch(/Uriel/i)
    expect(ddl).not.toMatch(/50677/)
    expect(ddl).not.toMatch(/119677/)
  })
})
