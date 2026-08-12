/** Per-canonical-property STR breakdown (read-only). Powered by ownerStrCockpit (Hostaway evidence). */
import { MoneyValue, UnknownValue } from '@/components/ds'
import type { OwnerStrCockpit } from '@/lib/owners/ownerStrCockpit'

const fmtDate = (iso: string | null) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) } catch { return iso }
}

export function StrPropertyBreakdown({ cockpit }: { cockpit: OwnerStrCockpit }) {
  if (cockpit.breakdown.length === 0) return null
  const t = cockpit.totals
  return (
    <section aria-labelledby="str-breakdown-heading" data-testid="str-property-breakdown">
      <h2 id="str-breakdown-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Property Breakdown</h2>
      <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2 font-medium">Property</th>
              <th className="px-3 py-2 font-medium text-right" dir="ltr">Confirmed</th>
              <th className="px-3 py-2 font-medium text-right" dir="ltr">Cancelled</th>
              <th className="px-3 py-2 font-medium text-right" dir="ltr">Nights</th>
              <th className="px-3 py-2 font-medium text-right" dir="ltr">Revenue</th>
              <th className="px-3 py-2 font-medium" dir="ltr">Next Check-in</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {cockpit.breakdown.map((b) => (
              <tr key={b.propertyId} data-testid="str-breakdown-row" className="border-b border-gray-100">
                <td className="px-3 py-2 font-medium text-gray-900">{b.propertyName}</td>
                <td className="px-3 py-2 text-right text-gray-700" dir="ltr">{b.confirmed}</td>
                <td className="px-3 py-2 text-right text-gray-500" dir="ltr">{b.cancelled}</td>
                <td className="px-3 py-2 text-right text-gray-700" dir="ltr">{b.nights}</td>
                <td className="px-3 py-2 text-right" dir="ltr">
                  {b.revenueEur != null ? <MoneyValue amount={b.revenueEur} size="sm" /> : <UnknownValue reason="Revenue unknown" />}
                </td>
                <td className="px-3 py-2 text-gray-600" dir="ltr">{fmtDate(b.nextCheckIn)}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs border rounded px-2 py-0.5 font-medium ${b.status === 'active' ? 'text-green-700 bg-green-50 border-green-200' : 'text-gray-500 bg-gray-50 border-gray-200'}`}>
                    {b.status === 'active' ? 'Upcoming' : 'Idle'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          {cockpit.breakdown.length > 1 && (
            <tfoot>
              <tr className="border-t-2 border-gray-300 font-semibold text-gray-800">
                <td className="px-3 py-2">Totals</td>
                <td className="px-3 py-2 text-right" dir="ltr">{t.confirmed}</td>
                <td className="px-3 py-2 text-right" dir="ltr">{t.cancelled}</td>
                <td className="px-3 py-2 text-right" dir="ltr">{t.nights}</td>
                <td className="px-3 py-2 text-right" dir="ltr">{t.revenueEur != null ? <MoneyValue amount={t.revenueEur} size="sm" /> : '—'}</td>
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  )
}
