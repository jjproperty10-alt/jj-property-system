/** Compact "Needs Attention" — derived from existing reconciliation statuses only (no new alert engine). */
import type { OwnerStrCockpit } from '@/lib/owners/ownerStrCockpit'

export function StrNeedsAttention({ cockpit }: { cockpit: OwnerStrCockpit }) {
  const items: { property: string; text: string }[] = []
  for (const r of cockpit.reconciliation) {
    if (r.status === 'missing_in_jj') items.push({ property: r.propertyName, text: 'Hostaway evidence present but no JJ ledger entry — needs manual entry/confirmation.' })
    else if (r.status === 'variance') items.push({ property: r.propertyName, text: `Variance between Hostaway evidence and JJ ledger${r.varianceEur != null ? ` (€${r.varianceEur.toFixed(2)})` : ''}.` })
    else if (r.status === 'insufficient_evidence') items.push({ property: r.propertyName, text: r.reviewReason ?? 'Needs review — insufficient evidence.' })
    else if (r.status === 'missing_in_hostaway') items.push({ property: r.propertyName, text: 'JJ ledger present but no Hostaway evidence to corroborate.' })
  }

  if (items.length === 0) {
    return (
      <section data-testid="str-attention-clear" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <div className="text-sm font-semibold text-green-800">All clear</div>
        <div className="text-xs text-green-700">No STR reconciliation issues for the selected month.</div>
      </section>
    )
  }
  return (
    <section data-testid="str-attention" aria-labelledby="str-attention-heading" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <h2 id="str-attention-heading" className="text-sm font-semibold text-amber-900 mb-2">Needs Attention · {items.length}</h2>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} data-testid="str-attention-item" className="text-xs text-amber-800">
            <span className="font-medium">{it.property}:</span> {it.text}
          </li>
        ))}
      </ul>
    </section>
  )
}
