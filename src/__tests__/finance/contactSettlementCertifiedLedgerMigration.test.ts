import { readFileSync } from 'fs'
import { join } from 'path'

const MIGRATION = '20261003120000_contact_settlement_certified_ledger.sql'
const ROLLBACK = '20261003120000_contact_settlement_certified_ledger_rollback.sql'
const LIVE_MD5 = '84b5a9448d4b8547b361602406bcf7e6'
const NEW_MD5 = '5858d732fc385d506a81d8de6ef7ad9b'

const strip = (s: string) =>
  s
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')

const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8')
const rb = readFileSync(join(process.cwd(), 'supabase', 'rollbacks', ROLLBACK), 'utf8')
const ddl = strip(sql)
const rbDdl = strip(rb)

const viewBody = (s: string) => {
  const start = s.indexOf('CREATE OR REPLACE VIEW public.v_contact_settlement AS\n')
  return s.slice(start, s.indexOf(';\n', start))
}

describe('20261003120000 v_contact_settlement certified ledger', () => {
  test('replaces v_contact_settlement and adds the shared view, never the summary', () => {
    expect(ddl.match(/CREATE OR REPLACE VIEW/g)).toHaveLength(2)
    expect(ddl).toMatch(/CREATE OR REPLACE VIEW public\.v_canonical_transaction_inclusion/)
    expect(ddl).toMatch(/CREATE OR REPLACE VIEW public\.v_contact_settlement AS/)
    expect(ddl).not.toMatch(/CREATE OR REPLACE VIEW public\.v_contact_settlement_summary/)
    expect(ddl).not.toMatch(/DROP\s+VIEW/i)
    expect(ddl).not.toMatch(/CREATE TABLE/i)
  })

  test('both branches read the shared inclusion view, not raw transactions', () => {
    const body = viewBody(ddl)
    expect(body.match(/v_canonical_transaction_inclusion t/g)).toHaveLength(2)
    expect(body).not.toMatch(/v_certified_ledger_transactions/)
    expect(body).not.toMatch(/\btransactions t\b(?! ON)/)
    expect(body).not.toMatch(/FROM transactions t/)
    expect(body).not.toMatch(/JOIN transactions t/)
    expect(body).not.toMatch(/review_status/)
  })

  test('grants only the new objects; contact settlement keeps its options; no data writes', () => {
    const body = viewBody(ddl)
    expect(body).not.toMatch(/\bGRANT\b|\bREVOKE\b|security_invoker/i)
    expect(ddl).not.toMatch(/ALTER\s+VIEW|OWNER TO/i)
    expect(ddl).toMatch(/GRANT SELECT ON public\.v_canonical_transaction_inclusion TO service_role/)
    expect(ddl).toMatch(/GRANT EXECUTE ON FUNCTION public\.canonical_inclusion_decided\(uuid\) TO service_role/)
    expect(ddl).not.toMatch(/\b(INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|TRUNCATE)\b/i)
    expect(ddl).not.toMatch(/is_deleted\s*=\s*false\s*,|SET\s+is_deleted/i)
    expect(ddl).toMatch(/to_regclass\('finance\.canonical_inclusion_decisions'\)/)
    expect(ddl).not.toMatch(/CREATE\s+TABLE[\s\S]*canonical_inclusion_decisions/i)
  })

  test('no planned-input allowlist inside the view or the function', () => {
    const body = viewBody(ddl)
    const fnStart = ddl.indexOf('CREATE OR REPLACE FUNCTION public.canonical_inclusion_decided')
    const fnEnd = ddl.indexOf('$$;', fnStart)
    const fn = ddl.slice(fnStart, fnEnd)
    for (const id of [
      'cfb1b60c', 'eb5256c8', '20eaeb18', 'dc3d60fb', '10622dde', '82c8ee31',
      '2509d3ad', '7acdcebd', 'ba646d2d',
    ]) {
      expect(body).not.toContain(id)
      expect(fn).not.toContain(id)
    }
  })

  test('guards: pre-check on captured md5, post-check on new md5', () => {
    expect(ddl.indexOf(LIVE_MD5)).toBeGreaterThan(-1)
    expect(ddl.indexOf(LIVE_MD5)).toBeLessThan(ddl.indexOf('CREATE OR REPLACE VIEW'))
    expect(ddl.indexOf(NEW_MD5)).toBeGreaterThan(ddl.indexOf('CREATE OR REPLACE VIEW'))
    expect(ddl).toMatch(/\{postgres=arwdDxtm\/postgres,service_role=arwdDxtm\/postgres\}/)
  })

  test('rollback restores the captured body; only the source lines differ', () => {
    const before = viewBody(rbDdl).split('\n')
    const after = viewBody(ddl).split('\n')
    expect(rbDdl.indexOf(NEW_MD5)).toBeLessThan(rbDdl.indexOf('CREATE OR REPLACE VIEW'))
    expect(rbDdl.indexOf(LIVE_MD5)).toBeGreaterThan(rbDdl.indexOf('CREATE OR REPLACE VIEW'))
    const removed = before.filter((l) => !after.includes(l))
    const added = after.filter((l) => !before.includes(l))
    expect(removed.map((l) => l.trim())).toEqual([
      'FROM transactions t',
      "WHERE t.review_status = 'active'::text OR t.review_status IS NULL",
      'JOIN transactions t ON t.id = sa.transaction_id',
      "WHERE sa.voided_at IS NULL AND (t.review_status = 'active'::text OR t.review_status IS NULL) AND t.property_name IS NULL",
    ])
    expect(added.map((l) => l.trim())).toEqual([
      'FROM v_canonical_transaction_inclusion t',
      'JOIN v_canonical_transaction_inclusion t ON t.id = sa.transaction_id',
      'WHERE sa.voided_at IS NULL AND t.property_name IS NULL',
    ])
  })
})
