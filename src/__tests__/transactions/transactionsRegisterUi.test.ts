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
    expect(page).toMatch(/data-testid="col-amount-header"[\s\S]{0,160}Amount/)
    expect(page).toMatch(/data-testid="col-client-charge-header"[\s\S]{0,160}Client Charge/)
    expect(page).toContain('table-fixed')
    expect(page).toContain('min-w-[960px]')
    expect(page).toContain('tabular-nums')
    expect(page).toContain('title={text}')
  })

  it('uses one Status header instead of four audit headers', () => {
    expect(page).toContain('data-testid="col-status-header"')
    expect(page).toMatch(/data-testid="col-status-header"[\s\S]{0,80}Status/)
    expect(page).not.toMatch(/<th[^>]*>\s*Review\s*</)
    expect(page).not.toMatch(/<th[^>]*>\s*Deleted\s*</)
    expect(page).not.toMatch(/<th[^>]*>\s*Exclusion\s*</)
    expect(page).not.toMatch(/<th[^>]*>\s*Correction\s*</)
    expect(page).toContain('data-testid="col-subcategory-header"')
    expect(page).toContain('data-testid="col-description-header"')
    expect(page).toContain('w-[7rem]')
    expect(page).toContain('w-[9rem]')
  })

  it('still represents all four underlying status fields', () => {
    const badges = read('src/components/transactions/RegisterStatusBadges.tsx')
    expect(badges).toContain('data-testid="col-status"')
    expect(badges).toContain('data-testid="col-review-status"')
    expect(badges).toContain('data-testid="col-is-deleted"')
    expect(badges).toContain('data-testid="col-exclusion"')
    expect(badges).toContain('data-testid="col-correction-case"')
    expect(badges).toContain('buildRegisterStatusTitle')
    expect(badges).toContain('Review:')
    expect(badges).toContain('Deleted:')
    expect(badges).toContain('Exclusion:')
    expect(badges).toContain('Correction:')
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
    expect(draftsPage).toContain('data-testid="col-created-header"')
    expect(draftsPage).toContain('stamp(row.created_at)')
    expect(draftsPage).toContain('DraftInboxActions')
    expect(draftsPage).not.toContain('postDraft')
    expect(draftsPage).not.toContain('approveDraft')
    expect(actions).toContain("rpc('approve_and_post_agent_transaction_draft'")
    expect(actions).not.toMatch(/from\(\s*['"]transactions['"]\s*\)/)
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
