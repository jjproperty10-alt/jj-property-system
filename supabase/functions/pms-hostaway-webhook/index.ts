// PMS — Hostaway Unified Webhook receiver — v1.0 (M0.1)
// verify_jwt=false (Hostaway can't send our JWT) → protected by Basic auth against vault secret.
// PRINCIPLE (ADR §5): payload is a TRIGGER, never truth — stored to raw_events + fires a targeted sync.
import postgres from 'npm:postgres@3.4.4'

const SENSITIVE_KEYS = new Set(['ccnumber','cvc','cvv','cardnumber','creditcardnumber','cardsecuritycode','expirymonth','expiryyear','expirationdate','magneticstripe','trackdata','pin','ccexpirationmonth','ccexpirationyear','ccname','paymenttoken','cardtoken'])
function walk(v: any, removed: Record<string, number>): any {
  if (Array.isArray(v)) return v.map((x) => walk(x, removed))
  if (v !== null && typeof v === 'object') {
    const out: Record<string, any> = {}
    for (const [k, val] of Object.entries(v)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) removed[k] = (removed[k] || 0) + 1
      else out[k] = walk(val, removed)
    }
    return out
  }
  return v
}

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false })
  try {
    // Basic auth gate
    const auth = req.headers.get('authorization') || ''
    let ok = false
    if (auth.startsWith('Basic ')) {
      const [login, pw] = atob(auth.slice(6)).split(':')
      const row = await sql`select decrypted_secret from vault.decrypted_secrets where name='hostaway_webhook_auth'`
      ok = login === 'jj-webhook' && pw === row[0]?.decrypted_secret
    }
    if (!ok) { await sql.end(); return new Response('unauthorized', { status: 401 }) }

    const payload0 = await req.json().catch(() => ({}))
    const removed: Record<string, number> = {}
    const payload = walk(payload0, removed) // sanitize BEFORE persist — 4.1 rule applies to raw_events too
    const eventType = payload?.event ?? payload?.eventType ?? 'unknown'
    const externalId = payload?.reservationId ?? payload?.id ?? payload?.data?.id ?? null
    const hash = await sha256(JSON.stringify(payload))

    const conn = await sql`select id from pms.connections where provider='hostaway' and status='active' limit 1`
    if (!conn.length) { await sql.end(); return new Response('no connection', { status: 200 }) }

    await sql`insert into pms.raw_events (connection_id, source, event_type, external_id, payload, dedupe_hash, status)
      values (${conn[0].id}, 'webhook', ${String(eventType)}, ${externalId != null ? String(externalId) : null}, ${sql.json(payload)}, ${hash}, 'received')
      on conflict (connection_id, dedupe_hash) do nothing`

    // trigger, not truth: fire a full incremental pass (small scale) — fetches the actual state from the API
    await sql`select ops.invoke_pms_function('pms-hostaway-sync-reservations', '{"offset":0,"maxPages":6,"trigger":"webhook"}'::jsonb)`
    await sql`update pms.raw_events set status='queued', processed_at=now()
      where connection_id=${conn[0].id} and dedupe_hash=${hash}`

    await sql.end()
    return new Response('ok', { status: 200 }) // fast 200 — Hostaway retries only 3 times
  } catch (_e) {
    try { await sql.end() } catch (_) { /* ignore */ }
    return new Response('ok', { status: 200 }) // never make Hostaway drop us over our own error; reconciliation covers
  }
})
