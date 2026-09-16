import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..', '..', '..')

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

describe('Phase 0D source audits', () => {
  it('/transactions/new contains no transactions INSERT', () => {
    const src = read('src/app/(app)/transactions/new/page.tsx')
    expect(src).not.toMatch(/from\(\s*['"]transactions['"]\s*\)\s*\.insert/)
    expect(src).not.toMatch(/transactions['"]\s*\)\.insert/)
    expect(src).toContain('createAgentTransactionDraft')
    expect(src).toContain('DRAFT_NOT_POSTED_MESSAGE')
    expect(src).toContain('Save draft')
    expect(src).toContain('Not posted to accounts')
    expect(read('src/lib/ledger/agentDraft.ts')).toContain('Draft saved — not posted to accounts.')
    expect(src).not.toContain('createServiceClient')
  })

  it('draft action never inserts into public.transactions and has no post function', () => {
    const src = read('src/lib/transactions/agentDraftActions.ts')
    expect(src).not.toMatch(/from\(\s*['"]transactions['"]\s*\)/)
    expect(src).not.toMatch(/posted_transaction_id:\s*['"]/)
    expect(src).toContain("schema('finance')")
    expect(src).toContain('authenticateStatementUser')
    expect(src).toContain('createSupabaseServerClient')
    expect(src).not.toContain('createServiceClient')
    expect(src).not.toMatch(/function post/i)
    expect(src).not.toMatch(/approveDraft|postDraft|postToTransactions/)
  })

  it('STR screen and PDF consume the same statement composer', () => {
    const pdf = read('src/app/(app)/owners/[slug]/statement/pdf/route.ts')
    const range = read('src/lib/report/str/ownerStrRangeStatementService.ts')
    const monthly = read('src/lib/report/str/ownerStrStatementService.ts')
    expect(pdf).toContain('buildOwnerStrStatement')
    expect(pdf).toContain('OwnerStrStatementPdf')
    expect(range).toContain('buildOwnerStrStatement')
    expect(range).toContain('composeOwnerStrRangeStatement')
    expect(monthly).toContain('composeOwnerStrStatement')
    expect(monthly).toContain('fetchCertifiedLedgerRows')
  })

  it('Owner Room and RC3 PDF consume fetchRC3Report, not a second filter', () => {
    const adapter = read('src/lib/owners/ownerFinancialAdapter.ts')
    const fetch = read('src/lib/report/fetchReport.ts')
    const pdf = read('src/lib/pdf/OwnerSettlementPdfV3.tsx')
    expect(adapter).toContain('fetchRC3Report')
    expect(adapter).not.toMatch(/is_deleted/)
    expect(fetch).toContain('v_rc3_')
    expect(fetch).not.toMatch(/filter\(.*is_deleted/)
    expect(pdf).toContain('getOwnerClientReport')
  })

  it('Client Report FinalSummary and headline consume the same report object', () => {
    const page = read('src/app/client-report-rc3/page.tsx')
    expect(page).toContain('FinalSummary')
    expect(page).toContain('PremiumSummary')
    expect(page).toContain('computeNetOwnerBalance(filterOwnerFacingSections(report.accounts))')
    expect(page).toContain('<FinalSummary report={filteredReport!} lang={lang} />')
  })

  it('Partner Settlement keeps its own isCertifiedLedgerRow module', () => {
    const partner = read('src/lib/partner-settlement/ledgerRowFilter.ts')
    const rc3 = read('src/lib/ledger/certifiedLedger.ts')
    expect(partner).toContain('export function isCertifiedLedgerRow')
    expect(partner).not.toContain("@/lib/ledger/certifiedLedger")
    expect(rc3).toContain('Partner Settlement keeps its own isCertifiedLedgerRow')
  })
})
