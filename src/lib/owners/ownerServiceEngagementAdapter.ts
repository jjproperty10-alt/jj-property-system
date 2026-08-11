/**
 * ownerServiceEngagementAdapter — Read-only data consumer for Service Engagements.
 *
 * P2 PR #2: Read Layer — connects lifecycle.service_engagements to Owner Workspace.
 *
 * Architecture: ownerWorkspaceService → ownerServiceEngagementAdapter → lifecycle RPC
 *
 * Responsibility:
 * - Calls get_entity_service_engagements RPC via Supabase (service_role only)
 * - Maps raw DB rows to ServiceEngagementDTO
 * - Groups engagements by property_id
 * - Resolves property_id UUIDs to property names using management_relationship
 * - Returns empty arrays cleanly when no engagements exist (normal state)
 *
 * Boundary:
 * - Read-only — zero writes
 * - No financial calculations
 * - No service creation or status changes
 * - No Hostaway or ownership logic
 *
 * Fail-closed: DB errors → empty result with console.error (partial data preferred)
 *
 * server-only: must never be imported into Client Components.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import type {
  ServiceEngagementDTO,
  ServiceType,
  ServiceEngagementStatus,
  PropertyServiceEngagementsDTO,
  OwnerServiceEngagementsDTO,
  EntityPropertyOption,
} from './ownerWorkspaceTypes'

// ─── DB Row Type (internal — not exported) ───────────────────────────────────

interface ServiceEngagementRow {
  id: string
  entity_id: string
  property_id: string
  service_type: string
  status: string
  effective_from: string | null
  effective_to: string | null
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
}

// ─── Validated type guards ───────────────────────────────────────────────────

const VALID_SERVICE_TYPES = new Set<ServiceType>([
  'renovation', 'sale', 'management_ltr', 'airbnb_str',
])

const VALID_STATUSES = new Set<ServiceEngagementStatus>([
  'draft', 'active', 'suspended', 'closed',
])

function isValidServiceType(value: string): value is ServiceType {
  return VALID_SERVICE_TYPES.has(value as ServiceType)
}

function isValidStatus(value: string): value is ServiceEngagementStatus {
  return VALID_STATUSES.has(value as ServiceEngagementStatus)
}

// ─── Row → DTO mapper (pure) ────────────────────────────────────────────────

function mapRow(row: ServiceEngagementRow): ServiceEngagementDTO | null {
  // Validate enum values — reject rows with unexpected types/statuses
  if (!isValidServiceType(row.service_type)) {
    console.error(
      `[serviceEngagementAdapter] Invalid service_type "${row.service_type}" for engagement ${row.id}`,
    )
    return null
  }
  if (!isValidStatus(row.status)) {
    console.error(
      `[serviceEngagementAdapter] Invalid status "${row.status}" for engagement ${row.id}`,
    )
    return null
  }

  return {
    id: row.id,
    entityId: row.entity_id,
    propertyId: row.property_id,
    serviceType: row.service_type,
    status: row.status,
    effectiveFrom: row.effective_from ?? null,
    effectiveTo: row.effective_to ?? null,
    notes: row.notes ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ─── Property name resolution ────────────────────────────────────────────────

/**
 * Build a map from property_id UUID → property display name.
 *
 * Uses the get_entity_associated_properties RPC which joins
 * entity_property_associations → property_definitions.
 * Falls back to direct property_definitions lookup for any
 * property_ids not found in associations.
 *
 * P2 PR #4: Replaced stub with working implementation.
 */
