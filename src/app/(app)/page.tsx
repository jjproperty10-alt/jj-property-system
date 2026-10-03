// ============================================================
// JJ PROPERTY 10 — CEO Dashboard (Engine v1.0)
// File: app/page.tsx ← replace the existing file with this
// ============================================================
//
// Section A — Cashboxes → v_cashbox_audit
// Section B — Partner Settlement → v_settlement_verification
// Section C — Anastasia Clearing → v_anastasia_clearing
// Section D — Owner/Client Bal. → v_ceo_summary
// Section E — Profit Overview → v_ceo_summary
// Section F — Company P&L → v_jj_company_pl
//
// Verified source values (10 Jun 2026):
// Yossi balance: −36,671.82
// Jacob balance: +74,079.54
// JJ balance: +66,644.71
// Settlement: €55,375.68 (Jacob → Yossi)
// Anastasia owes JJ: €7,082.69
// Total cash position profit: €293,321.90
// Net company P&L: €10,719.61
// ============================================================

import { UNAVAILABLE_METRIC } from '@/lib/legacy/staffMetricLabel'
import { fetchAll } from '@/lib/ceo/fetchCeoDashboard'
import { SettlementSection } from '@/components/ceo/SettlementSection'

export const dynamic = 'force-dynamic'

// ---- Numeric coercion ----
// Supabase returns PostgreSQL NUMERIC columns as strings.
// n() converts any value to a JavaScript number safely.
function n(v: unknown): number {
  if (v == null) return 0
  const f = parseFloat(String(v))
  return isNaN(f) ? 0 : f
}

// ---- Types ----
// Fields typed as `number | string` to allow both runtime strings from Supabase
// and TypeScript number types for static analysis. Always access via n().

// ---- Helpers ----

