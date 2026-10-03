/**
 * Orit engine output against the REVIEW-6 regression expect.
 * The three known deltas are whitelisted and still required of the engine.
 */
import { verifyApprovedReports } from '../verifyApprovedReports'
import { REVIEW6_WHITELISTED_DELTA_FIELDS, review6Regression } from '../review6Regression'

describe('REVIEW-6 regression', () => {
  test('figures, labels, grouping, wording and bridge match, with the three deltas whitelisted', () => {
    const orit = verifyApprovedReports().find((client) => client.summary.clientSlug === 'orit-rob')
    expect(orit?.document).toBeTruthy()
    if (!orit?.document) return
    expect(review6Regression(orit.document)).toEqual([])
    expect(REVIEW6_WHITELISTED_DELTA_FIELDS).toEqual([
      'properties[0].lines[*].clientChargeDefaulted',
      'PDF page 1 and page 2 header',
      'PDF electricity row',
    ])
  })
})
