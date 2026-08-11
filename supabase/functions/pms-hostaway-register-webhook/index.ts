// One-off: register our Unified Webhook in Hostaway via their API (endpoint discovery built-in).
// Sends: url + login + password (read from vault — value never returned in response).
import postgres from 'npm:postgres@3.4.4'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (_req: Request) => {
  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false })
  try {
    const conn = await sql`select id, external_account_id, credentials_ref from pms.connections
      where provider='hostaway' and status='active' limit 1`
    const accountId = conn[0]?.external_account_id
    const secret = (await sql`select decrypted_secret from vault.decrypted_secrets where name=${conn[0]?.credentials_ref}`)[0]?.decrypted_secret
    const webhookPw = (await sql`select decrypted_secret from vault.decrypted_secrets where name='hostaway_webhook_auth'`)[0]?.decrypted_secret
    await sql.end()
    if (!accountId || !secret || !webhookPw) return json({ ok: false, error: 'creds unresolved' })

    const tokenRes = await fetch('https://api.hostaway.com/v1/accessTokens', {
      method: 'POST', headers: { 'Content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(accountId)}&client_secret=${encodeURIComponent(secret)}&scope=general`,
    })
    if (!tokenRes.ok) return json({ ok: false, stage: 'token', status: tokenRes.status })
    const token = (await tokenRes.json())?.access_token

    const body = {
      url: 'https://vsiiprzjrstjcmjpwcrd.supabase.co/functions/v1/pms-hostaway-webhook',
      login: 'jj-webhook',
      password: webhookPw,
      isEnabled: 1,
    }
    const attempts: any[] = []
    for (const ep of ['unifiedWebhooks', 'webhooks/unified', 'webhooks']) {
      const r = await fetch(`https://api.hostaway.com/v1/${ep}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Cache-control': 'no-cache' },
        body: JSON.stringify(body),
      })
      const txt = (await r.text()).slice(0, 300)
      attempts.push({ endpoint: ep, status: r.status, response: txt.replace(webhookPw, '<REDACTED>') })
      if (r.ok) return json({ ok: true, registered_via: ep, attempts })
    }
    return json({ ok: false, attempts })
  } catch (e) {
    try { await sql.end() } catch (_) { /* ignore */ }
    return json({ ok: false, error: String(e).slice(0, 200) }, 500)
  }
})
