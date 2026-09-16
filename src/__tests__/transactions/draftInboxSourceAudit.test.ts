import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..', '..', '..')

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

describe('draft inbox source audit', () => {
  const page = read('src/app/(app)/transactions/drafts/page.tsx')
  const createPage = read('src/app/(app)/transactions/new/page.tsx')
  const action = read('src/lib/transactions/agentDraftActions.ts')

  it('is staff-gated, session RPC list only, and read-only', () => {
    expect(page).toContain("authenticateStatementUser")
    expect(page).toContain('listAgentTransactionDrafts')
    expect(page).toContain('/transactions/new')
    expect(page).toContain('New draft')
    expect(page).not.toContain('createServiceClient')
    expect(page).not.toContain("schema('finance')")
    expect(page).not.toMatch(/from\(\s*['"]transactions['"]\s*\)/)
    expect(page).not.toContain('postDraft')
    expect(page).not.toContain('approveDraft')
    expect(page).not.toContain("rpc('update_agent_transaction_draft'")
    expect(page).not.toContain("rpc('create_agent_transaction_draft'")
  })

  it('new draft View all goes to the inbox', () => {
    expect(createPage).toContain('href="/transactions/drafts"')
    expect(createPage).toContain('View all')
    expect(createPage).not.toMatch(/router\.push\('\/transactions'\)/)
  })

  it('list action uses public list RPC and never writes transactions', () => {
    expect(action).toContain("rpc('list_agent_transaction_drafts'")
    expect(action).not.toContain("schema('finance')")
    expect(action).not.toContain('createServiceClient')
    expect(action).not.toMatch(/from\(\s*['"]transactions['"]\s*\)/)
  })
})
