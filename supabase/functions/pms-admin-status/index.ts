// PMS/Ops admin status — v2 (M0.3 Monitoring): existing operational truth only, no parallel model.
// Sources: ops.health_checks, ops.v_operational_metrics, pms.sync_runs, cron.job(+run_details), pms.raw_events, pms.sync_errors, registry counts.
// Authenticated users only (anon rejected). Redacted aggregates — no secrets/PII.
import postgres from 'npm:postgres@3.4.4'

const CORS: Record<string, string> = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', ...CORS } })

function jwtRole(auth: string | null): string {
  try {
    const p = (auth || '').replace(/^Bearer\s+/i, '').split('.')[1]
    return JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/'))).role || 'none'
  } catch (_) { return 'none' }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (jwtRole(req.headers.get('authorization')) !== 'authenticated') {
    return json({ error: 'authenticated user required (anon rejected)' }, 403)
  }
  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false })
  try {
    const params = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const fromDate = typeof params.fromDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.fromDate) ? params.fromDate : null
    const toDate = typeof params.toDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.toDate) ? params.toDate : null

    const [conn] = await sql`select provider, display_name, status, last_sync_at,
        left(external_account_id,2)||'****' as account_masked from pms.connections where provider='hostaway' limit 1`
    const [prov] = await sql`select connector_version, capabilities->'pagination' as pagination, capabilities->'sanitizer' as sanitizer
      from pms.providers where code='hostaway'`
    const counts = await sql`select
        (select count(*) from pms.raw_properties where is_current) as raw_properties,
        (select count(*) from pms.raw_reservations where is_current) as raw_reservations,
        (select count(*) from pms.canonical_properties) as canonical_properties,
        (select count(*) from pms.canonical_reservations) as canonical_reservations,
        (select count(*) from pms.property_mappings where status='approved') as mapped_properties,
        (select count(*) from pms.raw_properties where is_current) -
          (select count(*) from pms.property_mappings where status='approved') as unmapped_properties,
        (select count(*) from pms.sync_errors where status='open') as open_errors,
        (select count(*) from registry.parties) as registry_parties,
        (select count(*) from registry.external_identities where mapping_status='approved') as registry_mappings_approved,
        (select count(*) from registry.external_identities where mapping_status='proposed') as registry_mappings_proposed`
    const health = await sql`select distinct on (check_name) check_name, status, value, threshold, checked_at
      from ops.health_checks order by check_name, checked_at desc`
    const metrics = await sql`select metric, value from ops.v_operational_metrics`
    const runs = await sql`select entity, trigger, status, started_at, finished_at, connector_version, stats
      from pms.sync_runs order by started_at desc limit 10`
    const cronJobs = await sql`select j.jobname, j.schedule, j.active,
        (select jsonb_build_object('status', d.status, 'start', d.start_time, 'msg', left(coalesce(d.return_message,''),80))
         from cron.job_run_details d where d.jobid=j.jobid order by d.start_time desc limit 1) as last_run
      from cron.job j order by j.jobname`
    const webhooks = await sql`select event_type, external_id, status, received_at, processed_at
      from pms.raw_events order by received_at desc limit 10`
    const errors = await sql`select entity, error_code, left(coalesce(message,''),120) as message, created_at, status
      from pms.sync_errors order by created_at desc limit 10`
    const mappings = await sql`select external_id, jj_property_name, confidence_label, match_confidence, status,
        approved_by, mapping_version, evidence from pms.property_mappings order by status, external_id`
    const sample = await sql`select external_id, external_property_id, channel, status, status_raw,
        check_in, check_out, nights, guests, currency_code, total_price, cleaning_fee
      from pms.canonical_reservations
      where (${fromDate}::date is null or check_in >= ${fromDate}::date)
        and (${toDate}::date is null or check_in <= ${toDate}::date)
      order by check_in desc limit 25`
    await sql.end()
    return json({ connection: conn, provider: prov, counts: counts[0], health, metrics, runs, cronJobs, webhooks, errors, mappings, reservationSample: sample })
  } catch (e) {
    try { await sql.end() } catch (_) { /* ignore */ }
    return json({ error: String(e).slice(0, 200) }, 500)
  }
})