async function resolvePropertyNames(
  entityId: string,
  propertyIds: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>()
  if (propertyIds.length === 0) return result

  // Initialize all as unresolved
  for (const pid of propertyIds) {
    result.set(pid, null)
  }

  try {
    const sb = createServiceClient()

    // Try the RPC first (joins EPA → property_definitions)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .rpc('get_entity_associated_properties', {
        p_entity_id: entityId,
      })

    if (!error && data) {
      for (const row of data as { property_id: string; property_name: string }[]) {
        if (propertyIds.includes(row.property_id)) {
          result.set(row.property_id, row.property_name)
        }
      }
    }

    // For any still-unresolved, try property_definitions directly
    const unresolved = propertyIds.filter(pid => result.get(pid) === null)
    if (unresolved.length > 0) {
      const { data: pdData, error: pdError } = await sb
        .from('property_definitions')
        .select('property_id, display_name, canonical_name, property_name')
        .in('property_id', unresolved)

      if (!pdError && pdData) {
        for (const row of pdData as {
          property_id: string
          display_name: string | null
          canonical_name: string | null
          property_name: string
        }[]) {
          result.set(
            row.property_id,
            row.display_name ?? row.canonical_name ?? row.property_name,
          )
        }
      }
    }
  } catch (err) {
    // Non-fatal — property names are display-only, not authorization
    console.error('[serviceEngagementAdapter] Property name resolution failed:', err)
  }

  return result
}

/**
 * Fetch properties associated with an entity for UI selection (dropdowns).
 *
 * Calls lifecycle.get_entity_associated_properties RPC.
 * Returns empty array if entity has no associations (normal).
 *
 * P2 PR #4: New function for Add Service form.
 */
export async function fetchEntityProperties(
  entityId: string,
): Promise<readonly EntityPropertyOption[]> {
  try {
    const sb = createServiceClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .rpc('get_entity_associated_properties', {
        p_entity_id: entityId,
      })

    if (error) throw error
    if (!data) return []

    return (data as { property_id: string; property_name: string }[]).map(row => ({
      propertyId: row.property_id,
      propertyName: row.property_name,
    }))
  } catch (err) {
    console.error('[serviceEngagementAdapter] fetchEntityProperties failed:', err)
    return []
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch all service engagements for an entity.
 *
 * Calls lifecycle.get_entity_service_engagements(entity_id UUID) RPC.
 * Groups results by property_id. Resolves property names where possible.
 *
 * Returns empty OwnerServiceEngagementsDTO when:
 * - No engagements exist (normal — table starts empty)
 * - RPC call fails (fail-closed)
 *
 * @param entityId - UUID from identity resolver (entity_identity.id)
 * @param managedPropertyNames - Property names from management_relationship (for name resolution)
 */
export async function fetchEntityServiceEngagements(
  entityId: string,
  managedPropertyNames: readonly string[] = [],
): Promise<OwnerServiceEngagementsDTO> {
  const empty: OwnerServiceEngagementsDTO = {
    entityId,
    properties: [],
    totalEngagements: 0,
  }

  // Call RPC
  let rows: ServiceEngagementRow[]
  try {
    const sb = createServiceClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .rpc('get_entity_service_engagements', {
        p_entity_id: entityId,
      })

    if (error) throw error
    rows = (data ?? []) as ServiceEngagementRow[]
  } catch (err) {
    console.error(
      '[serviceEngagementAdapter] get_entity_service_engagements RPC failed:',
      err,
    )
    return empty
  }

  if (rows.length === 0) return empty

  // Map rows to DTOs (filtering out invalid rows)
  const engagements = rows
    .map(mapRow)
    .filter((dto): dto is ServiceEngagementDTO => dto !== null)

  if (engagements.length === 0) return empty

  // Collect unique property_ids
  const propertyIds = Array.from(new Set(engagements.map(e => e.propertyId)))

  // Resolve property names
  const propertyNameMap = await resolvePropertyNames(entityId, propertyIds)

  // Group by property_id
  const grouped = new Map<string, ServiceEngagementDTO[]>()
  for (const engagement of engagements) {
    const list = grouped.get(engagement.propertyId) ?? []
    list.push(engagement)
    grouped.set(engagement.propertyId, list)
  }

  // Build property groups
  const properties: PropertyServiceEngagementsDTO[] = propertyIds.map(pid => ({
    propertyId: pid,
    propertyName: propertyNameMap.get(pid) ?? null,
    engagements: Object.freeze(grouped.get(pid) ?? []),
  }))

  return {
    entityId,
    properties: Object.freeze(properties),
    totalEngagements: engagements.length,
  }
}
