import { readFileSync } from 'fs'
import { resolve } from 'path'

const page = readFileSync(resolve(__dirname, '../../app/(app)/page.tsx'), 'utf8')
const data = readFileSync(resolve(__dirname, '../../lib/ceo/fetchCeoDashboard.ts'), 'utf8')

describe('CEO dashboard schema and phone layout', () => {
  it('does not query the missing settlement view or the missing profit column', () => {
    const source = `${page}\n${data}`
    expect(source).not.toContain("from('v_settlement_verification')")
    expect(source).not.toContain('total_cash_position_profit,total_contract_profit')
    expect(data).toContain("from('v_ceo_summary').select('*')")
    expect(page).toContain('UNAVAILABLE_METRIC')
    expect(page).toContain('<SettlementSection')
    expect(data).toContain('settlement: null')
    expect(source).not.toContain('Official Result')
    expect(source).not.toContain('Delta:')
    expect(source).not.toContain("?? 'Jacob pays Yossi'")
  })

  it('stacks cards below the sm breakpoint instead of forcing five columns', () => {
    expect(page).not.toMatch(/(^|[^\w:-])grid-cols-[3-5]\b/)
    expect(page).toContain('grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5')
    expect(page).toContain('grid-cols-1 gap-6 border-b pb-5 sm:grid-cols-3')
    expect(page).toContain('min-w-0 break-words')
  })
})
