/**
 * CompanyOverview — CEO Workspace, Company tab.
 *
 * R2 Product Parity: lifts Sections A, C, F from legacy page.tsx
 * into the new CEO Workspace. No new accounting logic.
 *
 * Three sections:
 *   1. Cash Positions (v_cashbox_audit)
 *   2. Company P&L (v_jj_company_pl)
 *   3. Employee / Anastasia Clearing (v_anastasia_clearing)
 *
 * DS components used: SectionHeader, KpiCard, MoneyValue, StatusBadge.
 * All monetary values rendered via MoneyValue (LTR isolation, tabular nums).
 * P-ARCH-1: null → em dash, never 0.
 */

import { SectionHeader, KpiCard, MoneyValue, StatusBadge } from '@/components/ds'
import type { CompanyOverviewDTO } from '@/lib/ceo/companyDataService'

// ─── Helpers ─────────────────────────────────────────────────────────────

function balanceColor(v: number): string {
  if (v > 0) return 'text-emerald-700'
  if (v < 0) return 'text-rose-700'
  return 'text-gray-500'
}

function balanceBg(v: number): string {
  if (v > 0) return 'bg-emerald-50 border-emerald-200'
  if (v < 0) return 'bg-rose-50 border-rose-200'
  return 'bg-gray-50 border-gray-200'
}

// ─── Sub-components ──────────────────────────────────────────────────────

function PLRow({ label, amount, sign }: { label: string; amount: number; sign: '+' | '−' }) {
  return (
    <div className="flex justify-between text-sm py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-gray-600">{label}</span>
      <span className={sign === '−' ? 'text-rose-600' : 'text-emerald-600'}>
        {sign}
        <MoneyValue amount={amount} size="sm" />
      </span>
    </div>
  )
}

function FlowRow({ label, amount, sign }: { label: string; amount: number; sign: '+' | '−' }) {
  return (
    <div className="flex justify-between text-sm py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-gray-600">{label}</span>
      <span className={sign === '+' ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}>
        {sign}
        <MoneyValue amount={Math.abs(amount)} size="sm" />
      </span>
    </div>
  )
}

// ─── Section 1: Cash Positions ───────────────────────────────────────────

function CashPositionsSection({ dto }: { dto: CompanyOverviewDTO }) {
  const yossi = dto.cashboxes.find(c => c.cash_box_name === 'Yossi')
  const jacob = dto.cashboxes.find(c => c.cash_box_name === 'Jacob')
  const jjBox = dto.cashboxes.find(c => c.cash_box_name === 'JJ')
  const anastasiaOnHand = dto.anastasia?.cash_on_hand ?? 0
  const totalInternal = (yossi?.balance ?? 0) + (jacob?.balance ?? 0) + (jjBox?.balance ?? 0) + anastasiaOnHand

  return (
    <section>
      <SectionHeader title="Cash Positions" subtitle="Partner cashboxes and working capital" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
        {/* Yossi */}
        <div className="jj-tile">
          <div className="jj-label mb-1">Yossi</div>
          <div className={`text-xl font-bold tabular-nums ${balanceColor(yossi?.balance ?? 0)}`}>
            <MoneyValue amount={yossi?.balance ?? null} size="lg" />
          </div>
          <div className="mt-2 text-xs text-gray-400 space-y-0.5">
            <div>In: <MoneyValue amount={yossi?.total_received ?? null} size="sm" /></div>
            <div>Out: <MoneyValue amount={yossi?.total_paid ?? null} size="sm" /></div>
          </div>
        </div>

        {/* Jacob */}
        <div className="jj-tile">
          <div className="jj-label mb-1">Jacob</div>
          <div className={`text-xl font-bold tabular-nums ${balanceColor(jacob?.balance ?? 0)}`}>
            <MoneyValue amount={jacob?.balance ?? null} size="lg" />
          </div>
          <div className="mt-2 text-xs text-gray-400 space-y-0.5">
            <div>In: <MoneyValue amount={jacob?.total_received ?? null} size="sm" /></div>
            <div>Out: <MoneyValue amount={jacob?.total_paid ?? null} size="sm" /></div>
          </div>
        </div>

        {/* JJ Company */}
        <div className="jj-tile">
          <div className="jj-label mb-1">JJ Company</div>
          <div className={`text-xl font-bold tabular-nums ${balanceColor(jjBox?.balance ?? 0)}`}>
            <MoneyValue amount={jjBox?.balance ?? null} size="lg" />
          </div>
          <div className="mt-2 text-xs text-gray-400 space-y-0.5">
            <div>In: <MoneyValue amount={jjBox?.total_received ?? null} size="sm" /></div>
            <div>Out: <MoneyValue amount={jjBox?.total_paid ?? null} size="sm" /></div>
          </div>
        </div>

        {/* Anastasia — cash on hand */}
        <div className="jj-tile border-amber-200">
          <div className="jj-label mb-1">Anastasia</div>
          <div className="text-xl font-bold tabular-nums text-amber-700">
            <MoneyValue amount={anastasiaOnHand} size="lg" />
          </div>
          <div className="mt-2 text-xs text-amber-600">Cash on hand</div>
        </div>

        {/* Total Internal */}
        <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
          <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Total</div>
          <div className={`text-xl font-bold tabular-nums ${totalInternal >= 0 ? 'text-white' : 'text-rose-400'}`}>
            <MoneyValue amount={totalInternal} size="lg" className={totalInternal >= 0 ? 'text-white' : 'text-rose-400'} />
          </div>
          <div className="mt-2 text-xs text-gray-500">Yossi + Jacob + JJ + Anastasia</div>
        </div>
      </div>
    </section>
  )
}

