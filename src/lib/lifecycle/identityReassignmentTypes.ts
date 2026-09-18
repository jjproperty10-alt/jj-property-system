/**
 * Managed-property identity reassignment.
 * Writes lifecycle.entity_id only. Never cash, never JJ P&L, never public.transactions.
 */

export const IDENTITY_REASSIGNMENT_STAFF_ROLES = ['ceo', 'finance_admin'] as const
export type IdentityReassignmentStaffRole = (typeof IDENTITY_REASSIGNMENT_STAFF_ROLES)[number]

export const IDENTITY_REASSIGNMENT_RPC = 'apply_managed_property_identity_reassignment'

export interface ApplyManagedPropertyIdentityReassignmentInput {
  readonly managementRelationshipId: string
  readonly entityPropertyAssociationId: string
  readonly serviceEngagementId: string
  readonly expectedOldEntityId: string
  readonly newEntityId: string
  readonly expectedPropertyName: string
  readonly expectedCanonicalPropertyId: string
  readonly expectedServiceType: string
  readonly reason: string
  readonly evidenceRef: string
  readonly idempotencyKey: string
}

export interface IdentityReassignmentRpcResult {
  readonly operation_id: string
  readonly replay: boolean
  readonly idempotent: boolean
  readonly updated_count: number
  readonly audit_count: number
  readonly affected: {
    readonly management_relationship_id: string
    readonly entity_property_association_id: string
    readonly service_engagement_id: string
  }
  readonly old_entity_id: string
  readonly new_entity_id: string
  readonly actor: string
}
