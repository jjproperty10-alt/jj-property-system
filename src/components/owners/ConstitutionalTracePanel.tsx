/**
 * ConstitutionalTracePanel — VS1 7-stage provenance display.
 *
 * 'use client' — uses useState for collapse/expand toggle.
 *
 * RC-4: Renders honest statuses. IMPLEMENTED stages are green.
 * NOT_IMPLEMENTED / NOT_POPULATED / UNTYPED / RECORDING_ONLY show
 * their real status with gap descriptions — never simulated or hidden.
 *
 * DS compliance: uses Tailwind utility classes only (no custom CSS).
 * P-ARCH-1: Unknown = NULL, never 0 or placeholder.
 *
 * @see constitutionalTraceTypes.ts — type definitions
 * @see buildConstitutionalTrace — pure builder function
 */

'use client'

import { useState } from 'react'
import type { ConstitutionalTrace, TraceStageStatus } from '@/lib/statements/constitutionalTraceTypes'

interface ConstitutionalTracePanelProps {
  trace: ConstitutionalTrace
}

/** Map status to display color + label */
function statusConfig(status: TraceStageStatus): { bg: string; text: string; label: string } {
  switch (status) {
    case 'IMPLEMENTED':
      return { bg: 'bg-green-50', text: 'text-green-700', label: 'Implemented' }
    case 'RECORDING_ONLY':
      return { bg: 'bg-yellow-50', text: 'text-yellow-700', label: 'Recording Only' }
    case 'NOT_POPULATED':
      return { bg: 'bg-orange-50', text: 'text-orange-700', label: 'Not Populated' }
    case 'NOT_IMPLEMENTED':
      return { bg: 'bg-red-50', text: 'text-red-700', label: 'Not Implemented' }
    case 'UNTYPED':
      return { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Untyped' }
  }
}

/** Human-readable stage names */
const STAGE_LABELS: Record<string, string> = {
  evidence: 'Evidence',
  business_event: 'Business Event',
  classification: 'Classification',
  computation: 'Computation',
  projection: 'Projection',
  interpretation: 'Interpretation',
  authority: 'Authority',
}

export function ConstitutionalTracePanel({ trace }: ConstitutionalTracePanelProps) {
  const [expanded, setExpanded] = useState(false)

  const stages = [
    trace.evidence,
    trace.businessEvent,
    trace.classification,
    trace.computation,
    trace.projection,
    trace.interpretation,
    trace.authority,
  ]

  return (
    <div className="mb-6 border border-gray-200 rounded-lg bg-white overflow-hidden">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors"
        aria-expanded={expanded}
        aria-controls="trace-panel-content"
      >
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Constitutional Trace
          </h3>
          <span className="text-xs text-gray-400">
            {trace.implementedCount}/{trace.totalStages} stages implemented
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Mini status indicators */}
          <div className="flex gap-1">
            {stages.map(stage => {
              const config = statusConfig(stage.status)
              return (
                <div
                  key={stage.stage}
                  className={`w-2 h-2 rounded-full ${stage.status === 'IMPLEMENTED' ? 'bg-green-500' : stage.status === 'NOT_IMPLEMENTED' ? 'bg-red-400' : 'bg-yellow-400'}`}
                  title={`${STAGE_LABELS[stage.stage]}: ${config.label}`}
                />
              )
            })}
          </div>
          <span className="text-gray-400 text-sm" aria-hidden="true">
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </button>

      {/* Expandable content */}
      {expanded && (
        <div id="trace-panel-content" className="divide-y divide-gray-100">
          {stages.map((stage, i) => {
            const config = statusConfig(stage.status)
            return (
              <div key={stage.stage} className={`px-4 py-3 ${config.bg}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-mono w-4">{i + 1}</span>
                    <span className="text-sm font-medium text-gray-800">
                      {STAGE_LABELS[stage.stage] ?? stage.stage}
                    </span>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${config.bg} ${config.text}`}>
                    {config.label}
                  </span>
                </div>
                <p className="text-xs text-gray-500 ml-6 leading-relaxed">
                  {stage.explanation}
                </p>
              </div>
            )
          })}

          {/* Gaps summary */}
          {trace.gaps.length > 0 && (
            <div className="px-4 py-3 bg-amber-50">
              <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">
                Gaps &amp; Unknowns ({trace.gaps.length})
              </h4>
              <ul className="space-y-1">
                {trace.gaps.map(gap => (
                  <li key={gap.stage} className="text-xs text-amber-600 flex items-start gap-2">
                    <span className="text-amber-400 mt-0.5" aria-hidden="true">&bull;</span>
                    <span>
                      <strong className="font-medium">{STAGE_LABELS[gap.stage] ?? gap.stage}:</strong>{' '}
                      {gap.description}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
