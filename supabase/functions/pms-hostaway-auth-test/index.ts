// PMS Connector — Phase 2: Hostaway auth test (READ-ONLY). v2: +CORS
// Reads credentials from Supabase Vault, gets a token, calls GET /v1/listings?limit=1.
// Never returns or logs secret values. No DB writes. No reservation pulls.
import postgres from 'npm:postgres@3.4.4'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  let sql: ReturnType<typeof postgres> | null = null
  try {
    sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false })
    const rows = await sql`
      select name, decrypted_secret
      from vault.decrypted_secrets
      where name in ('hostaway_account_id', 'hostaway_client_secret')`
    await sql.end()
    sql = null

    const accountId = rows.find((r: any) => r.name === 'hostaway_account_id')?.decrypted_secret
    const clientSecret = rows.find((r: any) => r.name === 'hostaway_client_secret')?.decrypted_secret
    if (!accountId || !clientSecret) {
      return json({ pass: false, stage: 'vault', error: 'Vault secrets missing' })
    }

    const tokenRes = await fetch('https://api.hostaway.com/v1/accessTokens', {
      method: 'POST',
      headers: { 'Content-type': 'application/x-www-form-urlencoded', 'Cache-control': 'no-cache' },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(accountId)}&client_secret=${encodeURIComponent(clientSecret)}&scope=general`,
    })
    if (!tokenRes.ok) {
      return json({ pass: false, stage: 'token', httpStatus: tokenRes.status })
    }
    const tokenBody = await tokenRes.json()
    const accessToken = tokenBody?.access_token
    if (!accessToken) return json({ pass: false, stage: 'token', error: 'no access_token in response' })

    const listRes = await fetch('https://api.hostaway.com/v1/listings?limit=1', {
      headers: { Authorization: `Bearer ${accessToken}`, 'Cache-control': 'no-cache' },
    })
    const listBody = await listRes.json().catch(() => null)
    return json({
      pass: listRes.ok,
      stage: 'listings',
      httpStatus: listRes.status,
      tokenExpiresInDays: tokenBody?.expires_in ? Math.round(tokenBody.expires_in / 86400) : null,
      listingsSeen: Array.isArray(listBody?.result) ? listBody.result.length : 0,
      totalListings: typeof listBody?.count === 'number' ? listBody.count : null,
    })
  } catch (e) {
    if (sql) try { await sql.end() } catch (_) { /* ignore */ }
    return json({ pass: false, stage: 'exception', error: String(e).slice(0, 200) }, 500)
  }
})
