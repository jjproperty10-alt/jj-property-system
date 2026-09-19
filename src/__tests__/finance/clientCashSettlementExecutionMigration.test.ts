import { readFileSync } from 'fs'
import { join } from 'path'

const sql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260919190000_client_cash_settlement_execution.sql'),
  'utf8',
)
const ddl = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n')

describe('20260919190000 client cash settlement execution', () => {
  test('posts one null-property cash row and separate FIFO allocations', () => {
    expect(ddl).toMatch(/INSERT INTO public\.transactions/)
    expect(ddl).toMatch(/p_effective_date,\s*NULL,\s*NULL/)
    expect(ddl).toMatch(/Bank Payment to Owner/)
    expect(ddl).toMatch(/Client Payment/)
    expect(ddl).toMatch(/execute_client_cash_settlement/)
    expect(ddl).toMatch(/reverse_client_cash_settlement/)
    expect(ddl).toMatch(/client_obligation_fifo_allocations/)
    expect(ddl).not.toMatch(/noncash_settlement_credit/)
    expect(ddl).not.toMatch(/CREATE OR REPLACE VIEW public\.v_rc3_classified/)
    expect(ddl).not.toMatch(/CREATE OR REPLACE VIEW public\.v_certified_ledger_transactions/)
    expect(ddl).not.toMatch(/\bTamir\b/)
    expect(ddl).not.toMatch(/AssistantChat/)
  })

  test('locks execute/reverse to authenticated staff DEFINER', () => {
    expect(ddl).toMatch(/SECURITY DEFINER/)
    expect(ddl).toMatch(/SET search_path TO ''/)
    expect(ddl).toMatch(/GRANT EXECUTE ON FUNCTION public.execute_client_cash_settlement[\s\S]*TO authenticated/)
    expect(ddl).toMatch(/REVOKE ALL ON FUNCTION public.execute_client_cash_settlement[\s\S]*FROM anon, service_role/)
    expect(ddl).toMatch(/REVOKE ALL ON FUNCTION public.reverse_client_cash_settlement[\s\S]*FROM anon, service_role/)
    expect(ddl).toMatch(/\[stale_preview\]/)
    expect(ddl).toMatch(/\[idempotency_conflict\]/)
    expect(ddl).toMatch(/idempotency_key/)
    expect(ddl).toMatch(/preview_client_cash_settlement/)
    expect(ddl).toMatch(/REVOKE ALL ON TABLE finance.client_cash_settlement_executions[\s\S]*FROM anon, authenticated, service_role/)
    expect(ddl).toMatch(/REVOKE ALL ON TABLE finance.client_obligation_fifo_allocations[\s\S]*FROM anon, authenticated, service_role/)
    expect(ddl).not.toMatch(/GRANT SELECT ON TABLE finance.client_cash_settlement_executions/)
    expect(ddl).not.toMatch(/GRANT SELECT ON TABLE finance.client_obligation_fifo_allocations/)
    expect(ddl).toMatch(/DROP CONSTRAINT IF EXISTS owner_transaction_links_link_role_check/)
    expect(ddl).toMatch(/link_role IN \('owner_level_payment', 'client_level_payment'\)/)
    expect(ddl).not.toMatch(/DROP TABLE[\s\S]*CASCADE/)
    expect(ddl).toMatch(/GRANT SELECT ON finance.v_owner_level_payments TO service_role/)
  })

  test('extends the canonical reader with cash remaining without rewriting 19180000', () => {
    expect(ddl).toMatch(/CREATE OR REPLACE FUNCTION finance\.read_certified_client_settlement/)
    expect(ddl).toMatch(/cash_allocation_signed_total/)
    expect(ddl).toMatch(/certified_remaining_due_to_jj/)
    expect(ddl).toMatch(/remaining_r/)
    expect(ddl).toMatch(/x\.effective_date <= p_as_of/)
    expect(ddl).toMatch(/read_client_settlement_balance/)
    expect(ddl).toMatch(/GRANT EXECUTE ON FUNCTION public.read_client_settlement_balance[\s\S]*TO authenticated/)
    expect(ddl).toMatch(/REVOKE ALL ON FUNCTION public.read_client_settlement_balance[\s\S]*FROM anon, service_role/)
    expect(ddl).not.toMatch(/GRANT SELECT ON TABLE finance.client_obligation_fifo_allocations/)
    const publicRead = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20260919180000_public_read_certified_client_settlement.sql'),
      'utf8',
    )
    expect(publicRead).toMatch(/GRANT EXECUTE ON FUNCTION public\.read_certified_client_settlement\(UUID, DATE\) TO service_role/)
    expect(ddl).not.toMatch(/CREATE OR REPLACE FUNCTION public\.read_certified_client_settlement/)
  })

  test('isolated 01_delta keeps production link_role until Phase 2E expands it', () => {
    const delta = readFileSync(
      join(process.cwd(), 'supabase', 'tests', '20260919190000_client_cash_settlement_execution', '01_delta.sql'),
      'utf8',
    )
    expect(delta).toMatch(/CHECK \(link_role IN \('owner_level_payment'\)\)/)
    expect(delta).not.toMatch(/client_level_payment/)
  })

  test('owner-level payment view columns stay compatible with existing consumers', () => {
    expect(ddl).toMatch(/t\.id\s+AS transaction_id/)
    expect(ddl).toMatch(/l\.owner_entity_id/)
    expect(ddl).toMatch(/e\.canonical_name\s+AS owner_display_name/)
    expect(ddl).toMatch(/t\.amount_eur/)
    expect(ddl).toMatch(/l\.idempotency_key/)
    const adapter = readFileSync(
      join(process.cwd(), 'src', 'lib', 'finance', 'ownerLevelPaymentAdapter.ts'),
      'utf8',
    )
    const composition = readFileSync(
      join(process.cwd(), 'src', 'lib', 'finance', 'ownerLevelPaymentComposition.ts'),
      'utf8',
    )
    expect(adapter).toMatch(/v_owner_level_payments/)
    expect(composition).toMatch(/composeOwnerLevelSettlement/)
    expect(ddl).toMatch(/remaining_signed_amount/)
    expect(ddl).toMatch(/v_client_property_obligation_register/)
  })
})
