/**
 * Validation Truth — billing-only zero_amount exclusion + UI action matrix.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  computeValidationQuality,
  isBillingOnlyZero,
  isZeroAmountIssue,
  validationActionAllowsCorrect,
  validationActionKind,
} from '@/lib/transactions/validationTruth'

const repoRoot = join(__dirname, '../../..')

describe('Validation Truth — zero_amount predicate', () => {
  it('does not flag amount_eur=0 with client_charge>0 (billing-only)', () => {
    expect(isBillingOnlyZero(0, 100)).toBe(true)
    expect(isZeroAmountIssue(0, 100)).toBe(false)
    expect(isZeroAmountIssue(0, 32418)).toBe(false)
  })

  it('flags amount_eur=0 with client_charge null/0 as review issue', () => {
    expect(isBillingOnlyZero(0, null)).toBe(false)
    expect(isBillingOnlyZero(0, 0)).toBe(false)
    expect(isZeroAmountIssue(0, null)).toBe(true)
    expect(isZeroAmountIssue(0, 0)).toBe(true)
  })

  it('flags negative amount_eur even when client_charge>0', () => {
    expect(isZeroAmountIssue(-50, 200)).toBe(true)
    expect(isBillingOnlyZero(-50, 200)).toBe(false)
  })

  it('migration SQL encodes the corrected predicate and preserves all issue types', () => {
    const mig = readFileSync(
      join(repoRoot, 'supabase/migrations/20260904_002_validation_truth_zero_amount_billing_only.sql'),
      'utf8',
    )
    expect(mig).toContain('security_invoker')
    expect(mig).toContain("'missing_property'")
    expect(mig).toContain("'missing_payer'")
    expect(mig).toContain("'missing_payee'")
    expect(mig).toContain("'missing_subcategory'")
    expect(mig).toContain("'large_amount'")
    expect(mig).toContain("'zero_amount'")
    expect(mig).toContain("'duplicate'")
    expect(mig).toContain("transactions.amount_eur < (0)::numeric")
    expect(mig).toContain('COALESCE(transactions.client_charge')
    // Active zero_amount filter must not be the old unqualified <= 0 alone
    const zeroBranch = mig.split("'zero_amount'")[1] ?? ''
    expect(zeroBranch).toContain('client_charge')
    expect(zeroBranch).not.toMatch(/WHERE \(transactions\.amount_eur <= \(0\)::numeric\)\s*UNION/)
  })

  it('rollback restores amount_eur <= 0 predicate', () => {
    const rb = readFileSync(
      join(repoRoot, 'docs/rollbacks/20260904_002_validation_truth_zero_amount_billing_only_rollback.sql'),
      'utf8',
    )
    expect(rb).toContain('WHERE (transactions.amount_eur <= (0)::numeric)')
  })
})

describe('Validation Truth — quality score uses distinct IDs', () => {
  it('does not subtract raw issue-row count from total', () => {
    const q = computeValidationQuality(100, ['a', 'a', 'b'])
    expect(q.issueRowCount).toBe(3)
    expect(q.distinctDirtyCount).toBe(2)
    expect(q.cleanCount).toBe(98)
    expect(q.scorePercent).toBe(98)
  })
})

describe('Validation Truth — action matrix', () => {
  it('missing_property does not expose Apply/correct link', () => {
    const kind = validationActionKind('missing_property')
    expect(kind).toBe('unsupported_property')
    expect(validationActionAllowsCorrect(kind)).toBe(false)
  })

  it('missing_payer/payee do not expose Apply/correct link', () => {
    expect(validationActionAllowsCorrect(validationActionKind('missing_payer'))).toBe(false)
    expect(validationActionAllowsCorrect(validationActionKind('missing_payee'))).toBe(false)
  })

  it('duplicate is review-only and cannot Apply', () => {
    const kind = validationActionKind('duplicate')
    expect(kind).toBe('review_only')
    expect(validationActionAllowsCorrect(kind)).toBe(false)
  })

  it('supported M1-resolvable issues still open Review / Correct', () => {
    expect(validationActionKind('zero_amount')).toBe('correct')
    expect(validationActionKind('missing_subcategory')).toBe('correct')
    expect(validationActionAllowsCorrect(validationActionKind('zero_amount'))).toBe(true)
  })
})

describe('Validation page source contracts', () => {
  const page = readFileSync(join(repoRoot, 'src/app/(app)/validation/page.tsx'), 'utf8')

  it('keeps issue-type filter cards and severity filters', () => {
    expect(page).toContain('validation-filter-card-')
    expect(page).toContain("['all','high','medium','low']")
  })

  it('shows client charge and capability-matched actions', () => {
    expect(page).toContain('Client Charge')
    expect(page).toContain('validation-unsupported-property')
    expect(page).toContain('validation-unsupported-party')
    expect(page).toContain('validation-review-only')
    expect(page).toContain('validation-correct-link-')
    expect(page).toContain('computeValidationQuality')
  })

  it('does not import Partner Reports paths', () => {
    expect(page).not.toMatch(/partner-settlement|PartnerReport/)
  })
})
