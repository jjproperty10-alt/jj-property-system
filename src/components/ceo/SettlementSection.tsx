import { UNAVAILABLE_METRIC } from '@/lib/legacy/staffMetricLabel'

export const SETTLEMENT_UNAVAILABLE = 'נתון לא זמין'

export interface Settlement {
  yossi_cashbox_balance: number | string
  jacob_cashbox_balance: number | string
  jj_cashbox_total: number | string
  jj_cashbox_per_partner: number | string
  anastasia_pending_jj_asset: number | string
  anastasia_asset_per_partner: number | string
  due_to_owners_total: number | string
  due_to_owners_per_partner: number | string
  settlement_delta: number | string
  settlement_amount: number | string
  transfer_direction: string
}

function eur(val: unknown, showSign = false): string {
  const num = parseFloat(String(val ?? 0))
  if (isNaN(num)) return '—'
  const abs = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(num))
  if (num < 0) return `-€${abs}`
  if (showSign && num > 0) return `+€${abs}`
  return `€${abs}`
}

function presentMetric(val: unknown, showSign = false): string {
  if (val == null || val === '') return UNAVAILABLE_METRIC
  return eur(val, showSign)
}

function color(val: unknown): string {
  const num = parseFloat(String(val ?? 0))
  if (isNaN(num)) return 'text-gray-400'
  if (num > 0) return 'text-green-600'
  if (num < 0) return 'text-red-600'
  return 'text-gray-500'
}

function SectionTitle({ source }: { source?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600">
        B
      </div>
      <div>
        <span className="text-sm font-semibold text-gray-700">Partner Settlement</span>
        <span className="ml-2 text-xs text-gray-400">סילוק בין שותפים</span>
      </div>
      {source ? (
        <span className="min-w-0 break-all text-[10px] font-mono text-gray-300 sm:ml-auto">{source}</span>
      ) : null}
    </div>
  )
}

export function SettlementSection({
  settlement,
  yossiBalance,
  jacobBalance,
}: {
  settlement: Settlement | null
  yossiBalance?: unknown
  jacobBalance?: unknown
}) {
  if (settlement == null) {
    return (
      <section id="settlement">
        <SectionTitle />
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-700">{SETTLEMENT_UNAVAILABLE}</p>
        </div>
      </section>
    )
  }

  return (
    <section id="settlement">
      <SectionTitle source="v_settlement_verification" />
      <div className="rounded-xl border border-blue-200 bg-white p-6">
        <div className="flex flex-col items-start gap-6 md:flex-row md:gap-8">
          <div className="min-w-0 flex-1">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-500">
              Official Result · v_settlement_verification ✓ authoritative
            </div>
            <div className="mb-3 flex flex-wrap items-baseline gap-3">
              <span className="min-w-0 break-words text-3xl font-bold text-blue-700 sm:text-4xl">
                {presentMetric(settlement.settlement_amount)}
              </span>
              <span className="min-w-0 break-words text-xl text-blue-600">
                {settlement.transfer_direction || UNAVAILABLE_METRIC}
              </span>
            </div>
            <p className="text-sm text-gray-500">Formula: ABS(Yossi − Jacob) ÷ 2</p>
            <p className="mt-0.5 break-words text-sm text-gray-500">
              = ABS({presentMetric(settlement.yossi_cashbox_balance, true)} − {presentMetric(settlement.jacob_cashbox_balance, true)}) ÷ 2
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <span className={color(yossiBalance)}>Yossi: {eur(yossiBalance, true)}</span>
              <span className="text-gray-300">·</span>
              <span className={color(jacobBalance)}>Jacob: {eur(jacobBalance, true)}</span>
              <span className="text-gray-300">·</span>
              <span className="text-gray-500">Delta: {presentMetric(settlement.settlement_delta)} ÷ 2</span>
            </div>
          </div>
          <div className="hidden w-px self-stretch bg-gray-200 md:block" />
          <div className="w-full min-w-0 md:w-60">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Context only · הקשר
            </div>
            {[
              ['JJ cashbox total', settlement.jj_cashbox_total],
              ['JJ ÷ 2 per partner', settlement.jj_cashbox_per_partner],
              ['Anastasia asset ÷ 2', settlement.anastasia_asset_per_partner],
              ['Due to owners ÷ 2', settlement.due_to_owners_per_partner],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex justify-between border-b border-gray-100 py-1.5 text-sm last:border-0">
                <span className="text-gray-500">{String(label)}</span>
                <span className="text-gray-400">{presentMetric(val)}</span>
              </div>
            ))}
            <p className="mt-2 text-[10px] text-gray-300">Identical for both partners → cancel in delta</p>
          </div>
        </div>
      </div>
    </section>
  )
}
