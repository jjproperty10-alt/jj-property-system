import {
  CASH_SUMMARY_TITLE,
  FUNDING_QUESTION,
  PERSONAL_SUMMARY_TITLE,
  matchEntitiesByCanonicalName,
  parseClientCashSettlementUtterance,
} from '@/lib/ops/assistant/clientCashSettlementIntent'

describe('assistant client cash settlement intake', () => {
  test('parses Tamir owed-him utterance without executing', () => {
    const parsed = parseClientCashSettlementUtterance('נתתי לתמיר 3260 על מה שהייתי חייב לו')
    expect(parsed).toMatchObject({
      direction: 'JJ_TO_CLIENT',
      amount: 3260,
      nameQuery: 'תמיר',
      needsDate: true,
      fundingSource: 'UNKNOWN',
    })
  })

  test('does not infer funding from שילמתי or אני', () => {
    expect(parseClientCashSettlementUtterance('שילמתי לתמיר 3260')).toMatchObject({
      direction: 'JJ_TO_CLIENT',
      amount: 3260,
      nameQuery: 'תמיר',
      fundingSource: 'UNKNOWN',
    })
    expect(parseClientCashSettlementUtterance('יוסי שילם לתמיר 3260')).toMatchObject({
      direction: 'JJ_TO_CLIENT',
      amount: 3260,
      fundingSource: 'UNKNOWN',
      partnerNameQuery: 'יוסי',
    })
    expect(parseClientCashSettlementUtterance('שילמתי לתמיר מהכסף הפרטי שלי 3260')).toMatchObject({
      fundingSource: 'PARTNER_PERSONAL',
      amount: 3260,
    })
    expect(parseClientCashSettlementUtterance('נתתי לתמיר 3260 על מה שהיינו חייבים לו')).toMatchObject({
      direction: 'JJ_TO_CLIENT',
      fundingSource: 'UNKNOWN',
    })
  })

  test('lists up to three entity_identity matches and does not guess', () => {
    const matches = matchEntitiesByCanonicalName('תמיר', [
      { id: '1', canonicalName: 'תמיר א' },
      { id: '2', canonicalName: 'תמיר ב' },
      { id: '3', canonicalName: 'תמיר ג' },
      { id: '4', canonicalName: 'תמיר ד' },
    ])
    expect(matches).toHaveLength(3)
    expect(matchEntitiesByCanonicalName('תמיר', [{ id: '9', canonicalName: 'Client Gamma' }])).toEqual([])
  })

  test('summary titles are not booked', () => {
    expect(CASH_SUMMARY_TITLE).toContain('עדיין לא נרשם')
    expect(PERSONAL_SUMMARY_TITLE).toContain('עדיין לא נרשם')
    expect(FUNDING_QUESTION).toContain('מאיזה כסף')
  })

  test('explicit date removes the date prompt', () => {
    const parsed = parseClientCashSettlementUtterance(
      'נתתי לתמיר 3260 על מה שהייתי חייב לו בתאריך 2026-04-01',
    )
    expect(parsed?.needsDate).toBe(false)
    expect(parsed?.amount).toBe(3260)
  })

  test('parses paid-him and they-paid-us variants without guessing property', () => {
    expect(parseClientCashSettlementUtterance('שילמתי לתמיר 3260 על החשבון')).toMatchObject({
      direction: 'JJ_TO_CLIENT',
      amount: 3260,
      nameQuery: 'תמיר',
    })
    expect(parseClientCashSettlementUtterance('תמיר שילם לנו 3260 על החוב שלו')).toMatchObject({
      direction: 'CLIENT_TO_JJ',
      amount: 3260,
      nameQuery: 'תמיר',
    })
  })
})
