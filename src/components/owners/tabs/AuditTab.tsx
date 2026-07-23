/**
 * Audit Tab — "Why should I trust this information?"
 *
 * Every number in the system must answer: "Where did you come from?"
 *
 * Shows:
 * - Evidence items (finance.evidence_links — read-only, immutable after creation)
 * - Statement version history
 * - Correction cases (public_reason only — internal_note never shown here)
 * - Decision history
 * - Verification history
 */

import { EmptyState } from '@/components/ds'
import type {
  OwnerAuditDTO,
  EvidencePointerDTO,
  StatementVersionDTO,
  CorrectionCaseDTO,
  DecisionHistoryItemDTO,
  VerificationHistoryItemDTO,
} from '@/lib/owners/ownerWorkspaceTypes'

export interface AuditTabProps {
  dto: OwnerAuditDTO
}

const EVIDENCE_STRENGTH_CONFIG = {
  primary: { label: 'Primary', className: 'text-blue-700 bg-blue-50 border-blue-200' },
  secondary: { label: 'Secondary', className: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  supporting: { label: 'Supporting', className: 'text-gray-600 bg-gray-50 border-gray-200' },
  attestation: { label: 'Attestation', className: 'text-purple-700 bg-purple-50 border-purple-200' },
}

const CORRECTION_STATUS_CONFIG = {
  open: { label: 'Open', className: 'text-amber-700 bg-amber-50 border-amber-200' },
  under_review: { label: 'Under Review', className: 'text-blue-700 bg-blue-50 border-blue-200' },
  waiting_for_information: { label: 'Waiting for Information', className: 'text-gray-600 bg-gray-50 border-gray-200' },
  approved: { label: 'Approved', className: 'text-green-700 bg-green-50 border-green-200' },
  rejected: { label: 'Rejected', className: 'text-red-700 bg-red-50 border-red-200' },
  replacement_draft: { label: 'Replacement Draft', className: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  replacement_sent: { label: 'Replacement Sent', className: 'text-purple-700 bg-purple-50 border-purple-200' },
  closed: { label: 'Closed', className: 'text-gray-500 bg-gray-50 border-gray-200' },
}

export function AuditTab({ dto }: AuditTabProps) {
  const isEmpty =
    dto.evidenceItems.length === 0 &&
    dto.statementVersions.length === 0 &&
    dto.correctionCases.length === 0 &&
    dto.decisionHistory.length === 0

  if (isEmpty) {
    return (
      <EmptyState
        icon="⚖"
        headline="No audit records yet"
        message="Evidence items, statement history, and decision records will appear here."
      />
    )
  }

  return (
    <div className="space-y-6">

      {/* Trust statement */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-4">
        <p className="text-sm text-gray-700">
          Every number in this workspace is derived from a named data source.
          <span className="font-medium"> No amounts are computed in the UI.</span>
          <span className="text-gray-500"> Evidence links are immutable once created (IL-1 enforced by database trigger).</span>
        </p>
      </div>

      {/* Evidence items */}
      {dto.evidenceItems.length > 0 && (
        <section aria-labelledby="audit-evidence-heading">
          <h2 id="audit-evidence-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Evidence ({dto.evidenceItems.length})
          </h2>
          <ul className="space-y-2" role="list">
            {dto.evidenceItems.map(item => (
              <EvidenceRow key={item.id} item={item} />
            ))}
          </ul>
        </section>
      )}

      {/* Statement versions */}
      {dto.statementVersions.length > 0 && (
        <section aria-labelledby="audit-statements-heading">
          <h2 id="audit-statements-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Statement History ({dto.statementVersions.length})
          </h2>
          <ul className="space-y-2" role="list">
            {dto.statementVersions.map(v => (
              <StatementVersionRow key={v.id} version={v} />
            ))}
          </ul>
        </section>
      )}

      {/* Correction cases */}
      {dto.correctionCases.length > 0 && (
        <section aria-labelledby="audit-corrections-heading">
          <h2 id="audit-corrections-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Correction Cases ({dto.correctionCases.length})
          </h2>
          <ul className="space-y-2" role="list">
            {dto.correctionCases.map(c => (
              <CorrectionRow key={c.id} correction={c} />
            ))}
          </ul>
        </section>
      )}

      {/* Decision history */}
      {dto.decisionHistory.length > 0 && (
        <section aria-labelledby="audit-decisions-heading">
          <h2 id="audit-decisions-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Decision History ({dto.decisionHistory.length})
          </h2>
          <ul className="space-y-2" role="list">
            {dto.decisionHistory.map(d => (
              <DecisionRow key={d.id} decision={d} />
            ))}
          </ul>
        </section>
      )}

      {/* Verification history */}
      {dto.verificationHistory.length > 0 && (
        <section aria-labelledby="audit-verification-heading">
          <h2 id="audit-verification-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Verification History ({dto.verificationHistory.length})
          </h2>
          <ul className="divide-y divide-gray-100" role="list">
            {dto.verificationHistory.map(v => (
              <VerificationRow key={v.id} item={v} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function EvidenceRow({ item }: { item: EvidencePointerDTO }) {
  const cfg = EVIDENCE_STRENGTH_CONFIG[item.strength]
  return (
    <li className="flex items-start gap-3 border border-gray-100 rounded-lg px-4 py-3 bg-white">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium text-gray-500 capitalize">{item.type}</span>
          <span className={`text-xs border rounded px-1.5 py-0.5 font-medium ${cfg.className}`}>
            {cfg.label}
          </span>
          {item.validityStatus !== 'active' && (
            <span className="text-xs text-amber-600 font-medium">
              {item.validityStatus === 'expired' ? 'Expired' : 'Needs renewal'}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-900">{item.description}</p>
        <div className="flex flex-wrap gap-3 mt-1">
          <span className="text-xs text-gray-400">{item.source}</span>
          {item.date && (
            <time className="text-xs text-gray-400" dateTime={item.date} dir="ltr">
              {formatDate(item.date)}
            </time>
          )}
          <time className="text-xs text-gray-300" dateTime={item.verifiedAt} dir="ltr">
            Verified: {formatDate(item.verifiedAt.slice(0, 10))}
          </time>
        </div>
      </div>
    </li>
  )
}

function StatementVersionRow({ version }: { version: StatementVersionDTO }) {
  return (
    <li className="flex items-center gap-3 border border-gray-100 rounded-lg px-4 py-3 bg-white text-sm">
      <span className="font-semibold text-gray-700 flex-shrink-0">v{version.version}</span>
      <div className="flex-1 min-w-0">
        <span className="text-gray-900">{version.period}</span>
        {version.channel && <span className="text-gray-400 ml-2 text-xs">{version.channel}</span>}
      </div>
      <span className="text-xs text-gray-400 capitalize">{version.status}</span>
      {version.sentAt && (
        <time className="text-xs text-gray-400 flex-shrink-0" dateTime={version.sentAt} dir="ltr">
          {formatDate(version.sentAt.slice(0, 10))}
        </time>
      )}
      {version.replacedBy && (
        <span className="text-xs text-gray-300">→ replaced</span>
      )}
    </li>
  )
}

function CorrectionRow({ correction }: { correction: CorrectionCaseDTO }) {
  const cfg = CORRECTION_STATUS_CONFIG[correction.status] ?? {
    label: correction.status,
    className: 'text-gray-500 bg-gray-50 border-gray-200',
  }
  return (
    <li className="border border-gray-200 rounded-lg px-4 py-3 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-900">{correction.publicReason}</p>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <span className="text-xs text-gray-400 capitalize">
              Initiated by: {correction.initiatedBy}
            </span>
            {correction.reviewerName && (
              <span className="text-xs text-gray-400">Reviewer: {correction.reviewerName}</span>
            )}
            <time className="text-xs text-gray-400" dateTime={correction.openedAt} dir="ltr">
              Opened: {formatDate(correction.openedAt.slice(0, 10))}
            </time>
            {correction.resolvedAt && (
              <time className="text-xs text-green-600" dateTime={correction.resolvedAt} dir="ltr">
                Resolved: {formatDate(correction.resolvedAt.slice(0, 10))}
              </time>
            )}
          </div>
          {correction.humanApprovalRequired && (
            <p className="text-xs text-amber-600 mt-1 font-medium">⚠ Requires human approval</p>
          )}
        </div>
        <span className={`flex-shrink-0 text-xs border rounded px-1.5 py-0.5 font-medium ${cfg.className}`}>
          {cfg.label}
        </span>
      </div>
    </li>
  )
}

function DecisionRow({ decision }: { decision: DecisionHistoryItemDTO }) {
  return (
    <li className="border border-gray-100 rounded-lg px-4 py-3 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">{decision.description}</p>
          <p className="text-xs text-gray-500 mt-0.5">{decision.evidenceChainSummary}</p>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <span className="text-xs text-gray-400">{decision.decidedBy}</span>
            <time className="text-xs text-gray-400" dateTime={decision.decidedAt} dir="ltr">
              {formatDate(decision.decidedAt.slice(0, 10))}
            </time>
          </div>
        </div>
        {decision.amountEur != null && (
          <span className="text-sm font-semibold text-gray-700 flex-shrink-0" dir="ltr">
            €{parseFloat(decision.amountEur).toLocaleString()}
          </span>
        )}
      </div>
    </li>
  )
}

function VerificationRow({ item }: { item: VerificationHistoryItemDTO }) {
  return (
    <li className="py-2.5 flex items-start gap-3 text-sm">
      <div className="flex-1 min-w-0">
        <span className="font-medium text-gray-700">{item.field}</span>
        <span className="text-gray-400 mx-2">→</span>
        <span className="text-gray-900">{item.newValue}</span>
        {item.oldValue && (
          <span className="text-gray-400 text-xs ml-2">(was: {item.oldValue})</span>
        )}
      </div>
      <div className="flex-shrink-0 text-right">
        <p className="text-xs text-gray-500">{item.verifiedBy}</p>
        {item.evidenceSource && (
          <p className="text-xs text-gray-400">{item.evidenceSource}</p>
        )}
        <time className="text-xs text-gray-400" dateTime={item.verifiedAt} dir="ltr">
          {formatDate(item.verifiedAt.slice(0, 10))}
        </time>
      </div>
    </li>
  )
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}
