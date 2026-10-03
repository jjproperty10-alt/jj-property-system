import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  gateServiceReads,
  SERVICE_ROLE_COMPANY_COLUMNS,
  SERVICE_ROLE_COMPANY_TABLES,
} from '@/lib/auth/serviceRoleCompanyGate'

const root = path.resolve(__dirname, '..', '..', '..')

type Row = {
  id: string
  operating_company_id?: string
  company_id?: string
}

type Filter = {
  eqs: string[]
  eq: (column: string, value: string) => Filter
  then: (
    onFulfilled?: ((value: unknown) => unknown) | null,
    onRejected?: ((reason: unknown) => unknown) | null,
  ) => Promise<unknown>
}

function client(byRelation: Record<string, Row[]>) {
  let fetched = false
  function build(): {
    from: (relation: string) => {
      select: (columns?: string, options?: { companyId?: string }) => Filter
    }
    schema: (name: string) => ReturnType<typeof build>
    fetched: () => boolean
  } {
    return {
      fetched: () => fetched,
      from(relation: string) {
        const rows = byRelation[relation] ?? []
        return {
          select(_columns?: string, _options?: { companyId?: string }) {
            const eqs: string[] = []
            const row: Filter = {
              eqs,
              eq(column: string, value: string) {
                eqs.push(`${column}=${value}`)
                return row
              },
              then(onFulfilled, onRejected) {
                fetched = true
                const data = rows.filter((item) =>
                  eqs.every((spec) => {
                    const splitAt = spec.indexOf('=')
                    const column = spec.slice(0, splitAt)
                    const value = spec.slice(splitAt + 1)
                    return item[column as keyof Row] === value
                  }),
                )
                return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected)
              },
            }
            return row
          },
        }
      },
      schema(_name: string) {
        return build()
      },
    }
  }
  return build()
}

describe('client and entity company gate', () => {
  const supabase = readFileSync(path.join(root, 'src/lib/supabase.ts'), 'utf8')
  const identity = readFileSync(
    path.join(root, 'src/lib/identity/identityResolverService.ts'),
    'utf8',
  )
  const sole = 'company-1'
  const other = 'company-2'
  const attacker = 'attacker-company'

  test('does not trust a caller supplied company uuid', () => {
    expect(supabase).toContain("rpc('resolve_service_read_company'")
    expect(supabase).toContain('p_requested: null')
    expect(supabase).toContain('gateServiceReads(rawServiceClient(), resolveSoleServiceCompany)')
    expect(supabase).not.toContain('export function rawServiceClient')
    expect(identity).toContain('createServiceClient')
    expect(identity).toContain(".from('entity_identity')")
    expect(identity).toContain(".from('management_relationship')")
    expect(identity).not.toContain('10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    expect(SERVICE_ROLE_COMPANY_COLUMNS.entity_identity).toBe('operating_company_id')
    expect(SERVICE_ROLE_COMPANY_COLUMNS.management_relationship).toBe('operating_company_id')
    expect(SERVICE_ROLE_COMPANY_COLUMNS.parties).toBe('company_id')
    expect(SERVICE_ROLE_COMPANY_TABLES.has('transactions')).toBe(false)
    expect(readFileSync(path.join(root, 'src/lib/auth/serviceRoleCompanyGate.ts'), 'utf8')).not.toContain(
      'service_role',
    )
  })

  test('one company returns the same current rows', async () => {
    const rows: Row[] = [
      { id: 'a', operating_company_id: sole },
      { id: 'b', operating_company_id: sole },
    ]
    const db = gateServiceReads(client({ entity_identity: rows }), async () => sole)
    const selected = db.schema('lifecycle').from('entity_identity').select('id', {
      companyId: attacker,
    }) as Filter
    const result = (await selected) as { data: Row[] }
    expect(selected.eqs).toEqual([`operating_company_id=${sole}`])
    expect(result.data.map((row) => row.id)).toEqual(['a', 'b'])
  })

  test('two companies do not leak customers or relationships', async () => {
    const db = gateServiceReads(
      client({
        entity_identity: [
          { id: 'own-customer', operating_company_id: sole },
          { id: 'foreign-customer', operating_company_id: other },
        ],
        management_relationship: [
          { id: 'own-relationship', operating_company_id: sole },
          { id: 'foreign-relationship', operating_company_id: other },
        ],
        parties: [
          { id: 'own-party', company_id: sole },
          { id: 'foreign-party', company_id: other },
        ],
      }),
      async () => sole,
    )

    const customers = db.schema('lifecycle').from('entity_identity').select('id') as Filter
    const relationships = db
      .schema('lifecycle')
      .from('management_relationship')
      .select('id') as Filter
    const parties = db.schema('registry').from('parties').select('party_id') as Filter

    const customerRows = (await customers) as { data: Row[] }
    const relationshipRows = (await relationships) as { data: Row[] }
    const partyRows = (await parties) as { data: Row[] }
    expect(customerRows.data.map((row) => row.id)).toEqual(['own-customer'])
    expect(relationshipRows.data.map((row) => row.id)).toEqual(['own-relationship'])
    expect(partyRows.data.map((row) => row.id)).toEqual(['own-party'])
    expect(customers.eqs).toEqual([`operating_company_id=${sole}`])
    expect(parties.eqs).toEqual([`company_id=${sole}`])
  })

  test('missing company context fails closed before the read', async () => {
    const raw = client({ entity_identity: [{ id: 'a', operating_company_id: sole }] })
    const db = gateServiceReads(raw, async () => {
      throw new Error('BLOCKED_BY_COMPANY_CONTEXT')
    })
    const selected = db.from('entity_identity').select('id') as Filter
    await expect(selected).rejects.toThrow('BLOCKED_BY_COMPANY_CONTEXT')
    expect(selected.eqs).toEqual([])
    expect(raw.fetched()).toBe(false)
  })
})
