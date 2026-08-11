// PMS Connector — Hostaway reservations sync — v0.4.0 (M0.1 / D1 tenant-neutral fix)
// Credentials resolved PER-CONNECTION: account id from pms.connections.external_account_id,
// secret via vault[connections.credentials_ref]. No fixed vault names. trigger param supported.
import postgres from 'npm:postgres@3.4.4'

const CONNECTOR_VERSION = '0.4.0'
const SANITIZER_VERSION = '1.0.0'
const PAGE_LIMIT = 100
const THROTTLE_MS = 700
const HARD_MAX_PAGES = 50

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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
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
    let offset: number = Number(params.offset ?? 0)
    const maxPages: number = Math.min(Number(params.maxPages ?? 6), 10)
    const trigger: string = params.trigger === 'cron' ? 'cron' : (params.trigger === 'webhook' ? 'webhook' : 'manual')

    // D1: per-connection credentials — tenant-neutral
    const conn = await sql`select id, external_account_id, credentials_ref from pms.connections
      where provider='hostaway' and status='active' limit 1`
    if (!conn.length) return json({ ok: false, stage: 'connection', error: 'no active connection' })
    const connectionId = conn[0].id
    const accountId = conn[0].external_account_id
    const secretRow = await sql`select decrypted_secret from vault.decrypted_secrets where name=${conn[0].credentials_ref}`
    const clientSecret = secretRow[0]?.decrypted_secret
    if (!accountId || !clientSecret) return json({ ok: false, stage: 'vault', error: 'credentials unresolved via credentials_ref' })

    const cap = await sql`select capabilities->'pagination'->>'active' as strategy from pms.providers where code='hostaway'`
    const strategy = cap[0]?.strategy || 'offset'

    const run = await sql`insert into pms.sync_runs (connection_id, entity, trigger, connector_version, status, cursor_start)
      values (${connectionId}, 'reservations', ${trigger}, ${CONNECTOR_VERSION}, 'running', ${strategy + ':' + offset}) returning id`
    runId = run[0].id

    const tokenRes = await fetch('https://api.hostaway.com/v1/accessTokens', {
      method: 'POST',
      headers: { 'Content-type': 'application/x-www-form-urlencoded', 'Cache-control': 'no-cache' },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(accountId)}&client_secret=${encodeURIComponent(clientSecret)}&scope=general`,
    })
    if (!tokenRes.ok) throw new Error(`token HTTP ${tokenRes.status}`)
    const accessToken = (await tokenRes.json())?.access_token

    let pages = 0, fetched = 0, inserted = 0, updated = 0, unchanged = 0, itemErrors = 0
    let hostawayTotal: number | null = null
    let done = false
    let lastPageSig = ''
    const sanitizedAudit: Record<string, number> = {}

    while (pages < maxPages && pages < HARD_MAX_PAGES) {
      const res = await fetch(`https://api.hostaway.com/v1/reservations?limit=${PAGE_LIMIT}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${accessToken}`, 'Cache-control': 'no-cache' } })
      if (res.status === 429) { await sleep(11000); continue }
      if (!res.ok) throw new Error(`reservations HTTP ${res.status}`)
      const body = await res.json()
      if (hostawayTotal === null && typeof body?.count === 'number') hostawayTotal = body.count
      const items: any[] = Array.isArray(body?.result) ? body.result : []
      if (!items.length) { done = true; break }
      const pageSig = `${items[0]?.id}-${items[items.length - 1]?.id}-${items.length}`
      if (pageSig === lastPageSig) {
        await sql`insert into pms.sync_errors (sync_run_id, connection_id, entity, error_code, message)
          values (${runId}, ${connectionId}, 'reservations', 'repeated_page_detected', ${'pagination loop at offset ' + offset})`
        throw new Error('repeated page detected — aborting to prevent loop')
      }
      lastPageSig = pageSig
      pages++; fetched += items.length; offset += items.length

      const withHash = await Promise.all(items.map(async (r0) => {
        const { sanitized, removed } = sanitizePayload(r0)
        for (const [k, n] of Object.entries(removed)) sanitizedAudit[k] = (sanitizedAudit[k] || 0) + n
        return {
          externalId: String(sanitized.id), raw: sanitized, hash: await sha256(JSON.stringify(sanitized)),
          listingId: sanitized.listingMapId != null ? String(sanitized.listingMapId) : null,
          updatedOn: sanitized.updatedOn ?? null,
        }
      }))
      const ids = withHash.map((x) => x.externalId)
      const state = await sql`select external_id, max(version) as maxv,
               (array_agg(id) filter (where is_current))[1] as cur_id,
               (array_agg(raw_hash) filter (where is_current))[1] as cur_hash
        from pms.raw_reservations
        where connection_id=${connectionId} and external_id = any(${ids})
        group by external_id`
      const byExt: Record<string, any> = {}
      for (const e of state) byExt[e.external_id] = e
      const same = withHash.filter((x) => byExt[x.externalId]?.cur_hash === x.hash)
      const toBump = withHash.filter((x) => !byExt[x.externalId] || byExt[x.externalId].cur_hash !== x.hash)
      try {
        if (same.length) {
          await sql`update pms.raw_reservations set synced_at=now(), sync_run_id=${runId}
            where id = any(${same.map((x) => byExt[x.externalId].cur_id)})`
          unchanged += same.length
        }
        const retire = toBump.map((x) => byExt[x.externalId]?.cur_id).filter(Boolean)
        if (retire.length) await sql`update pms.raw_reservations set is_current=false where id = any(${retire})`
        for (const x of toBump) {
          const nextV = (byExt[x.externalId]?.maxv ?? 0) + 1
          await sql`insert into pms.raw_reservations
            (connection_id, provider, external_id, external_property_id, raw, raw_hash, version, is_current, provider_updated_at, sync_run_id)
            values (${connectionId}, 'hostaway', ${x.externalId}, ${x.listingId}, ${sql.json(x.raw)}, ${x.hash}, ${nextV}, true, ${x.updatedOn}, ${runId})`
          if (byExt[x.externalId]) updated++; else inserted++
        }
      } catch (pageErr) {
        itemErrors += items.length
        await sql`insert into pms.sync_errors (sync_run_id, connection_id, entity, error_code, message)
          values (${runId}, ${connectionId}, 'reservations', 'page_upsert_failed', ${String(pageErr).slice(0, 300)})`
      }
      if (items.length < PAGE_LIMIT || (hostawayTotal !== null && offset >= hostawayTotal)) { done = true; break }
      await sleep(THROTTLE_MS)
    }

    const stats = { fetched, hostawayTotal, pages, inserted, updated, unchanged, itemErrors, nextOffset: offset, done,
      sanitizer: { version: SANITIZER_VERSION, removedFieldCounts: sanitizedAudit } }
    await sql`update pms.sync_runs set finished_at=now(), status=${itemErrors ? 'partial' : 'success'}, stats=${sql.json(stats)}, cursor_end=${strategy + ':' + offset} where id=${runId}`
    if (done) await sql`update pms.connections set last_sync_at=now() where id=${connectionId}`
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
