import { buildStrReconciliation } from '../strAudit';
import type { StrPeriodInput } from '../strAudit';
const PID='4eb09c84-907a-404c-b19a-7856f73fadff';
const ENG='eng-1';
const P=(o:Partial<StrPeriodInput>):StrPeriodInput=>({period:'2025-07',hostawayAmount:1000,hostawayConfidence:'high',jjAmount:1000,...o});
describe('buildStrReconciliation (P3B read-path DTO)',()=>{
  it('valid UUID + engagement + matching evidence -> match',()=>{const d=buildStrReconciliation(PID,ENG,[P({})]);expect(d.hasActiveEngagement).toBe(true);expect(d.summary.match).toBe(1);expect(d.periods[0].propertyId).toBe(PID);expect(d.periods[0].serviceEngagementId).toBe(ENG);});
  it('missing engagement -> every period Needs Review (insufficient), hasActiveEngagement false',()=>{const d=buildStrReconciliation(PID,null,[P({}),P({hostawayAmount:1200})]);expect(d.hasActiveEngagement).toBe(false);expect(d.summary.insufficient).toBe(2);expect(d.summary.match).toBe(0);expect(d.summary.variance).toBe(0);});
  it('no Hostaway snapshot evidence (null) with JJ ledger -> missing_in_hostaway',()=>{const d=buildStrReconciliation(PID,ENG,[P({hostawayAmount:null,jjAmount:900})]);expect(d.summary.missingInHostaway).toBe(1);});
  it('Hostaway evidence but no JJ ledger -> missing_in_jj',()=>{const d=buildStrReconciliation(PID,ENG,[P({hostawayAmount:900,jjAmount:null})]);expect(d.summary.missingInJj).toBe(1);});
  it('variance path + aggregated totalVarianceEur',()=>{const d=buildStrReconciliation(PID,ENG,[P({hostawayAmount:1200,jjAmount:1000}),P({period:'2025-08',hostawayAmount:1000,jjAmount:1000})]);expect(d.summary.variance).toBe(1);expect(d.summary.match).toBe(1);expect(d.summary.totalVarianceEur).toBe(200);});
  it('identity is property_id (no name anywhere in output)',()=>{const d=buildStrReconciliation(PID,ENG,[P({})]);expect(JSON.stringify(d)).not.toMatch(/property_name|jjPropertyName/);});
  it('low confidence maps to medium',()=>{const d=buildStrReconciliation(PID,ENG,[P({hostawayConfidence:'low',hostawayAmount:900,jjAmount:null})]);expect(d.periods[0].confidence).toBe('medium');});
});
