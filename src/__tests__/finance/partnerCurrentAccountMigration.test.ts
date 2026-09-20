import { readFileSync } from 'fs'
import { join } from 'path'

const sql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260919200000_partner_current_account_foundation.sql'),
  'utf8',
)
const ddl = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n')

const sql243 = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260919190000_client_cash_settlement_execution.sql'),
  'utf8',
)

function extractPublicFn(sql: string, name: string): string {
  const needle = `CREATE OR REPLACE FUNCTION public.${name}`
  const start = sql.indexOf(needle)
  if (start < 0) throw new Error(`missing function ${name}`)
  const end = sql.indexOf('$fn$;', start)
  if (end < 0) throw new Error(`unterminated function ${name}`)
  return sql.slice(start, end + '$fn$;'.length)
}

function normalizeSql(sql: string): string {
  return sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripPartnerFundedGuard(sql: string): string {
  return sql.replace(
    /IF COALESCE\(v_src\.canonical_snapshot->>'funding_source', ''\) = 'PARTNER_PERSONAL'[\s\S]*?reverse_partner_funding_event\.';\s*END IF;\s*/g,
    '',
  )
}

describe('20260919200000 partner current-account foundation', () => {
  test('adds additive events, CA entries, links, and RPCs without RC3 rewrite', () => {
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS finance\.partner_funding_events/)
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS finance\.partner_current_account_entries/)
    expect(ddl).toMatch(/CREATE TABLE IF NOT EXISTS finance\.partner_funding_transaction_links/)
    expect(ddl).toMatch(/preview_partner_funded_client_settlement/)
    expect(ddl).toMatch(/execute_partner_funded_client_settlement/)
    expect(ddl).toMatch(/preview_partner_reimbursement/)
    expect(ddl).toMatch(/execute_partner_reimbursement/)
    expect(ddl).toMatch(/reverse_partner_funding_event/)
    expect(ddl).toMatch(/list_partner_funding_actors/)
    expect(ddl).toMatch(/read_partner_current_account/)
    expect(ddl).toMatch(/Expense Reimbursement/)
    expect(ddl).toMatch(/PARTNER_PERSONAL/)
    expect(ddl).not.toMatch(/CREATE OR REPLACE VIEW public\.v_rc3_classified/)
    expect(ddl).not.toMatch(/CREATE OR REPLACE VIEW public\.v_certified_ledger_transactions/)
    expect(ddl).not.toMatch(/noncash_settlement_credit/)
    expect(ddl).not.toMatch(/\bTamir\b/)
    expect(ddl).not.toMatch(/0f352012-1403-4e3b-982a-7c019ee89f1b/)
    expect(ddl).not.toMatch(/4de83e15-e8cd-4abc-a104-5ddf8a2a3a4d/)
    expect(ddl).not.toMatch(/ALTER TABLE public\.business_events/)
  })

  test('locks writes to authenticated DEFINER and deny-all tables', () => {
    expect(ddl).toMatch(/SECURITY DEFINER/)
    expect(ddl).toMatch(/SET search_path TO ''/)
    expect(ddl).toMatch(/FORCE ROW LEVEL SECURITY/)
    expect(ddl).toMatch(/GRANT EXECUTE ON FUNCTION public.execute_partner_funded_client_settlement[\s\S]*TO authenticated/)
    expect(ddl).toMatch(/REVOKE ALL ON FUNCTION public.execute_partner_funded_client_settlement[\s\S]*FROM anon, service_role/)
    expect(ddl).toMatch(/REVOKE ALL ON TABLE finance.partner_funding_events[\s\S]*FROM anon, authenticated, service_role/)
    expect(ddl).toMatch(/REVOKE ALL ON TABLE finance.partner_current_account_entries[\s\S]*FROM anon, authenticated, service_role/)
    expect(ddl).not.toMatch(/GRANT SELECT ON TABLE finance.partner_funding_events/)
    expect(ddl).toMatch(/entity_type = 'partner'/)
    expect(ddl).toMatch(/\[idempotency_conflict\]/)
    expect(ddl).toMatch(/\[stale_preview\]/)
    expect(ddl).toMatch(/over_reimbursement/)
    expect(ddl).toMatch(/partner-funded cash must be reversed with reverse_partner_funding_event/)
  })

  test('reverse_client_cash_settlement is #243 plus the partner-funded guard only', () => {
    const baseline = extractPublicFn(sql243, 'reverse_client_cash_settlement')
    const replacement = extractPublicFn(sql, 'reverse_client_cash_settlement')
    expect(replacement).toMatch(/v_rev_dir TEXT/)
    expect(replacement).toMatch(/pg_catalog\.pg_advisory_xact_lock\(\s*872007/)
    expect(replacement).toMatch(/cash-link:/)
    expect(replacement).toMatch(/client cash settlement reversal/)
    expect(replacement).toMatch(/finance\.client_cash_posting_fields/)
    expect(replacement).toMatch(/owner_level_payment/)
    expect(replacement).toMatch(/client_level_payment/)
    expect(replacement).toMatch(/already reversed/)
    expect(replacement).toMatch(/reversing a reversal/)
    expect(replacement).toMatch(/\[idempotency_conflict\]/)
    expect(replacement).toMatch(/PARTNER_PERSONAL/)
    expect(replacement).toMatch(/pf-cash:/)
    expect(replacement).toMatch(/finance\.partner_funding_transaction_links/)
    expect(replacement).not.toMatch(/lower\(.*payer/)
    expect(baseline).not.toMatch(/PARTNER_PERSONAL/)
    expect(normalizeSql(stripPartnerFundedGuard(replacement))).toBe(normalizeSql(baseline))
  })
})
