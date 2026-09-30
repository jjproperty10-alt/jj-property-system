import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  gateServiceReads,
  SERVICE_ROLE_COMPANY_TABLES,
} from '@/lib/auth/serviceRoleCompanyGate'

const root = path.resolve(__dirname, '..', '..', '..')

function read(file: string): string {
  return readFileSync(path.join(root, file), 'utf8')
}

type Filter = {
  method: string
  eqs: string[]
  eq: (column: string, value: string) => Filter
  then: (
    onFulfilled?: ((value: unknown) => unknown) | null,
    onRejected?: ((reason: unknown) => unknown) | null,
  ) => Promise<unknown>
}

function filter(method: string): Filter {
  const row: Filter = {
    method,
    eqs: [],
    eq(column: string, value: string) {
      row.eqs.push(`${column}=${value}`)
      return row
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected)
    },
  }
  return row
}

type SelectOptions = {
  head?: boolean
  count?: 'exact' | 'planned' | 'estimated'
}

type InsertOptions = {
  count?: 'exact' | 'planned' | 'estimated'
  defaultToNull?: boolean
}

type MockQuery = {
  relation: string
  select(columns?: string, options?: SelectOptions): Filter
  insert(
    values?: Record<string, unknown> | readonly Record<string, unknown>[],
    options?: InsertOptions,
  ): Filter
}

type MockClient = {
  from(relation: string): MockQuery
  schema(name: string): MockClient
}

function client(): MockClient {
  return {
    from(relation: string) {
      return {
        relation,
        select(_columns?: string, _options?: SelectOptions) {
          return filter('GET')
        },
        insert(
          _values?: Record<string, unknown> | readonly Record<string, unknown>[],
          _options?: InsertOptions,
        ) {
          return filter('POST')
        },
      }
    },
    schema(_name: string) {
      return client()
    },
  }
}

describe('service role read company', () => {
  const migration = read('supabase/migrations/20260930200000_service_role_read_company.sql')
  const rollback = read('supabase/rollbacks/20260930200000_service_role_read_company_rollback.sql')
  const matrix = read('supabase/tests/20260930200000_service_role_read_company_matrix.sql')
  const runner = read('scripts/run-service-role-read-company-matrix.cjs')
  const supabase = read('src/lib/supabase.ts')

  test('resolves a service read without trusting a caller uuid', () => {
    for (const file of [migration, rollback, matrix, runner, supabase]) {
      expect(file.includes('\r')).toBe(false)
      expect(file).not.toContain('10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    }
    expect(migration).toContain('<> 192')
    expect(migration).toContain("version = '20260930120000'")
    expect(migration).toContain('IF p_requested IS NULL THEN')
    expect(migration).not.toContain('set_config(')
    expect(migration).not.toContain('INSERT INTO registry.companies')
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.resolve_service_read_company(uuid) TO service_role')
    expect(migration).toContain('REVOKE ALL ON FUNCTION access.resolve_service_read_company(uuid) FROM anon, authenticated, service_role')
    expect(rollback).toContain('DROP FUNCTION public.resolve_service_read_company(uuid);')
    expect(rollback).toContain('DROP FUNCTION access.resolve_service_read_company(uuid);')
    expect(matrix).toContain('two_null_blocked')
    expect(matrix).toContain('two_explicit_without_permit_blocked')
    expect(matrix).toContain('two_permit_does_not_authorize_omission')
    expect(runner).toContain(".replaceAll('@@MIGRATION@@', () => migration)")
    expect(supabase).toContain("rpc('resolve_service_read_company'")
    expect(supabase).toContain('p_requested: null')
    expect(SERVICE_ROLE_COMPANY_TABLES.has('transactions')).toBe(false)
    expect(SERVICE_ROLE_COMPANY_TABLES.has('properties')).toBe(true)
  })

  test('scopes a company table read and leaves other reads unchanged', async () => {
    let calls = 0
    const db = gateServiceReads(client(), async () => {
      calls += 1
      return 'company-1'
    })

    const properties = db.from('properties').select('id') as Filter
    await properties
    expect(properties.eqs).toEqual(['operating_company_id=company-1'])

    const transactions = db.from('transactions').select('id') as Filter
    await transactions
    expect(transactions.eqs).toEqual([])

    const inserted = db.from('properties').insert() as Filter
    await inserted
    expect(inserted.eqs).toEqual([])

    const mappings = db.schema('pms').from('property_mappings').select('id') as Filter
    await mappings
    expect(mappings.eqs).toEqual(['operating_company_id=company-1'])
    expect(calls).toBe(2)
  })

  test('does not run an unscoped read when company resolution fails', async () => {
    const db = gateServiceReads(client(), async () => {
      throw new Error('BLOCKED_BY_COMPANY_CONTEXT')
    })
    const properties = db.from('properties').select('id') as Filter
    await expect(properties).rejects.toThrow('BLOCKED_BY_COMPANY_CONTEXT')
    expect(properties.eqs).toEqual([])
  })
})
