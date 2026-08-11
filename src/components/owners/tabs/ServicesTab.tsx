'use client'

/**
 * Services Tab — "What services are active on each property?"
 *
 * P2 PR #4: Service Engagement Write/Edit Lifecycle
 *
 * Displays service engagements grouped by property.
 * Add / Edit / Close flows via server actions.
 *
 * Architecture:
 * - Client component — uses state for forms
 * - Calls createServiceEngagementAction / updateServiceEngagementAction server actions
 * - useRouter().refresh() after mutations to refetch server data
 * - DS components: EmptyState, StatusBadge
 * - P-ARCH-1: null dates rendered as em dash, never "Unknown"
 * - P-ARCH-4: no delete — status changes only (close)
 * - No auto-close of existing engagements
 * - Overlap warning: same service type active on same property → warning, not rejection
 */

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { EmptyState, StatusBadge } from '@/components/ds'
import {
  createServiceEngagementAction,
  updateServiceEngagementAction,
} from '@/lib/owners/serviceEngagementActions'
import type {
  OwnerServiceEngagementsDTO,
  PropertyServiceEngagementsDTO,
  ServiceEngagementDTO,
  ServiceType,
  ServiceEngagementStatus,
  EntityPropertyOption,
  CreateServiceEngagementInput,
  UpdateServiceEngagementInput,
} from '@/lib/owners/ownerWorkspaceTypes'
import type { StatusToken } from '@/lib/ds/tokens'

// ─── Display mappings ────────────────────────────────────────────────────────

const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  renovation: 'Renovation',
  sale: 'Sale',
  management_ltr: 'Management (LTR)',
  airbnb_str: 'Airbnb (STR)',
}

const SERVICE_TYPE_OPTIONS: { value: ServiceType; label: string }[] = [
  { value: 'management_ltr', label: 'Management (LTR)' },
  { value: 'airbnb_str', label: 'Airbnb (STR)' },
  { value: 'renovation', label: 'Renovation' },
  { value: 'sale', label: 'Sale' },
]

const STATUS_MAP: Record<ServiceEngagementStatus, { token: StatusToken; label: string }> = {
  active: { token: 'active', label: 'Active' },
  draft: { token: 'pending', label: 'Draft' },
  suspended: { token: 'attention', label: 'Suspended' },
  closed: { token: 'completed', label: 'Closed' },
}

const STATUS_OPTIONS: { value: ServiceEngagementStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'closed', label: 'Closed' },
]

/** Valid transitions from a given status */
const VALID_TRANSITIONS: Record<ServiceEngagementStatus, ServiceEngagementStatus[]> = {
  draft: ['active', 'closed'],
  active: ['suspended', 'closed'],
  suspended: ['active', 'closed'],
  closed: [],
}

