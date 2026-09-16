import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..', '..', '..')

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

describe('Transactions register UI — drafts discoverability and money columns', () => {
  const page = read('src/app/(app)/transactions/page.tsx')
  const sidebar = read('src/components/nav/Sidebar.tsx')
  const draftsPage = read('src/app/(app)/transactions/drafts/page.tsx')
  const actions = read('src/lib/transactions/agentDraftActions.ts')

  it('contains View Drafts beside New Transaction', () => {
    expect(page).toContain('href="/transactions/drafts"')
    expect(page).toContain('View Drafts / הצג טיוטות')
    expect(page).toContain('data-testid="view-drafts-link"')
    expect(page).toContain('New Transaction')
    expect(page).toContain('href="/transactions/new"')
  })

  it('renders Amount and Client Charge headers', () => {
    expect(page).toContain('data-testid="col-amount-header"')
    expect(page).toContain('data-testid="col-client-charge-header"')
    expect(page).toMatch(/data-testid="col-amount-header"[\s\S]{0,120}Amount/)
    expect(page).toMatch(/data-testid="col-client-charge-header"[\s\S]{0,120}Client Charge/)
    expect(page).toContain('table-fixed')
    expect(page).toContain('min-w-[960px]')
    expect(page).toContain('tabular-nums')
    expect(page).toContain('title={text}')
  })

  it('does not change register data-access or EUR formatting', () => {
    expect(page).toContain(".from('transactions')")
    expect(page).toContain(".select('*', { count: 'exact' })")
    expect(page).toContain(".order('date', { ascending: false })")
    expect(page).toContain('EUR(Number(tx.amount_eur))')
    expect(page).toContain('EUR(Number(tx.client_charge))')
    expect(page).toContain('maximumFractionDigits: 0')
    expect(page).not.toContain('.insert(')
    expect(page).not.toContain('.update(')
    expect(page).not.toContain('.delete(')
    expect(page).not.toContain("rpc(")
  })

  it('does not change draft data-access or staff gate', () => {
    expect(actions).toContain("rpc('list_agent_transaction_drafts'")
    expect(actions).toContain("rpc('create_agent_transaction_draft'")
    expect(actions).not.toContain("schema('finance')")
    expect(draftsPage).toContain('authenticateStatementUser')
    expect(draftsPage).toContain('listAgentTransactionDrafts')
  })

  it('keeps Drafts nested under Transactions and off partner surfaces', () => {
    expect(sidebar).toContain('href="/transactions/drafts"')
    expect(sidebar).toContain('data-testid="nav-transactions-drafts"')
    expect(sidebar).toContain("ws.id === 'transactions'")
    expect(sidebar).not.toMatch(/role === ['"]partner['"]/)
    const partnerDir = path.join(ROOT, 'src/app/partner')
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name)
        return entry.isDirectory() ? walk(full) : [full]
      })
    const partnerFiles = walk(partnerDir)
    for (const file of partnerFiles) {
      const src = fs.readFileSync(file, 'utf8')
      expect(src).not.toContain('/transactions/drafts')
    }
  })
})
