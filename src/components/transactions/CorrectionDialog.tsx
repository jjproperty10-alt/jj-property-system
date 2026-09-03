'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  previewControlledCorrectionAction,
  applyControlledCorrectionAction,
  resolveCorrectionSeriesForTransactionAction,
  type BoundSeriesOption,
} from '@/lib/transactions/correctionWorkspaceActions'
import {
  M1_EDITABLE_FIELDS,
  M1_READONLY_FIELDS,
  M1_READONLY_REASONS,
} from '@/lib/transactions/correctionFieldSupport'
import type { RegisterTxForCorrection } from '@/lib/transactions/buildM1CorrectionPreview'
import type { M1PreviewToken } from '@/lib/transactions/previewFingerprint'
import { CorrectionPreviewTable } from '@/components/transactions/CorrectionPreviewTable'
import { CATEGORIES, CATEGORY_SUBCATEGORIES, type Category } from '@/types'

export interface CorrectionDialogProps {
  readonly open: boolean
  readonly transaction: RegisterTxForCorrection
  readonly onClose: () => void
  readonly onApplied: () => void
  readonly previewAction?: typeof previewControlledCorrectionAction
  readonly applyAction?: typeof applyControlledCorrectionAction
  readonly resolveSeries?: typeof resolveCorrectionSeriesForTransactionAction
}

type Step = 'edit' | 'preview' | 'done'

