import {
  applyPersonalFunding,
  applyReimbursement,
  closingBalance,
  partnerFundedCashPosting,
  reimbursementCashPosting,
  reversePersonalFunding,
  reverseReimbursement,
  roundEur,
  signedCaAmount,
} from '../partnerCurrentAccountModel'

describe('partner current-account truth table', () => {
  test('A personal payment: partner 0→3260, client R 5000→1740, JJ cash 0, P&L 0', () => {
    const after = applyPersonalFunding(
      { partnerBalance: 0, clientR: 5000, jjCashDelta: 0, pnlDelta: 0 },
      3260,
    )
    expect(after).toEqual({
      partnerBalance: 3260,
      clientR: 1740,
      jjCashDelta: 0,
      pnlDelta: 0,
    })
    expect(partnerFundedCashPosting('Partner North')).toEqual({
      category: 'Management',
      subcategory: 'Bank Payment to Owner',
      payer: 'Partner North',
      payee: 'Owner',
    })
    expect(signedCaAmount('personal_funding', 3260)).toBe(3260)
  })

  test('B reimbursement: partner 3260→0, client R stays 1740, JJ cash -3260, P&L 0', () => {
    const funded = applyPersonalFunding(
      { partnerBalance: 0, clientR: 5000, jjCashDelta: 0, pnlDelta: 0 },
      3260,
    )
    const repaid = applyReimbursement(funded, 3260)
    expect(repaid).toEqual({
      partnerBalance: 0,
      clientR: 1740,
      jjCashDelta: -3260,
      pnlDelta: 0,
    })
    expect(reimbursementCashPosting('Partner North')).toEqual({
      category: 'Transfer',
      subcategory: 'Expense Reimbursement',
      payer: 'JJ',
      payee: 'Partner North',
    })
    expect(signedCaAmount('reimbursement', 3260)).toBe(-3260)
  })

  test('C full reversal before reimbursement restores client and partner', () => {
    const funded = applyPersonalFunding(
      { partnerBalance: 0, clientR: 5000, jjCashDelta: 0, pnlDelta: 0 },
      3260,
    )
    const reversed = reversePersonalFunding(funded, 3260)
    expect(reversed).toEqual({
      partnerBalance: 0,
      clientR: 5000,
      jjCashDelta: 0,
      pnlDelta: 0,
    })
  })

  test('D reimbursement reversal restores partner liability and JJ cash, client unchanged', () => {
    const funded = applyPersonalFunding(
      { partnerBalance: 0, clientR: 5000, jjCashDelta: 0, pnlDelta: 0 },
      3260,
    )
    const repaid = applyReimbursement(funded, 3260)
    const undone = reverseReimbursement(repaid, 3260)
    expect(undone).toEqual({
      partnerBalance: 3260,
      clientR: 1740,
      jjCashDelta: 3260,
      pnlDelta: 0,
    })
    expect(roundEur(repaid.jjCashDelta + undone.jjCashDelta)).toBe(0)
  })

  test('over-reimbursement is blocked and invariant holds', () => {
    expect(() =>
      applyReimbursement(
        { partnerBalance: 100, clientR: 0, jjCashDelta: 0, pnlDelta: 0 },
        100.01,
      ),
    ).toThrow('over_reimbursement')
    expect(closingBalance(0, [3260, -3260])).toBe(0)
    expect(closingBalance(0, [3260])).toBe(3260)
  })
})
