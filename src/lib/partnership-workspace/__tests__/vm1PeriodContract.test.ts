import * as fs from 'fs'
import * as path from 'path'
import {
  isVm1InitialPeriodCheckIn,
  VM1_HOSTAWAY_INVENTORY_EVIDENCE_NOTE,
  VM1_HOSTAWAY_OVERLAP_PROBE_FROM,
  VM1_HOSTAWAY_OVERLAP_PROBE_TO,
  VM1_INITIAL_PERIOD_FROM,
  VM1_INITIAL_PERIOD_NAME,
  VM1_INITIAL_PERIOD_TO,
} from '../vm1PeriodContract'
import { VM1_NEW_PERIOD_START } from '../vm1Identity'

describe('vm1PeriodContract', () => {
  it('names the Initial partnership period without calling it 90 days or exactly 3 months', () => {
    expect(VM1_INITIAL_PERIOD_NAME).toBe('Initial partnership period')
    expect(VM1_INITIAL_PERIOD_FROM).toBe('2026-08-30')
    expect(VM1_INITIAL_PERIOD_FROM).toBe(VM1_NEW_PERIOD_START)
    expect(VM1_INITIAL_PERIOD_TO).toBe('2026-11-30')
    const src = fs.readFileSync(path.join(process.cwd(), 'src/lib/partnership-workspace/vm1PeriodContract.ts'), 'utf8')
    expect(src).not.toMatch(/90 days/i)
    expect(src).not.toMatch(/exactly 3 months/i)
  })

  it('uses inclusive check-in membership on the approved boundaries', () => {
    expect(isVm1InitialPeriodCheckIn('2026-08-29')).toBe(false)
    expect(isVm1InitialPeriodCheckIn('2026-08-30')).toBe(true)
    expect(isVm1InitialPeriodCheckIn('2026-11-30')).toBe(true)
    expect(isVm1InitialPeriodCheckIn('2026-12-01')).toBe(false)
    expect(isVm1InitialPeriodCheckIn(null)).toBe(false)
    expect(isVm1InitialPeriodCheckIn('')).toBe(false)
  })

  it('keeps Hostaway overlap probe dates distinct from period membership', () => {
    expect(VM1_HOSTAWAY_OVERLAP_PROBE_FROM).toBe('2026-08-25')
    expect(VM1_HOSTAWAY_OVERLAP_PROBE_TO).toBe('2026-11-30')
    expect(isVm1InitialPeriodCheckIn('2026-08-25')).toBe(false)
    expect(VM1_HOSTAWAY_INVENTORY_EVIDENCE_NOTE).toContain('not a Certified snapshot')
  })

  it('does not carry a €30 financial fixture or future expense classification', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/lib/partnership-workspace/vm1PeriodContract.ts'), 'utf8')
    expect(src).not.toContain('efe4e1f5')
    expect(src).not.toContain('APPROVED_PROPERTY_EXPENSE_FOR_FUTURE_DRAFT')
    expect(src).not.toContain('partnershipChargeEur')
    expect(src).not.toContain('jjCostEur')
    expect(src).not.toContain('jjMarginEur')
    expect(src).not.toContain('Internet')
    expect(src).not.toContain('transactions')
    expect(src).not.toContain('594.25')
    expect(src).not.toContain('property_name')
    expect(src).not.toContain('€15')
    expect(src).not.toContain('7.50')
  })
})
