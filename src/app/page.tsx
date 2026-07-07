// ============================================================
// JJ PROPERTY 10 — CEO Dashboard (Engine v1.0)
// File: app/page.tsx  ← replace the existing file with this
// ============================================================
//
// Section A — Cashboxes          → v_cashbox_audit
// Section B — Partner Settlement → v_settlement_verification
// Section C — Anastasia Clearing → v_anastasia_clearing
// Section D — Owner/Client Bal.  → v_ceo_summary
// Section E — Profit Overview    → v_ceo_summary
// Section F — Company P&L        → v_jj_company_pl
//
// Verified source values (10 Jun 2026):
//   Yossi  balance: −36,671.82
//   Jacob  balance: +74,079.54
//   JJ     balance: +66,644.71
//   Settlement:     €55,375.68  (Jacob → Yossi)
//   Anastasia owes JJ: €7,082.69
//   Total cash position profit: €293,321.90
//   Net company P&L: €10,719.61
// ============================================================

import { createClient } from '@supabase/supabase-js'

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

interface CashboxRow {
  cash_box_name: string
  total_received: number | string
  total_paid: number | string
  balance: number | string
  transaction_count_received: number | string
  transaction_count_paid: number | string
}

interface Settlement {
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

interface AnastasiaClearing {
  cash_collected: number | string
  cash_transfers_in: number | string
  cash_transferred_out: number | string
  expenses_paid: number | string
  fabi_salary_paid: number | string
  salary_received: number | string
  cash_on_hand: number | string
  anastasia_owes_jj: number | string
  jj_owes_anastasia: number | string
  tx_as_payer: number
  tx_as_payee: number
}

interface CeoSummary {
  // Profit (v1.0 columns only — do NOT use deprecated columns)
  total_cash_position_profit: number | string
  total_contract_profit: number | string
  cash_contract_gap: number | string
  client_cash_position_profit: number | string
  jj_own_cash_profit: number | string
  partnership_jj_cash_profit: number | string
  company_cash_profit: number | string
  // Balances
  due_to_owners: number | string
  reno_receivables: number | string
  sale_receivables: number | string
  total_receivables: number | string
}

interface CompanyPL {
  jj_income: number | string
  salary_anastasia: number | string
  salary_fabi: number | string
  total_payroll: number | string
  office_expenses: number | string
  marketing_platform: number | string
  other_expenses: number | string
  total_expenses: number | string
  net_company_pl: number | string
  transaction_count: number | string
}

// ---- Helpers ----

// eur() accepts unknown since Supabase numeric fields arrive as strings at runtime
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

// ---- Supabase (server-side only) ----

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

// ---- Data Fetching ----

async function fetchAll() {
  const sb = getSupabase()

  const [cashboxRes, settlementRes, anastasiaRes, summaryRes, plRes] = await Promise.all([
    sb.from('v_cashbox_audit').select('*').order('cash_box_name'),
    sb.from('v_settlement_verification').select('*').single(),
    sb.from('v_anastasia_clearing').select('*').single(),
    sb.from('v_ceo_summary').select(
      'total_cash_position_profit,total_contract_profit,cash_contract_gap,' +
      'client_cash_position_profit,jj_own_cash_profit,partnership_jj_cash_profit,company_cash_profit,' +
      'due_to_owners,reno_receivables,sale_receivables,total_receivables'
    ).single(),
    sb.from('v_jj_company_pl').select('*').single(),
  ])

  return {
    cashboxes: (cashboxRes.data ?? []) as CashboxRow[],
    settlement: settlementRes.data as Settlement | null,
    anastasia: anastasiaRes.data as AnastasiaClearing | null,
    summary: summaryRes.data as CeoSummary | null,
    pl: plRes.data as CompanyPL | null,
    errors: [cashboxRes.error, settlementRes.error, anastasiaRes.error, summaryRes.error, plRes.error]
      .filter(Boolean)
      .map(e => e?.message),
  }
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
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
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

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-8">

        {/* ══ SECTION A — Cashboxes ══ */}
        <section id="cashboxes">
          <SectionHeader letter="A" en="Cashboxes" he="קופות מזומן" source="v_cashbox_audit" />
          <div className="grid grid-cols-5 gap-3">

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
              <div className="text-2xl font-semibold text-yellow-600 mt-1">
                {eur(anastasia?.cash_on_hand)}
              </div>
              <div className="text-xs text-yellow-600 mt-1">Anastasia owes JJ · חייבת</div>
              <div className="text-[10px] text-gray-300 mt-auto pt-2">v_anastasia_clearing</div>
            </div>

            {/* Total */}
            <div className="bg-gray-900 rounded-xl border border-gray-700 p-4 flex flex-col">
              <div className="text-xs text-gray-400">Total Internal Cash</div>
              <div className={`text-2xl font-semibold mt-1 ${totalInternal >= 0 ? 'text-white' : 'text-red-400'}`}>
                {eur(totalInternal, true)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Yossi + Jacob + JJ + Anastasia</div>
              <div className="text-[10px] text-gray-600 mt-auto pt-2">Combined</div>
            </div>
          </div>
        </section>

        {/* ══ SECTION B — Settlement ══ */}
        <section id="settlement">
          <SectionHeader letter="B" en="Partner Settlement" he="סילוק בין שותפים" source="v_settlement_verification" />
          <div className="bg-white rounded-xl border border-blue-200 p-6">
            <div className="flex gap-8 items-start">

              {/* Main result */}
              <div className="flex-1">
                <div className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-2">
                  Official Result · v_settlement_verification ✓ authoritative
                </div>
                <div className="flex items-baseline gap-3 mb-3">
                  <span className="text-4xl font-bold text-blue-700">
                    {eur(settlement?.settlement_amount)}
                  </span>
                  <span className="text-xl text-blue-600">
                    {settlement?.transfer_direction ?? 'Jacob pays Yossi'}
                  </span>
                  <span className="text-base text-blue-500">ג׳ייקוב משלם ליוסי</span>
                </div>
                <p className="text-sm text-gray-500">
                  Formula: ABS(Yossi − Jacob) ÷ 2
                </p>
                <p className="text-sm text-gray-500 mt-0.5">
                  = ABS({eur(settlement?.yossi_cashbox_balance, true)} − {eur(settlement?.jacob_cashbox_balance, true)}) ÷ 2
                </p>
                <div className="mt-3 flex items-center gap-4 text-sm">
                  <span className={color(yossi?.balance)}>Yossi: {eur(yossi?.balance, true)}</span>
                  <span className="text-gray-300">·</span>
                  <span className={color(jacob?.balance)}>Jacob: {eur(jacob?.balance, true)}</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-gray-500">Delta: {eur(Math.abs(n(settlement?.settlement_delta)))} ÷ 2</span>
                </div>
              </div>

              {/* Context divider */}
              <div className="w-px bg-gray-200 self-stretch" />

              {/* Context only */}
              <div className="w-60">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Context only · הקשר
                </div>
                {[
                  ['JJ cashbox total', settlement?.jj_cashbox_total],
                  ['JJ ÷ 2 per partner', settlement?.jj_cashbox_per_partner],
                  ['Anastasia asset ÷ 2', settlement?.anastasia_asset_per_partner],
                  ['Due to owners ÷ 2', settlement?.due_to_owners_per_partner],
                ].map(([label, val]) => (
                  <div key={String(label)} className="flex justify-between text-sm py-1.5 border-b border-gray-100 last:border-0">
                    <span className="text-gray-500">{String(label)}</span>
                    <span className="text-gray-400">{eur(val as number)}</span>
                  </div>
                ))}
                <p className="text-[10px] text-gray-300 mt-2">
                  Identical for both partners → cancel in delta
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ══ SECTION C — Anastasia Clearing ══ */}
        <section id="anastasia">
          <SectionHeader letter="C" en="Anastasia Clearing" he="סליקת אנסטסיה" source="v_anastasia_clearing" />
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between mb-5">
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

            <div className="grid grid-cols-2 gap-8">
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
            <div className="grid grid-cols-5 gap-3 mt-6 border-t pt-5">
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
          <div className="grid grid-cols-2 gap-4">

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
              <div className="text-4xl font-bold text-red-600 mb-3">
                {eur(summary?.due_to_owners)}
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
                  <span className="font-semibold text-green-600">{eur(summary?.reno_receivables)}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-gray-600">Sale receivables</span>
                  <span className="font-semibold text-green-600">{eur(summary?.sale_receivables)}</span>
                </div>
                <div className="flex justify-between items-baseline border-t pt-2.5">
                  <span className="font-semibold text-gray-800">Total receivables</span>
                  <span className="text-2xl font-bold text-green-700">{eur(summary?.total_receivables)}</span>
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
            <div className="grid grid-cols-3 gap-6 pb-5 mb-5 border-b">
              <div>
                <div className="text-xs text-gray-500">Total Cash Position Profit</div>
                <div className="text-xs text-gray-400 mt-0.5">רווח מצב מזומן כולל</div>
                <div className={`text-4xl font-bold mt-2 ${color(summary?.total_cash_position_profit)}`}>
                  {eur(summary?.total_cash_position_profit, true)}
                </div>
                <div className="text-xs text-gray-400 mt-1">Cash basis · all 4 segments</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Total Contract Profit</div>
                <div className="text-xs text-gray-400 mt-0.5">רווח חוזי כולל</div>
                <div className={`text-4xl font-bold mt-2 ${color(summary?.total_contract_profit)}`}>
                  {eur(summary?.total_contract_profit, true)}
                </div>
                <div className="text-xs text-gray-400 mt-1">Accrual basis · all 4 segments</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Cash–Contract Gap</div>
                <div className="text-xs text-gray-400 mt-0.5">פער מזומן / חוזה</div>
                <div className={`text-4xl font-bold mt-2 ${color(summary?.cash_contract_gap)}`}>
                  {eur(summary?.cash_contract_gap)}
                </div>
                <div className="text-xs text-gray-400 mt-1">Cash received vs. accrual value</div>
              </div>
            </div>

            {/* 4-segment breakdown */}
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              By segment · לפי מגזר
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Client-managed', labelHe: 'נכסי לקוחות', val: summary?.client_cash_position_profit, sub: 'Mgmt + deals realized' },
                { label: 'JJ-owned', labelHe: 'נכסי JJ', val: summary?.jj_own_cash_profit, sub: 'After capital invested' },
                { label: 'Partnership', labelHe: 'שותפות', val: summary?.partnership_jj_cash_profit, sub: "JJ's share after capital" },
                { label: 'Company P&L', labelHe: 'חברה', val: summary?.company_cash_profit, sub: 'Net company P&L' },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 rounded-lg p-4">
                  <div className="text-xs text-gray-500">{s.label}</div>
                  <div className="text-xs text-gray-400 mb-2">{s.labelHe}</div>
                  <div className={`text-2xl font-semibold ${color(s.val)}`}>
                    {eur(s.val, true)}
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
            <div className="grid grid-cols-2 gap-10">

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
            <div className={`mt-6 rounded-xl border p-5 flex items-center justify-between ${bgColor(pl?.net_company_pl)}`}>
              <div>
                <div className={`font-semibold text-base ${color(pl?.net_company_pl)}`}>
                  Net Company P&L · רווח נקי חברה
                </div>
                <div className={`text-sm mt-0.5 ${color(pl?.net_company_pl)}`}>
                  Income {eur(pl?.jj_income)} − Expenses {eur(pl?.total_expenses)}
                </div>
              </div>
              <div className={`text-4xl font-bold ${color(pl?.net_company_pl)}`}>
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
    <div className="flex items-center gap-3 mb-3">
      <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0">
        {letter}
      </div>
      <div>
        <span className="text-sm font-semibold text-gray-700">{en}</span>
        <span className="text-xs text-gray-400 ml-2">{he}</span>
      </div>
      <span className="ml-auto text-[10px] text-gray-300 font-mono">{source}</span>
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
      <div className={`text-2xl font-semibold mt-1 ${color(balance)}`}>
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
      <div className={`text-xl font-bold ${textMain}`}>{value}</div>
      <div className={`text-[10px] mt-1 ${textSub}`}>{sub}</div>
    </div>
  )
}