// ─── Section 2: Company P&L ──────────────────────────────────────────────

function CompanyPLSection({ dto }: { dto: CompanyOverviewDTO }) {
  const pl = dto.pl
  if (!pl) {
    return (
      <section>
        <SectionHeader title="Company P&L" subtitle="JJ Ltd profit and loss" />
        <div className="jj-tile mt-4 text-center text-sm text-gray-400">
          Company P&L data is not available.
        </div>
      </section>
    )
  }

  return (
    <section>
      <SectionHeader
        title="Company P&L"
        subtitle="JJ Ltd profit and loss"
        action={<span>{pl.transaction_count} transactions</span>}
      />
      <div className="jj-tile mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left: Income + Payroll */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-emerald-700 mb-3">Income</div>
            <PLRow label="JJ income" amount={pl.jj_income} sign="+" />

            <div className="text-xs font-semibold uppercase tracking-widest text-gray-500 mt-5 mb-3">Payroll</div>
            <PLRow label="Salary — Anastasia" amount={pl.salary_anastasia} sign="−" />
            <PLRow label="Salary — Fabi" amount={pl.salary_fabi} sign="−" />
            <div className="flex justify-between text-sm font-semibold py-2.5 border-t mt-1">
              <span className="text-gray-700">Total payroll</span>
              <span className="text-rose-600">−<MoneyValue amount={pl.total_payroll} size="sm" /></span>
            </div>
          </div>

          {/* Right: Operating Expenses */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">Expenses</div>
            <PLRow label="Office expenses" amount={pl.office_expenses} sign="−" />
            <PLRow label="Marketing / platform" amount={pl.marketing_platform} sign="−" />
            <PLRow label="Other expenses" amount={pl.other_expenses} sign="−" />
            <div className="flex justify-between text-sm font-semibold py-2.5 border-t mt-1">
              <span className="text-gray-700">Total expenses</span>
              <span className="text-rose-600">−<MoneyValue amount={pl.total_expenses} size="sm" /></span>
            </div>
          </div>
        </div>

        {/* Net P&L bar */}
        <div className={`mt-6 rounded-xl border p-5 flex items-center justify-between ${balanceBg(pl.net_company_pl)}`}>
          <div>
            <div className={`font-semibold ${balanceColor(pl.net_company_pl)}`}>
              Net Company P&L
            </div>
            <div className={`text-sm mt-0.5 ${balanceColor(pl.net_company_pl)}`}>
              Income <MoneyValue amount={pl.jj_income} size="sm" /> − Expenses <MoneyValue amount={pl.total_expenses} size="sm" />
            </div>
          </div>
          <div className={`text-3xl font-bold ${balanceColor(pl.net_company_pl)}`}>
            <MoneyValue amount={pl.net_company_pl} size="xl" />
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Section 3: Anastasia Clearing ───────────────────────────────────────

function AnastasiaClearingSection({ dto }: { dto: CompanyOverviewDTO }) {
  const a = dto.anastasia
  if (!a) {
    return (
      <section>
        <SectionHeader title="Employee Clearing" subtitle="Anastasia Kravchenko" />
        <div className="jj-tile mt-4 text-center text-sm text-gray-400">
          Employee clearing data is not available.
        </div>
      </section>
    )
  }

  const totalIn = a.cash_collected + a.cash_transfers_in
  const totalOut = a.cash_transferred_out + a.expenses_paid

  return (
    <section>
      <SectionHeader
        title="Employee Clearing"
        subtitle="Anastasia Kravchenko"
        badge={
          a.anastasia_owes_jj > 0
            ? <StatusBadge status="attention" label="Owes JJ" />
            : <StatusBadge status="active" label="Settled" />
        }
        action={<span>{a.tx_as_payer} as payer · {a.tx_as_payee} as payee</span>}
      />
      <div className="jj-tile mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Money In */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-emerald-700 mb-3">Money in</div>
            <FlowRow label="Cash collected" amount={a.cash_collected} sign="+" />
            <FlowRow label="Transfers received" amount={a.cash_transfers_in} sign="+" />
            <div className="flex justify-between items-baseline pt-3 mt-1 border-t border-emerald-200">
              <span className="text-sm font-semibold text-emerald-800">Total in</span>
              <span className="text-base font-bold text-emerald-700">+<MoneyValue amount={totalIn} size="md" /></span>
            </div>
          </div>

          {/* Money Out */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-rose-700 mb-3">Money out</div>
            <FlowRow label="Transfers sent" amount={a.cash_transferred_out} sign="−" />
            <FlowRow label="Expenses paid for company" amount={a.expenses_paid} sign="−" />
            <div className="text-xs text-gray-400 py-1 pl-4 italic">
              of which: Fabi salary <MoneyValue amount={a.fabi_salary_paid} size="sm" className="text-gray-400" />
            </div>
            <div className="flex justify-between items-baseline pt-3 mt-1 border-t border-rose-200">
              <span className="text-sm font-semibold text-rose-800">Total out</span>
              <span className="text-base font-bold text-rose-700">−<MoneyValue amount={totalOut} size="md" /></span>
            </div>
          </div>
        </div>

        {/* Result metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 border-t pt-5">
          <KpiCard
            label="Cash on hand"
            value={<MoneyValue amount={a.cash_on_hand} size="lg" className="text-amber-700" />}
            trend="= Total in − Total out"
            className={a.cash_on_hand > 0 ? 'border-amber-200 bg-amber-50' : ''}
          />
          <KpiCard
            label="Anastasia owes JJ"
            value={<MoneyValue amount={a.anastasia_owes_jj} size="lg" className={a.anastasia_owes_jj > 0 ? 'text-amber-700' : ''} />}
            trend="GREATEST(0, cash_on_hand)"
            className={a.anastasia_owes_jj > 0 ? 'border-amber-200 bg-amber-50' : ''}
          />
          <KpiCard
            label="JJ owes Anastasia"
            value={<MoneyValue amount={a.jj_owes_anastasia} size="lg" />}
            trend="GREATEST(0, −cash_on_hand)"
          />
          <KpiCard
            label="Salary received"
            value={<MoneyValue amount={a.salary_received} size="lg" />}
            trend="Personal compensation"
          />
        </div>
      </div>
    </section>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────

export function CompanyOverview({ dto }: { dto: CompanyOverviewDTO }) {
  return (
    <div className="space-y-8">
      {dto.errors.length > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Data fetch errors: {dto.errors.join(' · ')}
        </div>
      )}
      <CashPositionsSection dto={dto} />
      <CompanyPLSection dto={dto} />
      <AnastasiaClearingSection dto={dto} />
    </div>
  )
}
