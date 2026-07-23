/**
 * @component EvidenceChainDrawer
 * @description Expandable side drawer: Evidence → Claim trace for a single claim.
 *
 * Displays: claim statement, status, each EvidenceLink with source/strength/
 * confidence, and resolution steps if the claim is unsupported.
 *
 * Rules:
 *   - Client component (uses state for open/close, passed in as prop here).
 *   - All data comes from a single ClaimEvaluation — no additional fetches.
 *   - Does not modify or re-evaluate claims.
 *
 * FR-001: This component is owned by PR #1.
 */

'use client'

import type { ClaimEvaluation, EvidenceLink } from '@/lib/finance'

const STRENGTH_LABEL: Record<string, string> = {
  primary:     'Primary',
  secondary:   'Secondary',
  supporting:  'Supporting',
  attestation: 'Attestation',
}

const SOURCE_LABEL: Record<string, string> = {
  bank:     'Bank statement',
  invoice:  'Invoice',
  contract: 'Contract',
  whatsapp: 'WhatsApp',
  manual:   'Manual entry',
}

function EvidenceLinkRow({ link }: { link: EvidenceLink }) {
  const strength = STRENGTH_LABEL[link.strength] ?? link.strength
  const source = SOURCE_LABEL[link.sourceType] ?? link.sourceType

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-gray-800">{source}</span>
        <span className="text-xs font-mono text-gray-500 shrink-0">
          {link.confidence ?? '?'}%
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-xs text-gray-400">{strength}</span>
        {link.validityStatus !== 'active' && (
          <span className="text-xs text-amber-600 font-medium">
            {link.validityStatus === 'expired' ? 'Expired' : 'Needs renewal'}
          </span>
        )}
      </div>
      {link.description && (
        <p className="mt-1.5 text-xs text-gray-600 leading-snug">{link.description}</p>
      )}
      {link.sourceRef && (
        <p className="mt-0.5 text-xs font-mono text-gray-400 truncate">{link.sourceRef}</p>
      )}
    </div>
  )
}

interface EvidenceChainDrawerProps {
  claim: ClaimEvaluation
  onClose: () => void
}

export function EvidenceChainDrawer({ claim, onClose }: EvidenceChainDrawerProps) {
  const isBlocking = claim.required && claim.status === 'unsupported'

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className={`flex items-start justify-between px-5 py-4 border-b ${isBlocking ? 'bg-red-50 border-red-100' : 'border-gray-100'}`}
        >
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Evidence chain
            </p>
            <p className="text-sm font-semibold text-gray-900 leading-snug">
              {claim.statement}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {/* Status summary */}
          <div className="flex items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                claim.status === 'supported'
                  ? 'bg-green-50 text-green-700'
                  : claim.status === 'unsupported'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              {claim.status === 'supported' ? '✓ Supported' : claim.status === 'unsupported' ? '✗ Unsupported' : '⋯ Pending'}
            </span>
            <span className="text-sm text-gray-500">
              Confidence: <span className="font-medium text-gray-700">{claim.confidence}%</span>
            </span>
            {claim.required && (
              <span className="text-sm text-gray-500 ml-auto">Required</span>
            )}
          </div>

          {/* Evidence links */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Evidence ({claim.evidenceLinks.length})
            </h3>
            {claim.evidenceLinks.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No evidence attached.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {claim.evidenceLinks.map((link) => (
                  <EvidenceLinkRow key={link.id} link={link} />
                ))}
              </div>
            )}
          </section>

          {/* Gap + resolution steps */}
          {claim.gap && (
            <section className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <h3 className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1.5">
                Evidence gap
              </h3>
              <p className="text-sm text-red-800 leading-snug mb-3">{claim.gap.description}</p>

              <h4 className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1.5">
                Resolution steps
              </h4>
              <ol className="flex flex-col gap-1.5">
                {claim.gap.resolutionSteps.map((step, i) => (
                  <li key={step.action} className="flex gap-2 text-sm text-red-800">
                    <span className="shrink-0 font-medium">{i + 1}.</span>
                    <div>
                      <span>{step.description}</span>
                      <span className="ml-2 text-xs text-red-500">
                        (~{step.estimatedEffortMinutes} min)
                      </span>
                    </div>
                  </li>
                ))}
              </ol>

              <p className="mt-3 text-xs text-red-500">
                Confidence after resolution:{' '}
                <span className="font-semibold">{claim.gap.confidenceAfter}%</span>
              </p>
            </section>
          )}
        </div>
      </div>
    </>
  )
}
