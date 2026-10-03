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

/**
 * NOTES — Slice B overlap.
 * An unseen local Slice B edits this same file. This change is additive so
 * the two can be reconciled by hand:
 *   - SERVICE_ROLE_COMPANY_WIDE_RELATIONS is a new export. Do not merge it
 *     into SERVICE_ROLE_COMPANY_TABLES: those relations are filtered on
 *     operating_company_id; these are verify-only and must stay disjoint.
 *   - gateSelectedRead takes a GateMode ('filter' | 'verify').
 *   - gateServiceReads selects the mode with gateModeFor instead of testing
 *     SERVICE_ROLE_COMPANY_TABLES alone.
 * Keep Slice B's edits to the filtered path and this verify-only path.
 * Replacing the file wholesale drops one of them.
 *
 * Relations a service-role caller may read only inside a verified company
 * context, but which have no operating_company_id column to filter on yet
 * (company-wide views and registries). The read waits for the company
 * resolver; when it refuses (for example, more than one active company and
 * no verified permit), the read is never sent. No filter is added.
 * Move a relation to SERVICE_ROLE_COMPANY_TABLES once it carries the column.
 */
export const SERVICE_ROLE_COMPANY_WIDE_RELATIONS: ReadonlySet<string> = new Set([
  'entity_registry',
  'partnership_ownership',
  'v_anastasia_clearing',
  'v_cashbox_audit',
  'v_ceo_summary',
  'v_jj_company_pl',
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

type GateMode = 'filter' | 'verify'

function gateSelectedRead(
  filter: CompanyFilter,
  resolveCompanyId: () => Promise<string>,
  mode: GateMode,
): CompanyFilter {
  if (gated.has(filter)) return filter
  gated.add(filter)
  const originalThen = filter.then.bind(filter)
  filter.then = (onFulfilled, onRejected) =>
    resolveCompanyId().then((companyId) => {
      if (mode === 'filter') filter.eq('operating_company_id', companyId)
      return originalThen(onFulfilled, onRejected)
    }, onRejected)
  return filter
}

function gateModeFor(relation: string): GateMode | null {
  if (SERVICE_ROLE_COMPANY_TABLES.has(relation)) return 'filter'
  if (SERVICE_ROLE_COMPANY_WIDE_RELATIONS.has(relation)) return 'verify'
  return null
}

export function gateServiceReads<T extends CompanyClient>(
  client: T,
  resolveCompanyId: () => Promise<string>,
): T {
  const originalFrom = client.from.bind(client)
  client.from = (relation: string) => {
    const query = originalFrom(relation)
    const mode = gateModeFor(relation)
    if (mode === null || query === null || typeof query !== 'object') {
      return query
    }
    const selectable = query as CompanyQuery
    if (typeof selectable.select !== 'function') return query
    const originalSelect = selectable.select.bind(selectable)
    selectable.select = (...args: unknown[]) => {
      const selected = originalSelect(...args)
      return gateSelectedRead(selected, resolveCompanyId, mode)
    }
    return selectable
  }

  if (typeof client.schema === 'function') {
    const originalSchema = client.schema.bind(client)
    client.schema = (schema: string) => gateServiceReads(originalSchema(schema) as T, resolveCompanyId)
  }

  return client
}
