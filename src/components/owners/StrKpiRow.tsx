/**
 * StrKpiRow — top-of-page management KPI row for the Reservations cockpit.
 * Revenue · Confirmed · Cancelled · Nights · ADR · Occupancy. Read-only, from cockpit totals.
 * ADR derived from Revenue/Nights only when reliable; Occupancy stays Unknown (no capacity source).
 */
import { KpiCard, MoneyValue, UnknownValue } from '@/components/ds'
import type { OwnerStrCockpit } from '@/lib/owners/ownerStrCockpit'

export function StrKpiRow({ cockpit }: { cockpit: OwnerStrCockpit }) {
  const t = cockpit.totals
  const adr = t.revenueEur != null && t.nights > 0 ? Math.round((t.revenueEur / t.nights) * 100) / 100 : null
  const num = (n: number) => <span className="text-2xl font-bold text-gray-900" dir="ltr">{n}</span>
  return (
    <section aria-labelledby="str-kpi-heading" data-testid="str-kpi-row">
      <h2 id="str-kpi-heading" className="sr-only">Period KPIs</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Revenue" value={t.revenueEur != null ? <MoneyValue amount={t.revenueEur} size="lg" /> : <UnknownValue reason="Revenue not available" />} />
        <KpiCard label="Confirmed" value={num(t.confirmed)} />
        <KpiCard label="Cancelled" value={num(t.cancelled)} />
        <KpiCard label="Nights" value={num(t.nights)} />
        <KpiCard label="ADR" value={adr != null ? <MoneyValue amount={adr} size="md" /> : <UnknownValue reason="ADR needs revenue & nights" />} />
        <KpiCard label="Occupancy" value={<UnknownValue reason="Occupancy needs a capacity source" />} />
      </div>
    </section>
  )
}