/** Active/draft sort before closed/suspended */
const STATUS_SORT_ORDER: Record<ServiceEngagementStatus, number> = {
  active: 0,
  draft: 1,
  suspended: 2,
  closed: 3,
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ServicesTabProps {
  dto: OwnerServiceEngagementsDTO
  entityProperties: EntityPropertyOption[]
}

// ─── Main component ─────────────────────────────────────────────────────────

export function ServicesTab({ dto, entityProperties }: ServicesTabProps) {
  const router = useRouter()
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleCreated = useCallback(() => {
    setShowAddForm(false)
    setError(null)
    router.refresh()
  }, [router])

  const handleUpdated = useCallback(() => {
    setEditingId(null)
    setError(null)
    router.refresh()
  }, [router])

  const handleError = useCallback((msg: string) => {
    setError(msg)
  }, [])

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 ml-3 text-xs font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Add Service button */}
      {!showAddForm && (
        <div className="flex justify-end">
          <button
            onClick={() => { setShowAddForm(true); setError(null) }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <span aria-hidden>+</span> Add Service
          </button>
        </div>
      )}

      {/* Add Service form */}
      {showAddForm && (
        <AddServiceForm
          entityId={dto.entityId}
          entityProperties={entityProperties}
          existingEngagements={dto.properties}
          onCreated={handleCreated}
          onCancel={() => { setShowAddForm(false); setError(null) }}
          onError={handleError}
        />
      )}

      {/* Engagement list */}
      {dto.totalEngagements === 0 && !showAddForm ? (
        <EmptyState
          icon="📋"
          title="No services configured"
          description="Service engagements for each property will appear here once configured."
        />
      ) : (
        <div className="space-y-8">
          {dto.properties.map(property => (
            <PropertyServiceGroup
              key={property.propertyId}
              property={property}
              editingId={editingId}
              onStartEdit={(id) => { setEditingId(id); setError(null) }}
              onCancelEdit={() => setEditingId(null)}
              onUpdated={handleUpdated}
              onError={handleError}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Add Service Form ───────────────────────────────────────────────────────

interface AddServiceFormProps {
  entityId: string
  entityProperties: EntityPropertyOption[]
  existingEngagements: readonly PropertyServiceEngagementsDTO[]
  onCreated: () => void
  onCancel: () => void
  onError: (msg: string) => void
}

function AddServiceForm({
  entityId,
  entityProperties,
  existingEngagements,
  onCreated,
  onCancel,
  onError,
}: AddServiceFormProps) {
  const [propertyId, setPropertyId] = useState('')
  const [serviceType, setServiceType] = useState<ServiceType>('management_ltr')
  const [status, setStatus] = useState<ServiceEngagementStatus>('draft')
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [effectiveTo, setEffectiveTo] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Overlap warning
  const overlapWarning = checkOverlap(propertyId, serviceType, existingEngagements)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!propertyId) {
      onError('Please select a property')
      return
    }
    setIsSubmitting(true)

    const input: CreateServiceEngagementInput = {
      entityId,
      propertyId,
      serviceType,
      status,
      effectiveFrom: effectiveFrom || null,
      effectiveTo: effectiveTo || null,
      notes: notes.trim() || null,
    }

    const result = await createServiceEngagementAction(input)
    setIsSubmitting(false)

    if (!result.ok) {
      onError(result.message)
      return
    }

    onCreated()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-blue-200 bg-blue-50/30 rounded-lg p-4 space-y-4"
    >
      <h3 className="text-sm font-semibold text-gray-900">Add Service Engagement</h3>

      {/* Property */}
      <div>
        <label htmlFor="add-property" className="block text-xs font-medium text-gray-600 mb-1">
          Property
        </label>
        {entityProperties.length > 0 ? (
          <select
            id="add-property"
            value={propertyId}
            onChange={e => setPropertyId(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            required
          >
            <option value="">Select property…</option>
            {entityProperties.map(p => (
              <option key={p.propertyId} value={p.propertyId}>
                {p.propertyName}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-gray-400 italic">
            No properties associated with this entity. Associate properties first.
          </p>
        )}
      </div>

      {/* Service type + Status row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="add-type" className="block text-xs font-medium text-gray-600 mb-1">
            Service Type
          </label>
          <select
            id="add-type"
            value={serviceType}
            onChange={e => setServiceType(e.target.value as ServiceType)}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {SERVICE_TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="add-status" className="block text-xs font-medium text-gray-600 mb-1">
            Initial Status
          </label>
          <select
            id="add-status"
            value={status}
            onChange={e => setStatus(e.target.value as ServiceEngagementStatus)}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="add-from" className="block text-xs font-medium text-gray-600 mb-1">
            Start Date <span className="text-gray-400">(optional)</span>
          </label>
          <input
            id="add-from"
            type="date"
            value={effectiveFrom}
            onChange={e => setEffectiveFrom(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="add-to" className="block text-xs font-medium text-gray-600 mb-1">
            End Date <span className="text-gray-400">(optional)</span>
          </label>
          <input
            id="add-to"
            type="date"
            value={effectiveTo}
            onChange={e => setEffectiveTo(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="add-notes" className="block text-xs font-medium text-gray-600 mb-1">
          Notes <span className="text-gray-400">(optional, max 2000)</span>
        </label>
        <textarea
          id="add-notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          maxLength={2000}
          rows={2}
          className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          placeholder="Optional notes about this engagement"
        />
      </div>

      {/* Overlap warning */}
      {overlapWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-700">
          ⚠ This property already has an active <strong>{overlapWarning}</strong> engagement.
          Adding another is allowed but may need review.
        </div>
      )}

      {/* Buttons */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={isSubmitting || entityProperties.length === 0}
          className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors"
        >
          {isSubmitting ? 'Creating…' : 'Create'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ─── Property group ──────────────────────────────────────────────────────────

interface PropertyServiceGroupProps {
  property: PropertyServiceEngagementsDTO
  editingId: string | null
  onStartEdit: (id: string) => void
  onCancelEdit: () => void
  onUpdated: () => void
  onError: (msg: string) => void
}

function PropertyServiceGroup({
  property,
  editingId,
  onStartEdit,
  onCancelEdit,
  onUpdated,
  onError,
}: PropertyServiceGroupProps) {
  const displayName = property.propertyName ?? property.propertyId.slice(0, 8)

  // Sort: active/draft first, then suspended/closed
  const sorted = [...property.engagements].sort(
    (a, b) => STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status]
  )

  const activeCount = sorted.filter(e => e.status === 'active' || e.status === 'draft').length
  const historicalCount = sorted.length - activeCount

  return (
    <section aria-labelledby={`property-${property.propertyId}`}>
      {/* Property header */}
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3
          id={`property-${property.propertyId}`}
          className="text-sm font-semibold text-gray-900"
        >
          {displayName}
        </h3>
        <span className="text-xs text-gray-400">
          {activeCount > 0 && `${activeCount} active`}
          {activeCount > 0 && historicalCount > 0 && ' · '}
          {historicalCount > 0 && `${historicalCount} closed`}
        </span>
      </div>

      {/* Engagements list */}
      <ul className="space-y-2" role="list">
        {sorted.map(engagement =>
          editingId === engagement.id ? (
            <EditServiceRow
              key={engagement.id}
              engagement={engagement}
              onUpdated={onUpdated}
              onCancel={onCancelEdit}
              onError={onError}
            />
          ) : (
            <ServiceEngagementRow
              key={engagement.id}
              engagement={engagement}
              onEdit={() => onStartEdit(engagement.id)}
              onClose={() => handleClose(engagement.id, onUpdated, onError)}
            />
          )
        )}
      </ul>
    </section>
  )
}

// ─── Single engagement row ───────────────────────────────────────────────────

interface ServiceEngagementRowProps {
  engagement: ServiceEngagementDTO
  onEdit: () => void
  onClose: () => void
}

function ServiceEngagementRow({ engagement, onEdit, onClose }: ServiceEngagementRowProps) {
  const typeLabel = SERVICE_TYPE_LABELS[engagement.serviceType] ?? engagement.serviceType
  const statusInfo = STATUS_MAP[engagement.status] ?? { token: 'unknown' as StatusToken, label: engagement.status }
  const canTransition = VALID_TRANSITIONS[engagement.status]?.length > 0

  return (
    <li className="border border-gray-100 bg-white rounded-lg px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Service type + status */}
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-medium text-gray-900">{typeLabel}</span>
            <StatusBadge status={statusInfo.token} label={statusInfo.label} />
          </div>

          {/* Date range */}
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-xs text-gray-500" dir="ltr">
              {formatDate(engagement.effectiveFrom)}
              {' — '}
              {engagement.effectiveTo ? formatDate(engagement.effectiveTo) : 'Present'}
            </span>
          </div>

          {/* Notes (if present) */}
          {engagement.notes && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{engagement.notes}</p>
          )}
        </div>

        {/* Action buttons */}
        {canTransition && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onEdit}
              className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
              title="Edit engagement"
            >
              Edit
            </button>
            {engagement.status !== 'closed' && (
              <button
                onClick={onClose}
                className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                title="Close engagement"
              >
                Close
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

// ─── Edit row (inline) ──────────────────────────────────────────────────────

interface EditServiceRowProps {
  engagement: ServiceEngagementDTO
  onUpdated: () => void
  onCancel: () => void
  onError: (msg: string) => void
}

function EditServiceRow({ engagement, onUpdated, onCancel, onError }: EditServiceRowProps) {
  const [status, setStatus] = useState<ServiceEngagementStatus>(engagement.status)
  const [effectiveFrom, setEffectiveFrom] = useState(engagement.effectiveFrom ?? '')
  const [effectiveTo, setEffectiveTo] = useState(engagement.effectiveTo ?? '')
  const [notes, setNotes] = useState(engagement.notes ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const transitions = VALID_TRANSITIONS[engagement.status] ?? []
  const typeLabel = SERVICE_TYPE_LABELS[engagement.serviceType] ?? engagement.serviceType

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)

    const input: UpdateServiceEngagementInput = {
      id: engagement.id,
      // Only send status if changed
      status: status !== engagement.status ? status : undefined,
      // Typed-patch: tell server which fields we intend to set
      setEffectiveFrom: true,
      effectiveFrom: effectiveFrom || null,
      setEffectiveTo: true,
      effectiveTo: effectiveTo || null,
      setNotes: true,
      notes: notes.trim() || null,
    }

    const result = await updateServiceEngagementAction(input)
    setIsSubmitting(false)

    if (!result.ok) {
      onError(result.message)
      return
    }

    onUpdated()
  }

  return (
    <li className="border border-blue-200 bg-blue-50/30 rounded-lg px-4 py-3">
      <form onSubmit={handleSave} className="space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-medium text-gray-900">{typeLabel}</span>
          <span className="text-xs text-gray-400">Editing</span>
        </div>

        {/* Status + dates row */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor={`edit-status-${engagement.id}`} className="block text-xs text-gray-500 mb-0.5">
              Status
            </label>
            <select
              id={`edit-status-${engagement.id}`}
              value={status}
              onChange={e => setStatus(e.target.value as ServiceEngagementStatus)}
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value={engagement.status}>
                {STATUS_MAP[engagement.status]?.label ?? engagement.status}
              </option>
              {transitions.map(t => (
                <option key={t} value={t}>{STATUS_MAP[t]?.label ?? t}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`edit-from-${engagement.id}`} className="block text-xs text-gray-500 mb-0.5">
              Start
            </label>
            <input
              id={`edit-from-${engagement.id}`}
              type="date"
              value={effectiveFrom}
              onChange={e => setEffectiveFrom(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor={`edit-to-${engagement.id}`} className="block text-xs text-gray-500 mb-0.5">
              End
            </label>
            <input
              id={`edit-to-${engagement.id}`}
              type="date"
              value={effectiveTo}
              onChange={e => setEffectiveTo(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label htmlFor={`edit-notes-${engagement.id}`} className="block text-xs text-gray-500 mb-0.5">
            Notes
          </label>
          <textarea
            id={`edit-notes-${engagement.id}`}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            maxLength={2000}
            rows={2}
            className="w-full text-sm border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-3 py-1 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 rounded-md transition-colors"
          >
            {isSubmitting ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-3 py-1 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </li>
  )
}

// ─── Close handler (standalone — no edit form needed) ────────────────────────

async function handleClose(
  engagementId: string,
  onUpdated: () => void,
  onError: (msg: string) => void,
) {
  const result = await updateServiceEngagementAction({
    id: engagementId,
    status: 'closed',
  })

  if (!result.ok) {
    onError(result.message)
    return
  }

  onUpdated()
}

// ─── Overlap detection ──────────────────────────────────────────────────────

function checkOverlap(
  propertyId: string,
  serviceType: ServiceType,
  existingProperties: readonly PropertyServiceEngagementsDTO[],
): string | null {
  if (!propertyId) return null

  const property = existingProperties.find(p => p.propertyId === propertyId)
  if (!property) return null

  const activeOfSameType = property.engagements.find(
    e => e.serviceType === serviceType && (e.status === 'active' || e.status === 'draft'),
  )

  if (activeOfSameType) {
    return SERVICE_TYPE_LABELS[serviceType] ?? serviceType
  }

  return null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—'
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
