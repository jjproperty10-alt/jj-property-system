import { readFileSync } from 'fs'
import { join } from 'path'

const sql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260919170000_client_obligation_fifo_foundation.sql'),
  'utf8',
)
const ddl = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n')

describe('20260919170000 client obligation FIFO foundation', () => {
  test('does not mutate cash, RC3, drafts, or overlay execution', () => {
    expect(ddl).not.toMatch(/INSERT\s+INTO\s+public\.transactions/i)
    expect(ddl).not.toMatch(/UPDATE\s+public\.transactions/i)
    expect(ddl).not.toMatch(/DELETE\s+FROM\s+public\.transactions/i)
    expect(ddl).not.toMatch(/CREATE OR REPLACE VIEW public\.v_rc3_classified/)
    expect(ddl).not.toMatch(/CREATE OR REPLACE VIEW public\.v_certified_ledger_transactions/)
    expect(ddl).not.toMatch(/open_client_settlement_event/)
    expect(ddl).not.toMatch(/approve_and_post_agent_transaction_draft/)
    expect(ddl).not.toMatch(/AssistantChat/)
    expect(ddl).not.toMatch(/Bank Payment to Owner/)
    expect(ddl).not.toMatch(/noncash_settlement_credit/)
    expect(ddl).not.toMatch(/reporting_name/)
  })

  test('binds by certification line UUID and public.properties.id', () => {
    expect(ddl).toMatch(/certification_line_id/)
    expect(ddl).toMatch(/REFERENCES public\.properties\(id\)/)
    expect(ddl).toMatch(/uq_copb_active_line/)
    expect(ddl).toMatch(/bind_client_obligation_property/)
    expect(ddl).toMatch(/preview_client_obligation_fifo/)
    expect(ddl).toMatch(/v_client_property_obligation_register/)
    expect(ddl).toMatch(/v_client_obligation_unbound_lines/)
    expect(ddl).toMatch(/lifecycle\.entity_property_associations/)
    expect(ddl).toMatch(/no active entity_property_associations row/)
  })

  test('SHA-256 hashes one canonical JSONB snapshot, not concatenated MD5', () => {
    expect(ddl).toMatch(/extensions\.digest/)
    expect(ddl).toMatch(/sha256/)
    expect(ddl).toMatch(/canonical_snapshot/)
    expect(ddl).toMatch(/client-obligation-fifo-v2/)
    expect(ddl).toMatch(/v_blocked := 'unbound_certification_line'/)
    expect(ddl).not.toMatch(/v_hash := pg_catalog\.md5/)
    expect(ddl).not.toMatch(/string_agg\(/)
  })

  test('locks RPCs to authenticated staff DEFINER with empty search_path', () => {
    expect(ddl).toMatch(/SECURITY DEFINER/)
    expect(ddl).toMatch(/SET search_path TO ''/)
    expect(ddl).toMatch(/FORCE ROW LEVEL SECURITY/)
    expect(ddl).toMatch(/GRANT EXECUTE ON FUNCTION public.bind_client_obligation_property[\s\S]*TO authenticated/)
    expect(ddl).toMatch(/REVOKE ALL ON FUNCTION public.bind_client_obligation_property[\s\S]*FROM anon, service_role/)
    expect(ddl).toMatch(/REVOKE ALL ON FUNCTION public.preview_client_obligation_fifo[\s\S]*FROM anon, service_role/)
    expect(ddl).toMatch(/REVOKE ALL ON TABLE finance.client_obligation_property_bindings FROM anon, authenticated, service_role/)
    expect(ddl).toMatch(/REVOKE ALL ON FUNCTION finance.client_obligation_fifo_sha256\(jsonb\) FROM anon, authenticated, service_role/)
    expect(ddl).not.toMatch(/GRANT EXECUTE ON FUNCTION public.bind_client_obligation_property[\s\S]*TO service_role/)
  })
})
