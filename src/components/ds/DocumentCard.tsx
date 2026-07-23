/**
 * DocumentCard — DS primitive for the Evidence Library (Documents tab).
 *
 * This is NOT a generic file card.
 * It is a business evidence card — every document must show:
 * - Document type
 * - Related owner/property
 * - Related business event
 * - Date
 * - Source
 * - Verification status
 * - Open/Preview action
 *
 * Rules:
 * - Verification status communicated by shape + text (not color alone)
 * - Accessible labels
 * - motion-reduce safe
 */

import type { OwnerDocumentDTO, DocumentType } from '@/lib/owners/ownerWorkspaceTypes'

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  contract: 'Contract',
  statement: 'Statement',
  invoice: 'Invoice',
  receipt: 'Receipt',
  ownership: 'Ownership',
  approval: 'Approval',
  property: 'Property',
  maintenance: 'Maintenance',
}

const DOC_TYPE_ICONS: Record<DocumentType, string> = {
  contract: '📋',
  statement: '📊',
  invoice: '🧾',
  receipt: '🧾',
  ownership: '🏠',
  approval: '✅',
  property: '🔑',
  maintenance: '🔧',
}

const VERIFICATION_CONFIG = {
  verified: { label: 'Verified', icon: '✓', className: 'text-green-700 bg-green-50 border-green-200' },
  pending: { label: 'Pending', icon: '○', className: 'text-amber-700 bg-amber-50 border-amber-200' },
  missing: { label: 'Missing', icon: '!', className: 'text-red-700 bg-red-50 border-red-200' },
  expired: { label: 'Expired', icon: '↺', className: 'text-gray-500 bg-gray-50 border-gray-200' },
}

export interface DocumentCardProps {
  document: OwnerDocumentDTO
}

/**
 * Evidence Library document card.
 *
 * Usage:
 *   <DocumentCard document={doc} />
 */
export function DocumentCard({ document: doc }: DocumentCardProps) {
  const verif = VERIFICATION_CONFIG[doc.verificationStatus]
  const icon = DOC_TYPE_ICONS[doc.type]
  const typeLabel = DOC_TYPE_LABELS[doc.type]

  return (
    <article
      className="bg-white border border-gray-200 rounded-lg p-4 flex items-start gap-4 hover:border-gray-300 hover:shadow-sm transition-all duration-150 motion-reduce:transition-none"
      aria-label={`${typeLabel}: ${doc.title}`}
    >
      {/* Type icon */}
      <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-xl flex-shrink-0" aria-hidden>
        {icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{doc.title}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {doc.relatedEntity}
              {doc.relatedEvent && <span className="ml-1 text-gray-400">· {doc.relatedEvent}</span>}
            </p>
          </div>

          {/* Verification badge */}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium flex-shrink-0 ${verif.className}`}
            aria-label={`Verification status: ${verif.label}`}
          >
            <span aria-hidden>{verif.icon}</span>
            {verif.label}
          </span>
        </div>

        {/* Meta row */}
        <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
          <span className="bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 font-medium">{typeLabel}</span>
          {doc.date && (
            <time dateTime={doc.date} dir="ltr">{formatDate(doc.date)}</time>
          )}
          <span>{doc.source}</span>
        </div>
      </div>

      {/* Action */}
      {doc.openHref && (
        <a
          href={doc.openHref}
          className="flex-shrink-0 text-sm text-blue-600 hover:text-blue-800 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          aria-label={`Open ${doc.title}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open →
        </a>
      )}
    </article>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}
