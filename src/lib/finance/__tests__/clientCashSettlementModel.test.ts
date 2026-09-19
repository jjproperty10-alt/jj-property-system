import { applyPaymentToR, cashPostingFields, signedAllocation } from '../clientCashSettlementModel'

describe('client cash settlement truth table', () => {
  test('JJ_TO_CLIENT posting and R sign', () => {
    expect(cashPostingFields('JJ_TO_CLIENT')).toEqual({
      category: 'Management',
      subcategory: 'Bank Payment to Owner',
      payer: 'JJ',
      payee: 'Owner',
    })
    expect(applyPaymentToR('JJ_TO_CLIENT', 400, 400)).toBe(0)
    expect(signedAllocation('JJ_TO_CLIENT', 400)).toBe(-400)
  })

  test('CLIENT_TO_JJ posting and R sign', () => {
    expect(cashPostingFields('CLIENT_TO_JJ')).toEqual({
      category: 'Management',
      subcategory: 'Client Payment',
      payer: 'Client',
      payee: 'JJ',
    })
    expect(applyPaymentToR('CLIENT_TO_JJ', -250, 250)).toBe(0)
    expect(signedAllocation('CLIENT_TO_JJ', 250)).toBe(250)
  })
})
