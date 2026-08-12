import renderer from 'react-test-renderer'
import { StrReconciliationPanel } from '../StrReconciliationPanel'
import { buildStrReconciliation } from '@/lib/hostaway-audit'

const PID = '4eb09c84-907a-404c-b19a-7856f73fadff'
const find = (t: any, id: string): any[] => {
  const o: any[] = []
  const w = (n: any) => { if (!n || typeof n !== 'object') return; if (n.props && n.props['data-testid'] === id) o.push(n); (n.children || []).forEach(w) }
  w(t.toJSON()); return o
}
const text = (t: any) => JSON.stringify(t.toJSON())

describe('StrReconciliationPanel month-aligned evidence', () => {
  it('empty state names the selected period', () => {
    const dto = buildStrReconciliation(PID, 'eng-1', [])
    const t = renderer.create(<StrReconciliationPanel data={dto} periodLabel="August 2026" />)
    expect(find(t, 'str-recon-empty').length).toBe(1)
    expect(text(t)).toContain('August 2026')
  })

  it('Hostaway present + JJ null → Missing in JJ (Needs Review) row', () => {
    const dto = buildStrReconciliation(PID, 'eng-1', [
      { period: 'August 2026', hostawayAmount: 640.5, hostawayConfidence: 'high', jjAmount: null },
    ])
    const t = renderer.create(<StrReconciliationPanel data={dto} periodLabel="August 2026" />)
    expect(find(t, 'str-recon-row').length).toBe(1)
    expect(text(t)).toContain('Missing in JJ')
    expect(dto.summary.missingInJj).toBe(1)
  })
})
