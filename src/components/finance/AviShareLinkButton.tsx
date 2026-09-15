'use client'

import { useState } from 'react'
import { createAviShareLink } from '@/lib/partner-settlement/external-partner/createAviShareLinkAction'

function expiryLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

/**
 * Staff-only control. Mints a 72-hour read-only link to the certified Avi DTO.
 * Hidden in print. Does not compute settlement values.
 */
export function AviShareLinkButton() {
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function mint() {
    setBusy(true)
    setCopied(false)
    setError(null)
    const result = await createAviShareLink()
    setBusy(false)
    if (!result.ok) {
      setUrl(null)
      setExpiresAt(null)
      if (result.error === 'SECRET_MISSING') {
        setError('Share links are not configured on this server.')
        return
      }
      if (
        result.error === 'NO_SESSION' ||
        result.error === 'NOT_STAFF' ||
        result.error === 'STAFF_INACTIVE'
      ) {
        setError('Only active JJ staff can create a share link.')
        return
      }
      setError('Could not create a share link.')
      return
    }
    setUrl(`${window.location.origin}${result.path}`)
    setExpiresAt(result.expiresAt)
  }

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="print:hidden max-w-md" data-testid="avi-share-link">
      <button
        type="button"
        data-testid="avi-share-button"
        onClick={() => void mint()}
        disabled={busy}
        className="px-4 py-2 bg-white text-gray-800 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        {busy ? 'Creating link…' : 'Copy share link'}
      </button>
      {error && (
        <p className="mt-2 text-xs text-rose-700" data-testid="avi-share-error">{error}</p>
      )}
      {url && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 space-y-2">
          <p className="text-xs text-gray-500">
            Read-only. Expires {expiresAt ? expiryLabel(expiresAt) : 'in 72 hours'}.
            Anyone with this link can open the certified Avi report. It cannot be revoked
            except by rotating the server secret.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url}
              data-testid="avi-share-url"
              className="flex-1 min-w-0 text-xs font-mono border border-gray-200 rounded px-2 py-1.5 bg-gray-50"
            />
            <button
              type="button"
              onClick={() => void copy()}
              className="shrink-0 px-3 py-1.5 text-xs font-medium rounded bg-neutral-900 text-white hover:bg-neutral-800"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
