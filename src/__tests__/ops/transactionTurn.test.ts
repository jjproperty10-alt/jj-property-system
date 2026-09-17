import { classifyTransactionTurn } from '@/lib/ops/assistant/transactionTurn'

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
})
