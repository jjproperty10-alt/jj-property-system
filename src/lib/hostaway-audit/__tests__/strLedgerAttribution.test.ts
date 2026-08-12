import { classifyStrPeriodAttribution, monthsSpanned } from '../strLedgerAttribution';
describe('classifyStrPeriodAttribution (P4, read-only, no split)',()=>{
  it('explicit multi-month range -> multi_period_aggregate (detected, not split)',()=>{const a=classifyStrPeriodAttribution('2025-07-01','2025-12-31','הכנסה 1/7/25-31/12/25');expect(a.method).toBe('explicit_period_range');expect(a.spansMultipleMonths).toBe(true);expect(a.reviewReason).toBe('multi_period_aggregate');});
  it('explicit single-month range -> no review reason',()=>{const a=classifyStrPeriodAttribution('2026-01-01','2026-01-31','jan');expect(a.method).toBe('explicit_period_range');expect(a.spansMultipleMonths).toBe(false);expect(a.reviewReason).toBeNull();});
  it('periodFrom only (open) -> explicit, no reason',()=>{const a=classifyStrPeriodAttribution('2025-07-24',null,'x');expect(a.method).toBe('explicit_period_range');expect(a.reviewReason).toBeNull();});
  it('no parseable period + description -> period_unresolved (never assume tx date = period)',()=>{const a=classifyStrPeriodAttribution(null,null,'AIRBNB');expect(a.method).toBe('period_unresolved');expect(a.reviewReason).toBe('period_unresolved');});
  it('no parseable period + empty description -> missing_period_metadata',()=>{const a=classifyStrPeriodAttribution(null,null,'');expect(a.reviewReason).toBe('missing_period_metadata');});
  it('explicit period metadata wins over description text',()=>{const a=classifyStrPeriodAttribution('2025-07-01','2025-07-31','some fuzzy text');expect(a.method).toBe('explicit_period_range');});
  it('monthsSpanned counts inclusive calendar months',()=>{expect(monthsSpanned('2025-07-01','2025-12-31')).toBe(6);expect(monthsSpanned('2026-01-05','2026-01-20')).toBe(1);expect(monthsSpanned('2025-11-01','2026-02-28')).toBe(4);});
});
