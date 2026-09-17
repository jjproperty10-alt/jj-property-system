import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..', '..', '..')
const SQL = path.join(ROOT, 'supabase', 'migrations', '20260919120000_ops_agent_core.sql')
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations')

function read(abs: string): string {
  return fs.readFileSync(abs, 'utf8')
}

describe('ops agent core migration', () => {
  const sql = read(SQL)

  it('uses a unique 14-digit version after 20260918100000', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
    expect(files.filter((f) => f.startsWith('20260919120000_'))).toEqual([
      '20260919120000_ops_agent_core.sql',
    ])
    expect(sql).not.toMatch(/20260916_/)
  })

  it('creates the six finance ops tables with RLS and FORCE RLS', () => {
    for (const table of [
      'ops_conversations',
      'ops_messages',
      'ops_tasks',
      'ops_artifacts',
      'ops_approvals',
      'ops_audit_events',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS finance\\.${table}`))
      expect(sql).toMatch(new RegExp(`ALTER TABLE finance\\.${table} ENABLE ROW LEVEL SECURITY`))
      expect(sql).toMatch(new RegExp(`ALTER TABLE finance\\.${table} FORCE ROW LEVEL SECURITY`))
      expect(sql).toMatch(
        new RegExp(`REVOKE ALL ON TABLE finance\\.${table} FROM anon, authenticated, service_role`),
      )
    }
  })

  it('defines staff-only public RPCs with SECURITY DEFINER and empty search_path', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.create_ops_conversation\(/)
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.append_ops_inbound_message\(/)
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.list_ops_conversation\(/)
    const definers = sql.match(/SECURITY DEFINER\s+SET search_path = ''/g) ?? []
    expect(definers.length).toBeGreaterThanOrEqual(4)
    expect(sql).toMatch(/finance\.is_active_jj_staff\(\)/)
    expect(sql).toMatch(/auth\.uid\(\)/)
    expect(sql).toMatch(/created_by,\s*\n\s*external_thread_id/m)
    expect(sql).toMatch(/ON CONFLICT \(idempotency_key\) DO NOTHING/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_ops_conversation[\s\S]*TO authenticated/)
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.create_ops_conversation\(text, text, text\) FROM anon, service_role/,
    )
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_ops_conversation\(text, text, text\) FROM PUBLIC/,
    )
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]*TO anon/)
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]*TO service_role/)
  })

  it('keeps consume-once private and binds expected snapshot hash, not artifact content_hash', () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION finance\.consume_ops_approval\(\s*p_approval_id uuid,\s*p_expected_snapshot_hash text\s*\)/m,
    )
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION finance\.consume_ops_approval\(uuid, text\) FROM anon, authenticated, service_role/,
    )
    expect(sql).toMatch(/p_expected_snapshot_hash IS DISTINCT FROM v_row\.snapshot_hash/)
    expect(sql).toMatch(/bound_artifact_version/)
    expect(sql).toMatch(/bound_content_hash/)
    expect(sql).not.toMatch(/v_hash IS DISTINCT FROM v_row\.snapshot_hash/)
    expect(sql).not.toMatch(/v_art_content_hash IS DISTINCT FROM v_row\.snapshot_hash/)
    expect(sql).not.toMatch(/INSERT INTO public\.transactions/i)
    expect(sql).not.toMatch(/UPDATE public\.transactions/i)
    expect(sql).not.toMatch(/approve_and_post_agent_transaction_draft/)
    expect(sql).not.toMatch(/send_email|send_whatsapp|gmail|twilio/i)
    expect(sql).not.toMatch(/storage\.buckets|jj-documents/)
    expect(sql).not.toMatch(/DROP CASCADE/)
    expect(sql).not.toMatch(/GRANT USAGE ON SCHEMA finance/)
    expect(sql).not.toMatch(/\bp_created_by\b/)
  })
})
