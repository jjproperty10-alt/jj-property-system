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
 *   - gateSelectedRead takes a GateMode ('filter' | 'verify' | 'refuse').
 *   - gateServiceReads selects the mode with gateModeFor instead of testing
 *     SERVICE_ROLE_COMPANY_TABLES alone. A relation in neither set is
 *     refused. A resolver result that is not a non-empty string is refused.
 *     Neither path sends the read.
 * Keep Slice B's edits to the filtered path and this verify-only / refuse path.
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
  // Decision-page selects. Still no operating_company_id filter: the company
  // resolver must succeed, and the caller must already have passed the staff
  // and membership check. An unlisted relation stays refused.
  'claim_templates',
  'evidence_links',
  'statement_events',
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
        if (mode === 'filter') filter.eq('operating_company_id', verified)
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
    const query = originalFrom(relation)
    if (query === null || typeof query !== 'object') {
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
