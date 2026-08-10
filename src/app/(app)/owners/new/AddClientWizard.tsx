'use client'

/**
 * AddClientWizard — 3-step client wizard for creating a new owner/client (PR #4)
 *
 * Step 1: Identity (name, type, contact info)
 * Step 2: JJ Relationship (type, effective date, notes)
 * Step 3: Property Association (select properties)
 *
 * Duplicate detection runs after Step 1. STRONG matches require override reason.
 * Submission calls createOwnerAction (server action) — atomic RPC.
 *
 * UI: raw <input>/<select> + Tailwind (same pattern as OwnersRoomClient.tsx).
 * No DS amendment needed — DS v1.0 does not have form primitives.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { detectDuplicates } from '@/lib/identity/duplicateDetectionService'
import { createOwnerAction } from '@/lib/owners/createOwnerAction'
import type { CreateOwnerInput } from '@/lib/owners/createOwnerAction'

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

interface ExistingEntity {
  entityId: string
  displayName: string
  canonicalSlug: string
}

interface AvailableProperty {
  propertyId: string
  displayName: string
}

interface Props {
  existingEntities: ExistingEntity[]
  availableProperties: AvailableProperty[]
}

// ─────────────────────────────────────────────────────────────
// Steps
// ─────────────────────────────────────────────────────────────

const STEP_LABELS = ['Identity', 'Relationship', 'Properties'] as const
type Step = 0 | 1 | 2

const RELATIONSHIP_TYPES = [
  { value: 'managed_client', label: 'Managed Client' },
  { value: 'investor', label: 'Investor' },
  { value: 'deal_partner', label: 'Deal Partner' },
  { value: 'internal_partner', label: 'Internal Partner' },
  { value: 'private_client', label: 'Private Client' },
]

const LANGUAGES = [
  { value: '', label: '— Select —' },
  { value: 'he', label: 'Hebrew' },
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Russian' },
]

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function AddClientWizard({ existingEntities, availableProperties }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Step state
  const [step, setStep] = useState<Step>(0)

  // Step 1 — Identity
  const [name, setName] = useState('')
  const [entityType] = useState('external')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [language, setLanguage] = useState('')
  const [country, setCountry] = useState('')
  const [legalName, setLegalName] = useState('')
  const [notes, setNotes] = useState('')

  // Duplicate detection
  const [dupWarnings, setDupWarnings] = useState<{ tier: string; matchedName: string; reason: string }[]>([])
  const [overrideReason, setOverrideReason] = useState('')
  const [needsOverride, setNeedsOverride] = useState(false)

  // Step 2 — Relationship
  const [relType, setRelType] = useState('managed_client')
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [relNotes, setRelNotes] = useState('')

  // Step 3 — Properties
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<Set<string>>(new Set())

  // Submission
  const [submitError, setSubmitError] = useState<string | null>(null)

  // ── Step 1 → Step 2: run duplicate detection ──
  function handleStep1Next() {
    if (!name.trim()) return

    // Build minimal entities for client-side duplicate check
    const entities = existingEntities.map(e => ({
      entityId: e.entityId,
      displayName: e.displayName,
      canonicalSlug: e.canonicalSlug,
      entityKind: 'person' as const,
      aliases: Object.freeze([] as string[]),
      status: 'active' as const,
      source: 'lifecycle.entity_identity' as const,
      contactEmail: null,
      contactPhone: null,
      preferredLanguage: null,
      country: null,
      entityLegalName: null,
      internalNotes: null,
    }))

    const result = detectDuplicates(name.trim(), entities)

    if (result.blocked) {
      setDupWarnings([{ tier: 'hard', matchedName: '', reason: 'Identical entity exists — creation blocked' }])
      setNeedsOverride(false)
      return
    }

    setDupWarnings(result.matches.map(m => ({
      tier: m.tier,
      matchedName: m.existingEntity.displayName,
      reason: m.reason,
    })))

    const hasStrong = result.matches.some(m => m.tier === 'strong')
    setNeedsOverride(hasStrong)

    if (hasStrong && !overrideReason.trim()) {
      // Don't proceed — show override prompt
      return
    }

    setStep(1)
  }

  // ── Submit ──
  function handleSubmit() {
    setSubmitError(null)

    const input: CreateOwnerInput = {
      canonicalName: name.trim(),
      entityType,
      contactEmail: email.trim() || null,
      contactPhone: phone.trim() || null,
      preferredLanguage: (language || null) as 'he' | 'en' | 'ru' | null,
      country: country.trim() || null,
      entityLegalName: legalName.trim() || null,
      internalNotes: notes.trim() || null,
      relationshipType: relType,
      effectiveFrom: effectiveFrom || null,
      relationshipNotes: relNotes.trim() || null,
      propertyIds: Array.from(selectedPropertyIds),
      duplicateOverrideReason: overrideReason.trim() || null,
    }

    startTransition(async () => {
      const result = await createOwnerAction(input)
      if (result.ok) {
        router.push(`/owners/${result.slug}`)
      } else {
        setSubmitError(result.message)
      }
    })
  }

  // ── Toggle property selection ──
  function toggleProperty(id: string) {
    setSelectedPropertyIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                i === step
                  ? 'bg-blue-600 text-white'
                  : i < step
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              {i + 1}
            </div>
            <span className={`text-sm ${i === step ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
              {label}
            </span>
            {i < STEP_LABELS.length - 1 && (
              <div className="w-8 h-px bg-gray-200" />
            )}
          </div>
        ))}
      </div>

      {/* ── Step 1: Identity ── */}
      {step === 0 && (
        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-gray-900">Client Identity</h2>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setDupWarnings([]); setNeedsOverride(false) }}
              placeholder="e.g. Tamir Cohen"
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input id="phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-1">Language</label>
              <select id="language" value={language} onChange={e => setLanguage(e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-1">Country</label>
              <input id="country" type="text" value={country} onChange={e => setCountry(e.target.value)}
                placeholder="e.g. Israel, Cyprus"
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>

          <div>
            <label htmlFor="legalName" className="block text-sm font-medium text-gray-700 mb-1">Legal Name</label>
            <input id="legalName" type="text" value={legalName} onChange={e => setLegalName(e.target.value)}
              placeholder="If different from display name"
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">Internal Notes</label>
            <textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
            />
          </div>

          {/* Duplicate warnings */}
          {dupWarnings.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-800 mb-2">Potential duplicates found:</p>
              <ul className="space-y-1">
                {dupWarnings.map((w, i) => (
                  <li key={i} className="text-sm text-amber-700">
                    <span className={`font-semibold ${w.tier === 'STRONG' ? 'text-red-600' : 'text-amber-600'}`}>
                      {w.tier}
                    </span>
                    {' — '}
                    {w.matchedName ? `"${w.matchedName}": ` : ''}
                    {w.reason}
                  </li>
                ))}
              </ul>

              {needsOverride && (
                <div className="mt-3">
                  <label htmlFor="override" className="block text-sm font-medium text-amber-800 mb-1">
                    Override reason (required to proceed):
                  </label>
                  <input
                    id="override"
                    type="text"
                    value={overrideReason}
                    onChange={e => setOverrideReason(e.target.value)}
                    placeholder="Explain why this is not a duplicate"
                    className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleStep1Next}
              disabled={!name.trim()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Relationship ── */}
      {step === 1 && (
        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-gray-900">JJ Relationship</h2>

          <div>
            <label htmlFor="relType" className="block text-sm font-medium text-gray-700 mb-1">
              Relationship Type <span className="text-red-500">*</span>
            </label>
            <select
              id="relType"
              value={relType}
              onChange={e => setRelType(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {RELATIONSHIP_TYPES.map(rt => (
                <option key={rt.value} value={rt.value}>{rt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="effectiveFrom" className="block text-sm font-medium text-gray-700 mb-1">
              Effective From
            </label>
            <input
              id="effectiveFrom"
              type="date"
              value={effectiveFrom}
              onChange={e => setEffectiveFrom(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <p className="text-xs text-gray-400 mt-1">Leave empty if unknown (P-ARCH-1: Unknown = NULL)</p>
          </div>

          <div>
            <label htmlFor="relNotes" className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              id="relNotes"
              value={relNotes}
              onChange={e => setRelNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
            />
          </div>

          <div className="flex justify-between">
            <button type="button" onClick={() => setStep(0)}
              className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button type="button" onClick={() => setStep(2)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Properties ── */}
      {step === 2 && (
        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-gray-900">Associate Properties</h2>
          <p className="text-sm text-gray-500">Select one or more properties this client is associated with. You can skip this step.</p>

          {availableProperties.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-md p-3">
              {availableProperties.map(prop => (
                <label
                  key={prop.propertyId}
                  className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 rounded px-2 py-1.5 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedPropertyIds.has(prop.propertyId)}
                    onChange={() => toggleProperty(prop.propertyId)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                  />
                  <span className="text-sm text-gray-900">{prop.displayName}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No active properties available.</p>
          )}

          {selectedPropertyIds.size > 0 && (
            <p className="text-xs text-gray-500">
              {selectedPropertyIds.size} {selectedPropertyIds.size === 1 ? 'property' : 'properties'} selected
            </p>
          )}

          {/* Submit error */}
          {submitError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}

          {/* Summary */}
          <div className="rounded-md border border-gray-200 bg-gray-50 p-4 space-y-1">
            <p className="text-sm font-medium text-gray-700">Summary</p>
            <p className="text-sm text-gray-600">Name: <span className="font-medium">{name}</span></p>
            <p className="text-sm text-gray-600">Relationship: <span className="font-medium">{RELATIONSHIP_TYPES.find(r => r.value === relType)?.label}</span></p>
            {effectiveFrom && <p className="text-sm text-gray-600">From: <span className="font-medium">{effectiveFrom}</span></p>}
            {selectedPropertyIds.size > 0 && (
              <p className="text-sm text-gray-600">
                Properties: <span className="font-medium">{selectedPropertyIds.size}</span>
              </p>
            )}
          </div>

          <div className="flex justify-between">
            <button type="button" onClick={() => setStep(1)}
              className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-wait transition-colors"
            >
              {isPending ? 'Creating...' : 'Create Client'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
