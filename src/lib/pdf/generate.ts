/**
 * JJ Property 10 — PDF Document Engine
 * Generation utilities: create, download, print, share.
 *
 * Place at: src/lib/pdf/generate.ts
 */

import React from 'react'
import { pdf } from '@react-pdf/renderer'
import { OwnerSettlementPdf } from './OwnerSettlementPdf'
import type { OwnerPdfData } from './types'

/* ─────────────────────────── generate ─────────────────────────── */

/**
 * Render the Owner Settlement Report to a PDF Blob.
 * Pure client-side — no server required.
 */
export async function generateOwnerSettlementPdf(data: OwnerPdfData): Promise<Blob> {
  // Cast to any: @react-pdf/renderer's pdf() expects ReactElement<DocumentProps>
  // but our wrapper component uses { data: OwnerPdfData } props — functionally correct.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(OwnerSettlementPdf, { data }) as any
  const blob = await pdf(element).toBlob()
  return blob
}

/* ─────────────────────────── output actions ─────────────────────────── */

/**
 * Trigger browser download of a Blob as the given filename.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke after a short delay to let the download start
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/**
 * Open the PDF in a new tab and trigger the browser print dialog.
 */
export function printBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) {
    // Popup blocked — fall back to download
    downloadBlob(blob, 'report.pdf')
    return
  }
  win.addEventListener('load', () => {
    setTimeout(() => {
      win.print()
    }, 150)
  })
  // Revoke after print has had time to start
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Share the PDF using the Web Share API on supported browsers (mobile).
 * Falls back to download on desktop or unsupported browsers.
 */
export async function shareBlob(
  blob: Blob,
  filename: string,
  title: string,
): Promise<void> {
  const file = new File([blob], filename, { type: 'application/pdf' })

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title })
      return
    } catch (err) {
      // User cancelled or API failed — fall through to download
      if ((err as DOMException)?.name === 'AbortError') return
    }
  }

  // Fallback: download
  downloadBlob(blob, filename)
}

/* ─────────────────────────── filename helper ─────────────────────────── */

/**
 * Build a clean, filesystem-safe filename for a PDF report.
 * Example: "Tamir_Owner_Statement_01_Jan_2023_06_Jul_2026.pdf"
 */
export function buildPdfFilename(
  contactName: string,
  fromDate: string,
  toDate: string,
): string {
  const fmt = (iso: string) => {
    try {
      return new Date(iso + 'T00:00:00')
        .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        .replace(/ /g, '_')
    } catch {
      return iso
    }
  }
  const name = (contactName || 'Owner').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')
  return `${name}_Owner_Statement_${fmt(fromDate)}_${fmt(toDate)}.pdf`
}
