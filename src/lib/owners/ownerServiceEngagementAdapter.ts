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
 * Build a map from property_id UUID → property_name string.
 *
 * Uses entity_property_associations (which links entity+property_id)
 * joined with management_relationship (which has property_name).
 *
 * If no association exists, the property_id remains unresolved (null name).
 * This is expected — entity_property_associations may not be fully populated yet.
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

    // Query entity_property_associations for this entity's property mappings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .schema('lifecycle')
      .from('entity_property_associations')
      .select('property_id, association_source')
      .eq('entity_id', entityId)
      .eq('status', 'active')
      .in('property_id', propertyIds)

    if (error) throw error

    // entity_property_associations doesn't have property_name directly.
    // For now, property names remain null — they'll be resolved when
    // entity_property_associations is populated or a property registry exists.
    // The UI can still display engagements grouped by property_id.

    // Future: join with a property registry table to get names.
  } catch (err) {
    // Non-fatal — property names are display-only, not authorization
    console.error('[serviceEngagementAdapter] Property name resolution failed:', err)
  }

  return result
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
