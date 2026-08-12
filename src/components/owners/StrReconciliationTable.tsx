/** Compact STR reconciliation table — one row per canonical property (replaces repeated cards). */
import type { OwnerStrCockpit } from '@/lib/owners/ownerStrCockpit'

const STATUS: Record<string, { label: string; cls: string }> = {
  match:                 { label: 'Match',            cls: 'text-green-700 bg-green-50 border-green-200' },
  variance:              { label: 'Variance',         cls: 'text-amber-700 bg-amber-50 border-amber-200' },
  missing_in_jj:         { label: 'Missing in JJ',    cls: 'text-blue-700 bg-blue-50 border-blue-200' },
  missing_in_hostaway:   { label: 'Missing in Hostaway', cls: 'text-blue-700 bg-blue-50 border-blue-200' },
  insufficient_evidence: { label: 'Needs Review',     cls: 'text-gray-600 bg-gray-50 border-gray-200' },
  no_activity:           { label: 'No activity',      cls: 'text-gray-500 bg-gray-50 border-gray-200' },
  no_engagement:         { label: 'No engagement',    cls: 'text-gray-500 bg-gray-50 border-gray-200' },
  unavailable:           { label: 'Unavailable',      cls: 'text-gray-500 bg-gray-50 border-gray-200' },
}
const eur = (n: number | null) => (n == null ? '—' : `€${n.toFixed(2)}`)

export function StrReconciliationTable({ cockpit, periodLabel }: { cockpit: OwnerStrCockpit; periodLabel?: string }) {
  if (cockpit.reconciliation.length === 0) return null
  return (
    <section aria-labelledby="str-recon-heading" data-testid="str-reconciliation-table">
      <h2 id="str-recon-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Airbnb / STR Evidence Reconciliation{periodLabel ? ` · ${periodLabel}` : ''}
      </h2>
      <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2 font-medium">Property</th>
              <th className="px-3 py-2 font-medium text-right" dir="ltr">Hostaway (evidence)</th>
              <th className="px-3 py-2 font-medium text-right" dir="ltr">JJ ledger</th>
              <th className="px-3 py-2 font-medium text-right" dir="ltr">Variance</th>
              <th className="px-3 py-2 font-medium">Confidence</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Review reason</th>
            </tr>
          </thead>
          <tbody>
            {cockpit.reconciliation.map((r) => {
              const st = STATUS[r.status] ?? { label: r.status, cls: 'text-gray-600 bg-gray-50 border-gray-200' }
              return (
                <tr key={r.propertyName} data-testid="str-recon-compact-row" className="border-b border-gray-100">
                  <td className="px-3 py-2 font-medium text-gray-900">{r.propertyName}</td>
                  <td className="px-3 py-2 text-right text-gray-700" dir="ltr">{eur(r.hostawayEvidenceEur)}</td>
                  <td className="px-3 py-2 text-right text-gray-700" dir="ltr">{eur(r.jjLedgerEur)}</td>
                  <td className="px-3 py-2 text-right text-gray-700" dir="ltr">{eur(r.varianceEur)}</td>
                  <td className="px-3 py-2 text-gray-500">{r.confidence}</td>
                  <td className="px-3 py-2"><span className={`text-xs border rounded px-2 py-0.5 font-medium ${st.cls}`}>{st.label}</span></td>
                  <td className="px-3 py-2 text-xs text-gray-500">{r.reviewReason ?? ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
