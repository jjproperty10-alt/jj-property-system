import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..', '..', '..')
const SQL = path.join(ROOT, 'supabase', 'migrations', '20260918090000_agent_draft_approval_rpcs.sql')
const ACTION = path.join(ROOT, 'src', 'lib', 'transactions', 'agentDraftActions.ts')
const INBOX = path.join(ROOT, 'src', 'app', '(app)', 'transactions', 'drafts', 'page.tsx')
const ACTIONS_UI = path.join(ROOT, 'src', 'components', 'transactions', 'DraftInboxActions.tsx')
const EDIT_PAGE = path.join(ROOT, 'src', 'app', '(app)', 'transactions', 'drafts', '[id]', 'edit', 'page.tsx')
const EDIT_FORM = path.join(ROOT, 'src', 'components', 'transactions', 'DraftEditForm.tsx')

function read(abs: string): string {
  return fs.readFileSync(abs, 'utf8')
}

describe('draft approval RPCs and UI', () => {
  const sql = read(SQL)
  const action = read(ACTION)
  const inbox = read(INBOX)
  const ui = read(ACTIONS_UI)
  const editPage = read(EDIT_PAGE)
  const editForm = read(EDIT_FORM)

  it('uses a unique 14-digit version after the public draft RPCs', () => {
    const files = fs.readdirSync(path.join(ROOT, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql'))
    expect(files.filter((f) => f.startsWith('20260918090000_'))).toEqual([
      '20260918090000_agent_draft_approval_rpcs.sql',
    ])
    expect(SQL).not.toMatch(/20260916/)
  })

  it('is SECURITY DEFINER with empty search_path and re-checks active JJ staff', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.approve_and_post_agent_transaction_draft\(/)
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.reject_agent_transaction_draft\(/)
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_agent_transaction_draft\(/)
    const definers = sql.match(/SECURITY DEFINER\s+SET search_path = ''/g) ?? []
    expect(definers.length).toBeGreaterThanOrEqual(4)
    expect(sql).toMatch(/finance\.is_active_jj_staff\(\)/)
    expect(sql).toMatch(/auth\.uid\(\)/)
    expect(sql).toMatch(/FOR UPDATE/)
    expect(sql).toMatch(/reused_existing := true/)
    expect(sql).toMatch(/rejected drafts cannot be posted/)
    expect(sql).toMatch(/missing required posting fields/)
    expect(sql).toMatch(/INSERT INTO public\.transactions/)
    expect(sql).not.toMatch(/UPDATE public\.transactions/i)
    expect(sql).not.toMatch(/DELETE FROM finance\.agent_transaction_drafts/i)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.approve_and_post_agent_transaction_draft[\s\S]*TO authenticated/)
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.approve_and_post_agent_transaction_draft\(uuid\) FROM anon, service_role/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.approve_and_post_agent_transaction_draft\(uuid\) FROM PUBLIC/)
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]*TO anon/)
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]*TO service_role/)
    expect(sql).toMatch(/date, property_id, property_name, category, subcategory,\s*\n\s*description, payer, payee, amount_eur, client_charge, notes, k_note/)
  })

  it('app write path uses session JWT public RPCs only', () => {
    expect(action).toContain("rpc('approve_and_post_agent_transaction_draft'")
    expect(action).toContain("rpc('reject_agent_transaction_draft'")
    expect(action).toContain("rpc('update_agent_transaction_draft'")
    expect(action).toContain('authenticateStatementUser')
    expect(action).toContain('createSupabaseServerClient')
    expect(action).not.toContain('createServiceClient')
    expect(action).not.toContain("schema('finance')")
    expect(action).not.toMatch(/from\(\s*['"]transactions['"]\s*\)/)
    expect(action).not.toMatch(/p_created_by/)
  })

  it('inbox requires explicit confirmation with the full summary', () => {
    expect(inbox).toContain('DraftInboxActions')
    expect(ui).toContain('Approve and post')
    expect(ui).toContain('Confirm post')
    expect(ui).toContain('Date')
    expect(ui).toContain('Property')
    expect(ui).toContain('Category')
    expect(ui).toContain('Subcategory')
    expect(ui).toContain('Description')
    expect(ui).toContain('Payer')
    expect(ui).toContain('Payee')
    expect(ui).toContain('Amount')
    expect(ui).toContain('Client Charge')
    expect(ui).toContain('Posted TX')
    expect(ui).not.toContain('createServiceClient')
  })

  it('edit stays draft-only and never writes transactions', () => {
    expect(editPage).toContain('getAgentTransactionDraft')
    expect(editPage).toContain('authenticateStatementUser')
    expect(editForm).toContain('updateAgentTransactionDraft')
    expect(editForm).toContain('Draft only')
    expect(editPage).not.toMatch(/from\(\s*['"]transactions['"]\s*\)/)
    expect(editForm).not.toMatch(/from\(\s*['"]transactions['"]\s*\)/)
    expect(editForm).not.toContain('approveAndPostAgentTransactionDraft')
  })
})
