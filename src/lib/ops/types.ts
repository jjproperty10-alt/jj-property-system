/**
 * Operations Core types — Phase 1B.
 * Channel-neutral. No AI, send, post, or Storage in this phase.
 */

export const OPS_TIMEZONE = 'Europe/Nicosia' as const
export const OPS_APPROVAL_POLICY_VERSION = 'ops-approval-v1' as const
export const OPS_MESSAGE_BODY_MAX = 2000 as const

export const OPS_CHANNELS = ['web', 'whatsapp', 'email'] as const
export type OpsChannel = (typeof OPS_CHANNELS)[number]

export const OPS_CONVERSATION_STATUSES = ['open', 'completed', 'cancelled'] as const
export type OpsConversationStatus = (typeof OPS_CONVERSATION_STATUSES)[number]

export const OPS_MESSAGE_DIRECTIONS = ['inbound', 'outbound', 'system'] as const
export type OpsMessageDirection = (typeof OPS_MESSAGE_DIRECTIONS)[number]

export const OPS_CAPABILITY_TYPES = [
  'transaction_draft',
  'account_query',
  'report_draft',
  'document_ingest',
  'document_request',
  'email_review',
  'message_draft',
  'contract_draft',
] as const
export type OpsCapabilityType = (typeof OPS_CAPABILITY_TYPES)[number]

export const OPS_TASK_STATUSES = [
  'received',
  'needs_information',
  'ready',
  'awaiting_approval',
  'executing',
  'completed',
  'failed',
  'cancelled',
] as const
export type OpsTaskStatus = (typeof OPS_TASK_STATUSES)[number]

export const OPS_ARTIFACT_TYPES = [
  'transaction_draft_preview',
  'report_preview',
  'document_filing_proposal',
  'document_request',
  'email_summary',
  'message_draft',
  'contract_draft',
] as const
export type OpsArtifactType = (typeof OPS_ARTIFACT_TYPES)[number]

export const OPS_ARTIFACT_STATUSES = ['prepared', 'superseded', 'approved', 'cancelled'] as const
export type OpsArtifactStatus = (typeof OPS_ARTIFACT_STATUSES)[number]

export const OPS_SENSITIVITY = ['internal', 'confidential', 'restricted'] as const
export type OpsSensitivity = (typeof OPS_SENSITIVITY)[number]

export const OPS_APPROVAL_STATUSES = [
  'pending',
  'approved',
  'consumed',
  'expired',
  'cancelled',
] as const
export type OpsApprovalStatus = (typeof OPS_APPROVAL_STATUSES)[number]

export const OPS_PROHIBITED_ACTIONS = [
  'post_transaction',
  'send_email',
  'send_whatsapp',
  'release_document',
  'sign_contract',
  'delete_evidence',
  'change_canonical_truth',
] as const
export type OpsProhibitedAction = (typeof OPS_PROHIBITED_ACTIONS)[number]

export const OPS_RISK_LEVELS = ['low', 'medium', 'high', 'restricted'] as const
export type OpsRiskLevel = (typeof OPS_RISK_LEVELS)[number]

/** Future handler name only. Phase 1B has no working external handlers. */
export interface OpsCapabilityHandlerRef {
  readonly name: string
}

export type OpsTaskTransitionMap = {
  readonly [K in OpsTaskStatus]: readonly OpsTaskStatus[]
}

export const FORBIDDEN_OPS_METADATA_KEYS = [
  'token',
  'password',
  'secret',
  'api_key',
  'refresh_token',
  'access_token',
  'authorization',
  'service_role',
  'service_role_key',
  'signed_url',
  'signedUrl',
] as const

export interface OpsApprovalAttachmentRef {
  readonly id: string
  readonly version: number
}

export interface OpsApprovalSnapshotInput {
  readonly artifactId: string
  readonly artifactVersion: number
  readonly taskId: string
  readonly actionType: string
  readonly policyVersion: string
  readonly contentHash: string
  readonly sensitivity: OpsSensitivity
  readonly recipientId?: string | null
  readonly destination?: string | null
  readonly attachments?: readonly OpsApprovalAttachmentRef[]
}
