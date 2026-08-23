/**
 * @module components/partner-settlement/PartnerReportBView
 * @description Stage 1 presentation for Partner Report B. Pure props, no hooks — safe
 * to server-render (and to render in tests via renderToStaticMarkup).
 *
 * Self-contained on purpose: Stage 1 does not modify or extract shared components
 * (report overlap must be reported before touching shared files). It reuses only
 * layout conventions.
 *
 * Enforces 12f: the headline never asserts a final debtor/creditor unless the gate
 * certifies. Otherwise it shows the status, the blocking reasons, and the unresolved
 * queue — never a misleading "who owes whom".
 */

import type {
  PartnerReportB, CashboxView, AccountView, PropertyView, UnresolvedItem, ExplainNode,
} from '@/lib/partner-settlement/partnerReportBTypes'

const eur = (n: number | null): string =>
  n === null ? '—'
    : new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    CERTIFIED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    PARTIAL: 'bg-amber-50 text-amber-700 border-amber-200',
    PENDING_RECONCILIATION: 'bg-amber-50 text-amber-800 border-amber-200',
    PENDING: 'bg-gray-100 text-gray-600 border-gray-200',
    LEGACY: 'bg-gray-100 text-gray-600 border-gray-200',
    UNRESOLVED: 'bg-red-50 text-red-700 border-red-200',
    LEDGER_ONLY: 'bg-amber-50 text-amber-700 border-amber-200',
    RECONCILED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    DISCREPANCY: 'bg-red-50 text-red-700 border-red-200',
  }
  const cls = map[status] ?? 'bg-gray-100 text-gray-600 border-gray-200'
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>{status.replace(/_/g, ' ')}</span>
}