export function CorrectionDialog({
  open,
  transaction,
  onClose,
  onApplied,
  previewAction = previewControlledCorrectionAction,
  applyAction = applyControlledCorrectionAction,
  resolveSeries = resolveCorrectionSeriesForTransactionAction,
}: CorrectionDialogProps) {
  const [step, setStep] = useState<Step>('edit')
  const [date, setDate] = useState(transaction.date)
  const [category, setCategory] = useState(transaction.category)
  const [subcategory, setSubcategory] = useState(transaction.subcategory ?? '')
  const [amountEur, setAmountEur] = useState(String(transaction.amount_eur))
  const [clientCharge, setClientCharge] = useState(
    transaction.client_charge == null ? '' : String(transaction.client_charge),
  )
  const [description, setDescription] = useState(transaction.description ?? '')
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState('')
  const [boundSeries, setBoundSeries] = useState<BoundSeriesOption | null>(null)
  const [seriesBlockReason, setSeriesBlockReason] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmChecked, setConfirmChecked] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [preview, setPreview] = useState<any>(null)
  const [previewToken, setPreviewToken] = useState<M1PreviewToken | null>(null)
  const [resumeCaseId, setResumeCaseId] = useState<string | null>(null)
  const [applyResultIds, setApplyResultIds] = useState<string[]>([])
  const applyLockRef = useRef(false)

  useEffect(() => {
    if (!open) return
    setStep('edit')
    setDate(transaction.date)
    setCategory(transaction.category)
    setSubcategory(transaction.subcategory ?? '')
    setAmountEur(String(transaction.amount_eur))
    setClientCharge(transaction.client_charge == null ? '' : String(transaction.client_charge))
    setDescription(transaction.description ?? '')
    setReason('')
    setEvidence('')
    setError(null)
    setConfirmChecked(false)
    setPreview(null)
    setPreviewToken(null)
    setResumeCaseId(null)
    setApplyResultIds([])
    applyLockRef.current = false
    setBusy(true)
    void resolveSeries(transaction.id).then((res) => {
      setBusy(false)
      if (!res.ok) {
        setSeriesBlockReason(res.error)
        setBoundSeries(null)
        return
      }
      setBoundSeries(res.series)
      setSeriesBlockReason(res.bound.status === 'unbound' ? res.bound.reason : null)
    })
  }, [open, transaction, resolveSeries])

  const proposedPayload = useMemo(() => {
    const amount = Number(amountEur)
    const chargeRaw = clientCharge.trim()
    const charge = chargeRaw === '' ? null : Number(chargeRaw)
    return {
      date,
      category,
      subcategory: subcategory.trim() === '' ? null : subcategory,
      amount_eur: amount,
      client_charge: chargeRaw === '' ? null : charge,
      description: description.trim() === '' ? null : description,
    }
  }, [date, category, subcategory, amountEur, clientCharge, description])

  const subOptions =
    (CATEGORIES as readonly string[]).includes(category)
      ? CATEGORY_SUBCATEGORIES[category as Category] ?? []
      : []

  if (!open) return null

  async function handlePreview() {
    setError(null)
    if (!reason.trim()) {
      setError('Correction reason is required before preview.')
      return
    }
    setBusy(true)
    const res = await previewAction(transaction.id, proposedPayload)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      setPreview(null)
      setPreviewToken(null)
      return
    }
    setPreview(res.preview)
    setPreviewToken(res.token)
    setBoundSeries(res.boundSeries)
    setSeriesBlockReason(res.seriesBlockReason)
    setStep('preview')
    setConfirmChecked(false)
    setResumeCaseId(null)
  }

  async function handleApply() {
    setError(null)
    if (applyLockRef.current) return
    if (!confirmChecked) {
      setError('Explicit confirmation is required.')
      return
    }
    if (!previewToken) {
      setError('Apply without Preview rejected — regenerate Preview first.')
      return
    }
    if (!boundSeries?.seriesId) {
      setError(seriesBlockReason ?? 'No bound statement series — Apply is blocked.')
      return
    }
    applyLockRef.current = true
    setBusy(true)
    try {
      const res = await applyAction({
        transactionId: transaction.id,
        proposed: proposedPayload,
        reason,
        evidenceReference: evidence,
        confirmed: true,
        previewToken,
        seriesId: boundSeries.seriesId,
        resumeCaseId,
      })
      if (!res.ok) {
        setError(res.error)
        if (res.caseId) setResumeCaseId(res.caseId)
        return
      }
      setApplyResultIds(res.appliedTransactionIds)
      setStep('done')
      onApplied()
    } finally {
      setBusy(false)
      applyLockRef.current = false
    }
  }

  function handleCancel() {
    setPreview(null)
    setPreviewToken(null)
    setStep('edit')
    onClose()
  }

  function handleBackToEdit() {
    // Changing inputs after Preview requires regenerating Preview.
    setPreview(null)
    setPreviewToken(null)
    setConfirmChecked(false)
    setStep('edit')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      data-testid="correction-dialog"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Review / Correct</h2>
            <p className="text-xs text-gray-500">בדיקה / תיקון · append-only · session-authenticated</p>
          </div>
          <button type="button" onClick={handleCancel} className="text-sm text-gray-500 hover:text-gray-800">
            Close
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="text-xs text-gray-600 bg-gray-50 rounded p-3" data-testid="affected-tx-id">
            Affected transaction ID: <span className="font-mono text-gray-900">{transaction.id}</span>
          </div>

          {step === 'edit' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <label className="text-xs">
                  <span className="text-gray-500">Date</span>
                  <input type="date" className="input mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label className="text-xs">
                  <span className="text-gray-500">Category</span>
                  <select className="input mt-1" value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  <span className="text-gray-500">Subcategory</span>
                  <select
                    className="input mt-1"
                    value={subcategory}
                    onChange={(e) => setSubcategory(e.target.value)}
                  >
                    <option value="">—</option>
                    {subOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  <span className="text-gray-500">Amount EUR</span>
                  <input className="input mt-1" value={amountEur} onChange={(e) => setAmountEur(e.target.value)} />
                </label>
                <label className="text-xs">
                  <span className="text-gray-500">Client charge (blank = null; 0 is zero)</span>
                  <input
                    className="input mt-1"
                    value={clientCharge}
                    onChange={(e) => setClientCharge(e.target.value)}
                    placeholder="blank = null"
                  />
                </label>
                <label className="text-xs col-span-2">
                  <span className="text-gray-500">Description</span>
                  <input className="input mt-1" value={description} onChange={(e) => setDescription(e.target.value)} />
                </label>
              </div>

              <div className="border border-amber-100 bg-amber-50 rounded p-3 space-y-2" data-testid="readonly-fields">
                <div className="text-xs font-semibold text-amber-900">Read-only in M1 (not applied)</div>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-700">
                  <div>Property: {transaction.property_name || '—'}</div>
                  <div>Property ID: {transaction.property_id || '—'}</div>
                  <div>Payer: {transaction.payer || '—'}</div>
                  <div>Payee: {transaction.payee || '—'}</div>
                  <div className="col-span-2">Notes: {transaction.notes || '—'}</div>
                </div>
                <ul className="text-[10px] text-amber-800 list-disc pl-4">
                  {M1_READONLY_FIELDS.map((f) => (
                    <li key={f}>
                      <code>{f}</code>: {M1_READONLY_REASONS[f]}
                    </li>
                  ))}
                  <li>
                    <code>exclusions</code>: Out of scope for M1 — display-only; no mutation.
                  </li>
                </ul>
                <p className="text-[10px] text-gray-500">
                  Editable via controlled path: {M1_EDITABLE_FIELDS.join(', ')}. Property / payer / payee
                  cannot yet be corrected because correcting insert rows inherit them from the original
                  and they are not in CorrectionNewValues.
                </p>
              </div>

              <label className="text-xs block">
                <span className="text-gray-500">Correction reason (required)</span>
                <textarea
                  className="input mt-1 min-h-[60px]"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  data-testid="correction-reason"
                />
              </label>
              <label className="text-xs block">
                <span className="text-gray-500">Evidence / reference</span>
                <input
                  className="input mt-1"
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                  data-testid="evidence-reference"
                />
              </label>

              <div className="text-xs bg-gray-50 rounded p-3" data-testid="series-binding">
                <div className="font-medium text-gray-800">Bound statement series (server-derived)</div>
                {boundSeries ? (
                  <p className="mt-1 text-gray-700" data-testid="bound-series-label">
                    {boundSeries.label}
                  </p>
                ) : (
                  <p className="mt-1 text-amber-800" data-testid="series-gap">
                    {seriesBlockReason ??
                      'No unambiguous bound series. Preview is allowed; Apply is blocked.'}
                  </p>
                )}
              </div>
            </>
          )}

          {step === 'preview' && preview && previewToken && (
            <div className="space-y-3">
              <div className="text-sm font-medium text-gray-800">Preview — confirm before apply</div>
              <CorrectionPreviewTable
                changedFields={preview.changedFields}
                originalSnapshot={preview.originalSnapshot}
                proposedSnapshot={preview.proposedSnapshot}
                netLedgerEffectEur={preview.netLedgerEffectEur}
                reason={reason}
                evidenceReference={evidence}
                transactionId={transaction.id}
              />
              <div className="text-[10px] font-mono text-gray-400" data-testid="preview-token">
                fingerprint={previewToken.originalFingerprint.slice(0, 12)}…
                · idem={previewToken.idempotencyKey.slice(0, 12)}…
              </div>
              {resumeCaseId && (
                <div className="text-xs text-amber-800" data-testid="resume-case">
                  Will resume case {resumeCaseId} (no new case on retry).
                </div>
              )}
              <label className="flex items-start gap-2 text-xs text-gray-800">
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                  data-testid="confirm-apply"
                />
                <span>
                  I confirm this append-only correction. Source transaction stays preserved. Apply uses
                  session identity (ceo/finance_admin) and statements.apply_correction_case only.
                </span>
              </label>
            </div>
          )}

          {step === 'done' && (
            <div className="text-sm text-green-700" data-testid="apply-success">
              Correction applied. Inserted transaction id(s): {applyResultIds.join(', ') || '—'}
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded p-3" data-testid="correction-error">
              {error}
              {resumeCaseId && step !== 'done' && (
                <div className="mt-2 text-xs text-gray-700">
                  Case ID retained: <span className="font-mono">{resumeCaseId}</span> — retry Apply to resume
                  the same case.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          {step === 'edit' && (
            <>
              <button type="button" className="btn-secondary text-sm" onClick={handleCancel} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary text-sm"
                onClick={() => void handlePreview()}
                disabled={busy}
                data-testid="preview-btn"
              >
                Preview
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={handleBackToEdit}
                disabled={busy}
                data-testid="back-edit-btn"
              >
                Back
              </button>
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={handleCancel}
                disabled={busy}
                data-testid="cancel-preview-btn"
              >
                Cancel (no mutation)
              </button>
              <button
                type="button"
                className="btn-primary text-sm"
                onClick={() => void handleApply()}
                disabled={busy || !confirmChecked || !boundSeries || !previewToken}
                data-testid="apply-btn"
              >
                {resumeCaseId ? 'Resume apply' : 'Apply controlled correction'}
              </button>
            </>
          )}
          {step === 'done' && (
            <button type="button" className="btn-primary text-sm" onClick={onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
