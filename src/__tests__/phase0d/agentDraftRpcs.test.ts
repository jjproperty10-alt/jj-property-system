import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..', '..', '..')
const RPC_SQL = path.join(ROOT, 'supabase', 'migrations', '20260917120000_agent_transaction_draft_public_rpcs.sql')
const ACTION = path.join(ROOT, 'src', 'lib', 'transactions', 'agentDraftActions.ts')
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations')

function read(abs: string): string {
  return fs.readFileSync(abs, 'utf8')
}

describe('public agent draft RPCs', () => {
  const sql = read(RPC_SQL)
  const action = read(ACTION)

  it('uses a unique 14-digit version that is not 20260916', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'))
    const hits = files.filter(f => f.startsWith('20260917120000_'))
    expect(hits).toEqual(['20260917120000_agent_transaction_draft_public_rpcs.sql'])
    expect(files.filter(f => /^20260917120000/.test(f))).toHaveLength(1)
    expect(RPC_SQL).not.toMatch(/20260916/)
  })

  it('defines the three public SECURITY DEFINER wrappers with empty search_path', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.create_agent_transaction_draft\(/)
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.list_agent_transaction_drafts\(/)
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.update_agent_transaction_draft\(/)
    const definerBlocks = sql.match(/SECURITY DEFINER\s+SET search_path = ''/g) ?? []
    expect(definerBlocks.length).toBeGreaterThanOrEqual(3)
    expect(sql).toMatch(/finance\.agent_transaction_drafts/)
    expect(sql).toMatch(/finance\.is_active_jj_staff\(\)/)
    expect(sql).toMatch(/auth\.uid\(\)/)
  })

  it('grants EXECUTE to authenticated only and revokes PUBLIC/anon/service_role', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.create_agent_transaction_draft[\s\S]*FROM PUBLIC/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.list_agent_transaction_drafts[\s\S]*FROM PUBLIC/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.update_agent_transaction_draft[\s\S]*FROM PUBLIC/)
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.create_agent_transaction_draft[\s\S]*FROM anon/)
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.list_agent_transaction_drafts[\s\S]*FROM anon/)
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.update_agent_transaction_draft[\s\S]*FROM anon/)
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.create_agent_transaction_draft[\s\S]*FROM service_role/)
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.list_agent_transaction_drafts[\s\S]*FROM service_role/)
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.update_agent_transaction_draft[\s\S]*FROM service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_agent_transaction_draft[\s\S]*TO authenticated/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_agent_transaction_drafts[\s\S]*TO authenticated/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.update_agent_transaction_draft[\s\S]*TO authenticated/)
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]*TO anon/)
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]*TO service_role/)
  })

  it('never writes public.transactions and never accepts posted_transaction_id or created_by', () => {
    expect(sql).not.toMatch(/INSERT INTO public\.transactions/i)
    expect(sql).not.toMatch(/UPDATE public\.transactions/i)
    expect(sql).not.toMatch(/p_created_by/)
    expect(sql).not.toMatch(/p_posted_transaction_id/)
    expect(sql).not.toMatch(/posted_transaction_id\s*=/)
    expect(sql).toMatch(/ON CONFLICT \(idempotency_key\) DO NOTHING/)
    expect(sql).toMatch(/reused_existing := true/)
    expect(sql).toMatch(/ORDER BY d\.created_at DESC, d\.id ASC/)
  })

  it('action uses session JWT public RPC and does not touch schema finance or transactions', () => {
    expect(action).toContain("rpc('create_agent_transaction_draft'")
    expect(action).toContain("rpc('list_agent_transaction_drafts'")
    expect(action).toContain('authenticateStatementUser')
    expect(action).toContain('createSupabaseServerClient')
    expect(action).not.toContain("schema('finance')")
    expect(action).not.toContain('createServiceClient')
    expect(action).not.toMatch(/from\(\s*['"]transactions['"]\s*\)/)
    expect(action).not.toMatch(/p_created_by/)
    expect(action).not.toMatch(/p_posted_transaction_id/)
  })
})
