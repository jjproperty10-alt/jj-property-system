/** Compact "Needs Attention" — derived from existing reconciliation statuses only (no new alert engine). */
import type { OwnerStrCockpit } from '@/lib/owners/ownerStrCockpit'

export function StrNeedsAttention({ cockpit, periodLabel, financialHref }: { cockpit: OwnerStrCockpit; periodLabel?: string; financialHref?: string }) {
  const period = periodLabel ?? 'This month'
  const items: { property: string; text: string }[] = []
  for (const r of cockpit.reconciliation) {
    if (r.status === 'missing_in_jj') items.push({ property: r.propertyName, text: `${period} STR income is not yet recorded in JJ.` })
    else if (r.status === 'variance') items.push({ property: r.propertyName, text: `${period} STR income differs from the JJ ledger${r.varianceEur != null ? ` (€${r.varianceEur.toFixed(2)})` : ''}.` })
    else if (r.status === 'insufficient_evidence') items.push({ property: r.propertyName, text: `${period} needs review — insufficient evidence.` })
    else if (r.status === 'missing_in_hostaway') items.push({ property: r.propertyName, text: `${period} JJ ledger has income with no Hostaway evidence to corroborate.` })
  }

  if (items.length === 0) {
    return (
      <section data-testid="str-attention-clear" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <div className="text-sm font-semibold text-green-800">All clear</div>
        <div className="text-xs text-green-700">No STR items need attention for {period.toLowerCase()}.</div>
      </section>
    )
  }
  return (
    <section data-testid="str-attention" aria-labelledby="str-attention-heading" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <h2 id="str-attention-heading" className="text-sm font-semibold text-amber-900 mb-2">Needs Attention · {items.length}</h2>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} data-testid="str-attention-item" className="text-xs text-amber-800 flex items-center justify-between gap-3">
            <span><span className="font-medium">{it.property}:</span> {it.text}</span>
            {financialHref ? (
              <a href={financialHref} data-testid="str-attention-review" className="shrink-0 text-xs font-medium text-blue-700 hover:underline">Review</a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
