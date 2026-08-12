/** Financial section header shows Service · Property · Period + owner Direction (QA cleanup). */
import renderer from 'react-test-renderer'
import { FinancialTab } from '@/components/owners/tabs/FinancialTab'
import type { OwnerFinancialDTO } from '@/lib/owners/ownerWorkspaceTypes'

const flat = (t: any): string => {
  let out = ''
  const walk = (n: any) => {
    if (n == null) return
    if (typeof n === 'string' || typeof n === 'number') { out += ' ' + n; return }
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (n.children) walk(n.children)
  }
  walk(t.toJSON()); return out
}

function dto(): OwnerFinancialDTO {
  return {
    position: { incomeEur: null, expensesEur: null, paidToOwnerEur: null, netEur: null, pendingEur: null, closingBalanceEur: null } as any,
    overallNet: null,
    sections: [{
      type: 'airbnb',
      label: 'Short-Term Rental',
      propertyName: 'Tamir Dekelia',
      ownerDirection: 'due_to_you',
      ownerDirectionAmountEur: '2839.95',
      incomeEur: '2839.95', expensesEur: '0', netEur: '2839.95',
      closingBalanceEur: '2839.95', balanceConvention: 'owner_credit', rows: [],
    }],
    timeline: [],
    occupancyPosition: null,
  } as unknown as OwnerFinancialDTO
}

describe('FinancialTab section labels', () => {
  it('renders Service · Property · Period and a Due to You direction badge', () => {
    const t = renderer.create(<FinancialTab dto={dto()} periodLabel="July 2026" />)
    const text = flat(t)
    expect(text).toContain('Short-Term Rental')
    expect(text).toContain('Tamir Dekelia')
    expect(text).toContain('July 2026')
    expect(text).toContain('Due to You')
  })
})
