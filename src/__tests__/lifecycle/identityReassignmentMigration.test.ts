import { readFileSync } from 'fs'
import { join } from 'path'

const MIGRATION = '20260919150000_lifecycle_identity_reassignment.sql'
const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8')
const ddl = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n')

describe('20260919150000 lifecycle identity reassignment migration', () => {
  test('creates audit table, operations header, triggers, and public RPC', () => {
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS lifecycle\.identity_reassignment_audit/)
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS lifecycle\.identity_reassignment_operations/)
    expect(ddl).toMatch(/CREATE OR REPLACE FUNCTION public\.apply_managed_property_identity_reassignment/)
    expect(ddl).toMatch(/AFTER UPDATE OF entity_id ON lifecycle\.management_relationship/)
    expect(ddl).toMatch(/AFTER UPDATE OF entity_id ON lifecycle\.entity_property_associations/)
    expect(ddl).toMatch(/AFTER UPDATE OF entity_id ON lifecycle\.service_engagements/)
  })

  test('audit columns, uniqueness, and append-only guards', () => {
    expect(ddl).toMatch(/operation\s+TEXT NOT NULL CHECK \(operation = 'entity_reassignment'\)/)
    expect(ddl).toMatch(/transaction_id\s+BIGINT NOT NULL/)
    expect(ddl).toMatch(/uq_ira_operation_table_row/)
    expect(ddl).toMatch(/identity_reassignment_audit is append-only/)
    expect(ddl).toMatch(/BEFORE UPDATE OR DELETE ON lifecycle\.identity_reassignment_audit/)
  })

  test('RLS deny-all, authenticated EXECUTE only, helpers locked', () => {
    expect(ddl).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(ddl).toMatch(/FORCE ROW LEVEL SECURITY/)
    expect(ddl).toMatch(/USING \(false\)/)
    expect(ddl).toMatch(/WITH CHECK \(false\)/)
    expect(ddl).toMatch(/GRANT SELECT ON TABLE lifecycle\.identity_reassignment_audit TO service_role/)
    expect(ddl).toMatch(/GRANT EXECUTE ON FUNCTION public\.apply_managed_property_identity_reassignment[\s\S]*TO authenticated/)
    expect(ddl).toMatch(/REVOKE ALL ON FUNCTION public\.apply_managed_property_identity_reassignment[\s\S]*FROM anon, service_role/)
    expect(ddl).toMatch(/REVOKE ALL ON FUNCTION lifecycle\.assert_identity_reassignment_authorized\(\) FROM anon, authenticated, service_role/)
    expect(ddl).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.apply_managed_property_identity_reassignment[\s\S]*TO service_role/)
    expect(ddl).not.toMatch(/GRANT UPDATE ON TABLE lifecycle\.management_relationship/)
  })

  test('RPC is SECURITY DEFINER with empty search_path and staff gate', () => {
    expect(ddl).toMatch(/public\.require_jj_staff\(ARRAY\['ceo', 'finance_admin'\]\)/)
    expect(ddl).toMatch(/SECURITY DEFINER\s+SET search_path TO ''/)
    expect(ddl).toMatch(/pg_advisory_xact_lock\(\s*872004/)
    expect(ddl).toMatch(/GET DIAGNOSTICS v_n = ROW_COUNT/)
    expect(ddl).not.toMatch(/auth\.role\(\) IS NOT DISTINCT FROM 'service_role'/)
  })

  test('does not touch cash, settlement, or production IDs', () => {
    expect(ddl).not.toMatch(/INSERT INTO public\.transactions/i)
    expect(ddl).not.toMatch(/UPDATE\s+public\.transactions/i)
    expect(ddl).not.toMatch(/DELETE\s+FROM\s+public\.transactions/i)
    expect(ddl).not.toMatch(/CREATE OR REPLACE VIEW public\.v_cashbox_audit/)
    expect(ddl).not.toMatch(/CREATE OR REPLACE VIEW public\.v_certified_ledger_transactions/)
    expect(ddl).not.toMatch(/CREATE OR REPLACE VIEW public\.v_rc3_/)
    expect(ddl).not.toMatch(/CREATE OR REPLACE VIEW public\.v_contact_settlement_summary/)
    expect(ddl).not.toMatch(/public\.audit_logs/)
    expect(ddl).not.toMatch(/2944e9ad/)
    expect(ddl).not.toMatch(/0e2f942b/)
    expect(ddl).not.toMatch(/6d6fe818/)
    expect(ddl).not.toMatch(/3a9fb802/)
    expect(ddl).not.toMatch(/ef731606/)
    expect(ddl).not.toMatch(/b587f463/)
    expect(ddl).not.toMatch(/780713fd/)
    expect(ddl).not.toMatch(/c75aa52d/)
    expect(ddl).not.toMatch(/Uriel/)
    expect(ddl).not.toMatch(/Sharon/)
    expect(ddl).not.toMatch(/Neer/)
    expect(ddl).not.toMatch(/Yoav/)
    expect(ddl).not.toMatch(/Efi/)
    expect(ddl).not.toMatch(/50677/)
    expect(ddl).not.toMatch(/182098/)
    expect(ddl).not.toMatch(/ownerWorkspaceService/)
  })
})
