export const SERVICE_ROLE_COMPANY_TABLES: ReadonlySet<string> = new Set([
  'agent_transaction_drafts',
  'management_fee_configs',
  'ownership',
  'properties',
  'property_acquisition',
  'property_definitions',
  'property_mappings',
  'property_name_aliases',
  'property_owners',
  'property_ownership',
  'property_reporting_map',
  'service_engagements',
])

type CompanyFilter = {
  method?: string
  eq: (column: string, value: string) => unknown
  then: (
    onFulfilled?: ((value: unknown) => unknown) | null,
    onRejected?: ((reason: unknown) => unknown) | null,
  ) => Promise<unknown>
}

type CompanyQuery = {
  select: (...args: unknown[]) => CompanyFilter
}

type CompanyClient = {
  from: (relation: string) => unknown
  schema?: (schema: string) => unknown
}

const gated = new WeakSet<object>()

function gateSelectedRead(
  filter: CompanyFilter,
  resolveCompanyId: () => Promise<string>,
): CompanyFilter {
  if (gated.has(filter)) return filter
  gated.add(filter)
  const originalThen = filter.then.bind(filter)
  filter.then = (onFulfilled, onRejected) =>
    resolveCompanyId().then((companyId) => {
      filter.eq('operating_company_id', companyId)
      return originalThen(onFulfilled, onRejected)
    }, onRejected)
  return filter
}

export function gateServiceReads<T extends CompanyClient>(
  client: T,
  resolveCompanyId: () => Promise<string>,
): T {
  const originalFrom = client.from.bind(client)
  client.from = (relation: string) => {
    const query = originalFrom(relation)
    if (!SERVICE_ROLE_COMPANY_TABLES.has(relation) || query === null || typeof query !== 'object') {
      return query
    }
    const selectable = query as CompanyQuery
    if (typeof selectable.select !== 'function') return query
    const originalSelect = selectable.select.bind(selectable)
    selectable.select = (...args: unknown[]) => {
      const selected = originalSelect(...args)
      return gateSelectedRead(selected, resolveCompanyId)
    }
    return selectable
  }

  if (typeof client.schema === 'function') {
    const originalSchema = client.schema.bind(client)
    client.schema = (schema: string) => gateServiceReads(originalSchema(schema) as T, resolveCompanyId)
  }

  return client
}
