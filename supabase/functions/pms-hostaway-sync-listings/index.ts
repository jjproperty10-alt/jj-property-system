// PMS Connector — Hostaway listings sync — v0.3.0 (M0.1 / D1 tenant-neutral fix + trigger param)
import postgres from 'npm:postgres@3.4.4'

const CONNECTOR_VERSION = '0.3.0'
const SANITIZER_VERSION = '1.0.0'
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
function sanitizePayload(p: any) { const removed: Record<string, number> = {}; return { sanitized: walk(p, removed), removed } }

const CORS: Record<string, string> = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', ...CORS } })
async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false })
  let runId: string | null = null
  try {
    const params = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const trigger: string = params.trigger === 'cron' ? 'cron' : 'manual'

    const conn = await sql`select id, external_account_id, credentials_ref from pms.connections
      where provider='hostaway' and status='active' limit 1`
    if (!conn.length) return json({ ok: false, stage: 'connection', error: 'no active hostaway connection' })
    const connectionId = conn[0].id
    const accountId = conn[0].external_account_id
    const secretRow = await sql`select decrypted_secret from vault.decrypted_secrets where name=${conn[0].credentials_ref}`
    const clientSecret = secretRow[0]?.decrypted_secret
    if (!accountId || !clientSecret) return json({ ok: false, stage: 'vault', error: 'credentials unresolved via credentials_ref' })

    const run = await sql`insert into pms.sync_runs (connection_id, entity, trigger, connector_version, status)
      values (${connectionId}, 'properties', ${trigger}, ${CONNECTOR_VERSION}, 'running') returning id`
    runId = run[0].id

    const tokenRes = await fetch('https://api.hostaway.com/v1/accessTokens', {
      method: 'POST',
      headers: { 'Content-type': 'application/x-www-form-urlencoded', 'Cache-control': 'no-cache' },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(accountId)}&client_secret=${encodeURIComponent(clientSecret)}&scope=general`,
    })
    if (!tokenRes.ok) throw new Error(`token HTTP ${tokenRes.status}`)
    const accessToken = (await tokenRes.json())?.access_token

    const listRes = await fetch('https://api.hostaway.com/v1/listings?limit=500', {
      headers: { Authorization: `Bearer ${accessToken}`, 'Cache-control': 'no-cache' },
    })
    if (!listRes.ok) throw new Error(`listings HTTP ${listRes.status}`)
    const body = await listRes.json()
    const listings: any[] = Array.isArray(body?.result) ? body.result : []
    const hostawayCount: number | null = typeof body?.count === 'number' ? body.count : listings.length

    let inserted = 0, updated = 0, unchanged = 0
    const sanitizedAudit: Record<string, number> = {}
    for (const l0 of listings) {
      const { sanitized: l, removed } = sanitizePayload(l0)
      for (const [k, n] of Object.entries(removed)) sanitizedAudit[k] = (sanitizedAudit[k] || 0) + n
      const externalId = String(l.id)
      const hash = await sha256(JSON.stringify(l))
      const cur = await sql`select id, raw_hash, version from pms.raw_properties
        where connection_id=${connectionId} and external_id=${externalId} and is_current`
      if (!cur.length) {
        const maxv = await sql`select coalesce(max(version),0) as v from pms.raw_properties
          where connection_id=${connectionId} and external_id=${externalId}`
        await sql`insert into pms.raw_properties
          (connection_id, provider, external_id, raw, raw_hash, version, is_current, provider_updated_at, sync_run_id)
          values (${connectionId}, 'hostaway', ${externalId}, ${sql.json(l)}, ${hash}, ${maxv[0].v + 1}, true, ${l.latestActivityOn ?? null}, ${runId})`
        inserted++
      } else if (cur[0].raw_hash === hash) {
        await sql`update pms.raw_properties set synced_at=now(), sync_run_id=${runId} where id=${cur[0].id}`
        unchanged++
      } else {
        await sql`update pms.raw_properties set is_current=false where id=${cur[0].id}`
        await sql`insert into pms.raw_properties
          (connection_id, provider, external_id, raw, raw_hash, version, is_current, provider_updated_at, sync_run_id)
          values (${connectionId}, 'hostaway', ${externalId}, ${sql.json(l)}, ${hash}, ${cur[0].version + 1}, true, ${l.latestActivityOn ?? null}, ${runId})`
        updated++
      }
    }

    const stats = { fetched: listings.length, hostawayCount, inserted, updated, unchanged,
      sanitizer: { version: SANITIZER_VERSION, removedFieldCounts: sanitizedAudit } }
    await sql`update pms.sync_runs set finished_at=now(), status='success', stats=${sql.json(stats)} where id=${runId}`
    await sql`update pms.connections set last_sync_at=now() where id=${connectionId}`
    await sql.end()
    return json({ ok: true, ...stats, syncRunId: runId })
  } catch (e) {
    try {
      if (runId) await sql`update pms.sync_runs set finished_at=now(), status='failed', error=${String(e).slice(0, 300)} where id=${runId}`
      await sql.end()
    } catch (_) { /* ignore */ }
    return json({ ok: false, stage: 'exception', error: String(e).slice(0, 200) }, 500)
  }
})
