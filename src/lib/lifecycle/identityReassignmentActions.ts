'use server'

/**
 * Session-JWT action for managed-property identity reassignment.
 * Browser → authenticateStatementUser → createSupabaseServerClient → public RPC.
 * Never uses the service-role client. Does not write public.transactions.
 */

import 'server-only'

import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { isValidUUID } from '@/lib/owners/validation'
import {
  assertIdentityReassignmentRpcAuthorized,
  UnauthorizedIdentityReassignmentError,
} from './identityReassignmentRpcAuth'
import {
  IDENTITY_REASSIGNMENT_RPC,
  type ApplyManagedPropertyIdentityReassignmentInput,
  type IdentityReassignmentRpcResult,
} from './identityReassignmentTypes'

function sessionDb() {
  return createSupabaseServerClient()
}

function staffOrError(
  auth: Awaited<ReturnType<typeof authenticateStatementUser>>,
): { ok: true; userId: string; staffRole: string } | { ok: false; error: string } {
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }
  try {
    assertIdentityReassignmentRpcAuthorized({
      jwtRole: 'authenticated',
      staffRole: auth.staffRole,
    })
  } catch (err) {
    if (err instanceof UnauthorizedIdentityReassignmentError) return { ok: false, error: err.message }
    throw err
  }
  return { ok: true, userId: auth.userId, staffRole: auth.staffRole }
}

function asResult(data: unknown): IdentityReassignmentRpcResult {
  const row = data as IdentityReassignmentRpcResult
  return {
    operation_id: String(row.operation_id),
    replay: Boolean(row.replay),
    idempotent: Boolean(row.idempotent),
    updated_count: Number(row.updated_count ?? 0),
    audit_count: Number(row.audit_count ?? 0),
    affected: {
      management_relationship_id: String(row.affected.management_relationship_id),
      entity_property_association_id: String(row.affected.entity_property_association_id),
      service_engagement_id: String(row.affected.service_engagement_id),
    },
    old_entity_id: String(row.old_entity_id),
    new_entity_id: String(row.new_entity_id),
    actor: String(row.actor),
  }
}

export async function applyManagedPropertyIdentityReassignmentAction(
  input: ApplyManagedPropertyIdentityReassignmentInput,
): Promise<{ ok: true; result: IdentityReassignmentRpcResult } | { ok: false; error: string }> {
  const gate = staffOrError(await authenticateStatementUser())
  if (!gate.ok) return gate
  if (
    !isValidUUID(input.managementRelationshipId) ||
    !isValidUUID(input.entityPropertyAssociationId) ||
    !isValidUUID(input.serviceEngagementId) ||
    !isValidUUID(input.expectedOldEntityId) ||
    !isValidUUID(input.newEntityId) ||
    !isValidUUID(input.expectedCanonicalPropertyId)
  ) {
    return { ok: false, error: 'Invalid identity UUID' }
  }
  if (
    !input.expectedPropertyName.trim() ||
    !input.expectedServiceType.trim() ||
    !input.reason.trim() ||
    !input.evidenceRef.trim() ||
    !input.idempotencyKey.trim()
  ) {
    return { ok: false, error: 'Missing required identity-reassignment fields' }
  }

  const { data, error } = await sessionDb().rpc(IDENTITY_REASSIGNMENT_RPC, {
    p_management_relationship_id: input.managementRelationshipId,
    p_entity_property_association_id: input.entityPropertyAssociationId,
    p_service_engagement_id: input.serviceEngagementId,
    p_expected_old_entity_id: input.expectedOldEntityId,
    p_new_entity_id: input.newEntityId,
    p_expected_property_name: input.expectedPropertyName.trim(),
    p_expected_canonical_property_id: input.expectedCanonicalPropertyId,
    p_expected_service_type: input.expectedServiceType.trim(),
    p_reason: input.reason.trim(),
    p_evidence_ref: input.evidenceRef.trim(),
    p_idempotency_key: input.idempotencyKey.trim(),
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, result: asResult(data) }
}
