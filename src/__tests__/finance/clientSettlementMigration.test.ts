import { readFileSync } from 'fs'
import { join } from 'path'

const MIGRATION = '20260919140000_client_settlement_layer.sql'
const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8')
const ddl = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n')

describe('20260919140000 client settlement layer migration', () => {
  test('creates events, log, applied view, fifo function, and public RPCs', () => {
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS finance\.client_settlement_events/)
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS finance\.client_settlement_event_log/)
    expect(ddl).toMatch(/CREATE OR REPLACE VIEW finance\.v_client_settlement_applied/)
    expect(ddl).toMatch(/CREATE OR REPLACE FUNCTION finance\.client_fifo_credits/)
    expect(ddl).toMatch(/CREATE OR REPLACE FUNCTION public\.open_client_settlement_event/)
    expect(ddl).toMatch(/CREATE OR REPLACE FUNCTION public\.approve_client_settlement_event/)
    expect(ddl).toMatch(/CREATE OR REPLACE FUNCTION public\.apply_client_settlement_event/)
    expect(ddl).toMatch(/CREATE OR REPLACE FUNCTION public\.void_client_settlement_event/)
  })

  test('event types and payload constraints', () => {
    expect(ddl).toMatch(/noncash_settlement_credit/)
    expect(ddl).toMatch(/exclude_transaction_from_settlement/)
    expect(ddl).toMatch(/include_transaction_in_settlement/)
    expect(ddl).toMatch(/settlement_amount\s+NUMERIC\(12,2\) NOT NULL CHECK \(settlement_amount > 0\)/)
    expect(ddl).toMatch(/cse_source_by_type/)
    expect(ddl).toMatch(/cse_counterparty_not_self/)
  })

  test('partial unique indexes cover exclude, include, noncash, and applied source', () => {
    expect(ddl).toMatch(/uq_cse_exclude_nonterminal/)
    expect(ddl).toMatch(/uq_cse_include_nonterminal/)
    expect(ddl).toMatch(/uq_cse_noncash_nonterminal/)
    expect(ddl).toMatch(/uq_cse_applied_source_global/)
    expect(ddl).toMatch(/uq_cse_applied_include_or_exclude/)
    expect(ddl).toMatch(/WHERE status = 'applied'/);
  })

  test('immutable payload, no DELETE, append-only log', () => {
    expect(ddl).toMatch(/forbids physical DELETE/)
    expect(ddl).toMatch(/payload columns are immutable/)
    expect(ddl).toMatch(/client_settlement_event_log is append-only/)
    expect(ddl).toMatch(/BEFORE UPDATE OR DELETE ON finance\.client_settlement_events/)
    expect(ddl).toMatch(/BEFORE UPDATE OR DELETE ON finance\.client_settlement_event_log/)
  })

  test('RLS deny-all, authenticated EXECUTE on public RPCs only, helpers locked', () => {
    expect(ddl).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(ddl).toMatch(/FORCE ROW LEVEL SECURITY/)
    expect(ddl).toMatch(/USING \(false\)/)
    expect(ddl).toMatch(/WITH CHECK \(false\)/)
    expect(ddl).toMatch(/GRANT SELECT ON TABLE finance\.client_settlement_events TO service_role/)
    expect(ddl).toMatch(/GRANT EXECUTE ON FUNCTION public\.open_client_settlement_event[\s\S]*TO authenticated/)
    expect(ddl).toMatch(/REVOKE ALL ON FUNCTION public\.open_client_settlement_event[\s\S]*FROM anon, service_role/)
    expect(ddl).toMatch(/REVOKE ALL ON FUNCTION finance\.assert_client_settlement_authorized\(\) FROM anon, authenticated, service_role/)
    expect(ddl).toMatch(/GRANT EXECUTE ON FUNCTION finance\.client_fifo_credits[\s\S]*TO service_role/)
    expect(ddl).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.open_client_settlement_event[\s\S]*TO service_role/)
  })

  test('apply locks event and source, checks amount, blocks cross-client and include+exclude', () => {
    expect(ddl).toMatch(/FOR UPDATE/)
    expect(ddl).toMatch(/source amount_eur does not equal settlement_amount/)
    expect(ddl).toMatch(/already used by another entity/)
    expect(ddl).toMatch(/applied include and exclude cannot coexist/)
    expect(ddl).toMatch(/pg_advisory_xact_lock\(\s*872003/)
    expect(ddl).toMatch(/inserted_count', 0/)
  })

  test('FIFO orders by effective_date, source date, created_at, id and cuts off after as_of', () => {
    expect(ddl).toMatch(/e\.effective_date <= p_as_of/)
    expect(ddl).toMatch(/ORDER BY\s+e\.effective_date ASC,\s+t\.date ASC NULLS LAST,\s+e\.created_at ASC,\s+e\.id ASC/)
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
    expect(ddl).not.toMatch(/UPDATE\s+public\.transactions/i)
    expect(ddl).not.toMatch(/2944e9ad/)
    expect(ddl).not.toMatch(/09e99dfa/)
    expect(ddl).not.toMatch(/27546e91/)
    expect(ddl).not.toMatch(/c43ba2d0/)
    expect(ddl).not.toMatch(/Uriel/i)
    expect(ddl).not.toMatch(/Sharon/i)
    expect(ddl).not.toMatch(/50677/)
    expect(ddl).not.toMatch(/182098/)
    expect(ddl).not.toMatch(/55000/)
    expect(ddl).not.toMatch(/13900/)
    expect(ddl).not.toMatch(/ownerWorkspaceService/)
  })

  test('SECURITY DEFINER public RPCs pin empty search_path and staff gate', () => {
    expect(ddl).toMatch(/public\.require_jj_staff\(ARRAY\['ceo', 'finance_admin'\]\)/)
    expect(ddl).toMatch(/SECURITY DEFINER\s+SET search_path TO ''/)
    expect(ddl).not.toMatch(/auth\.role\(\) IS NOT DISTINCT FROM 'service_role'/)
  })
})