function Explain({ nodes }: { nodes: readonly ExplainNode[] }) {
  if (nodes.length === 0) return null
  return (
    <details className="mt-2 text-xs text-gray-600">
      <summary className="cursor-pointer select-none text-blue-700">Explain this number</summary>
      <ul className="mt-1 space-y-0.5 pl-4">
        {nodes.map((n, i) => (
          <li key={i} className="tabular-nums" dir="ltr">
            {n.label}: {eur(n.amountEur)}{' '}
            <span className="text-gray-400">
              ← {n.tracesTo.map(t => t.ref ? `${t.system}(${t.ref})` : t.system).join(', ')}
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}

function HeadlineBanner({ dto }: { dto: PartnerReportB }) {
  const h = dto.equalization.headline
  // QA fix #6: BOTH conditions required. A hand-built CERTIFIED DTO with
  // canAssertDebtorCreditor=false must not render a debtor/creditor sentence.
  const certified = h.certificationStatus === 'CERTIFIED' && h.canAssertDebtorCreditor === true
  return (
    <section
      data-testid="prb-headline"
      data-certification={h.certificationStatus}
      className={`rounded-xl border p-5 ${certified ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-600">Yossi ↔ Jacob equalization</h2>
        <StatusPill status={h.certificationStatus} />
      </div>
      {certified && h.debtor ? (
        <p className="mt-2 text-2xl font-extrabold text-gray-900">{h.debtor} owes {h.creditor} {eur(h.amountEur)}</p>
      ) : (
        <>
          <p className="mt-2 text-lg font-semibold text-amber-900">
            No final “who owes whom” — result is not certified.
          </p>
          <p className="mt-1 text-sm text-amber-800">
            {dto.equalization.unresolvedCount} unresolved item(s). This is a framework view (Stage 1); the consolidated balance is intentionally not asserted on partial data.
          </p>
          {h.blockingReasons.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">
              {h.blockingReasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

function CashboxTable({ boxes }: { boxes: readonly CashboxView[] }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-600">Cashboxes</h3>
        <span className="text-xs text-gray-500">Ledger position — not verified available cash</span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-2 pr-3">Cashbox</th><th className="py-2 pr-3">Kind</th>
              <th className="py-2 pr-3 text-right">Ledger</th><th className="py-2 pr-3 text-right">Verified</th>
              <th className="py-2 pr-3 text-right">Diff</th><th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {boxes.map((b, i) => (
              <tr key={i}>
                <td className="py-2 pr-3 font-medium text-gray-800">{b.name}</td>
                <td className="py-2 pr-3 text-xs text-gray-500">{b.kind}</td>
                <td className="py-2 pr-3 text-right tabular-nums" dir="ltr">{eur(b.ledgerCashPosition)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-gray-400" dir="ltr">{eur(b.verifiedBankOrPhysicalCash)}</td>
                <td className="py-2 pr-3 text-right tabular-nums" dir="ltr">{eur(b.reconciliationDifference)}</td>
                <td className="py-2"><StatusPill status={b.verificationStatus} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function AccountBlock({ a }: { a: AccountView }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold capitalize text-gray-800">{a.accountType.replace('_', ' ')}</span>
        <StatusPill status={a.status} />
      </div>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded border border-gray-100 bg-white p-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">A · Economic</div>
          <div className="text-xs text-gray-700">Income {eur(a.economic.income)} · Exp {eur(a.economic.expenses)}</div>
          <div className="text-xs text-gray-500">Profit {a.economic.profitOrLoss === null ? 'PENDING' : eur(a.economic.profitOrLoss)}</div>
        </div>
        <div className="rounded border border-gray-100 bg-white p-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">B · Cash</div>
          <div className="text-xs text-gray-700">In {eur(a.cash.received)} · Out {eur(a.cash.paid)}</div>
          <div className="text-xs text-gray-400">by-party: Stage 2/3</div>
        </div>
        <div className="rounded border border-gray-100 bg-white p-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">C · Rights</div>
          <div className="text-xs text-gray-700">Contract {eur(a.rights.contractValue)} · Recv {eur(a.rights.receivable)}</div>
          <div className="text-xs text-gray-500">Commitments {a.rights.commitments === null ? 'PENDING' : eur(a.rights.commitments)}</div>
        </div>
      </div>
      <Explain nodes={a.explain} />
    </div>
  )
}

function PropertyBlock({ p }: { p: PropertyView }) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-900">{p.propertyName}</h3>
          <p className="text-xs text-gray-500">{p.relationshipType ?? 'relationship: —'}</p>
        </div>
        <StatusPill status={p.status} />
      </div>
      {p.ownership.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {p.ownership.map((o, i) => (
            <span key={i} className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] text-gray-600">
              {o.party} · {o.pct === null ? '—' : `${o.pct}%`} · {o.confidence}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 space-y-2">
        {p.accounts.map((a, i) => <AccountBlock key={i} a={a} />)}
        {p.accounts.length === 0 && <p className="text-xs italic text-gray-400">No RC3 account data for this property in period.</p>}
      </div>
    </article>
  )
}

function UnresolvedQueue({ items }: { items: readonly UnresolvedItem[] }) {
  if (items.length === 0) return null
  return (
    <section data-testid="prb-unresolved" className="rounded-xl border border-red-200 bg-red-50/50 p-4">
      <h3 className="text-xs font-bold uppercase tracking-widest text-red-700">Unresolved / Pending ({items.length})</h3>
      <ul className="mt-2 space-y-1 text-xs text-red-800">
        {items.map((u, i) => (
          <li key={i}><span className="font-semibold">{u.kind}</span> · {u.ref} — {u.reason}</li>
        ))}
      </ul>
    </section>
  )
}

export function PartnerReportBView({ dto }: { dto: PartnerReportB }) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header>
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-400">JJ Property 10 · Partner Report B (Stage 1)</p>
        <h1 className="text-2xl font-extrabold text-gray-900">Partner Settlement — {dto.meta.periodStart} → {dto.meta.periodEnd}</h1>
        <p className="mt-1 text-xs text-gray-500">Framework view · read-only · consolidated headline gated</p>
      </header>

      <HeadlineBanner dto={dto} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CashboxTable boxes={dto.cashboxes} />
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-600">JJ position &amp; partner current accounts</h3>
          <div className="mt-2 space-y-1 text-sm text-gray-700">
            <div>JJ economic profit: {eur(dto.jjPosition.economicProfit)} <StatusPill status={dto.jjPosition.economicProfitStatus} /></div>
            <div>JJ actual cash (ledger): {eur(dto.jjPosition.actualCashLedger)} <StatusPill status={dto.jjPosition.cashVerificationStatus} /></div>
            <div>Receivables: {eur(dto.jjPosition.receivables)} · Payables: {eur(dto.jjPosition.payables)} <StatusPill status={dto.jjPosition.receivablesScope} /></div>
            <div className="pt-2">
              {dto.partnerCurrentAccounts.map((pa, i) => (
                <div key={i}>{pa.party} current account (ledger): {eur(pa.ledgerBalanceEur)} <StatusPill status={pa.status} /></div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <UnresolvedQueue items={dto.unresolved} />

      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-600">Properties &amp; accounts</h3>
        {dto.properties.map((p, i) => <PropertyBlock key={i} p={p} />)}
      </section>

      <footer className="border-t border-gray-100 pt-4 text-center text-xs text-gray-400">
        {dto.meta.currency} · generated {dto.meta.generatedAt} · Stage 1 framework · no certified consolidated balance
      </footer>
    </div>
  )
}
