import fs from 'fs'
import path from 'path'

const SQL = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'supabase',
  'migrations',
  '20260927220000_ops_conversation_suggested_property.sql',
)

describe('ops conversation suggested property migration', () => {
  const sql = fs.readFileSync(SQL, 'utf8')

  it('adds a nullable column and does not rewrite existing conversations', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS suggested_property_name text\s*;/)
    expect(sql).not.toMatch(/suggested_property_name text\s+NOT NULL/)
    expect(sql).not.toMatch(/suggested_property_name text\s+DEFAULT\s+'(?!')/)
    expect(sql).not.toMatch(/UPDATE\s+finance\.ops_conversations/i)
    expect(sql).toMatch(/suggested_property_name IS NULL/)
    expect(sql).toMatch(/char_length\(suggested_property_name\) BETWEEN 1 AND 200/)
  })

  it('keeps one create function, with a default so existing callers still work', () => {
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.create_ops_conversation\(text, text, text\);/)
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.create_ops_conversation\(text, text, text, text\);/)
    expect(sql).toMatch(/p_external_thread_id text DEFAULT NULL/)
    expect(sql).toMatch(/p_suggested_property_name text DEFAULT NULL/)
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.create_ops_conversation/)
    expect(sql.match(/CREATE FUNCTION public\.create_ops_conversation\(/g)).toHaveLength(1)
  })

  it('stores only an exact unique catalog name and still creates the conversation otherwise', () => {
    expect(sql).toMatch(/WHERE property\.name = v_raw/)
    expect(sql).toMatch(/IF v_match_count = 1 THEN/)
    expect(sql).not.toMatch(/ILIKE/)
    expect(sql).toMatch(/ON CONFLICT \(idempotency_key\) DO NOTHING/)
    expect(sql).not.toMatch(/RAISE EXCEPTION '.*property/i)
  })

  it('returns the stored name and freezes it after insert', () => {
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.list_ops_conversation\(uuid\);/)
    expect(sql).toMatch(/suggested_property_name text/)
    expect(sql).toMatch(/c\.suggested_property_name/)
    expect(sql).toMatch(/NEW\.suggested_property_name IS DISTINCT FROM OLD\.suggested_property_name/)
  })

  it('grants execute only to authenticated', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_ops_conversation\(text, text, text, text\) FROM PUBLIC/,
    )
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.create_ops_conversation\(text, text, text, text\) FROM anon, service_role/,
    )
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_ops_conversation\(text, text, text, text\) TO authenticated/,
    )
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.list_ops_conversation\(uuid\) FROM PUBLIC/)
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.list_ops_conversation\(uuid\) FROM anon, service_role/,
    )
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_ops_conversation\(uuid\) TO authenticated/)
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]*TO anon/)
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]*TO service_role/)
    expect(sql).toMatch(/SECURITY DEFINER\s+SET search_path = ''/)
    expect(sql).toMatch(/finance\.is_active_jj_staff\(\)/)
  })
})
