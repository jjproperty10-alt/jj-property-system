import { isOwnerStatementExtra, isOwnerStatementExtraCategory } from '@/lib/report/str/ownerStrStatement'
import { CLIENT_REPORT_FORBIDDEN_ROW_FIELDS } from '@/lib/report/clientReportDto'

describe('partner funding privacy', () => {
  test('owner STR extras exclude Bank Payment to Owner regardless of payer identity', () => {
    expect(isOwnerStatementExtra('Bank Payment to Owner', 'Partner North')).toBe(false)
    expect(isOwnerStatementExtra('Bank Payment to Owner', 'Yossi')).toBe(false)
    expect(isOwnerStatementExtraCategory('Transfer')).toBe(false)
  })

  test('client report DTO forbids payer so funding partner is not exposed', () => {
    expect(CLIENT_REPORT_FORBIDDEN_ROW_FIELDS).toEqual(expect.arrayContaining(['payer', 'payee']))
  })
})
