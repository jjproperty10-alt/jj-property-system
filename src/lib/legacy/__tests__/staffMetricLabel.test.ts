import { staffMetricLabel, UNAVAILABLE_METRIC } from '@/lib/legacy/staffMetricLabel'

describe('staffMetricLabel', () => {
  test('a failed or missing summary is not shown as zero', () => {
    expect(staffMetricLabel(false, false, undefined)).toBe(UNAVAILABLE_METRIC)
    expect(staffMetricLabel(false, false, 0)).toBe(UNAVAILABLE_METRIC)
    expect(staffMetricLabel(false, true, null)).toBe(UNAVAILABLE_METRIC)
  })

  test('a returned numeric zero stays zero', () => {
    expect(staffMetricLabel(false, true, 0)).toBe('€0')
  })

  test('a returned amount is shown', () => {
    expect(staffMetricLabel(false, true, 1250)).toBe('€1,250')
  })
})
