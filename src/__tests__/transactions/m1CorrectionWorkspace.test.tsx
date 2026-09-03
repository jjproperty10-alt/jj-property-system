/**
 * M1 — field support, preview builder, status columns, source guards (hardened).
 */
import React from 'react'
import fs from 'fs'
import path from 'path'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  M1_EDITABLE_FIELDS,
  M1_READONLY_FIELDS,
  assertNoUnsupportedApplyFields,
} from '@/lib/transactions/correctionFieldSupport'
import {
  buildM1CorrectionPreview,
  type RegisterTxForCorrection,
} from '@/lib/transactions/buildM1CorrectionPreview'
import { validateM1Proposed } from '@/lib/transactions/validateM1Proposed'
import { RegisterStatusBadges, ReviewCorrectButton } from '@/components/transactions/RegisterStatusBadges'
import { CorrectionPreviewTable } from '@/components/transactions/CorrectionPreviewTable'

const ROOT = path.resolve(__dirname, '../..')

const ORIG: RegisterTxForCorrection = {
  id: '11111111-1111-1111-1111-111111111111',
  date: '2026-01-15',
  property_id: '22222222-2222-2222-2222-222222222222',
  property_name: 'Sea View',
  category: 'Management',
  subcategory: 'Tenant Payment',
  description: 'January rent',
  payer: 'Tenant',
  payee: 'JJ',
  amount_eur: 1000,
  client_charge: 1000,
  notes: 'internal note',
}

describe('M1 correction field support', () => {
  it('lists the end-to-end editable fields', () => {
    expect(M1_EDITABLE_FIELDS).toEqual([
      'date',
      'category',
      'subcategory',
      'amount_eur',
      'client_charge',
      'description',
    ])
  })

  it('rejects unsupported fields from apply payload', () => {
    expect(assertNoUnsupportedApplyFields({ payer: 'X' })).toEqual({
      ok: false,
      unsupported: ['payer'],
    })
  })

  it('documents read-only gaps for property/payer/payee/notes', () => {
    for (const f of ['property_id', 'property_name', 'payer', 'payee', 'notes'] as const) {
      expect(M1_READONLY_FIELDS).toContain(f)
    }
  })
})

describe('M1 strict validation', () => {
  it('rejects non-finite amount_eur', () => {
    const r = validateM1Proposed({ amount_eur: Number.NaN })
    expect(r.ok).toBe(false)
  })

  it('rejects invalid date', () => {
    expect(validateM1Proposed({ date: '01-15-2026' }).ok).toBe(false)
    expect(validateM1Proposed({ date: '2026-02-30' }).ok).toBe(false)
  })

  it('rejects unsupported subcategory for category', () => {
    const r = validateM1Proposed({ category: 'Management', subcategory: 'NotReal' })
    expect(r.ok).toBe(false)
  })

  it('preserves null vs zero client_charge', () => {
    expect(validateM1Proposed({ client_charge: null })).toEqual({
      ok: true,
      value: { client_charge: null },
    })
    expect(validateM1Proposed({ client_charge: 0 })).toEqual({
      ok: true,
      value: { client_charge: 0 },
    })
  })
})

describe('M1 correction preview builder', () => {
  it('shows original vs proposed for amount change', () => {
    const preview = buildM1CorrectionPreview(ORIG, { amount_eur: 800 })
    expect(preview.changedFields).toContain('amount_eur')
    expect(preview.originalSnapshot.amount_eur).toBe(1000)
    expect(preview.proposedSnapshot.amount_eur).toBe(800)
  })

  it('uses reclassify for category-only change', () => {
    const preview = buildM1CorrectionPreview(ORIG, {
      category: 'Renovation',
      subcategory: 'Materials',
    })
    expect(preview.kind).toBe('reclassify')
    expect(preview.plan.netAmountEur).toBe(0)
  })

  it('throws when no fields changed', () => {
    expect(() =>
      buildM1CorrectionPreview(ORIG, { amount_eur: 1000, category: 'Management' }),
    ).toThrow(/No editable fields changed/)
  })
})

describe('M1 register status columns', () => {
  it('renders review_status, is_deleted, exclusion, and correction flags', () => {
    const html = renderToStaticMarkup(
      <table>
        <tbody>
          <tr>
            <RegisterStatusBadges
              reviewStatus="active"
              isDeleted={true}
              hasActiveExclusion={true}
              hasCorrectionCase={true}
              correctionCaseCount={2}
            />
          </tr>
        </tbody>
      </table>,
    )
    expect(html).toContain('data-testid="col-review-status"')
    expect(html).toContain('data-testid="col-is-deleted"')
    expect(html).toContain('data-testid="col-exclusion"')
    expect(html).toContain('data-testid="col-correction-case"')
  })

  it('renders bilingual Review / Correct action', () => {
    const html = renderToStaticMarkup(<ReviewCorrectButton />)
    expect(html).toContain('Review / Correct')
    expect(html).toContain('בדיקה / תיקון')
  })
})

