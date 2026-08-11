// PMS Connector — Stage A Investigation: read-only query of financeCalculatedField.
// Same auth pattern as pms-hostaway-auth-test. No DB writes. Returns raw Hostaway response.
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

async function getHostawayToken(sql: ReturnType<typeof postgres>): Promise<string> {
  const rows = await sql`
    select name, decrypted_secret
    from vault.decrypted_secrets
    where name in ('hostaway_account_id', 'hostaway_client_secret')`
  const accountId = rows.find((r: any) => r.name === 'hostaway_account_id')?.decrypted_secret
  const clientSecret = rows.find((r: any) => r.name === 'hostaway_client_secret')?.decrypted_secret
  if (!accountId || !clientSecret) throw new Error('Vault secrets missing')

  const tokenRes = await fetch('https://api.hostaway.com/v1/accessTokens', {
    method: 'POST',
    headers: { 'Content-type': 'application/x-www-form-urlencoded', 'Cache-control': 'no-cache' },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(accountId)}&client_secret=${encodeURIComponent(clientSecret)}&scope=general`,
  })
  if (!tokenRes.ok) throw new Error(`Token request failed: ${tokenRes.status}`)
  const tokenBody = await tokenRes.json()
  if (!tokenBody?.access_token) throw new Error('No access_token in response')
  return tokenBody.access_token
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  let sql: ReturnType<typeof postgres> | null = null
  try {
    const url = new URL(req.url)
    const reservationIds = url.searchParams.get('ids')?.split(',').map(s => s.trim()).filter(Boolean)
    if (!reservationIds?.length) {
      return json({ error: 'Pass ?ids=123,456,789' }, 400)
    }
    if (reservationIds.length > 20) {
      return json({ error: 'Max 20 reservation IDs per call' }, 400)
    }

    sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false })
    const token = await getHostawayToken(sql)
    await sql.end()
    sql = null

    const results: Record<string, any> = {}
    for (const resId of reservationIds) {
      const res = await fetch(
        `https://api.hostaway.com/v1/financeCalculatedField/reservation/${encodeURIComponent(resId)}`,
        { headers: { Authorization: `Bearer ${token}`, 'Cache-control': 'no-cache' } }
      )
      const body = await res.json().catch(() => null)
      results[resId] = { httpStatus: res.status, data: body }
    }

    return json({ reservationCount: reservationIds.length, results })
  } catch (e) {
    if (sql) try { await sql.end() } catch (_) { /* ignore */ }
    return json({ error: String(e).slice(0, 300) }, 500)
  }
})
