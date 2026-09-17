import {
  applyUserText,
  createCollectorState,
  extractAmountEur,
  isUnsupportedCapability,
  matchProperties,
  nicosiaToday,
  numberedDirectChoices,
  cancelCollector,
  resetForChangeDetails,
  UNSUPPORTED_CAPABILITY_MESSAGE,
  type CollectorContext,
  type PropertyCatalogEntry,
} from '@/lib/ops/assistant/transactionDraftCollector'

const CATALOG: PropertyCatalogEntry[] = [
  { id: '1', name: 'Tamir Dekelia' },
  { id: '2', name: 'Tamir Kiti' },
  { id: '3', name: 'Tamir Radisson' },
  { id: '4', name: 'Villa Mazotos' },
]

const CTX: CollectorContext = {
  catalog: CATALOG,
  staffPayerName: 'Yossi',
  now: new Date('2026-09-17T10:00:00+03:00'),
}

function start() {
  return createCollectorState('draft-key-1')
}

describe('transaction draft collector', () => {
  it('extracts euro amounts and does not convert other currencies', () => {
    expect(extractAmountEur('שילמתי 120 אירו')).toBe('120')
    expect(extractAmountEur('€120')).toBe('120')
    expect(extractAmountEur('120 euro')).toBe('120')
    expect(extractAmountEur('120 dollars')).toBe('other_currency')
    expect(extractAmountEur('אין סכום')).toBeNull()
  })

  it('maps היום to Europe/Nicosia', () => {
    expect(nicosiaToday(new Date('2026-09-17T00:30:00+03:00'))).toBe('2026-09-17')
    const next = applyUserText(start(), 'שילמתי 50 אירו היום', CTX)
    expect(next.slots.date.value).toBe('2026-09-17')
  })

  it('asks when several Tamir properties match and does not guess', () => {
    const next = applyUserText(start(), 'שילמתי 120 אירו חשמל בדירה של תמיר', CTX)
    expect(next.lastPrompt.kind).toBe('question')
    if (next.lastPrompt.kind !== 'question') return
    expect(next.lastPrompt.field).toBe('propertyName')
    const labels = numberedDirectChoices(next.lastPrompt).map((c) => c.label)
    expect(labels).toEqual(['Tamir Dekelia', 'Tamir Kiti', 'Tamir Radisson'])
    expect(labels).toHaveLength(3)
    expect(next.slots.propertyName.status).toBe('unknown')
  })

  it('does not invent an unknown property', () => {
    const next = applyUserText(start(), 'שילמתי 10 אירו בנכס בדוי', CTX)
    expect(next.lastPrompt.kind).toBe('question')
    if (next.lastPrompt.kind !== 'question') return
    expect(next.lastPrompt.searchProperties).toBe(true)
    expect(next.slots.propertyName.value).toBeUndefined()
    expect(matchProperties('נכס בדוי', CATALOG)).toEqual([])
  })

  it('keeps client_charge unknown until an explicit decision', () => {
    const next = applyUserText(start(), 'שילמתי 120 אירו חשמל בדירה של תמיר', CTX)
    expect(next.slots.clientCharge.status).toBe('unknown')
    expect(next.slots.clientCharge.value).toBeUndefined()
  })

  it('uses a searchable selector when more than three properties match', () => {
    const catalog = [
      ...CATALOG,
      { id: '5', name: 'Tamir Four' },
    ]
    const next = applyUserText(start(), 'תמיר 30 אירו', { ...CTX, catalog })
    expect(next.lastPrompt.kind).toBe('question')
    if (next.lastPrompt.kind !== 'question') return
    expect(next.lastPrompt.searchProperties).toBe(true)
    expect(numberedDirectChoices(next.lastPrompt).length).toBeLessThanOrEqual(3)
  })

  it('shows a full summary only after required fields, without creating a draft', () => {
    let state = applyUserText(start(), 'שילמתי 120 אירו חשמל בדירה של תמיר', CTX)
    state = applyUserText(state, 'Tamir Kiti', CTX)
    let guard = 0
    while (state.lastPrompt.kind === 'question' && guard < 20) {
      guard += 1
      const prompt = state.lastPrompt
      if (prompt.choices[0]) {
        state = applyUserText(state, prompt.choices[0].label, CTX)
        continue
      }
      if (prompt.field === 'date') {
        state = applyUserText(state, 'היום', CTX)
        continue
      }
      if (prompt.field === 'description') {
        state = applyUserText(state, 'חשמל תמיר', CTX)
        continue
      }
      if (prompt.field === 'payee') {
        state = applyUserText(state, 'Electricity Authority', CTX)
        continue
      }
      if (prompt.field === 'payer') {
        state = applyUserText(state, 'Yossi', CTX)
        continue
      }
      break
    }
    expect(state.createdDraftId).toBeNull()
    expect(state.lastPrompt.kind).toBe('ready')
    if (state.lastPrompt.kind !== 'ready') return
    expect(state.lastPrompt.summary.date).toBe('2026-09-17')
    expect(state.lastPrompt.summary.property).toBe('Tamir Kiti')
    expect(state.lastPrompt.summary.amount).toContain('120')
    expect(state.lastPrompt.summary.category.length).toBeGreaterThan(0)
    expect(state.lastPrompt.summary.subcategory.length).toBeGreaterThan(0)
    expect(state.lastPrompt.summary.payer).toBe('Yossi')
    expect(state.lastPrompt.summary.payee.length).toBeGreaterThan(0)
    expect(state.lastPrompt.summary.clientCharge).toMatch(/אין חיוב|NULL|none/i)
  })

  it('change and cancel do not create a draft', () => {
    const readyish = applyUserText(start(), 'שילמתי 120 אירו', CTX)
    const changed = resetForChangeDetails(readyish, CTX)
    expect(changed.createdDraftId).toBeNull()
    const cancelled = cancelCollector('new-key')
    expect(cancelled.createdDraftId).toBeNull()
    expect(cancelled.slots.amountEur.status).toBe('unknown')
  })

  it('defers email, messaging, document and report requests', () => {
    expect(isUnsupportedCapability('תשלח מייל לבעלים')).toBe(true)
    const next = applyUserText(start(), 'שלח וואטסאפ לדייר', CTX)
    expect(next.lastPrompt.kind).toBe('unsupported')
    if (next.lastPrompt.kind === 'unsupported') {
      expect(next.lastPrompt.message).toBe(UNSUPPORTED_CAPABILITY_MESSAGE)
    }
    expect(next.createdDraftId).toBeNull()
  })
})
