'use client'

import { useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  ingestOwnerStatementUpload,
  previewOwnerStatementUpload,
  type Vm1OwnerStatementPreviewActionResult,
} from '@/app/(app)/finance/external-partner/avi/operations/ownerStatementUploadActions'

const CONFIRMATION = 'staff_confirmed_hostaway_download'
const PREVIEW_COLUMNS = [
  'reservation_id',
  'check_in',
  'check_out',
  'reservation_status',
  'gross_rental_revenue',
  'platform_fee',
  'guest_cleaning',
  'total_taxes',
  'management_charge',
  'net_owner_payout',
  'currency',
  'source_row_reference',
  'reconciliation_status',
] as const

type PreviewOk = Extract<Vm1OwnerStatementPreviewActionResult, { ok: true }>['preview']

export function Vm1OwnerStatementUploadPanel() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewOk | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [pending, setPending] = useState<'preview' | 'ingest' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function resetLocal(clearFile: boolean) {
    setPreview(null)
    setConfirmed(false)
    setMessage(null)
    setError(null)
    setPending(null)
    if (clearFile) {
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function onPreview(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    if (file == null) {
      setError('An .xlsx Owner Statement file is required.')
      return
    }
    const formData = new FormData()
    formData.set('file', file)
    setPending('preview')
    const result = await previewOwnerStatementUpload(formData)
    setPending(null)
    if (!result.ok) {
      setPreview(null)
      setError(result.reason)
      return
    }
    setPreview(result.preview)
  }

  async function onIngest(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    if (file == null || preview == null || !confirmed) {
      setError('Staff confirmation is required before ingest.')
      return
    }
    const formData = new FormData()
    formData.set('file', file)
    formData.set('confirmation', CONFIRMATION)
    setPending('ingest')
    const result = await ingestOwnerStatementUpload(formData)
    setPending(null)
    if (!result.ok) {
      setError(result.reason)
      return
    }
    resetLocal(true)
    setMessage(
      result.kind === 'idempotent'
        ? 'This Owner Statement was already stored. The reader will refresh.'
        : 'Owner Statement evidence was stored. The reader will refresh.',
    )
    router.refresh()
  }

  return (
    <section className="mb-8 min-w-0 rounded-xl border border-gray-200 bg-white p-5" data-testid="vm1-os-upload-section">
      <h2 className="mb-2 text-lg font-semibold text-gray-900" data-testid="vm1-os-upload-title">
        Hostaway Owner Statement upload / העלאת דוח בעלים
      </h2>
      <p
        className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900"
        data-testid="vm1-os-upload-staff-note"
      >
        Evidence ingest only for TM20 listing 412148, Initial partnership period. Not admission,
        settlement, Certified, or a partner split.
      </p>

      <form className="space-y-3" onSubmit={onPreview} data-testid="vm1-os-upload-preview-form">
        <label className="block text-sm font-medium text-gray-800">
          Owner Statement (.xlsx)
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="mt-1 block w-full text-sm text-gray-700"
            data-testid="vm1-os-upload-file"
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null
              setFile(next)
              setPreview(null)
              setConfirmed(false)
              setMessage(null)
              setError(null)
            }}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending != null}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            data-testid="vm1-os-upload-preview"
          >
            Preview
          </button>
          <button
            type="button"
            disabled={pending != null}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 disabled:opacity-50"
            data-testid="vm1-os-upload-cancel"
            onClick={() => resetLocal(true)}
          >
            Cancel
          </button>
        </div>
      </form>

      {preview != null ? (
        <div className="mt-6" data-testid="vm1-os-upload-preview-result">
          <dl className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-500">Listing</dt>
              <dd className="mt-1 text-sm text-gray-900" dir="ltr" data-testid="vm1-os-upload-listing">
                {preview.listingId}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-500">Period</dt>
              <dd className="mt-1 text-sm text-gray-900" dir="ltr" data-testid="vm1-os-upload-period">
                {preview.statementFrom} → {preview.statementTo}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-500">Rows</dt>
              <dd className="mt-1 text-sm text-gray-900" dir="ltr" data-testid="vm1-os-upload-row-count">
                {preview.lineCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-500">Net owner payout total</dt>
              <dd className="mt-1 text-sm text-gray-900" dir="ltr" data-testid="vm1-os-upload-net-total">
                €{preview.netOwnerPayoutTotalEur}
              </dd>
            </div>
          </dl>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs text-gray-800" data-testid="vm1-os-upload-preview-table">
              <thead>
                <tr>
                  {PREVIEW_COLUMNS.map((column) => (
                    <th key={column} className="border-b border-gray-200 px-2 py-2 font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.lines.map((line) => (
                  <tr key={`${line.reservation_id}-${line.source_row_reference}`}>
                    {PREVIEW_COLUMNS.map((column) => (
                      <td key={column} className="border-b border-gray-100 px-2 py-2" dir="ltr">
                        {line[column]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form className="mt-4 space-y-3" onSubmit={onIngest} data-testid="vm1-os-upload-ingest-form">
            <label className="flex items-start gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmed}
                data-testid="vm1-os-upload-confirm"
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              I confirm this file is the Hostaway Owner Statement download for TM20 listing 412148.
            </label>
            <button
              type="submit"
              disabled={pending != null || !confirmed}
              className="rounded-md bg-emerald-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              data-testid="vm1-os-upload-ingest"
            >
              Ingest evidence
            </button>
          </form>
        </div>
      ) : null}

      {error != null ? (
        <p className="mt-4 text-sm text-red-800" data-testid="vm1-os-upload-error">
          {error}
        </p>
      ) : null}
      {message != null ? (
        <p className="mt-4 text-sm text-emerald-800" data-testid="vm1-os-upload-message">
          {message}
        </p>
      ) : null}
    </section>
  )
}
