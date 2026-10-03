/**
 * Opt-in: drives the company gate with the REAL resolver SQL
 * (access.resolve_service_read_company, copied verbatim from a read-only
 * Production capture into supabase/tests/fixtures/throwaway_company_base.sql)
 * on a THROWAWAY local PostgreSQL. Skipped unless JJ_THROWAWAY_PG is set.
 *
 *   JJ_THROWAWAY_PG='host=/tmp port=55432 user=postgres' npx jest directServiceClientsCompanyGate.throwaway
 *
 * Never point JJ_THROWAWAY_PG at Supabase; assertThrowaway() refuses it.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'
import { gateServiceReads, SERVICE_ROLE_COMPANY_WIDE_RELATIONS } from '@/lib/auth/serviceRoleCompanyGate'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { assertThrowaway } = require('../../../scripts/run-throwaway-pg-matrix.cjs')

const conninfo = process.env.JJ_THROWAWAY_PG
const maybe = conninfo ? describe : describe.skip
const root = path.resolve(__dirname, '..', '..', '..')

function toConfig(info: string, database: string) {
  const parts = Object.fromEntries(info.split(/\s+/).filter(Boolean).map((kv) => kv.split('=')))
  return { host: parts.host, port: Number(parts.port ?? 5432), user: parts.user, database }
}

maybe('company gate against the live resolver SQL (throwaway Postgres)', () => {
  const database = `jj_throwaway_gate_${process.pid}`
  let admin: Client
  let db: Client

  beforeAll(async () => {
    assertThrowaway(conninfo)
    admin = new Client(toConfig(conninfo as string, 'postgres'))
    await admin.connect()
    await admin.query(`CREATE DATABASE ${database}`)
    db = new Client(toConfig(conninfo as string, database))
    await db.connect()
    await db.query(readFileSync(path.join(root, 'supabase/tests/fixtures/throwaway_company_base.sql'), 'utf8'))
  })

  afterAll(async () => {
    await db?.end()
    await admin?.query(`DROP DATABASE IF EXISTS ${database}`)
    await admin?.end()
  })

  // Same call the app makes: public.resolve_service_read_company(NULL) as service_role, no user.
  async function resolveAsServiceRole(): Promise<string> {
    await db.query('BEGIN')
    try {
      await db.query("SELECT set_config('request.jwt.claim.role', 'service_role', true), set_config('request.jwt.claim.sub', '', true)")
      await db.query('SET LOCAL ROLE service_role')
      const { rows } = await db.query('SELECT public.resolve_service_read_company(NULL) AS company')
      await db.query('COMMIT')
      return rows[0].company as string
    } catch (error) {
      await db.query('ROLLBACK')
      throw new Error((error as Error).message)
    }
  }

  function client(sent: string[]) {
    return {
      from(relation: string) {
        return {
          select() {
            const filter = {
              eq() {
                return filter
              },
              then(onFulfilled?: ((v: unknown) => unknown) | null, onRejected?: ((r: unknown) => unknown) | null) {
                sent.push(relation)
                return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected)
              },
            }
            return filter
          },
        }
      },
    }
  }

  test('one active company: company-wide reads are sent', async () => {
    const sent: string[] = []
    const gated = gateServiceReads(client(sent), resolveAsServiceRole)
    for (const relation of Array.from(SERVICE_ROLE_COMPANY_WIDE_RELATIONS)) {
      await gated.from(relation).select()
    }
    expect(sent).toEqual(Array.from(SERVICE_ROLE_COMPANY_WIDE_RELATIONS))
  })

  test('second active company: every company-wide read is refused before it is sent', async () => {
    await db.query(
      "INSERT INTO registry.companies (company_id, canonical_name, status) VALUES ('00000000-0000-4000-8000-00000000000b', 'Throwaway Company B', 'active')",
    )
    const sent: string[] = []
    const gated = gateServiceReads(client(sent), resolveAsServiceRole)
    for (const relation of Array.from(SERVICE_ROLE_COMPANY_WIDE_RELATIONS)) {
      await expect(gated.from(relation).select()).rejects.toThrow('BLOCKED_BY_COMPANY_CONTEXT')
    }
    expect(sent).toEqual([])
  })
})
