import { readFileSync } from 'fs'
import { join } from 'path'

const MIGRATION = '20260919160000_client_settlement_certifications.sql'
const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8')
const ddl = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n')

const APP_FILES = [
  'src/lib/finance/clientSettlementCertificationTypes.ts',
  'src/lib/finance/clientSettlementCertificationRpcAuth.ts',
  'src/lib/finance/clientSettlementCertificationActions.ts',
]

describe('20260919160000 client settlement certifications migration', () => {
  test('creates header, lines, audit, apply/void RPCs, and service-role reader', () => {
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS finance\.client_settlement_certifications/)
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS finance\.client_settlement_certification_lines/)
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS finance\.client_settlement_certification_audit/)
    expect(ddl).toMatch(/CREATE OR REPLACE FUNCTION public\.apply_client_settlement_opening_certification/)
    expect(ddl).toMatch(/CREATE OR REPLACE FUNCTION public\.void_client_settlement_opening_certification/)
    expect(ddl).toMatch(/CREATE OR REPLACE FUNCTION finance\.read_certified_client_settlement/)
  })

  test('opening-obligation constraints and unique applied chain', () => {
    expect(ddl).toMatch(/certification_type = 'opening_property_obligations'/)
    expect(ddl).toMatch(/currency = 'EUR'/)
    expect(ddl).toMatch(/status IN \('draft', 'approved', 'applied', 'void'\)/)
    expect(ddl).toMatch(/uq_csc_applied_entity_asof_type/)
    expect(ddl).toMatch(/WHERE status = 'applied'/)
    expect(ddl).toMatch(/UNIQUE \(\s*certification_id, property_key, component_code, line_order/)
    expect(ddl).toMatch(/total_due_to_jj\s+NUMERIC\(12,2\) NOT NULL/)
    expect(ddl).toMatch(/amount_due_to_jj\s+NUMERIC\(12,2\) NOT NULL/)
  })

  test('immutable payload, no DELETE, append-only audit', () => {
    expect(ddl).toMatch(/forbids physical DELETE/)
    expect(ddl).toMatch(/payload columns are immutable/)
    expect(ddl).toMatch(/client_settlement_certification_lines are immutable after insert/)
    expect(ddl).toMatch(/client_settlement_certification_audit is append-only/)
    expect(ddl).toMatch(/BEFORE UPDATE OR DELETE ON finance\.client_settlement_certifications/)
    expect(ddl).toMatch(/BEFORE UPDATE OR DELETE ON finance\.client_settlement_certification_lines/)
    expect(ddl).toMatch(/BEFORE UPDATE OR DELETE ON finance\.client_settlement_certification_audit/)
  })

  test('RLS deny-all, authenticated EXECUTE on public RPCs only, reader service_role only', () => {
    expect(ddl).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(ddl).toMatch(/FORCE ROW LEVEL SECURITY/)
    expect(ddl).toMatch(/USING \(false\)/)
    expect(ddl).toMatch(/WITH CHECK \(false\)/)
    expect(ddl).toMatch(/GRANT SELECT ON TABLE finance\.client_settlement_certifications TO service_role/)
    expect(ddl).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.apply_client_settlement_opening_certification[\s\S]*TO authenticated/,
    )
    expect(ddl).toMatch(
      /REVOKE ALL ON FUNCTION public\.apply_client_settlement_opening_certification[\s\S]*FROM anon, service_role/,
    )
    expect(ddl).toMatch(
      /REVOKE ALL ON FUNCTION finance\.assert_client_settlement_certification_authorized\(\) FROM anon, authenticated, service_role/,
    )
    expect(ddl).toMatch(
      /GRANT EXECUTE ON FUNCTION finance\.read_certified_client_settlement[\s\S]*?TO service_role/,
    )
    const applyExecuteGrant = ddl.match(
      /GRANT EXECUTE ON FUNCTION public\.apply_client_settlement_opening_certification\([^;]+;/,
    )?.[0]
    expect(applyExecuteGrant).toMatch(/TO authenticated;/)
    expect(applyExecuteGrant).not.toMatch(/service_role/)
  })

  test('SECURITY DEFINER public RPCs pin empty search_path, staff gate, advisory lock, rollback semantics', () => {
    expect(ddl).toMatch(/public\.require_jj_staff\(ARRAY\['ceo', 'finance_admin'\]\)/)
    expect(ddl).toMatch(/SECURITY DEFINER\s+SET search_path TO ''/)
    expect(ddl).toMatch(/pg_advisory_xact_lock\(\s*872005/)
    expect(ddl).toMatch(/inserted_count', 0/)
    expect(ddl).toMatch(/header total_due_to_jj does not equal sum of lines/)
    expect(ddl).toMatch(/duplicate line key is not allowed/)
    expect(ddl).not.toMatch(/auth\.role\(\) IS NOT DISTINCT FROM 'service_role'/)
  })

  test('reader returns opening, FIFO, exclusions, closing, and unavailable without both layers', () => {
    expect(ddl).toMatch(/certified_closing_due_to_jj/)
    expect(ddl).toMatch(/finance\.client_fifo_credits/)
    expect(ddl).toMatch(/exclude_transaction_from_settlement/)
    expect(ddl).toMatch(/unavailable', true/)
    expect(ddl).toMatch(/settlement_layer_unavailable/)
    expect(ddl).toMatch(/no_applied_certification/)
  })

  test('does not touch cash, RC3, certified ledger, contact settlement, or production IDs', () => {
    expect(ddl).not.toMatch(/INSERT INTO public\.transactions/i)
    expect(ddl).not.toMatch(/UPDATE\s+public\.transactions/i)
    expect(ddl).not.toMatch(/DELETE\s+FROM\s+public\.transactions/i)
    expect(ddl).not.toMatch(/CREATE OR REPLACE VIEW public\.v_cashbox_audit/)
    expect(ddl).not.toMatch(/CREATE OR REPLACE VIEW public\.v_certified_ledger_transactions/)
    expect(ddl).not.toMatch(/CREATE OR REPLACE VIEW public\.v_rc3_/)
    expect(ddl).not.toMatch(/CREATE OR REPLACE VIEW public\.v_contact_settlement_summary/)
    expect(ddl).not.toMatch(/v_property_pl/)
    expect(ddl).not.toMatch(/transaction_exclusions/)
    expect(ddl).not.toMatch(/SET review_status/)
    expect(ddl).not.toMatch(/payer/)
    expect(ddl).not.toMatch(/payee/)
    expect(ddl).not.toMatch(/2944e9ad/)
    expect(ddl).not.toMatch(/09e99dfa/)
    expect(ddl).not.toMatch(/27546e91/)
    expect(ddl).not.toMatch(/c43ba2d0/)
    expect(ddl).not.toMatch(/Uriel/i)
    expect(ddl).not.toMatch(/Sharon/i)
    expect(ddl).not.toMatch(/Kamares/)
    expect(ddl).not.toMatch(/50677/)
    expect(ddl).not.toMatch(/119677/)
    expect(ddl).not.toMatch(/55000/)
    expect(ddl).not.toMatch(/13900/)
    expect(ddl).not.toMatch(/ownerWorkspaceService/)
  })
})

describe('opening-obligation application constants contain no production facts', () => {
  test('types, auth, and actions stay generic', () => {
    for (const rel of APP_FILES) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8')
      expect(src).not.toMatch(/2944e9ad/)
      expect(src).not.toMatch(/Uriel/i)
      expect(src).not.toMatch(/Sharon/i)
      expect(src).not.toMatch(/Kamares/)
      expect(src).not.toMatch(/119677/)
      expect(src).not.toMatch(/50677/)
      expect(src).not.toMatch(/55000/)
      expect(src).not.toMatch(/13900/)
      expect(src).not.toMatch(/ownerWorkspaceService/)
      expect(src).not.toMatch(/fetchRC3Report/)
    }
  })
})
