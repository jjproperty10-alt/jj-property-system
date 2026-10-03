/**
 * Filtered service reads. Each relation names the column the company id is
 * compared with. The set below is derived from these keys.
 *
 * entity_identity and management_relationship filter on operating_company_id.
 * parties filters on company_id. Those columns are added or already present
 * only after Slice A's migration is applied; this file does not apply it.
 */
export const SERVICE_ROLE_COMPANY_COLUMNS: Readonly<Record<string, string>> = {
  agent_transaction_drafts: 'operating_company_id',
  entity_identity: 'operating_company_id',
  management_fee_configs: 'operating_company_id',
  management_relationship: 'operating_company_id',
  ownership: 'operating_company_id',
  parties: 'company_id',
  properties: 'operating_company_id',
  property_acquisition: 'operating_company_id',
  property_definitions: 'operating_company_id',
  property_mappings: 'operating_company_id',
  property_name_aliases: 'operating_company_id',
  property_owners: 'operating_company_id',
  property_ownership: 'operating_company_id',
  property_reporting_map: 'operating_company_id',
  service_engagements: 'operating_company_id',
}

export const SERVICE_ROLE_COMPANY_TABLES: ReadonlySet<string> = new Set(
  Object.keys(SERVICE_ROLE_COMPANY_COLUMNS),
)

/**
 * NOTES — hand merge of Slice B onto the direct-service-client draft.
 * Slice B replaced the filtered-relation list with SERVICE_ROLE_COMPANY_COLUMNS
 * and passed that column into the selected-read gate. This file keeps that map.
 * It also keeps the draft that Slice B did not have:
 *   - GateMode is 'filter' | 'verify' | 'refuse'.
 *   - SERVICE_ROLE_COMPANY_WIDE_RELATIONS stays disjoint from the filtered map.
 *     Those relations wait for a verified company and add no column filter.
 *   - A relation in neither set is refused. The underlying client is not called.
 *   - A resolver result that is not a non-empty string is refused. The read
 *     is not sent.
 * A missing column on a filtered relation is refused. It is not passed through.
 * Replacing this file with Slice B alone would drop refuse, verify, and the
 * non-empty company check.
 *
 * Relations a caller may read only inside a verified company context, but
 * which have no company column to filter on yet (company-wide views and
 * registries). Move a relation into SERVICE_ROLE_COMPANY_COLUMNS once it
 * carries the column named there.
 */
export const SERVICE_ROLE_COMPANY_WIDE_RELATIONS: ReadonlySet<string> = new Set([
  'entity_registry',
  'partnership_ownership',
  'v_anastasia_clearing',
  'v_cashbox_audit',
  'v_ceo_summary',
  'v_jj_company_pl',
  // Decision-page selects. Still no company-column filter: the company
  // resolver must succeed, and the caller must already have passed the staff
  // and membership check. An unlisted relation stays refused.
  'claim_templates',
  'evidence_links',
  'statement_events',
  // Staff-action tables with no company column yet. The contacts draft
  // records that contacts and contact_properties have neither company_id
  // nor operating_company_id, and it does not add one. Verify mode still
  // waits for the company resolver and adds no column filter. user_roles
  // stays unlisted and refused. The admin check reads the caller's own
  // user_roles row on the session client.
  'jj_staff_config',
  'contacts',
  'contact_properties',
  'contact_opening_balances',
  'partnership_capital',
  'entity_aliases',
  'accounting_rules',
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

type GateMode = 'filter' | 'verify' | 'refuse'

export const UNGATED_RELATION_BLOCK = 'BLOCKED_BY_UNGATED_RELATION'

function companyIdOrBlock(companyId: unknown): string {
  if (typeof companyId !== 'string' || companyId.length === 0) {
    throw new Error('BLOCKED_BY_COMPANY_CONTEXT')
  }
  return companyId
}

function blockedRead(message: string): CompanyFilter {
  const error = new Error(message)
  const filter: CompanyFilter = {
    eq: () => filter,
    then: (onFulfilled, onRejected) => Promise.reject(error).then(onFulfilled, onRejected),
  }
  const chain = filter as CompanyFilter & {
    order: () => CompanyFilter
    single: () => CompanyFilter
    maybeSingle: () => CompanyFilter
    limit: () => CompanyFilter
    gte: () => CompanyFilter
    lte: () => CompanyFilter
    in: () => CompanyFilter
  }
  chain.order = () => filter
  chain.single = () => filter
  chain.maybeSingle = () => filter
  chain.limit = () => filter
  chain.gte = () => filter
  chain.lte = () => filter
  chain.in = () => filter
  return filter
}

function gateSelectedRead(
  filter: CompanyFilter,
  column: string,
  resolveCompanyId: () => Promise<string>,
  mode: Exclude<GateMode, 'refuse'>,
): CompanyFilter {
  if (gated.has(filter)) return filter
  gated.add(filter)
  const originalThen = filter.then.bind(filter)
  filter.then = (onFulfilled, onRejected) => {
    // Await ignores the return value of then() and settles only by calling
    // the handlers it passes in. A throw inside an inner promise must invoke
    // onRejected itself, or the caller hangs and the rejection is unhandled.
    const fail = (error: unknown) => {
      if (typeof onRejected === 'function') onRejected(error)
    }
    return resolveCompanyId().then((companyId) => {
      try {
        const verified = companyIdOrBlock(companyId)
        if (mode === 'filter') filter.eq(column, verified)
      } catch (error) {
        fail(error)
        return undefined
      }
      return originalThen(onFulfilled, onRejected)
    }, fail)
  }
  return filter
}

function gateModeFor(relation: string): GateMode {
  if (SERVICE_ROLE_COMPANY_TABLES.has(relation)) return 'filter'
  if (SERVICE_ROLE_COMPANY_WIDE_RELATIONS.has(relation)) return 'verify'
  return 'refuse'
}

export function gateServiceReads<T extends CompanyClient>(
  client: T,
  resolveCompanyId: () => Promise<string>,
): T {
  const originalFrom = client.from.bind(client)
  client.from = (relation: string) => {
    const mode = gateModeFor(relation)
    if (mode === 'refuse') {
      return {
        select: () => blockedRead(`${UNGATED_RELATION_BLOCK}:${relation}`),
      }
    }
    const column = mode === 'filter' ? SERVICE_ROLE_COMPANY_COLUMNS[relation] : ''
    if (mode === 'filter' && !column) {
      return {
        select: () => blockedRead(`${UNGATED_RELATION_BLOCK}:${relation}`),
      }
    }
    const query = originalFrom(relation)
    if (query === null || typeof query !== 'object') {
      return query
    }
    const selectable = query as CompanyQuery
    if (typeof selectable.select !== 'function') return query
    const originalSelect = selectable.select.bind(selectable)
    selectable.select = (...args: unknown[]) => {
      const selected = originalSelect(...args)
      return gateSelectedRead(selected, column, resolveCompanyId, mode)
    }
    return selectable
  }

  if (typeof client.schema === 'function') {
    const originalSchema = client.schema.bind(client)
    client.schema = (schema: string) => gateServiceReads(originalSchema(schema) as T, resolveCompanyId)
  }

  return client
}
