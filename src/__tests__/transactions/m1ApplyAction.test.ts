/**
 * Legacy m1ApplyAction shapes superseded by m1HardeningApply.test.ts.
 * Keep a thin source/API contract check so the file path remains intentional.
 */
import fs from 'fs'
import path from 'path'

describe('M1 apply action contract (hardened)', () => {
  it('applyControlledCorrectionAction no longer accepts client original snapshots', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../lib/transactions/correctionWorkspaceActions.ts'),
      'utf8',
    )
    expect(src).toContain('ApplyControlledCorrectionInput')
    expect(src).toContain('previewToken')
    expect(src).toContain('transactionId')
    expect(src).not.toMatch(/readonly original:\s*RegisterTxForCorrection/)
    expect(src).toContain('fetchCanonicalTransaction')
  })
})
