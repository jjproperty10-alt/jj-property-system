/**
 * Static guards over finance.owner_transaction_links migration + access SQL.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const MIGRATION = '20260914_001_owner_transaction_links.sql'
const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8')
const ddl = sql
  .split('\n')
  .filter(l => !l.trimStart().startsWith('--'))
  .join('\n')

describe('20260914_001 owner_transaction_links migration', () => {
  test('creates finance.owner_transaction_links with required columns', () => {
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS finance\.owner_transaction_links/)
    for (const col of [
      'transaction_id',
      'owner_entity_id',
      'link_role',
      'idempotency_key',
      'review_status',
      'is_deleted',
      'created_at',
      'created_by',
      'deleted_at',
      'deleted_by',
      'notes',
    ]) {
      expect(ddl).toContain(col)
    }
  })

  test('enforces link_role and unique idempotency', () => {
    expect(ddl).toMatch(/link_role\s+TEXT\s+NOT NULL/)
    expect(ddl).toMatch(/owner_level_payment/)
    expect(ddl).toMatch(/idempotency_key\s+TEXT\s+NOT NULL UNIQUE/)
  })

  test('unique active-link protection is a partial unique index', () => {
    expect(ddl).toMatch(/CREATE UNIQUE INDEX[\s\S]*ON finance\.owner_transaction_links \(transaction_id\)/)
    expect(ddl).toMatch(/WHERE is_deleted = false/)
  })

  test('forbids physical DELETE', () => {
    expect(ddl).toMatch(/forbids physical DELETE/)
    expect(ddl).toMatch(/BEFORE UPDATE OR DELETE ON finance\.owner_transaction_links/)
  })

  test('does not insert C1 or C3 into public.transactions', () => {
    expect(ddl).not.toMatch(/INSERT INTO public\.transactions/i)
    expect(ddl).not.toMatch(/tamir_owner_pmt_yaakov_2026-08-24_10000/)
  })

  test('view is countable-only and not a property P&L/STR/LTR join target', () => {
    expect(ddl).toMatch(/CREATE OR REPLACE VIEW finance\.v_owner_level_payments/)
    expect(ddl).toMatch(/property_id IS NULL/)
    expect(ddl).toMatch(/property_name IS NULL/)
    expect(ddl).toMatch(/COALESCE\(t\.is_deleted, false\) = false/)
    expect(ddl).toMatch(/Do not join this view into property P&L, STR, or LTR/)
    expect(ddl).not.toMatch(/v_rc3_/)
    expect(ddl).not.toMatch(/v_jj_company_pl/)
    expect(ddl).not.toMatch(/v_property_pl/)
  })

  test('RLS deny-all plus service_role grants; anon/authenticated revoked', () => {
    expect(ddl).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(ddl).toMatch(/FORCE ROW LEVEL SECURITY/)
    expect(ddl).toMatch(/USING \(false\)/)
    expect(ddl).toMatch(/WITH CHECK \(false\)/)
    expect(ddl).toMatch(/REVOKE ALL ON TABLE finance\.owner_transaction_links FROM anon, authenticated/)
    expect(ddl).toMatch(/GRANT SELECT ON TABLE finance\.owner_transaction_links TO service_role/)
    expect(ddl).not.toMatch(/GRANT SELECT, INSERT, UPDATE ON TABLE finance\.owner_transaction_links TO service_role/)
    expect(ddl).toMatch(/GRANT SELECT ON finance\.v_owner_level_payments TO service_role/)
    expect(ddl).toMatch(/GRANT EXECUTE ON FUNCTION finance\.get_owner_level_payments/)
    expect(ddl).toMatch(/REVOKE ALL ON FUNCTION finance\.link_owner_level_payment[\s\S]*FROM anon/)
    expect(ddl).not.toMatch(/REVOKE ALL ON FUNCTION finance\.link_owner_level_payment[\s\S]*FROM anon, authenticated/)
  })

  test('write RPC is staff-gated with service_role JWT bypass', () => {
    expect(ddl).toMatch(/finance\.assert_owner_link_authorized/)
    expect(ddl).toMatch(/auth\.role\(\) IS NOT DISTINCT FROM 'service_role'/)
    expect(ddl).toMatch(/PERFORM public\.require_jj_staff\(ARRAY\['ceo','finance_admin'\]\)/)
    expect(ddl).toMatch(/SECURITY DEFINER/)
    expect(ddl).not.toMatch(/p_created_by[\s\S]{0,80}service_role/)
  })

  test('conflict view exists for NEEDS REVIEW', () => {
    expect(ddl).toMatch(/finance\.v_owner_level_payment_conflicts/)
    expect(ddl).toMatch(/NEW\.review_status := 'needs_review'/)
  })

  test('countable view requires positive amount_eur', () => {
    expect(ddl).toMatch(/t\.amount_eur > 0/)
  })

  test('SECURITY DEFINER RPCs pin search_path, use qualified names, and have no dynamic SQL', () => {
    expect(ddl).toMatch(/SECURITY DEFINER\s+SET search_path = ''/)
    expect(ddl).toMatch(/PERFORM finance\.assert_owner_link_authorized/)
    expect(ddl).toMatch(/PERFORM public\.require_jj_staff/)
    expect(ddl).toMatch(/INSERT INTO finance\.owner_transaction_links/)
    expect(ddl).toMatch(/UPDATE finance\.owner_transaction_links/)
    expect(ddl).toMatch(/FROM finance\.v_owner_level_payments/)
    expect(ddl).not.toMatch(/EXECUTE\s+IMMEDIATE/i)
    expect(ddl).not.toMatch(/EXECUTE\s+format/i)
  })

  test('anon cannot EXECUTE; authenticated and service_role can', () => {
    expect(ddl).toMatch(/REVOKE ALL ON FUNCTION finance\.link_owner_level_payment[\s\S]*FROM PUBLIC/)
    expect(ddl).toMatch(/REVOKE ALL ON FUNCTION finance\.link_owner_level_payment[\s\S]*FROM anon/)
    expect(ddl).toMatch(/GRANT EXECUTE ON FUNCTION finance\.link_owner_level_payment[\s\S]*TO authenticated, service_role/)
    expect(ddl).not.toMatch(/GRANT EXECUTE[\s\S]*TO anon/)
    expect(ddl).toMatch(/GRANT USAGE ON SCHEMA finance TO authenticated/)
  })

  test('trigger functions pin search_path', () => {
    expect(ddl).toMatch(/FUNCTION finance\.trg_owner_tx_links_guard\(\)[\s\S]*SET search_path = ''/)
    expect(ddl).toMatch(/FUNCTION finance\.trg_owner_tx_links_conflict_review\(\)[\s\S]*SET search_path = ''/)
  })
})
