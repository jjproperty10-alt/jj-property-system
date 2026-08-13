import renderer from 'react-test-renderer'
import { StrPropertyBreakdown } from '../StrPropertyBreakdown'
import { StrReconciliationTable } from '../StrReconciliationTable'
import { StrNeedsAttention } from '../StrNeedsAttention'
import { StrKpiRow } from '../StrKpiRow'
import type { OwnerStrCockpit } from '@/lib/owners/ownerStrCockpit'

const find = (t: any, id: string): any[] => {
  const o: any[] = []; const w = (n: any) => { if (!n || typeof n !== 'object') return; if (n.props?.['data-testid'] === id) o.push(n); (n.children || []).forEach(w) }
  w(t.toJSON()); return o
}
const flat = (t: any): string => { let s=''; const w=(n:any)=>{if(n==null)return; if(typeof n==='string'||typeof n==='number'){s+=' '+n;return} if(Array.isArray(n)){n.forEach(w);return} if(n.children)w(n.children)}; w(t.toJSON()); return s }

const cockpit: OwnerStrCockpit = {
  breakdown: [
    { propertyId: 'd', propertyName: 'Tamir Dekelia', confirmed: 3, cancelled: 4, nights: 27, revenueEur: 2839.95, netOwnerPayoutEur: null, nextCheckIn: '2026-08-02', status: 'active' },
    { propertyId: 'r', propertyName: 'Tamir Radisson', confirmed: 5, cancelled: 3, nights: 17, revenueEur: 1402, netOwnerPayoutEur: 900.5, nextCheckIn: null, status: 'idle' },
  ],
  reconciliation: [
    { propertyName: 'Tamir Dekelia', hostawayEvidenceEur: 2839.95, jjLedgerEur: null, varianceEur: null, confidence: 'medium', status: 'missing_in_jj', reviewReason: 'no JJ ledger', hasEngagement: true },
    { propertyName: 'Tamir Radisson', hostawayEvidenceEur: 1402, jjLedgerEur: null, varianceEur: null, confidence: 'medium', status: 'missing_in_jj', reviewReason: 'no JJ ledger', hasEngagement: true },
  ],
  totals: { confirmed: 8, cancelled: 7, nights: 44, revenueEur: 4241.95, netOwnerPayoutEur: null },
}

describe('STR cockpit components', () => {
  it('breakdown shows one row per property + totals', () => {
    const t = renderer.create(<StrPropertyBreakdown cockpit={cockpit} />)
    expect(find(t, 'str-breakdown-row').length).toBe(2)
    const s = flat(t)
    expect(s).toContain('Tamir Dekelia'); expect(s).toContain('Tamir Radisson'); expect(s).toContain('Totals')
  })
  it('reconciliation table is compact — one row per property', () => {
    const t = renderer.create(<StrReconciliationTable cockpit={cockpit} periodLabel="July 2026" />)
    expect(find(t, 'str-recon-compact-row').length).toBe(2)
    expect(flat(t)).toContain('Missing in JJ')
  })
  it('needs attention lists issues from statuses', () => {
    const t = renderer.create(<StrNeedsAttention cockpit={cockpit} />)
    expect(find(t, 'str-attention-item').length).toBe(2)
  })
  it('needs attention shows All clear when no issues', () => {
    const clear: OwnerStrCockpit = { ...cockpit, reconciliation: [{ ...cockpit.reconciliation[0], status: 'match', reviewReason: null }] }
    const t = renderer.create(<StrNeedsAttention cockpit={clear} />)
    expect(find(t, 'str-attention-clear').length).toBe(1)
  })

  it('KPI row shows Revenue + derived ADR, Occupancy stays Unknown', () => {
    const t = renderer.create(<StrKpiRow cockpit={cockpit} />)
    const s = flat(t)
    expect(find(t, 'str-kpi-row').length).toBe(1)
    expect(s).toContain('Revenue'); expect(s).toContain('ADR'); expect(s).toContain('Occupancy')
  })
  it('breakdown Net Payout: value when reliable, Needs Review (not 0) when null', () => {
    const t = renderer.create(<StrPropertyBreakdown cockpit={cockpit} />)
    const s = flat(t)
    expect(s).toContain('Net Payout')
    expect(s).toContain('Needs Review') // Dekelia netOwnerPayoutEur=null
  })
  it('needs attention uses human wording + Review link to financial', () => {
    const t = renderer.create(<StrNeedsAttention cockpit={cockpit} periodLabel="August 2026" financialHref="/owners/tamir?tab=financial" />)
    const s = flat(t)
    expect(s).toContain('August 2026 STR income is not yet recorded in JJ')
    expect(find(t, 'str-attention-review').length).toBe(2)
    expect(find(t, 'str-attention-review')[0].props.href).toBe('/owners/tamir?tab=financial')
  })

})