describe('M1 correction preview dialog content', () => {
  it('shows original and proposed values', () => {
    const preview = buildM1CorrectionPreview(ORIG, { amount_eur: 750, description: 'fixed' })
    const html = renderToStaticMarkup(
      <CorrectionPreviewTable
        changedFields={preview.changedFields}
        originalSnapshot={preview.originalSnapshot}
        proposedSnapshot={preview.proposedSnapshot}
        netLedgerEffectEur={preview.netLedgerEffectEur}
        reason="Imported amount wrong"
        evidenceReference="JHKA-12"
        transactionId={ORIG.id}
      />,
    )
    expect(html).toContain(ORIG.id)
    expect(html).toContain('1000')
    expect(html).toContain('750')
  })
})

describe('M1 source guards (hardened)', () => {
  const workspaceAction = fs.readFileSync(
    path.join(ROOT, 'lib/transactions/correctionWorkspaceActions.ts'),
    'utf8',
  )
  const billing = fs.readFileSync(path.join(ROOT, 'lib/owners/billingActions.ts'), 'utf8')
  const registerPage = fs.readFileSync(path.join(ROOT, 'app/(app)/transactions/page.tsx'), 'utf8')
  const validationPage = fs.readFileSync(path.join(ROOT, 'app/(app)/validation/page.tsx'), 'utf8')
  const dialog = fs.readFileSync(path.join(ROOT, 'components/transactions/CorrectionDialog.tsx'), 'utf8')

  it('mutation RPC path uses session client, not service role', () => {
    expect(billing).toContain('createSupabaseServerClient')
    expect(billing).toContain('correctionSessionDb')
    // The three correction mutators must call correctionSessionDb / session client
    const openIdx = billing.indexOf('export async function openCorrectionCaseAction')
    const applyIdx = billing.indexOf('export async function applyCorrectionCaseAction')
    const openBlock = billing.slice(openIdx, billing.indexOf('export async function transitionCorrectionCaseAction'))
    const applyBlock = billing.slice(applyIdx, billing.indexOf('// ─── Report Preferences'))
    expect(openBlock).toContain('correctionSessionDb()')
    expect(openBlock).not.toMatch(/createServiceClient\(\)/)
    expect(applyBlock).toContain('correctionSessionDb()')
    expect(applyBlock).not.toMatch(/createServiceClient\(\)/)
  })

  it('apply path calls only approved controlled correction server actions', () => {
    expect(workspaceAction).toContain('openCorrectionCaseAction')
    expect(workspaceAction).toContain('applyCorrectionCaseAction')
    expect(workspaceAction).toContain('fetchCanonicalTransaction')
    expect(workspaceAction).toContain('resolveBoundCorrectionSeries')
  })

  it('no direct transaction UPDATE exists in M1 workspace action', () => {
    expect(workspaceAction).not.toMatch(/\.from\(['"]transactions['"]\)\s*\.update/)
    expect(workspaceAction).not.toMatch(/\.from\(['"]transactions['"]\)\s*\.delete/)
  })

  it('validation link opens the correct transaction; missing tx shows error', () => {
    expect(validationPage).toContain('/transactions?tx=')
    expect(registerPage).toContain("searchParams.get('tx')")
    expect(registerPage).toContain('loadTransactionForCorrectionAction')
    expect(registerPage).toContain('tx-focus-error')
  })

  it('cancelled preview performs no mutation; apply lock uses ref', () => {
    expect(dialog).toContain('Cancel (no mutation)')
    expect(dialog).toContain('applyLockRef')
    expect(dialog).toContain('previewToken')
  })

  it('successful apply refreshes the register', () => {
    expect(registerPage).toContain('setRefreshToken')
  })

  it('filters and pagination remain on the register page', () => {
    expect(registerPage).toContain('data-testid="register-filters"')
    expect(registerPage).toContain('data-testid="register-pagination"')
    expect(registerPage).toContain('.range(page * PAGE_SIZE')
  })

  it('Partner Report navigation untouched', () => {
    expect(fs.existsSync(path.join(ROOT, 'app/(app)/partner'))).toBe(false)
    expect(fs.existsSync(path.join(ROOT, 'app/partner/[slug]/page.tsx'))).toBe(true)
  })
})
