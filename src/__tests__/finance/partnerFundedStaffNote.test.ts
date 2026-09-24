import fs from 'fs'
import path from 'path'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260924190000_partner_funded_staff_note.sql',
)

const ddl = fs.readFileSync(migrationPath, 'utf8').replace(/--.*$/gm, '')

describe('partner funded staff note migration', () => {
  it('stores a staff note only on the funding event', () => {
    expect(ddl).toContain('ADD COLUMN IF NOT EXISTS staff_note TEXT')
    expect(ddl).toContain('char_length(staff_note) <= 2000')
    expect(ddl).toContain('p_staff_note TEXT DEFAULT NULL')
    expect(ddl).toContain("NULLIF(pg_catalog.btrim(p_staff_note), '')")
    expect(ddl).toContain('v_existing.staff_note IS DISTINCT FROM v_note')
    expect(ddl).toContain('[idempotency_conflict]')
    expect(ddl).toContain('created_by, staff_note')
    expect(ddl).toContain("'partner funded client settlement'")
    expect(ddl).toContain("SET search_path TO ''")
    expect(ddl).toContain('FROM anon, service_role')
    expect(ddl).toContain('TO authenticated')
    expect(ddl).toContain(
      'DROP FUNCTION IF EXISTS public.execute_partner_funded_client_settlement',
    )
    const auditInsert = ddl.match(/INSERT INTO finance\.partner_funding_audit[\s\S]*?;/)?.[0] ?? ''
    const linkInsert = ddl.match(/INSERT INTO finance\.owner_transaction_links[\s\S]*?;/)?.[0] ?? ''
    const caInsert = ddl.match(/INSERT INTO finance\.partner_current_account_entries[\s\S]*?;/)?.[0] ?? ''
    const txInsert = ddl.match(/INSERT INTO public\.transactions[\s\S]*?;/)?.[0] ?? ''
    expect(auditInsert).not.toContain('staff_note')
    expect(linkInsert).not.toContain('staff_note')
    expect(caInsert).not.toContain('staff_note')
    expect(txInsert).not.toContain('staff_note')
    expect(txInsert).toContain("'partner funded client settlement'")
    expect(ddl).not.toMatch(/0f352012-1403-4e3b-982a-7c019ee89f1b|4de83e15-e8cd-4abc-a104-5ddf8a2a3a4d/)
  })
})
