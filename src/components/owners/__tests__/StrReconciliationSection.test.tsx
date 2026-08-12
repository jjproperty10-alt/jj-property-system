import renderer from 'react-test-renderer';
jest.mock('@/lib/owners/ownerStrAuditAdapter', () => ({ getStrReconciliationByName: jest.fn() }));
import { getStrReconciliationByName } from '@/lib/owners/ownerStrAuditAdapter';
import { StrReconciliationSection } from '../StrReconciliationSection';
import { buildStrReconciliation } from '@/lib/hostaway-audit';
const find=(t:any,id:string):any[]=>{const o:any[]=[];const w=(n:any)=>{if(!n||typeof n!=='object')return;if(n.props&&n.props['data-testid']===id)o.push(n);(n.children||[]).forEach(w);};w(t.toJSON());return o;};
describe('StrReconciliationSection (P3B mount)',()=>{
  it('renders reconciliation panel when data resolves',async()=>{
    (getStrReconciliationByName as jest.Mock).mockResolvedValue(buildStrReconciliation('4eb09c84-907a-404c-b19a-7856f73fadff','eng-1',[{period:'2025-07',hostawayAmount:1200,hostawayConfidence:'high',jjAmount:1000}]));
    const el=await StrReconciliationSection({propertyName:'Villa Mazotos'});
    const t=renderer.create(el);
    expect(find(t,'str-recon-section').length).toBe(1);
    expect(find(t,'str-recon-row').length).toBe(1);
  });
  it('fails safe (Needs Review) when unavailable',async()=>{
    (getStrReconciliationByName as jest.Mock).mockResolvedValue(null);
    const el=await StrReconciliationSection({propertyName:'Unknown'});
    const t=renderer.create(el);
    expect(find(t,'str-recon-unavailable').length).toBe(1);
  });
});
