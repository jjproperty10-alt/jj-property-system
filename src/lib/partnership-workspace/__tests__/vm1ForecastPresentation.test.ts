import type { Vm1ForecastLine } from '../vm1ForecastCalculator'
import {
  partitionVm1ForecastLines,
  VM1_FORECAST_RECOGNITION_LABEL,
  VM1_FORECAST_RECOGNITION_LABEL_HE,
  vm1ForecastRecognitionLabel,
} from '../vm1ForecastPresentation'

function line(overrides: Partial<Vm1ForecastLine> & Pick<Vm1ForecastLine, 'externalId' | 'recognitionState'>): Vm1ForecastLine {
  return {
    channel: 'airbnb',
    status: 'confirmed',
    checkIn: '2026-09-03',
    checkOut: '2026-09-06',
    listingId: '412148',
    operationalDisposition: 'operational_candidate',
    calculable: false,
    blockedReason: null,
    grossRentalRevenue: null,
    platformFees: null,
    guestCleaning: null,
    totalTaxes: null,
    managementBase: null,
    jjManagementCharge: null,
    propertyNet: null,
    ...overrides,
  }
}

describe('partitionVm1ForecastLines', () => {
  it('orders financial review by state then check-in, and keeps excluded out', () => {
    const partitioned = partitionVm1ForecastLines([
      line({
        externalId: '53139113',
        recognitionState: 'excluded',
        checkIn: '2026-08-15',
        operationalDisposition: 'already_certified',
      }),
      line({
        externalId: '54972355',
        recognitionState: 'needs_review',
        checkIn: '2026-09-22',
        status: 'modified',
        channel: 'booking',
      }),
      line({
        externalId: '64232458',
        recognitionState: 'forecast',
        checkIn: '2026-09-18',
        calculable: true,
        propertyNet: 1307.78,
      }),
      line({
        externalId: '53082517',
        recognitionState: 'blocked',
        checkIn: '2026-09-11',
        channel: 'booking',
      }),
      line({
        externalId: '65733679',
        recognitionState: 'completed_pending_reconciliation',
        checkIn: '2026-09-03',
        calculable: true,
        propertyNet: 498.37,
      }),
      line({
        externalId: '54720071',
        recognitionState: 'excluded',
        status: 'cancelled',
        checkIn: '2026-09-01',
        operationalDisposition: 'excluded',
      }),
    ])

    expect(partitioned.financialReview.map((row) => row.externalId)).toEqual([
      '65733679',
      '64232458',
      '53082517',
      '54972355',
    ])
    expect(partitioned.excludedEvidence.map((row) => row.externalId)).toEqual(['53139113', '54720071'])
    expect(partitioned.financialReview.some((row) => row.recognitionState === 'excluded')).toBe(false)
    expect(partitioned.excludedEvidence.every((row) => row.recognitionState === 'excluded')).toBe(true)
  })

  it('does not sum or allocate partner shares', () => {
    const partitioned = partitionVm1ForecastLines([
      line({
        externalId: '65733679',
        recognitionState: 'completed_pending_reconciliation',
        propertyNet: 498.37,
        calculable: true,
      }),
      line({
        externalId: '64232458',
        recognitionState: 'forecast',
        checkIn: '2026-09-18',
        propertyNet: 1307.78,
        calculable: true,
      }),
    ])
    expect(partitioned.financialReview).toHaveLength(2)
    expect(JSON.stringify(partitioned)).not.toContain('50%')
    expect(JSON.stringify(partitioned)).not.toContain('25%')
    expect(JSON.stringify(partitioned)).not.toContain('594.25')
  })
})

describe('forecast recognition labels', () => {
  it('keeps bilingual staff labels without received/paid/settled wording', () => {
    expect(vm1ForecastRecognitionLabel({ recognitionState: 'completed_pending_reconciliation' })).toBe(
      'Completed — pending reconciliation',
    )
    expect(VM1_FORECAST_RECOGNITION_LABEL_HE.completed_pending_reconciliation).toBe('הושלם — ממתין להתאמה')
    expect(VM1_FORECAST_RECOGNITION_LABEL.forecast).toBe('Forecast')
    expect(VM1_FORECAST_RECOGNITION_LABEL.blocked).toBe('Blocked')
    expect(VM1_FORECAST_RECOGNITION_LABEL.needs_review).toBe('Needs Review')
    expect(VM1_FORECAST_RECOGNITION_LABEL.excluded).toBe('Excluded')
    const joined = JSON.stringify(VM1_FORECAST_RECOGNITION_LABEL) + JSON.stringify(VM1_FORECAST_RECOGNITION_LABEL_HE)
    expect(joined.toLowerCase()).not.toContain('paid')
    expect(joined.toLowerCase()).not.toContain('settled')
    expect(joined.toLowerCase()).not.toContain('approved income')
    expect(joined.toLowerCase()).not.toContain('certified income')
  })
})
