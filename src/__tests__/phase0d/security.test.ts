import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..', '..', '..')

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

const DRAFT_FILES = [
  'src/app/(app)/transactions/new/page.tsx',
  'src/app/(app)/transactions/drafts/page.tsx',
  'src/lib/transactions/agentDraftActions.ts',
  'src/lib/ledger/agentDraft.ts',
  'supabase/migrations/20260917090100_agent_transaction_drafts.sql',
  'supabase/migrations/20260917120000_agent_transaction_draft_public_rpcs.sql',
]

const LEDGER_FILES = [
  'src/lib/ledger/certifiedLedger.ts',
  'src/lib/ledger/certifiedTransactionsReader.ts',
  'src/lib/report/str/ownerStrStatementService.ts',
  'src/lib/owners/ownerStrAuditAdapter.ts',
  'src/lib/hostaway-audit/propertyAuditService.ts',
  'src/lib/report/fetchReport.ts',
  'supabase/migrations/20260917090000_v_certified_ledger_and_rc3.sql',
]

describe('Phase 0D static security', () => {
  it('no draft path inserts into public.transactions', () => {
    for (const f of DRAFT_FILES) {
      const src = read(f)
      expect(src).not.toMatch(/INSERT INTO public\.transactions/i)
      expect(src).not.toMatch(/from\(\s*['"]transactions['"]\s*\)\s*\.insert/)
    }
  })

  it('no draft approval/post function exists', () => {
    const action = read('src/lib/transactions/agentDraftActions.ts')
    const sql = read('supabase/migrations/20260917090100_agent_transaction_drafts.sql')
    const rpcs = read('supabase/migrations/20260917120000_agent_transaction_draft_public_rpcs.sql')
    expect(action).not.toMatch(/postDraft|approveAndPost/)
    expect(action).not.toMatch(/posted_transaction_id/)
    expect(action).not.toContain("schema('finance')")
    expect(action).toContain("rpc('create_agent_transaction_draft'")
    expect(action).toContain("rpc('list_agent_transaction_drafts'")
    expect(sql).toMatch(/agent_drafts_posted_forbidden/)
    expect(sql).toMatch(/Phase 0D forbids posting drafts/)
    expect(sql).not.toMatch(/INSERT INTO public\.transactions/i)
    expect(rpcs).not.toMatch(/INSERT INTO public\.transactions/i)
    expect(rpcs).not.toMatch(/p_posted_transaction_id/)
  })

  it('client page does not import a service-role client', () => {
    const page = read('src/app/(app)/transactions/new/page.tsx')
    expect(page).toMatch(/'use client'/)
    expect(page).not.toContain('createServiceClient')
    expect(page).not.toContain('SUPABASE_SERVICE')
  })

  it('no secrets or production URLs added in Phase 0D files', () => {
    const files = [...DRAFT_FILES, ...LEDGER_FILES]
    for (const f of files) {
      const src = read(f)
      expect(src).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\./)
      expect(src).not.toMatch(/sk_live_|ghp_|github_pat_/)
      expect(src).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@/)
    }
  })

  it('RC3/STR migrations do not touch cashbox, P&L, money position, or Anastasia', () => {
    const rc3 = read('supabase/migrations/20260917090000_v_certified_ledger_and_rc3.sql')
    const drafts = read('supabase/migrations/20260917090100_agent_transaction_drafts.sql')
    const rpcs = read('supabase/migrations/20260917120000_agent_transaction_draft_public_rpcs.sql')
    for (const src of [rc3, drafts, rpcs]) {
      expect(src).not.toMatch(/v_cashbox_audit/)
      expect(src).not.toMatch(/v_money_position/)
      expect(src).not.toMatch(/v_jj_company_pl/)
      expect(src).not.toMatch(/v_anastasia_clearing/)
      expect(src).not.toMatch(/UPDATE public\.transactions/i)
      expect(src).not.toMatch(/UPDATE public\.transaction_exclusions/i)
    }
  })

  it('certified ledger view is not granted to authenticated/anon', () => {
    const rc3 = read('supabase/migrations/20260917090000_v_certified_ledger_and_rc3.sql')
    expect(rc3).toMatch(/GRANT SELECT ON public\.v_certified_ledger_transactions TO service_role/)
    expect(rc3).not.toMatch(/GRANT SELECT ON public\.v_certified_ledger_transactions TO authenticated/)
    expect(rc3).toMatch(/REVOKE ALL ON public\.v_certified_ledger_transactions FROM anon/)
    expect(rc3).toMatch(/REVOKE ALL ON public\.v_certified_ledger_transactions FROM authenticated/)
  })
})
