import fs from 'fs'
import path from 'path'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260924140000_bind_property_uuid_bridge.sql',
)

const ddl = fs
  .readFileSync(migrationPath, 'utf8')
  .replace(/--.*$/gm, '')

describe('bind property UUID bridge migration', () => {
  it('keeps the existing signature and resolves EPA only by UUID', () => {
    expect(ddl).toContain('p_property_id             UUID')
    expect(ddl).toContain('external_id = p_property_id::text')
    expect(ddl).toContain("b.external_entity_type = 'property'")
    expect(ddl).toContain("b.mapping_status = 'approved'")
    expect(ddl).toContain('a.property_id = v_canonical')
    expect(ddl).toContain("a.status = 'active'")
    expect(ddl).toContain("SET search_path TO ''")
    expect(ddl).toContain('FROM anon, service_role')
    expect(ddl).toContain('TO authenticated')
    expect(ddl).not.toMatch(/canonical_name|property_name|ILIKE|similarity\(/i)
    expect(ddl).not.toMatch(/INSERT\s+INTO\s+lifecycle\.entity_property_associations/i)
    expect(ddl).not.toMatch(/INSERT\s+INTO\s+public\.transactions/i)
  })
})
