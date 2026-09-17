import {
  formatVm1EvidenceAmount,
  parseVm1OperationsRange,
  utcTodayIso,
  VM1_DISPOSITION_LABEL,
  VM1_OPERATIONS_DEFAULT_FROM,
  VM1_UNKNOWN_EVIDENCE_LABEL,
  vm1DispositionLabel,
  vm1EvidenceStateLabel,
} from '../vm1OperationsPresentation'

describe('parseVm1OperationsRange', () => {
  const now = new Date(Date.UTC(2026, 8, 17))

  it('defaults from 2026-08-25 through the current UTC date', () => {
    const range = parseVm1OperationsRange(undefined, undefined, now)
    expect(range).toEqual({ ok: true, from: VM1_OPERATIONS_DEFAULT_FROM, to: '2026-09-17' })
    expect(utcTodayIso(now)).toBe('2026-09-17')
  })

  it('accepts explicit exact ISO from/to', () => {
    const range = parseVm1OperationsRange('2026-08-25', '2026-09-30', now)
    expect(range).toEqual({ ok: true, from: '2026-08-25', to: '2026-09-30' })
  })

  it('fails closed on unpadded dates', () => {
    const range = parseVm1OperationsRange('2026-9-3', '2026-09-30', now)
    expect(range.ok).toBe(false)
    if (range.ok) return
    expect(range.reason).toContain('from')
  })

  it('fails closed on impossible calendar days', () => {
    const range = parseVm1OperationsRange('2026-08-25', '2026-13-40', now)
    expect(range.ok).toBe(false)
  })

  it('fails closed on reversed ranges', () => {
    const range = parseVm1OperationsRange('2026-09-30', '2026-08-25', now)
    expect(range.ok).toBe(false)
    if (range.ok) return
    expect(range.reason).toContain('on or before')
  })

  it('fails closed on empty query values', () => {
    expect(parseVm1OperationsRange('', '2026-09-17', now).ok).toBe(false)
    expect(parseVm1OperationsRange('2026-08-25', '', now).ok).toBe(false)
  })

  it('fails closed when a query param is repeated', () => {
    expect(parseVm1OperationsRange(['2026-08-25', '2026-08-26'], '2026-09-17', now).ok).toBe(false)
  })
})

describe('operational labels', () => {
  it('maps certified / candidate / cancelled / inquiry / modified', () => {
    expect(
      vm1DispositionLabel({
        disposition: 'already_certified',
        reason: 'Already included',
        status: 'confirmed',
      }),
    ).toBe(VM1_DISPOSITION_LABEL.already_certified)
    expect(
      vm1DispositionLabel({
        disposition: 'operational_candidate',
        reason: 'Confirmed stay',
        status: 'confirmed',
      }),
    ).toBe(VM1_DISPOSITION_LABEL.operational_candidate)
    expect(
      vm1DispositionLabel({
        disposition: 'excluded',
        reason: 'Cancelled reservations are not revenue.',
        status: 'cancelled',
      }),
    ).toBe(VM1_DISPOSITION_LABEL.excluded_cancelled)
    expect(
      vm1DispositionLabel({
        disposition: 'excluded',
        reason: 'Inquiry reservations are not revenue.',
        status: 'inquiry',
      }),
    ).toBe(VM1_DISPOSITION_LABEL.excluded_inquiry)
    expect(
      vm1DispositionLabel({
        disposition: 'needs_review',
        reason: 'Status is modified.',
        status: 'modified',
      }),
    ).toBe(VM1_DISPOSITION_LABEL.needs_review)
  })

  it('renders null money as Unknown, never €0', () => {
    expect(formatVm1EvidenceAmount(null)).toBe(VM1_UNKNOWN_EVIDENCE_LABEL)
    expect(formatVm1EvidenceAmount(null)).not.toMatch(/€0/)
    expect(formatVm1EvidenceAmount(null)).not.toBe('€0.00')
    expect(formatVm1EvidenceAmount(0)).toBe('€0.00')
  })

  it('labels incomplete Hostaway evidence as missing', () => {
    expect(
      vm1EvidenceStateLabel({
        totalPrice: 1218.2,
        cleaningFee: 120,
        hostServiceFee: null,
        expectedPayout: null,
        taxAmount: null,
      }),
    ).toBe('Missing financial evidence')
  })
})
