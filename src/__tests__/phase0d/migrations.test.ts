import fs from 'fs'
import path from 'path'

const M1 = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations', '20260916_003_v_certified_ledger_and_rc3.sql')
const M2 = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations', '20260916_004_agent_transaction_drafts.sql')

describe('Phase 0D migrations (unapplied)', () => {
  const rc3 = fs.readFileSync(M1, 'utf8')
  const drafts = fs.readFileSync(M2, 'utf8')

  it('adds the certified predicate to RC3 without DROP CASCADE or cashbox/P&L edits', () => {
    expect(rc3).toMatch(/COALESCE\(t\.is_deleted,\s*false\)\s*=\s*false/)
    expect(rc3).toMatch(/transaction_exclusions/)
    expect(rc3).toMatch(/te\.is_active\s*=\s*true/)
    expect(rc3).toMatch(/NOT EXISTS/)
    expect(rc3).toMatch(/CREATE OR REPLACE VIEW public\.v_rc3_classified/)
    expect(rc3).toMatch(/CREATE OR REPLACE VIEW public\.v_certified_ledger_transactions/)
    expect(rc3).toMatch(/t\.id,\s*\n\s*t\.date,/m)
    expect(rc3).toMatch(/t\.reporting_name/)
    expect(rc3).not.toMatch(/CREATE OR REPLACE VIEW public\.v_rc3_classified AS\s+SELECT\s+t\.\*/)
    expect(rc3).toMatch(/GRANT SELECT ON public\.v_certified_ledger_transactions TO service_role/)
    expect(rc3).toMatch(/REVOKE ALL ON public\.v_certified_ledger_transactions FROM authenticated/)
    expect(rc3).not.toMatch(/GRANT SELECT ON public\.v_certified_ledger_transactions TO authenticated/)
    expect(rc3).toMatch(/COALESCE\(t\.client_charge,\s*t\.amount_eur\)\s*AS client_amount/)
    expect(rc3).toMatch(/reporting_name IS NOT NULL/)
    expect(rc3).not.toMatch(/^\s*DROP\b/im)
    expect(rc3).not.toMatch(/v_cashbox_audit/)
    expect(rc3).not.toMatch(/v_money_position/)
    expect(rc3).not.toMatch(/v_jj_company_pl/)
    expect(rc3).not.toMatch(/v_anastasia_clearing/)
    expect(rc3).not.toMatch(/INSERT INTO public\.transactions/i)
    expect(rc3).not.toMatch(/UPDATE public\.transactions/i)
  })

  it('draft table cannot post to transactions', () => {
    expect(drafts).toMatch(/finance\.agent_transaction_drafts/)
    expect(drafts).toMatch(/posted_transaction_id/)
    expect(drafts).toMatch(/agent_drafts_posted_forbidden/)
    expect(drafts).toMatch(/Phase 0D forbids posting drafts/)
    expect(drafts).not.toMatch(/INSERT INTO public\.transactions/i)
    expect(drafts).toMatch(/finance\.is_active_jj_staff/)
    expect(drafts).toMatch(/SECURITY DEFINER/)
    expect(drafts).toMatch(/SET search_path = ''/)
    expect(drafts).toMatch(/auth\.uid\(\)/)
    expect(drafts).toMatch(/public\.require_jj_staff/)
    expect(drafts).toMatch(/ENABLE ROW LEVEL SECURITY/)
  })
})
