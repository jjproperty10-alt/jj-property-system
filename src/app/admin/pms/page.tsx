'use client';
// M0.4 — PMS/Ops Admin Console (in-app). Target path: src/app/admin/pms/page.tsx
// Auth: Supabase session (app's existing auth). Data: pms-admin-status v2 (rejects anon).
// No secrets/PII rendered. Fails closed: no session → redirect to /login.

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Dict = Record<string, any>;

export default function PmsAdminPage() {
  const [data, setData] = useState<Dict | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function call(fn: string, body: Dict = {}) {
    const { data: s } = await supa.auth.getSession();
    if (!s.session) { window.location.href = '/login'; throw new Error('no session'); }
    const r = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${fn}`,
      { method: 'POST',
        headers: { Authorization: `Bearer ${s.session.access_token}`,
                   apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                   'Content-Type': 'application/json' },
        body: JSON.stringify(body) });
    return await r.json();
  }

  const refresh = () => call('pms-admin-status').then(setData).catch(e => setErr(String(e)));
  useEffect(() => { refresh(); }, []);

  async function syncNow(entity: 'listings' | 'reservations') {
    setBusy(entity);
    try {
      if (entity === 'listings') await call('pms-hostaway-sync-listings');
      else {
        let offset = 0;
        for (let i = 0; i < 10; i++) {
          const r = await call('pms-hostaway-sync-reservations', { offset, maxPages: 2 });
          if (!r.ok || r.done) break;
          offset = r.nextOffset;
        }
      }
      await refresh();
    } finally { setBusy(null); }
  }

  if (err) return <div className="p-8 text-red-500">שגיאה: {err}</div>;
  if (!data) return <div className="p-8 text-slate-400">טוען נתוני תפעול…</div>;
  const c = data.counts ?? {};
  const hColor = (s: string) => s === 'green' ? 'border-emerald-500' : s === 'yellow' ? 'border-amber-500' : 'border-red-500';
  const hText  = (s: string) => s === 'green' ? 'text-emerald-500' : s === 'yellow' ? 'text-amber-500' : 'text-red-500';

  return (
    <div dir="rtl" className="p-6 space-y-6 text-slate-200 bg-slate-900 min-h-screen">
      <h1 className="text-xl font-bold">PMS · תפעול ובקרה
        <span className="text-sm text-slate-400 font-normal mr-3">
          {data.connection?.display_name} · {data.connection?.account_masked} ·
          connector v{data.provider?.connector_version} · pagination: {data.provider?.pagination?.active}
        </span>
      </h1>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(data.health ?? []).map((h: Dict) => (
          <div key={h.check_name} className={`bg-slate-800 rounded-lg p-3 border-r-4 ${hColor(h.status)}`}>
            <div className={`font-bold ${hText(h.status)}`}>{h.status?.toUpperCase()}</div>
            <div className="text-sm">{h.check_name}</div>
            <div className="text-xs text-slate-400">{h.value}</div>
          </div>
        ))}
      </section>

      <section className="flex gap-3 items-center">
        <button onClick={() => syncNow('listings')} disabled={!!busy}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg px-4 py-2">
          {busy === 'listings' ? 'מסנכרן…' : 'Sync נכסים'}
        </button>
        <button onClick={() => syncNow('reservations')} disabled={!!busy}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg px-4 py-2">
          {busy === 'reservations' ? 'מסנכרן…' : 'Sync הזמנות'}
        </button>
        <button onClick={refresh} className="bg-slate-700 rounded-lg px-4 py-2">רענן</button>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <Panel title="📈 Operational Metrics">
          <table className="w-full text-sm">{(data.metrics ?? []).map((m: Dict) =>
            <tr key={m.metric} className="border-t border-slate-700">
              <td className="py-1">{m.metric}</td><td className="text-slate-300">{m.value}</td></tr>)}
          </table>
        </Panel>
        <Panel title="⏰ Cron">
          <table className="w-full text-sm">{(data.cronJobs ?? []).map((j: Dict) =>
            <tr key={j.jobname} className="border-t border-slate-700">
              <td className="py-1">{j.jobname}</td><td>{j.schedule}</td>
              <td className={j.last_run?.status === 'succeeded' ? 'text-emerald-400' : 'text-slate-400'}>
                {j.last_run ? `${j.last_run.status} ${String(j.last_run.start).slice(11, 16)}` : '—'}</td></tr>)}
          </table>
        </Panel>
        <Panel title="🪝 Webhooks">
          {(data.webhooks ?? []).length === 0
            ? <div className="text-slate-400 text-sm">אין אירועים עדיין</div>
            : <table className="w-full text-sm">{data.webhooks.map((w: Dict, i: number) =>
                <tr key={i} className="border-t border-slate-700">
                  <td className="py-1">{w.event_type}</td><td>{w.external_id}</td>
                  <td>{w.status}</td><td className="text-slate-400">{String(w.received_at).slice(0, 19)}</td></tr>)}
              </table>}
        </Panel>
        <Panel title="🔁 ריצות אחרונות">
          <table className="w-full text-sm">{(data.runs ?? []).map((r: Dict, i: number) =>
            <tr key={i} className="border-t border-slate-700">
              <td className="py-1">{r.entity}</td><td>{r.trigger}</td>
              <td className={r.status === 'success' ? 'text-emerald-400' : 'text-red-400'}>{r.status}</td>
              <td className="text-slate-400">{String(r.started_at).slice(0, 19)}</td></tr>)}
          </table>
        </Panel>
      </section>

      <Panel title="🏠 Property Mappings (confidence + evidence)">
        <table className="w-full text-sm">
          <thead><tr className="text-slate-400 text-right">
            <th>Hostaway</th><th>נכס JJ</th><th>ביטחון</th><th>סטטוס</th><th>גרסה</th></tr></thead>
          <tbody>{(data.mappings ?? []).map((m: Dict) =>
            <tr key={m.external_id} className="border-t border-slate-700">
              <td className="py-1">{m.external_id}</td><td>{m.jj_property_name}</td>
              <td>{m.confidence_label} ({m.match_confidence})</td>
              <td className={m.status === 'approved' ? 'text-emerald-400' : 'text-amber-400'}>{m.status}</td>
              <td>{m.mapping_version}</td></tr>)}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <h2 className="text-sky-400 text-sm font-semibold mb-2">{title}</h2>
      {children}
    </div>
  );
}
