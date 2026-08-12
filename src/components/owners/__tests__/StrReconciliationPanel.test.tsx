import renderer from 'react-test-renderer';
import { StrReconciliationPanel } from '../StrReconciliationPanel';
import { buildStrReconciliation } from '@/lib/hostaway-audit';
const PID='4eb09c84-907a-404c-b19a-7856f73fadff';
const find=(t:any,id:string):any[]=>{const o:any[]=[];const w=(n:any)=>{if(!n||typeof n!=='object')return;if(n.props&&n.props['data-testid']===id)o.push(n);(n.children||[]).forEach(w);};w(t.toJSON());return o;};
describe('StrReconciliationPanel (P3B, read-only)',()=>{
  it('no active engagement -> Needs Review message, no rows',()=>{const dto=buildStrReconciliation(PID,null,[{period:'2025-07',hostawayAmount:1000,hostawayConfidence:'high',jjAmount:1000}]);const t=renderer.create(<StrReconciliationPanel data={dto}/>);expect(find(t,'str-recon-no-engagement').length).toBe(1);expect(find(t,'str-recon-row').length).toBe(0);});
  it('with engagement -> renders period rows',()=>{const dto=buildStrReconciliation(PID,'eng-1',[{period:'2025-07',hostawayAmount:1200,hostawayConfidence:'high',jjAmount:1000}]);const t=renderer.create(<StrReconciliationPanel data={dto}/>);expect(find(t,'str-recon-panel').length).toBe(1);expect(find(t,'str-recon-row').length).toBe(1);});
});
