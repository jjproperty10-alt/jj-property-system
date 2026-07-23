/**
 * Documents Tab — "Can we prove everything?"
 *
 * This is an Evidence Library, not generic file storage.
 * Every document card shows type, related event, verification status.
 */

import { DocumentCard, EmptyState } from '@/components/ds'
import type { OwnerDocumentDTO, DocumentType } from '@/lib/owners/ownerWorkspaceTypes'

export interface DocumentsTabProps {
  documents: OwnerDocumentDTO[]
}

const TYPE_ORDER: DocumentType[] = [
  'contract', 'statement', 'invoice', 'receipt', 'approval', 'ownership', 'property', 'maintenance',
]

const TYPE_LABELS: Record<DocumentType, string> = {
  contract: 'Contracts',
  statement: 'Statements',
  invoice: 'Invoices',
  receipt: 'Receipts',
  approval: 'Approvals',
  ownership: 'Ownership',
  property: 'Property',
  maintenance: 'Maintenance',
}

export function DocumentsTab({ documents }: DocumentsTabProps) {
  if (documents.length === 0) {
    return (
      <EmptyState
        icon="📋"
        title="No documents yet"
        description="Contracts, statements, invoices and receipts will appear here as they are added."
      />
    )
  }

  // Group by type
  const byType = new Map<DocumentType, OwnerDocumentDTO[]>()
  for (const doc of documents) {
    const existing = byType.get(doc.type) ?? []
    byType.set(doc.type, [...existing, doc])
  }

  // Render missing count badge
  const missingCount = documents.filter(d => d.verificationStatus === 'missing').length
  const expiredCount = documents.filter(d => d.verificationStatus === 'expired').length

  return (
    <div className="space-y-6">

      {/* Summary alerts */}
      {(missingCount > 0 || expiredCount > 0) && (
        <div className="flex gap-3">
          {missingCount > 0 && (
            <div className="flex-1 border border-red-200 bg-red-50 rounded-lg px-4 py-3 text-sm text-red-700 font-medium">
              ⚠ {missingCount} missing document{missingCount !== 1 ? 's' : ''}
            </div>
          )}
          {expiredCount > 0 && (
            <div className="flex-1 border border-gray-200 bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-600 font-medium">
              ↺ {expiredCount} expired document{expiredCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {/* Documents by type */}
      {TYPE_ORDER.filter(t => byType.has(t)).map(type => {
        const docs = byType.get(type)!
        return (
          <section key={type} aria-labelledby={`docs-${type}-heading`}>
            <h2
              id={`docs-${type}-heading`}
              className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3"
            >
              {TYPE_LABELS[type]} ({docs.length})
            </h2>
            <div className="space-y-2">
              {docs.map(doc => (
                <DocumentCard key={doc.id} document={doc} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
