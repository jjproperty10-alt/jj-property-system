'use client'

// ============================================================
// JJ PROPERTY 10 — Entity Detail Page
// File: src/app/admin/entity-mapping/[id]/page.tsx
// Route: /admin/entity-mapping/[id]
//
// Loads entity data and renders all 6 panels stacked vertically.
// Panels manage their own edit/save state independently.
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Building2, AlertTriangle } from 'lucide-react'
import { getEntity, getAliases, getOwnership, EntityRegistry, EntityAlias, PartnershipOwnership, ENTITY_TYPE_LABELS, ENTITY_TYPE_COLORS, STATUS_LABELS, STATUS_COLORS } from '@/lib/entity-registry'

import IdentityPanel       from './components/IdentityPanel'
import AliasPanel          from './components/AliasPanel'
import OwnershipPanel      from './components/OwnershipPanel'
import PartnershipAllocationPanel from './components/PartnershipAllocationPanel'
import ContactsPanel       from './components/ContactsPanel'
import FinancialBreakdownPanel from './components/FinancialBreakdownPanel'
import TransactionPreviewPanel from './components/TransactionPreviewPanel'

export default function EntityDetailPage() {
  const params = useParams()
  const id = params?.id as string

  const [entity,    setEntity]    = useState<EntityRegistry | null>(null)
  const [aliases,   setAliases]   = useState<EntityAlias[]>([])
  const [ownership, setOwnership] = useState<PartnershipOwnership[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!id) return
    setLoading(true); setError(null)
    try {
      const [e, a, o] = await Promise.all([
        getEntity(id),
        getAliases(id),
        getOwnership(id),
      ])
      if (!e) { setError('Entity not found.'); return }
      setEntity(e)
      setAliases(a)
      setOwnership(o)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { reload() }, [reload])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading entity…</p>
      </div>
    )
  }

  if (error || !entity) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <AlertTriangle className="h-10 w-10 text-red-400" />
        <p className="text-red-600">{error ?? 'Entity not found.'}</p>
        <Link href="/admin/entity-mapping" className="text-blue-600 hover:underline text-sm">
          ← Back to registry
        </Link>
      </div>
    )
  }

  const showOwnership = entity.entity_type === 'partnership_property'
  const showContacts  = ['client_property', 'partnership_property', 'jj_property'].includes(entity.entity_type)
  const showFinancial = !['person', 'transfer_account'].includes(entity.entity_type)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <Building2 className="h-4 w-4" />
            <Link href="/admin/entity-mapping" className="hover:text-blue-600 flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> Entity Mapping
            </Link>
            <span>/</span>
            <span className="text-gray-600 truncate max-w-xs">{entity.canonical_name}</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                {entity.display_name ?? entity.canonical_name}
              </h1>
              {entity.display_name && (
                <p className="text-xs text-gray-400 font-mono mt-0.5">{entity.canonical_name}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ENTITY_TYPE_COLORS[entity.entity_type]}`}>
                {ENTITY_TYPE_LABELS[entity.entity_type]}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[entity.confirmation_status]}`}>
                {STATUS_LABELS[entity.confirmation_status]}
              </span>
              {!entity.is_active && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
                  Archived
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Panels */}
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Panel 1: Identity */}
        <IdentityPanel entity={entity} onSaved={reload} />

        {/* Panel 2: Aliases */}
        <AliasPanel entityId={id} aliases={aliases} onChanged={reload} />

        {/* Panel 3: Ownership (partnership_property only) */}
        {showOwnership && (
          <OwnershipPanel entityId={id} canonicalName={entity.canonical_name} ownershipRows={ownership} onChanged={reload} />
        )}

        {/* Panel 3b: Partnership Allocation Preview (partnership_property only — read-only) */}
        {showOwnership && (
          <PartnershipAllocationPanel canonicalName={entity.canonical_name} />
        )}

        {/* Panel 4: Contacts */}
        {showContacts && (
          <ContactsPanel canonicalName={entity.canonical_name} />
        )}

        {/* Panel 5: Financial Breakdown */}
        {showFinancial && entity.confirmation_status !== 'needs_review' && (
          <FinancialBreakdownPanel
            entityId={id}
            entityType={entity.entity_type}
            canonicalName={entity.canonical_name}
          />
        )}
        {showFinancial && entity.confirmation_status === 'needs_review' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-800">Financial breakdown not shown</p>
              <p className="text-sm text-yellow-700 mt-0.5">
                This entity has <strong>needs_review</strong> status. Classify it first, then financial data will appear.
              </p>
            </div>
          </div>
        )}

        {/* Panel 6: Transaction Preview */}
        <TransactionPreviewPanel entityId={id} canonicalName={entity.canonical_name} />
      </div>
    </div>
  )
}
