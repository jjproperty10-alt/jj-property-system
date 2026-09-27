import {
  classifyTransactionTurn,
  isAmountOnlyUtterance,
  isCollectionExit,
  opensTransactionCollection,
} from '@/lib/ops/assistant/transactionTurn'

describe('transaction turn classifier', () => {
  it('treats a full payment utterance as a new transaction when a proposal already exists', () => {
    expect(classifyTransactionTurn({
      hasExistingProposal: true,
      awaitingField: 'date',
      message: 'שולם שכירות לירון אלון 700 בתאריך 31.8.26',
      hasAmount: true,
      hasDate: true,
      hasPropertyOrSubject: true,
    })).toBe('new_transaction')
    expect(classifyTransactionTurn({
      hasExistingProposal: true,
      awaitingField: 'date',
      message: 'קיבלתי 700 שכירות לירון אלון בתאריך 31.8.26',
      hasAmount: true,
      hasDate: true,
      hasPropertyOrSubject: true,
    })).toBe('new_transaction')
  })

  it('keeps a first utterance as continuation', () => {
    expect(classifyTransactionTurn({
      hasExistingProposal: false,
      awaitingField: 'amountEur',
      message: 'שולם שכירות לירון אלון 700 בתאריך 31.8.26',
      hasAmount: true,
      hasDate: true,
      hasPropertyOrSubject: true,
    })).toBe('continuation')
  })

  it('classifies corrections, cancel, and ambiguous payment verbs', () => {
    expect(classifyTransactionTurn({
      hasExistingProposal: true,
      awaitingField: 'date',
      message: 'לא, התאריך 30.8.26',
      hasAmount: false,
      hasDate: true,
      hasPropertyOrSubject: false,
    })).toBe('correction')
    expect(classifyTransactionTurn({
      hasExistingProposal: true,
      awaitingField: 'payee',
      message: 'תבטל',
      hasAmount: false,
      hasDate: false,
      hasPropertyOrSubject: false,
    })).toBe('cancel')
    expect(classifyTransactionTurn({
      hasExistingProposal: true,
      awaitingField: 'date',
      message: 'קיבלתי משהו',
      hasAmount: false,
      hasDate: false,
      hasPropertyOrSubject: false,
    })).toBe('unknown')
  })

  it('opens collection only for an explicit income or expense, not a greeting or a bare number', () => {
    expect(opensTransactionCollection('היי', false)).toBe(false)
    expect(opensTransactionCollection('מה אתה יכול לעשות?', false)).toBe(false)
    expect(opensTransactionCollection('500', false)).toBe(false)
    expect(isAmountOnlyUtterance('500')).toBe(true)
    expect(isAmountOnlyUtterance('500 אירו')).toBe(true)
    expect(opensTransactionCollection('שילמתי חשמל', true)).toBe(true)
    expect(opensTransactionCollection('קיבלתי 850 שכירות', true)).toBe(true)
    expect(opensTransactionCollection('תמיר 30 אירו', true)).toBe(true)
    expect(opensTransactionCollection('עלה 120 וללקוח 150', false)).toBe(true)
    expect(isCollectionExit('ביטול')).toBe(true)
    expect(isCollectionExit('תפסיק')).toBe(true)
    expect(isCollectionExit('שנה נושא')).toBe(true)
    expect(isCollectionExit('היי')).toBe(false)
  })
})