// eur() accepts unknown since Supabase numeric fields arrive as strings at runtime
function presentMetric(val: unknown, showSign = false): string {
  if (val == null || val === '') return UNAVAILABLE_METRIC
  return eur(val, showSign)
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

function color(val: unknown): string {
  const num = parseFloat(String(val ?? 0))
  if (isNaN(num)) return 'text-gray-400'
  if (num > 0) return 'text-green-600'
  if (num < 0) return 'text-red-600'
  return 'text-gray-500'
}

function bgColor(val: unknown): string {
  const num = parseFloat(String(val ?? 0))
  if (isNaN(num)) return 'bg-gray-50 border-gray-200'
  if (num > 0) return 'bg-green-50 border-green-200'
  if (num < 0) return 'bg-red-50 border-red-200'
  return 'bg-gray-50 border-gray-200'
}

// ---- Page ----

export default async function CEODashboard() {
  const { cashboxes, settlement, anastasia, summary, pl, errors } = await fetchAll()

  const yossi = cashboxes.find(c => c.cash_box_name === 'Yossi')
  const jacob = cashboxes.find(c => c.cash_box_name === 'Jacob')
  const jjBox = cashboxes.find(c => c.cash_box_name === 'JJ')

  const totalInternal =
    n(yossi?.balance) +
    n(jacob?.balance) +
    n(jjBox?.balance) +
    n(anastasia?.cash_on_hand)

  const anastasiaIn = n(anastasia?.cash_collected) + n(anastasia?.cash_transfers_in)
  const anastasiaOut = n(anastasia?.cash_transferred_out) + n(anastasia?.expenses_paid)

  return (
    <div className="min-h-screen min-w-0 bg-gray-50">

      {/* ── Header ── */}
      <header className="sticky top-0 z-10 flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-gray-900">
            JJ Property 10 · CEO Dashboard
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            לוח בקרה ראשי · Engine v1.0 · {pl?.transaction_count ?? 2271} transactions
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
          🔒 v1.0 Frozen · 10 Jun 2026
        </span>
      </header>

      {/* ── Error banner ── */}
      {errors.length > 0 && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 text-sm text-red-700">
          Data fetch errors: {errors.join(' · ')}
        </div>
      )}

      <main className="mx-auto min-w-0 max-w-7xl space-y-8 px-4 py-6 sm:px-6">

        {/* ══ SECTION A — Cashboxes ══ */}
        <section id="cashboxes">
          <SectionHeader letter="A" en="Cashboxes" he="קופות מזומן" source="v_cashbox_audit" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">

            <CashCard
              label="Yossi"
              labelHe="יוסי"
              balance={yossi?.balance}
              totalIn={yossi?.total_received}
              totalOut={yossi?.total_paid}
            />
            <CashCard
              label="Jacob"
              labelHe="ג׳ייקוב"
              balance={jacob?.balance}
              totalIn={jacob?.total_received}
              totalOut={jacob?.total_paid}
            />
            <CashCard
              label="JJ Company"
              labelHe="חברה"
              balance={jjBox?.balance}
              totalIn={jjBox?.total_received}
              totalOut={jjBox?.total_paid}
            />

            {/* Anastasia — from v_anastasia_clearing */}
            <div className="bg-white rounded-xl border border-yellow-300 p-4 flex flex-col">
              <div className="text-xs text-gray-500">
                Anastasia · <span className="text-gray-400">cash on hand</span>
              </div>
              <div className="mt-1 min-w-0 break-words text-2xl font-semibold text-yellow-600">
                {eur(anastasia?.cash_on_hand)}
              </div>
              <div className="text-xs text-yellow-600 mt-1">Anastasia owes JJ · חייבת</div>
              <div className="text-[10px] text-gray-300 mt-auto pt-2">v_anastasia_clearing</div>
            </div>

            {/* Total */}
            <div className="bg-gray-900 rounded-xl border border-gray-700 p-4 flex flex-col">
              <div className="text-xs text-gray-400">Total Internal Cash</div>
              <div className={`mt-1 min-w-0 break-words text-2xl font-semibold ${totalInternal >= 0 ? 'text-white' : 'text-red-400'}`}>
                {eur(totalInternal, true)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Yossi + Jacob + JJ + Anastasia</div>
              <div className="text-[10px] text-gray-600 mt-auto pt-2">Combined</div>
            </div>
          </div>
        </section>

        <SettlementSection
          settlement={settlement}
          yossiBalance={yossi?.balance}
          jacobBalance={jacob?.balance}
        />

        {/* ══ SECTION C — Anastasia Clearing ══ */}
        <section id="anastasia">
          <SectionHeader letter="C" en="Anastasia Clearing" he="סליקת אנסטסיה" source="v_anastasia_clearing" />
          <div className="bg-white rounded-xl border p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="font-semibold text-gray-900">Anastasia Kravchenko</div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">
                  {anastasia?.tx_as_payer ?? 0} tx as payer · {anastasia?.tx_as_payee ?? 0} tx as payee
                </span>
                {n(anastasia?.anastasia_owes_jj) > 0 ? (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300">
                    ⚠️ Anastasia owes JJ · חייבת ל-JJ
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-300">
                    ✓ Settled
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              {/* Money In */}
              <div>
                <h4 className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-3">
                  Money in · כסף שנכנס
                </h4>
                <FlowRow label="Cash collected" labelHe="גביה מדיירים / לקוחות / Airbnb" value={anastasia?.cash_collected} sign="+" />
                <FlowRow label="Transfers received" labelHe="העברות שקיבלה מ-JJ / Jacob" value={anastasia?.cash_transfers_in} sign="+" />
                <div className="flex justify-between items-baseline pt-2.5 mt-1 border-t border-green-200">
                  <span className="text-sm font-semibold text-green-800">Total in</span>
                  <span className="text-base font-bold text-green-700">+{eur(anastasiaIn)}</span>
                </div>
              </div>

              {/* Money Out */}
              <div>
                <h4 className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-3">
                  Money out · כסף שיצא
                </h4>
                <FlowRow label="Transfers sent" labelHe="העברות ששלחה ל-JJ / Jacob" value={anastasia?.cash_transferred_out} sign="−" />
                <FlowRow label="Expenses paid for company" labelHe="הוצאות ששילמה עבור החברה" value={anastasia?.expenses_paid} sign="−" />
                <div className="flex justify-between text-xs text-gray-400 py-1 pl-4">
                  <span className="italic">of which: Fabi salary paid</span>
                  <span>({eur(anastasia?.fabi_salary_paid)})</span>
                </div>
                <div className="flex justify-between items-baseline pt-2.5 mt-1 border-t border-red-200">
                  <span className="text-sm font-semibold text-red-800">Total out</span>
                  <span className="text-base font-bold text-red-700">−{eur(anastasiaOut)}</span>
                </div>
              </div>
            </div>

            {/* Result metrics */}
            <div className="mt-6 grid grid-cols-1 gap-3 border-t pt-5 sm:grid-cols-2 xl:grid-cols-5">
              <Metric
                label="Cash on hand"
                labelHe="מזומן בקופה"
                value={eur(anastasia?.cash_on_hand)}
                sub="= Total in − Total out"
                highlight="yellow"
              />
              <Metric
                label="Anastasia owes JJ"
                labelHe="חייבת ל-JJ"
                value={eur(anastasia?.anastasia_owes_jj)}
                sub="GREATEST(0, cash_on_hand)"
                highlight="yellow"
              />
              <Metric
                label="JJ owes Anastasia"
                labelHe="JJ חייב לאנסטסיה"
                value={eur(anastasia?.jj_owes_anastasia)}
                sub="GREATEST(0, −cash_on_hand)"
                highlight="none"
              />
              <Metric
                label="Salary received"
                labelHe="משכורת שקיבלה"
                value={eur(anastasia?.salary_received)}
                sub="Personal compensation"
                highlight="none"
              />
              <Metric
                label="Transactions"
                labelHe="עסקאות"
                value={`${anastasia?.tx_as_payer ?? 0} / ${anastasia?.tx_as_payee ?? 0}`}
                sub="payer / payee"
                highlight="none"
              />
            </div>
          </div>
        </section>

        {/* ══ SECTION D — Owner / Client Balances ══ */}
        <section id="balances">
          <SectionHeader letter="D" en="Owner / Client Balances" he="יתרות בעלים / לקוחות" source="v_ceo_summary" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

            {/* Due to Owners */}
            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="font-semibold text-gray-900">Due to Owners · חוב לבעלים</div>
                  <div className="text-xs text-gray-400 mt-0.5">Rent collected, not yet distributed</div>
                </div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                  JJ owes · JJ חייב
                </span>
              </div>
              <div className="mb-3 min-w-0 break-words text-3xl font-bold text-red-600 sm:text-4xl">
                {presentMetric(summary?.due_to_owners)}
              </div>
              <p className="text-xs text-gray-400 mb-4">שכ״ד שנגבה ועדיין לא הועבר לבעלים</p>
              <a
                href="/owners-balance"
                className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                View owners owed breakdown →
              </a>
              <div className="text-[10px] text-gray-300 mt-3">v_ceo_summary.due_to_owners</div>
            </div>

            {/* Receivables */}
            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="font-semibold text-gray-900">Receivables · חוב לקוחות</div>
                  <div className="text-xs text-gray-400 mt-0.5">Clients and buyers owe JJ</div>
                </div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                  JJ is owed · מגיע ל-JJ
                </span>
              </div>
              <div className="space-y-3 mb-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-gray-600">Renovation receivables</span>
                  <span className="min-w-0 break-words font-semibold text-green-600">{presentMetric(summary?.reno_receivables)}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-gray-600">Sale receivables</span>
                  <span className="min-w-0 break-words font-semibold text-green-600">{presentMetric(summary?.sale_receivables)}</span>
                </div>
                <div className="flex justify-between items-baseline border-t pt-2.5">
                  <span className="font-semibold text-gray-800">Total receivables</span>
                  <span className="min-w-0 break-words text-2xl font-bold text-green-700">{presentMetric(summary?.total_receivables)}</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 mb-3">
                Not included in settlement — must be collected first · לא נכלל בסילוק
              </p>
              <a
                href="/clients-receivable"
                className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                View clients receivable breakdown →
              </a>
              <div className="text-[10px] text-gray-300 mt-3">
                v_ceo_summary.reno_receivables + sale_receivables
              </div>
            </div>
          </div>
        </section>

        {/* ══ SECTION E — Profit Overview ══ */}
        <section id="profit">
          <SectionHeader letter="E" en="Profit Overview" he="סקירת רווחיות" source="v_ceo_summary (v1.0 columns)" />
          <div className="bg-white rounded-xl border p-6">

            {/* Top 3 KPIs */}
            <div className="mb-5 grid grid-cols-1 gap-6 border-b pb-5 sm:grid-cols-3">
              <div>
                <div className="text-xs text-gray-500">Total Cash Position Profit</div>
                <div className="text-xs text-gray-400 mt-0.5">רווח מצב מזומן כולל</div>
                <div className={`mt-2 min-w-0 break-words text-3xl font-bold sm:text-4xl ${color(summary?.total_cash_position_profit)}`}>
                  {presentMetric(summary?.total_cash_position_profit, true)}
                </div>
                <div className="text-xs text-gray-400 mt-1">Cash basis · all 4 segments</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Total Contract Profit</div>
                <div className="text-xs text-gray-400 mt-0.5">רווח חוזי כולל</div>
                <div className={`mt-2 min-w-0 break-words text-3xl font-bold sm:text-4xl ${color(summary?.total_contract_profit)}`}>
                  {presentMetric(summary?.total_contract_profit, true)}
                </div>
                <div className="text-xs text-gray-400 mt-1">Accrual basis · all 4 segments</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Cash–Contract Gap</div>
                <div className="text-xs text-gray-400 mt-0.5">פער מזומן / חוזה</div>
                <div className={`mt-2 min-w-0 break-words text-3xl font-bold sm:text-4xl ${color(summary?.cash_contract_gap)}`}>
                  {presentMetric(summary?.cash_contract_gap)}
                </div>
                <div className="text-xs text-gray-400 mt-1">Cash received vs. accrual value</div>
              </div>
            </div>

            {/* 4-segment breakdown */}
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              By segment · לפי מגזר
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Client-managed', labelHe: 'נכסי לקוחות', val: summary?.client_cash_position_profit, sub: 'Mgmt + deals realized' },
                { label: 'JJ-owned', labelHe: 'נכסי JJ', val: summary?.jj_own_cash_profit, sub: 'After capital invested' },
                { label: 'Partnership', labelHe: 'שותפות', val: summary?.partnership_jj_cash_profit, sub: "JJ's share after capital" },
                { label: 'Company P&L', labelHe: 'חברה', val: summary?.company_cash_profit, sub: 'Net company P&L' },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 rounded-lg p-4">
                  <div className="text-xs text-gray-500">{s.label}</div>
                  <div className="text-xs text-gray-400 mb-2">{s.labelHe}</div>
                  <div className={`min-w-0 break-words text-2xl font-semibold ${color(s.val)}`}>
                    {presentMetric(s.val, true)}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">{s.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ SECTION F — Company P&L ══ */}
        <section id="company-pl">
          <SectionHeader letter="F" en="Company P&L — JJ Ltd" he="דוח רווח והפסד" source="v_jj_company_pl" />
          <div className="bg-white rounded-xl border p-6">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-10">

              {/* Income + Payroll */}
              <div>
                <div className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-3">
                  Income · הכנסות
                </div>
                <PLRow label="JJ income" value={pl?.jj_income} sign="+" />

                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-5 mb-3">
                  Payroll · שכר עבודה
                </div>
                <PLRow label="Salary — Anastasia" value={pl?.salary_anastasia} sign="−" />
                <PLRow label="Salary — Fabi" value={pl?.salary_fabi} sign="−" />
                <div className="flex justify-between text-sm font-semibold py-2 border-t mt-1">
                  <span className="text-gray-700">Total payroll</span>
                  <span className="text-red-600">−{eur(pl?.total_payroll)}</span>
                </div>
              </div>

              {/* Operating Expenses */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Expenses · הוצאות
                </div>
                <PLRow label="Office expenses" value={pl?.office_expenses} sign="−" />
                <PLRow label="Marketing / platform" value={pl?.marketing_platform} sign="−" />
                <PLRow label="Other expenses" value={pl?.other_expenses} sign="−" />
                <div className="flex justify-between text-sm font-semibold py-2 border-t mt-1">
                  <span className="text-gray-700">Total expenses</span>
                  <span className="text-red-600">−{eur(pl?.total_expenses)}</span>
                </div>
              </div>
            </div>

            {/* Net P&L */}
            <div className={`mt-6 flex flex-col gap-3 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between ${bgColor(pl?.net_company_pl)}`}>
              <div>
                <div className={`font-semibold text-base ${color(pl?.net_company_pl)}`}>
                  Net Company P&L · רווח נקי חברה
                </div>
                <div className={`text-sm mt-0.5 ${color(pl?.net_company_pl)}`}>
                  Income {eur(pl?.jj_income)} − Expenses {eur(pl?.total_expenses)}
                </div>
              </div>
              <div className={`min-w-0 break-words text-3xl font-bold sm:text-4xl ${color(pl?.net_company_pl)}`}>
                {eur(pl?.net_company_pl, true)}
              </div>
            </div>
          </div>
        </section>

      </main>
    </div>
  )
}

// ============================================================
// ── Sub-components ──
// ============================================================

function SectionHeader({
  letter, en, he, source
}: {
  letter: string; en: string; he: string; source: string
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0">
        {letter}
      </div>
      <div>
        <span className="text-sm font-semibold text-gray-700">{en}</span>
        <span className="text-xs text-gray-400 ml-2">{he}</span>
      </div>
      <span className="min-w-0 break-all text-[10px] font-mono text-gray-300 sm:ml-auto">{source}</span>
    </div>
  )
}

function CashCard({
  label, labelHe, balance, totalIn, totalOut
}: {
  label: string; labelHe: string; balance: unknown; totalIn: unknown; totalOut: unknown
}) {
  return (
    <div className="bg-white rounded-xl border p-4 flex flex-col">
      <div className="text-xs text-gray-500">
        {label} <span className="text-gray-400">· {labelHe}</span>
      </div>
      <div className={`mt-1 min-w-0 break-words text-2xl font-semibold ${color(balance)}`}>
        {eur(balance, true)}
      </div>
      <div className="text-xs text-gray-400 mt-2 space-y-0.5">
        <div>In: {eur(totalIn)}</div>
        <div>Out: {eur(totalOut)}</div>
      </div>
      <div className="text-[10px] text-gray-300 mt-auto pt-2">v_cashbox_audit</div>
    </div>
  )
}

function FlowRow({
  label, labelHe, value, sign
}: {
  label: string; labelHe: string; value: unknown; sign: string
}) {
  const cls = sign === '+' ? 'text-green-600' : 'text-red-600'
  return (
    <div className="py-2 border-b border-gray-100 last:border-0">
      <div className="flex justify-between">
        <span className="text-sm text-gray-600">{label}</span>
        <span className={`text-sm font-medium ${cls}`}>{sign}{eur(value)}</span>
      </div>
      <div className="text-xs text-gray-400 mt-0.5 direction-rtl">{labelHe}</div>
    </div>
  )
}

function PLRow({
  label, value, sign
}: {
  label: string; value: unknown; sign: string
}) {
  return (
    <div className="flex justify-between text-sm py-2 border-b border-gray-100">
      <span className="text-gray-600">{label}</span>
      <span className={sign === '−' ? 'text-red-600' : 'text-green-600'}>
        {sign}{eur(value)}
      </span>
    </div>
  )
}

function Metric({
  label, labelHe, value, sub, highlight
}: {
  label: string; labelHe: string; value: string; sub: string; highlight: 'yellow' | 'none'
}) {
  const bg = highlight === 'yellow'
    ? 'bg-yellow-50 border-yellow-300'
    : 'bg-gray-50 border-gray-200'
  const textMain = highlight === 'yellow' ? 'text-yellow-700' : 'text-gray-700'
  const textSub = highlight === 'yellow' ? 'text-yellow-600' : 'text-gray-400'

  return (
    <div className={`rounded-lg border p-3 ${bg}`}>
      <div className={`text-xs mb-0.5 ${textMain}`}>{label}</div>
      <div className={`text-[10px] mb-2 ${textSub}`}>{labelHe}</div>
      <div className={`min-w-0 break-words text-xl font-bold ${textMain}`}>{value}</div>
      <div className={`text-[10px] mt-1 ${textSub}`}>{sub}</div>
    </div>
  )
}
