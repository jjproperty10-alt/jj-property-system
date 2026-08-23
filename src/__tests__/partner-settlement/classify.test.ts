import {
  classifyTransactionRole, classifyPartnerFunding, classifyTransferPurpose,
  type ClassifierTxn,
} from '@/lib/partner-settlement/classifyPartnerTransaction'

const base: ClassifierTxn = {
  category: 'Management', subcategory: 'Repairs',
  payerRole: 'PARTNER', payerName: 'Yossi',
  payeeRole: 'EXTERNAL', payeeName: 'company',
}

describe('classifyTransactionRole', () => {
  it('partner pays vendor -> PARTNER_FUNDED_EXPENSE', () => {
    expect(classifyTransactionRole(base)).toBe('PARTNER_FUNDED_EXPENSE')
  })
  it('partner <-> partner -> DIRECT_PARTNER_TRANSFER', () => {
    expect(classifyTransactionRole({ ...base, payeeRole: 'PARTNER', payeeName: 'Jacob', category: 'Transfer' }))
      .toBe('DIRECT_PARTNER_TRANSFER')
  })
  it('JJ -> partner -> JJ_TO_PARTNER', () => {
    expect(classifyTransactionRole({ ...base, payerRole: 'JJ', payerName: 'JJ', payeeRole: 'PARTNER', payeeName: 'Yossi' }))
      .toBe('JJ_TO_PARTNER')
  })
  it('income collected personally by partner', () => {
    expect(classifyTransactionRole({ ...base, payerRole: 'EXTERNAL', payerName: 'Tenant', payeeRole: 'PARTNER', payeeName: 'Yossi', subcategory: 'Tenant Payment' }))
      .toBe('INCOME_COLLECTED_BY_PARTNER')
  })
})

describe('classifyPartnerFunding', () => {
  it('routine operating expense defaults to REIMBURSABLE_LOAN', () => {
    expect(classifyPartnerFunding(base)).toBe('REIMBURSABLE_LOAN')
  })
  it('Transfer/Partner Loan is REIMBURSABLE_LOAN', () => {
    expect(classifyPartnerFunding({ ...base, category: 'Transfer', subcategory: 'Partner Loan' })).toBe('REIMBURSABLE_LOAN')
  })
  it('acquisition/renovation is UNRESOLVED without an approved capital fact', () => {
    expect(classifyPartnerFunding({ ...base, category: 'Purchase', subcategory: 'Purchase Expenses' })).toBe('UNRESOLVED')
    expect(classifyPartnerFunding({ ...base, category: 'Renovation', subcategory: 'Materials' })).toBe('UNRESOLVED')
  })
  it('capital only with an approved capital fact (never inferred)', () => {
    expect(classifyPartnerFunding({ ...base, category: 'Renovation', hasApprovedCapitalFact: true })).toBe('CAPITAL')
  })
})

describe('classifyTransferPurpose', () => {
  it('unknown purpose stays UNKNOWN (-> UNRESOLVED downstream)', () => {
    expect(classifyTransferPurpose({ ...base, payeeRole: 'PARTNER', payeeName: 'Jacob' })).toBe('UNKNOWN')
  })
  it('known purpose is respected', () => {
    expect(classifyTransferPurpose({ ...base, payeeRole: 'PARTNER', payeeName: 'Jacob', settlementPurpose: 'general_equalization' }))
      .toBe('general_equalization')
  })
})
