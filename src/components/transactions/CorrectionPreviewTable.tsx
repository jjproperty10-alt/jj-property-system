import React from 'react'

export interface CorrectionPreviewTableProps {
  readonly changedFields: readonly string[]
  readonly originalSnapshot: Record<string, unknown>
  readonly proposedSnapshot: Record<string, unknown>
  readonly netLedgerEffectEur: number
  readonly reason: string
  readonly evidenceReference?: string
  readonly transactionId: string
}

const EUR = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n)

/** Presentational preview table — used by CorrectionDialog and SSR-tested. */
export function CorrectionPreviewTable({
  changedFields,
  originalSnapshot,
  proposedSnapshot,
  netLedgerEffectEur,
  reason,
  evidenceReference,
  transactionId,
}: CorrectionPreviewTableProps) {
  return (
    <div data-testid="correction-preview">
      <div className="text-xs text-gray-600 mb-2" data-testid="affected-tx-id">
        Affected transaction ID: <span className="font-mono">{transactionId}</span>
      </div>
      <table className="w-full text-xs border border-gray-100">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-3 py-2">Field</th>
            <th className="text-left px-3 py-2">Original</th>
            <th className="text-left px-3 py-2">Proposed</th>
          </tr>
        </thead>
        <tbody>
          {changedFields.map((field) => (
            <tr key={field} className="border-t border-gray-50">
              <td className="px-3 py-2 font-mono">{field}</td>
              <td className="px-3 py-2" data-testid={`orig-${field}`}>
                {String(originalSnapshot[field] ?? '—')}
              </td>
              <td className="px-3 py-2 font-medium" data-testid={`prop-${field}`}>
                {String(proposedSnapshot[field] ?? '—')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-xs text-gray-700 mt-2" data-testid="balance-impact">
        Ledger effect after apply (amount_eur, incl. original remaining): {EUR(netLedgerEffectEur)}
      </div>
      <div className="text-xs text-gray-600 mt-1" data-testid="preview-reason">
        Reason: {reason}
        {evidenceReference ? ` · Evidence: ${evidenceReference}` : ''}
      </div>
    </div>
  )
}
