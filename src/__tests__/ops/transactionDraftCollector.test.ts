import {
  applyUserText,
  createCollectorState,
  exactUniqueCatalogName,
  extractAmountEur,
  isUnsupportedCapability,
  matchProperties,
  nicosiaToday,
  numberedDirectChoices,
  replayUtterances,
  resolveProperty,
  reviewFromSlots,
  cancelCollector,
  resetForChangeDetails,
  resetForNewProposal,
  AMOUNT_ONLY_CLARIFICATION,
  ASSISTANT_TALK_MESSAGE,
  INTENT_PROMPT,
  NEW_TRANSACTION_NOTICE,
  UNSAVED_PREVIOUS_NOTICE,
  UNSUPPORTED_CAPABILITY_MESSAGE,
  type CollectorContext,
  type PropertyCatalogEntry,
} from '@/lib/ops/assistant/transactionDraftCollector'

const CATALOG: PropertyCatalogEntry[] = [
  { id: '1', name: 'Tamir Dekelia' },
  { id: '2', name: 'Tamir Kiti' },
  { id: '3', name: 'Tamir Radisson' },
  { id: '4', name: 'Villa Mazotos' },
  { id: '5', name: 'Liron and Alon' },
  { id: '6', name: 'Roni' },
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
    expect(state.lastPrompt.summary.date).toBe('17/09/2026')
    expect(state.lastPrompt.summary.property).toBe('Tamir Kiti')
    expect(state.lastPrompt.summary.amount).toContain('120')
    expect(state.lastPrompt.summary.category.length).toBeGreaterThan(0)
    expect(state.lastPrompt.summary.subcategory.length).toBeGreaterThan(0)
    expect(state.lastPrompt.summary.payer).toBe('Yossi')
    expect(state.lastPrompt.summary.payee.length).toBeGreaterThan(0)
    expect(state.lastPrompt.summary.clientCharge).toMatch(/אין חיוב|NULL|none|ללא/i)
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

describe('natural Hebrew intake and new-intent reset', () => {
  const ctx: CollectorContext = { ...CTX, freshIdempotencyKey: 'draft-key-2' }

  function awaitingDateAfterNoProperty() {
    let state = applyUserText(start(), 'שילמתי 10 אירו', CTX)
    expect(state.lastPrompt.kind).toBe('question')
    state = applyUserText(state, 'בלי נכס', CTX)
    expect(state.slots.propertyName.value).toBeNull()
    expect(state.slots.amountEur.value).toBe('10')
    if (state.lastPrompt.kind === 'question') {
      expect(state.lastPrompt.field).toBe('date')
    }
    return state
  }

  it('does not leak a previous empty-property proposal into a new rent receipt', () => {
    const previous = awaitingDateAfterNoProperty()
    const next = applyUserText(previous, 'שולם שכירות לירון אלון 700 בתאריך 31.8.26', ctx)
    expect(next.preface).toContain(NEW_TRANSACTION_NOTICE)
    expect(next.preface).toContain('העסקה הקודמת לא נשמרה')
    expect(next.draftIdempotencyKey).not.toBe(previous.draftIdempotencyKey)
    expect(next.slots.amountEur.value).toBe('700')
    expect(next.slots.date.value).toBe('2026-08-31')
    expect(next.slots.propertyName.value).toBe('Liron and Alon')
    expect(next.slots.category.value).toBe('Management')
    expect(next.slots.subcategory.value).toBe('Tenant Payment')
    expect(next.slots.payer.value).toBe('Tenant')
    expect(next.slots.payee.value).toBeUndefined()
    expect(next.slots.clientCharge.value).toBeNull()
    expect(next.lastPrompt.kind).toBe('question')
    if (next.lastPrompt.kind === 'question') {
      expect(next.lastPrompt.field).toBe('payee')
      expect(next.lastPrompt.prompt).toContain('מי קיבל את הכסף')
      expect(next.lastPrompt.field).not.toBe('date')
    }
    expect(next.createdDraftId).toBeNull()
  })

  it('parses natural Hebrew receipts and expenses', () => {
    const rent = applyUserText(start(), 'קיבלתי 700 שכירות לירון אלון בתאריך 31.8.26', CTX)
    expect(rent.slots.date.value).toBe('2026-08-31')
    expect(rent.slots.amountEur.value).toBe('700')
    expect(rent.slots.propertyName.value).toBe('Liron and Alon')
    expect(rent.slots.category.value).toBe('Management')
    expect(rent.slots.subcategory.value).toBe('Tenant Payment')

    const roni = applyUserText(start(), 'קיבלנו 900 שכירות של רוני היום', CTX)
    expect(roni.slots.amountEur.value).toBe('900')
    expect(roni.slots.date.value).toBe('2026-09-17')
    expect(roni.slots.propertyName.value).toBe('Roni')
    expect(roni.slots.subcategory.value).toBe('Tenant Payment')

    const tenant = applyUserText(start(), 'הדייר שילם לי 850', CTX)
    expect(tenant.slots.amountEur.value).toBe('850')
    expect(tenant.slots.payer.value).toBe('Tenant')

    const electric = applyUserText(start(), 'שילמתי 120 אירו חשמל בדירה של תמיר', CTX)
    expect(electric.slots.amountEur.value).toBe('120')
    expect(electric.slots.category.value).toBe('Management')
    expect(electric.slots.subcategory.value).toBe('Electricity')
    expect(electric.slots.payer.status).toBe('unknown')
    expect(electric.slots.propertyName.status).toBe('unknown')
    expect(numberedDirectChoices(electric.lastPrompt).map((c) => c.label)).toEqual([
      'Tamir Dekelia', 'Tamir Kiti', 'Tamir Radisson',
    ])

    const cleaning = applyUserText(start(), 'העברתי 60 לפאבי על ניקיון', CTX)
    expect(cleaning.slots.amountEur.value).toBe('60')
    expect(cleaning.slots.subcategory.value).toBe('Cleaning')
    expect(cleaning.slots.payee.value).toBe('Fabi')
    expect(cleaning.slots.propertyName.status).toBe('unknown')

    const split = applyUserText(start(), 'עלה 120 וללקוח 150', CTX)
    expect(split.slots.amountEur.value).toBe('120')
    expect(split.slots.clientCharge.value).toBe('150')
  })

  it('normalizes spelling variants without rewriting the stored utterance', () => {
    const next = applyUserText(start(), 'שולם שכר דירה לירון ואלון 700 יורו בתאריך 31/08/2026', CTX)
    expect(next.slots.propertyName.value).toBe('Liron and Alon')
    expect(next.slots.amountEur.value).toBe('700')
    expect(next.slots.date.value).toBe('2026-08-31')
    expect(next.slots.notes.value).toContain('לירון ואלון')
    expect(next.hintText).toContain('שכר דירה')
  })

  it('asks new vs correction when a payment verb is ambiguous', () => {
    const previous = awaitingDateAfterNoProperty()
    const next = applyUserText(previous, 'קיבלתי משהו מהדייר', ctx)
    expect(next.lastPrompt.kind).toBe('question')
    if (next.lastPrompt.kind === 'question') {
      expect(next.lastPrompt.field).toBe('intent')
      expect(next.lastPrompt.prompt).toBe(INTENT_PROMPT)
      expect(numberedDirectChoices(next.lastPrompt).map((c) => c.label)).toEqual([
        'עסקה חדשה', 'תיקון הקודמת', 'ביטול',
      ])
    }
    expect(next.slots.amountEur.value).toBe('10')
  })

  it('applies a correction only to the stated field', () => {
    const rent = applyUserText(start(), 'קיבלתי 700 שכירות לירון אלון בתאריך 31.8.26', CTX)
    const corrected = applyUserText(rent, 'הסכום 750 ולא 700', { ...CTX, freshIdempotencyKey: 'corr-2' })
    expect(corrected.slots.amountEur.value).toBe('750')
    expect(corrected.slots.date.value).toBe('2026-08-31')
    expect(corrected.slots.propertyName.value).toBe('Liron and Alon')
    expect(corrected.draftIdempotencyKey).not.toBe(rent.draftIdempotencyKey)
    expect(corrected.createdDraftId).toBeNull()
  })

  it('cancel and repeat send never create a draft', () => {
    const rent = applyUserText(start(), 'קיבלתי 700 שכירות לירון אלון בתאריך 31.8.26', CTX)
    const cancelled = applyUserText(rent, 'תבטל', { ...CTX, freshIdempotencyKey: 'cancel-2' })
    expect(cancelled.createdDraftId).toBeNull()
    expect(cancelled.slots.amountEur.status).toBe('unknown')
    const again = applyUserText(rent, 'קיבלתי 700 שכירות לירון אלון בתאריך 31.8.26', ctx)
    expect(again.createdDraftId).toBeNull()
    const reset = resetForNewProposal(rent, 'new-ui-key')
    expect(reset.createdDraftId).toBeNull()
    expect(reset.slots.amountEur.status).toBe('unknown')
    expect(reset.preface).toContain(NEW_TRANSACTION_NOTICE)
  })

  it('never guesses client_charge from amount_eur and never silently picks Tamir', () => {
    const next = applyUserText(start(), 'שילמתי 120 אירו חשמל בדירה של תמיר', CTX)
    expect(next.slots.clientCharge.value).toBeUndefined()
    expect(next.slots.propertyName.value).toBeUndefined()
    expect(next.lastPrompt.kind).toBe('question')
    if (next.lastPrompt.kind === 'question') {
      expect(next.lastPrompt.field).toBe('propertyName')
    }
  })
})

describe('property suggestion replay', () => {
  it('keeps a unique property through replay so a later date is not treated as a property', () => {
    const replayed = replayUtterances(
      ['שילמתי חשמל', '500', 'היום (2026-09-17)'],
      CTX,
      'replay-key',
      'Villa Mazotos',
    )
    expect(replayed.slots.propertyName.value).toBe('Villa Mazotos')
    expect(replayed.slots.amountEur.value).toBe('500')
    expect(replayed.slots.date.value).toBe('2026-09-17')
    expect(replayed.lastPrompt.kind === 'question' ? replayed.lastPrompt.field : '').not.toBe('propertyName')
    expect(replayed.createdDraftId).toBeNull()
  })

  it('does not auto-select an ambiguous or unknown property name', () => {
    const ambiguous = replayUtterances(['25'], CTX, 'replay-ambiguous', 'Tamir')
    expect(ambiguous.slots.propertyName.status).toBe('unknown')
    const unknown = replayUtterances(['25'], CTX, 'replay-unknown', 'Not A Real House')
    expect(unknown.slots.propertyName.value).toBeUndefined()
  })

  it('still lets the user replace or clear the suggested property', () => {
    const replayed = replayUtterances(
      ['שילמתי חשמל', '500', 'היום (2026-09-17)'],
      CTX,
      'replay-change',
      'Villa Mazotos',
    )
    const change = resetForChangeDetails(replayed, CTX)
    const clearedPrompt = applyUserText(change, 'נכס', CTX)
    expect(clearedPrompt.slots.propertyName.status).toBe('unknown')
    const replaced = applyUserText(clearedPrompt, 'Tamir Kiti', CTX)
    expect(replaced.slots.propertyName.value).toBe('Tamir Kiti')
    const cleared = applyUserText(clearedPrompt, 'בלי נכס', CTX)
    expect(cleared.slots.propertyName.value).toBeNull()
  })

  it('restores a stored unique name when the conversation is reopened without a URL property', () => {
    const stored = exactUniqueCatalogName('Villa Mazotos', CATALOG)
    const replayed = replayUtterances(
      ['שילמתי חשמל', '500', 'היום (2026-09-17)'],
      CTX,
      'reopen-c-only',
      stored,
    )
    expect(stored).toBe('Villa Mazotos')
    expect(replayed.slots.propertyName.value).toBe('Villa Mazotos')
    expect(replayed.slots.date.value).toBe('2026-09-17')
    expect(replayed.lastPrompt.kind === 'question' ? replayed.lastPrompt.field : '').not.toBe('propertyName')
  })

  it('does not restore a partial, ambiguous, unknown, or duplicate stored name', () => {
    expect(exactUniqueCatalogName('Tamir', CATALOG)).toBeNull()
    expect(exactUniqueCatalogName('Not A Real House', CATALOG)).toBeNull()
    expect(exactUniqueCatalogName('villa mazotos', CATALOG)).toBeNull()
    expect(exactUniqueCatalogName(null, CATALOG)).toBeNull()
    const duplicated = [...CATALOG, { id: '7', name: 'Villa Mazotos' }]
    expect(exactUniqueCatalogName('Villa Mazotos', duplicated)).toBeNull()
    const replayed = replayUtterances(['25'], CTX, 'reopen-ambiguous', exactUniqueCatalogName('Tamir', CATALOG))
    expect(replayed.slots.propertyName.status).toBe('unknown')
  })

  it('lets a saved property change or clear override the stored suggestion', () => {
    const replaced = replayUtterances(
      ['שילמתי חשמל', '500', 'היום (2026-09-17)', 'שנה פרטים', 'נכס', 'Tamir Kiti'],
      CTX,
      'reopen-replace',
      'Villa Mazotos',
    )
    expect(replaced.slots.propertyName.value).toBe('Tamir Kiti')
    const cleared = replayUtterances(
      ['שילמתי חשמל', '500', 'היום (2026-09-17)', 'שנה פרטים', 'נכס', 'בלי נכס'],
      CTX,
      'reopen-clear',
      'Villa Mazotos',
    )
    expect(cleared.slots.propertyName.value).toBeNull()
    const untouched = replayUtterances(['25'], CTX, 'reopen-no-stored', null)
    expect(untouched.slots.propertyName.status).toBe('unknown')
    expect(untouched.slots.amountEur.status).toBe('unknown')
  })
})

describe('assistant intent routing', () => {
  function promptBody(state: ReturnType<typeof start>): string {
    return state.lastPrompt.kind === 'talk' || state.lastPrompt.kind === 'unsupported'
      ? state.lastPrompt.message
      : state.lastPrompt.kind === 'question'
        ? state.lastPrompt.prompt
        : ''
  }

  it('answers a greeting without asking for an amount or opening a draft', () => {
    const greeted = applyUserText(start(), 'היי', CTX)
    expect(greeted.lastPrompt.kind).toBe('talk')
    expect(promptBody(greeted)).toBe(ASSISTANT_TALK_MESSAGE)
    expect(promptBody(greeted)).not.toContain('מה הסכום')
    expect(greeted.slots.amountEur.status).toBe('unknown')
    expect(greeted.createdDraftId).toBeNull()

    const amount = applyUserText(greeted, '500', CTX)
    expect(amount.lastPrompt.kind).toBe('talk')
    expect(promptBody(amount)).toBe(AMOUNT_ONLY_CLARIFICATION)
    expect(amount.slots.amountEur.status).toBe('unknown')
    expect(amount.createdDraftId).toBeNull()
  })

  it('treats other general and ambiguous messages the same way, not only one greeting', () => {
    for (const text of ['שלום', 'מה אתה יכול לעשות?', 'היי ערב טוב']) {
      const next = applyUserText(start(), text, CTX)
      expect(next.lastPrompt.kind).toBe('talk')
      expect(promptBody(next)).not.toContain('מה הסכום')
      expect(next.slots.amountEur.status).toBe('unknown')
      expect(next.createdDraftId).toBeNull()
    }
  })

  it('asks for clarification on a bare number when collection is not active', () => {
    const next = applyUserText(start(), '500', CTX)
    expect(promptBody(next)).toBe(AMOUNT_ONLY_CLARIFICATION)
    expect(next.slots.amountEur.status).toBe('unknown')
    expect(next.createdDraftId).toBeNull()
  })

  it('starts collection from an explicit expense and then accepts 500', () => {
    const opened = applyUserText(start(), 'שילמתי חשמל', CTX)
    expect(opened.lastPrompt.kind).toBe('question')
    if (opened.lastPrompt.kind !== 'question') return
    expect(opened.lastPrompt.field).toBe('amountEur')
    expect(opened.slots.amountEur.status).toBe('unknown')

    const amount = applyUserText(opened, '500', CTX)
    expect(amount.slots.amountEur.value).toBe('500')
    expect(amount.createdDraftId).toBeNull()
    expect(amount.lastPrompt.kind === 'question' ? amount.lastPrompt.prompt : '').not.toContain('מה הסכום')
  })

  it('restores an in-progress collection after the conversation is replayed', () => {
    const replayed = replayUtterances(
      ['שילמתי חשמל בדירה של תמיר', '500'],
      CTX,
      'replay-mid-collection',
    )
    expect(replayed.slots.amountEur.value).toBe('500')
    expect(replayed.createdDraftId).toBeNull()
    expect(replayed.lastPrompt.kind).toBe('question')
    const continued = applyUserText(replayed, 'היום', CTX)
    expect(continued.slots.amountEur.value).toBe('500')
    expect(continued.slots.date.value).toBe('2026-09-17')
    expect(continued.createdDraftId).toBeNull()
  })

  it('does not open collection for a negation, a clarifying question, or a topic with a number', () => {
    const blocked = ['לא שילמתי חשמל', 'מה שילמתי על חשמל?', 'חשמל 2026']
    blocked.forEach((text, index) => {
      const next = applyUserText(start(), text, CTX)
      expect(next.lastPrompt.kind).toBe('talk')
      expect(promptBody(next)).not.toContain('מה הסכום')
      expect(next.slots.amountEur.status).toBe('unknown')
      expect(next.slots.category.status).toBe('unknown')
      expect(next.createdDraftId).toBeNull()
      const replayed = replayUtterances([text], CTX, `replay-not-a-report-${index}`)
      expect(replayed.lastPrompt.kind).toBe('talk')
      expect(replayed.slots.amountEur.status).toBe('unknown')
      expect(replayed.createdDraftId).toBeNull()
    })
  })

  it('opens and replays an explicit expense and an explicit rent receipt', () => {
    const expense = applyUserText(start(), 'שילמתי 500 חשמל', CTX)
    expect(expense.slots.amountEur.value).toBe('500')
    expect(expense.slots.subcategory.value).toBe('Electricity')
    expect(expense.lastPrompt.kind).toBe('question')
    expect(expense.createdDraftId).toBeNull()
    const replayedExpense = replayUtterances(['שילמתי 500 חשמל'], CTX, 'replay-explicit-expense')
    expect(replayedExpense.slots.amountEur.value).toBe('500')
    expect(replayedExpense.slots.subcategory.value).toBe('Electricity')
    expect(replayedExpense.createdDraftId).toBeNull()

    const income = applyUserText(start(), 'קיבלתי 850 שכירות', CTX)
    expect(income.slots.amountEur.value).toBe('850')
    expect(income.slots.subcategory.value).toBe('Tenant Payment')
    expect(income.lastPrompt.kind).toBe('question')
    expect(income.createdDraftId).toBeNull()
    const replayedIncome = replayUtterances(['קיבלתי 850 שכירות'], CTX, 'replay-explicit-income')
    expect(replayedIncome.slots.amountEur.value).toBe('850')
    expect(replayedIncome.slots.subcategory.value).toBe('Tenant Payment')
    expect(replayedIncome.createdDraftId).toBeNull()
  })

  it('asks who paid and who was paid separately, and does not infer either from the expense verb', () => {
    const opened = applyUserText(start(), 'שילמתי 500 אירו על חשמל', CTX)
    expect(opened.slots.amountEur.value).toBe('500')
    expect(opened.slots.payer.status).toBe('unknown')
    expect(opened.slots.payee.status).toBe('unknown')

    const dated = applyUserText(applyUserText(opened, 'בלי נכס', CTX), 'היום', CTX)
    expect(dated.lastPrompt.kind).toBe('question')
    if (dated.lastPrompt.kind !== 'question') return
    expect(dated.lastPrompt.field).toBe('payer')
    expect(dated.lastPrompt.prompt).toContain('מי שילם בפועל')
    expect(dated.slots.payer.value).not.toBe('Company')
    expect(dated.slots.payer.value).not.toBe('Yossi')

    const paid = applyUserText(dated, 'Jacob', CTX)
    expect(paid.slots.payer.value).toBe('Jacob')
    expect(paid.lastPrompt.kind).toBe('question')
    if (paid.lastPrompt.kind !== 'question') return
    expect(paid.lastPrompt.field).toBe('payee')
    expect(paid.lastPrompt.prompt).toContain('למי שולם')

    const received = applyUserText(paid, 'Company', CTX)
    expect(received.slots.payer.value).toBe('Jacob')
    expect(received.slots.payee.value).toBe('Company')
    expect(received.slots.amountEur.value).toBe('500')
    expect(received.createdDraftId).toBeNull()
  })

  function expenseReadyForCharge() {
    return replayUtterances(
      ['שילמתי 500 אירו על חשמל', 'בלי נכס', 'היום', 'Jacob', 'Company'],
      CTX,
      'charge-ready',
    )
  }

  it('treats בעלים and לקוח as charge intent and asks for an explicit amount', () => {
    for (const word of ['בעלים', 'לקוח']) {
      const asked = expenseReadyForCharge()
      expect(asked.lastPrompt.kind).toBe('question')
      if (asked.lastPrompt.kind !== 'question') return
      expect(asked.lastPrompt.field).toBe('clientCharge')
      expect(asked.lastPrompt.prompt).toContain('לא לחייב')
      expect(asked.lastPrompt.prompt).toContain('לחייב')
      const intent = applyUserText(asked, word, CTX)
      expect(intent.slots.clientCharge.status).toBe('unknown')
      expect(intent.slots.clientCharge.value).not.toBe('500')
      expect(intent.slots.amountEur.value).toBe('500')
      expect(intent.lastPrompt.kind).toBe('question')
      if (intent.lastPrompt.kind !== 'question') return
      expect(intent.lastPrompt.prompt).toContain('כמה לחייב באירו')
      expect(intent.lastPrompt.prompt).not.toBe(asked.lastPrompt.prompt)
      const repeated = applyUserText(intent, word, CTX)
      expect(repeated.slots.clientCharge.status).toBe('unknown')
      expect(repeated.slots.clientCharge.value).not.toBe('500')
      expect(repeated.lastPrompt.kind).toBe('question')
      if (repeated.lastPrompt.kind !== 'question') return
      expect(repeated.lastPrompt.prompt).not.toBe(intent.lastPrompt.prompt)
      expect(repeated.lastPrompt.prompt).not.toBe(asked.lastPrompt.prompt)
    }
  })

  it('stores NULL for לא לחייב and only an explicit positive client charge', () => {
    const none = applyUserText(expenseReadyForCharge(), 'לא לחייב', CTX)
    expect(none.slots.clientCharge.status).toBe('confirmed')
    expect(none.slots.clientCharge.value).toBeNull()
    expect(none.slots.clientCharge.value).not.toBe('0')
    expect(none.slots.amountEur.value).toBe('500')

    const asked = applyUserText(expenseReadyForCharge(), 'בעלים', CTX)
    const invalid = applyUserText(asked, '0', CTX)
    expect(invalid.slots.clientCharge.status).toBe('unknown')
    expect(invalid.slots.amountEur.value).toBe('500')
    expect(invalid.lastPrompt.kind).toBe('question')
    if (invalid.lastPrompt.kind === 'question' && asked.lastPrompt.kind === 'question') {
      expect(invalid.lastPrompt.prompt).not.toBe(asked.lastPrompt.prompt)
    }
    const charged = applyUserText(invalid, '80', CTX)
    expect(charged.slots.clientCharge.value).toBe('80')
    expect(charged.slots.amountEur.value).toBe('500')
    const overridden = applyUserText(charged, 'לא לחייב', CTX)
    expect(overridden.slots.clientCharge.value).toBeNull()
    expect(overridden.createdDraftId).toBeNull()
  })

  it('restores each expense step from the saved utterances, and a later answer wins', () => {
    const payer = replayUtterances(
      ['שילמתי 500 אירו על חשמל', 'בלי נכס', 'היום'],
      CTX,
      'replay-payer',
    )
    expect(payer.lastPrompt.kind === 'question' ? payer.lastPrompt.field : '').toBe('payer')
    expect(payer.slots.payer.status).toBe('unknown')

    const payee = replayUtterances(
      ['שילמתי 500 אירו על חשמל', 'בלי נכס', 'היום', 'Jacob'],
      CTX,
      'replay-payee',
    )
    expect(payee.slots.payer.value).toBe('Jacob')
    expect(payee.lastPrompt.kind === 'question' ? payee.lastPrompt.field : '').toBe('payee')

    const charge = replayUtterances(
      ['שילמתי 500 אירו על חשמל', 'בלי נכס', 'היום', 'Jacob', 'Company', 'לקוח', '40'],
      CTX,
      'replay-charge',
    )
    expect(charge.slots.payee.value).toBe('Company')
    expect(charge.slots.payer.value).toBe('Jacob')
    expect(charge.slots.clientCharge.value).toBe('40')
    expect(charge.slots.amountEur.value).toBe('500')

    const replaced = replayUtterances(
      ['שילמתי 500 אירו על חשמל', 'בלי נכס', 'היום', 'Jacob', 'Company', 'לקוח', '40', 'לא לחייב'],
      CTX,
      'replay-charge-override',
    )
    expect(replaced.slots.clientCharge.value).toBeNull()
    expect(replaced.createdDraftId).toBeNull()

    const cancelled = applyUserText(expenseReadyForCharge(), 'ביטול', CTX)
    expect(cancelled.createdDraftId).toBeNull()
    expect(cancelled.slots.amountEur.status).toBe('unknown')
    const restarted = resetForNewProposal(expenseReadyForCharge(), 'new-expense-key')
    expect(restarted.preface).toContain(NEW_TRANSACTION_NOTICE)
    expect(restarted.preface).toContain(UNSAVED_PREVIOUS_NOTICE)
    expect(restarted.slots.amountEur.status).toBe('unknown')
    expect(restarted.createdDraftId).toBeNull()
  })

  it('maps תמיר קיטי to the single catalog name Tamir Kiti and replays that match', () => {
    const hebrew = resolveProperty('תמיר קיטי', CATALOG)
    const english = resolveProperty('Tamir Kiti', CATALOG)
    expect(hebrew.kind).toBe('unique')
    expect(english.kind).toBe('unique')
    if (hebrew.kind !== 'unique' || english.kind !== 'unique') return
    expect(hebrew.entry.name).toBe('Tamir Kiti')
    expect(english.entry.name).toBe('Tamir Kiti')

    const partial = resolveProperty('תמיר', CATALOG)
    expect(partial.kind).toBe('ambiguous')
    if (partial.kind !== 'ambiguous') return
    expect(partial.entries.map((entry) => entry.name)).toEqual(['Tamir Dekelia', 'Tamir Kiti', 'Tamir Radisson'])

    const duplicate = resolveProperty('תמיר קיטי', [
      { id: '2', name: 'Tamir Kiti' },
      { id: '9', name: 'Tamir Kiti Annex' },
    ])
    expect(duplicate.kind).toBe('ambiguous')

    const missing = resolveProperty('בית שלא קיים', CATALOG)
    expect(missing.kind).toBe('none')

    const opened = applyUserText(start(), 'שילמתי 20 אירו', CTX)
    const picked = applyUserText(opened, 'תמיר קיטי', CTX)
    expect(picked.slots.propertyName.value).toBe('Tamir Kiti')
    expect(picked.createdDraftId).toBeNull()

    const replayed = replayUtterances(['שילמתי 20 אירו', 'תמיר קיטי'], CTX, 'replay-kiti')
    expect(replayed.slots.propertyName.value).toBe('Tamir Kiti')
    const withoutKiti = CATALOG.filter((entry) => entry.name !== 'Tamir Kiti')
    const rejected = replayUtterances(
      ['שילמתי 20 אירו', 'תמיר קיטי'],
      { ...CTX, catalog: withoutKiti },
      'replay-kiti-missing',
    )
    expect(rejected.slots.propertyName.value).not.toBe('Tamir Kiti')
    expect(rejected.lastPrompt.kind === 'question' ? rejected.lastPrompt.field : '').toBe('propertyName')
    expect(rejected.createdDraftId).toBeNull()
  })

  it('accepts a typed category and does not repeat the question for an unclear answer', () => {
    let state = applyUserText(start(), 'שילמתי 40 אירו', CTX)
    state = applyUserText(state, 'בלי נכס', CTX)
    state = applyUserText(state, 'היום', CTX)
    expect(state.lastPrompt.kind).toBe('question')
    if (state.lastPrompt.kind !== 'question') return
    expect(state.lastPrompt.field).toBe('category')
    const asked = state.lastPrompt.prompt
    const named = applyUserText(state, 'Management', CTX)
    expect(named.slots.category.value).toBe('Management')
    expect(named.lastPrompt.kind === 'question' ? named.lastPrompt.field : '').toBe('subcategory')
    const unclear = applyUserText(state, 'בלה', CTX)
    expect(unclear.slots.category.status).toBe('unknown')
    expect(unclear.lastPrompt.kind).toBe('question')
    if (unclear.lastPrompt.kind !== 'question') return
    expect(unclear.lastPrompt.prompt).not.toBe(asked)
    expect(unclear.lastPrompt.prompt).toContain('לא זיהיתי')
    const replayed = replayUtterances(
      ['שילמתי 40 אירו', 'בלי נכס', 'היום', 'Management'],
      CTX,
      'replay-category',
    )
    expect(replayed.slots.category.value).toBe('Management')
    expect(replayed.createdDraftId).toBeNull()
  })

  it('maps ניהול at the category question to canonical Management', () => {
    let state = applyUserText(start(), 'שילמתי 40 אירו', CTX)
    state = applyUserText(state, 'בלי נכס', CTX)
    state = applyUserText(state, 'היום', CTX)
    expect(state.lastPrompt.kind).toBe('question')
    if (state.lastPrompt.kind !== 'question') return
    expect(state.lastPrompt.field).toBe('category')
    const asked = state.lastPrompt.prompt

    const named = applyUserText(state, 'ניהול', CTX)
    expect(named.slots.category.value).toBe('Management')
    expect(named.slots.category.status).toBe('confirmed')
    expect(reviewFromSlots(named.slots).category).toBe('Management')
    expect(named.lastPrompt.kind === 'question' ? named.lastPrompt.field : '').toBe('subcategory')
    expect(named.createdDraftId).toBeNull()

    const unclear = applyUserText(state, 'בלה', CTX)
    expect(unclear.slots.category.status).toBe('unknown')
    expect(unclear.lastPrompt.kind).toBe('question')
    if (unclear.lastPrompt.kind !== 'question') return
    expect(unclear.lastPrompt.prompt).not.toBe(asked)
    expect(unclear.lastPrompt.prompt).toContain('לא זיהיתי')

    const otherHebrew = applyUserText(state, 'שיפוץ', CTX)
    expect(otherHebrew.slots.category.status).toBe('unknown')
    const feeLabel = applyUserText(state, 'דמי ניהול', CTX)
    expect(feeLabel.slots.category.status).toBe('unknown')
    expect(feeLabel.slots.subcategory.status).toBe('unknown')

    const replayed = replayUtterances(
      ['שילמתי 40 אירו', 'בלי נכס', 'היום', 'ניהול'],
      CTX,
      'replay-nihul',
    )
    expect(replayed.slots.category.value).toBe('Management')
    expect(reviewFromSlots(replayed.slots).category).toBe('Management')
    expect(replayed.lastPrompt.kind === 'question' ? replayed.lastPrompt.field : '').toBe('subcategory')
    expect(replayed.createdDraftId).toBeNull()
  })

  it('leaves collection on cancel, stop, or a topic change without creating a draft', () => {
    for (const text of ['ביטול', 'תפסיק', 'שנה נושא']) {
      const opened = applyUserText(start(), 'שילמתי 40 אירו חשמל', CTX)
      expect(opened.slots.amountEur.value).toBe('40')
      const left = applyUserText(opened, text, CTX)
      expect(left.slots.amountEur.status).toBe('unknown')
      expect(left.createdDraftId).toBeNull()
      expect(left.lastPrompt.kind).toBe('talk')
      expect(left.preface).toContain('בוטל. לא נוצרה טיוטה.')
    }
  })
})

