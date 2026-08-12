import { reconcileStrPeriod } from '../strReconciliation';
import type { StrPeriodEvidence } from '../strReconciliation';
const PID='4eb09c84-907a-404c-b19a-7856f73fadff';
const base=(o:Partial<StrPeriodEvidence>):StrPeriodEvidence=>({propertyId:PID,serviceEngagementId:'eng-1',period:'2025-07',hostawayAmount:1000,hostawayConfidence:'high',jjAmount:1000,...o});
describe('reconcileStrPeriod (P3, read-only, property_id + engagement keyed)',()=>{
  it('match within tolerance',()=>{const r=reconcileStrPeriod(base({hostawayAmount:1000,jjAmount:1000.005}));expect(r.status).toBe('match');expect(r.needsReviewReason).toBeNull();});
  it('variance beyond tolerance',()=>{const r=reconcileStrPeriod(base({hostawayAmount:1200,jjAmount:1000}));expect(r.status).toBe('variance');expect(r.variance).toBe(200);expect(r.needsReviewReason).toContain('200.00');});
  it('missing_in_jj when only Hostaway evidence',()=>{const r=reconcileStrPeriod(base({hostawayAmount:900,jjAmount:null}));expect(r.status).toBe('missing_in_jj');expect(r.confidence).toBe('high');});
  it('missing_in_hostaway when only JJ ledger',()=>{const r=reconcileStrPeriod(base({hostawayAmount:null,jjAmount:900}));expect(r.status).toBe('missing_in_hostaway');expect(r.confidence).toBe('none');});
  it('insufficient when neither side',()=>{const r=reconcileStrPeriod(base({hostawayAmount:null,jjAmount:null}));expect(r.status).toBe('insufficient_evidence');});
  it('carries property_id + engagement (never name)',()=>{const r=reconcileStrPeriod(base({}));expect(r.propertyId).toBe(PID);expect(r.serviceEngagementId).toBe('eng-1');});
  it('requires propertyId (identity)',()=>{expect(()=>reconcileStrPeriod(base({propertyId:''}))).toThrow(/propertyId/);});

  // FIX 1 — fail-closed on missing service engagement
  it('equal amounts but NO engagement -> insufficient (not match)',()=>{const r=reconcileStrPeriod(base({serviceEngagementId:null,hostawayAmount:1000,jjAmount:1000}));expect(r.status).toBe('insufficient_evidence');expect(r.confidence).toBe('none');expect(r.needsReviewReason).toContain('service engagement');});
  it('variance amounts but NO engagement -> insufficient (not variance)',()=>{const r=reconcileStrPeriod(base({serviceEngagementId:'',hostawayAmount:1200,jjAmount:1000}));expect(r.status).toBe('insufficient_evidence');});
  it('valid engagement continues normally',()=>{const r=reconcileStrPeriod(base({serviceEngagementId:'eng-9',hostawayAmount:1000,jjAmount:1000}));expect(r.status).toBe('match');});

  // FIX 2 — tolerance uses RAW difference; round only for display
  it('raw difference beyond tolerance is variance even if displayed variance rounds to tolerance',()=>{const r=reconcileStrPeriod(base({hostawayAmount:1000.014,jjAmount:1000}),0.01);expect(r.status).toBe('variance');expect(r.variance).toBe(0.01);});
  it('exact 0.01 boundary is match',()=>{const r=reconcileStrPeriod(base({hostawayAmount:1000.01,jjAmount:1000}),0.01);expect(r.status).toBe('match');});
  it('rejects negative tolerance',()=>{expect(()=>reconcileStrPeriod(base({}),-0.01)).toThrow(/tolerance/);});
});
