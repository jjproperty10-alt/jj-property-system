import type {
  OpsCapabilityHandlerRef,
  OpsCapabilityType,
  OpsProhibitedAction,
  OpsRiskLevel,
  OpsTaskStatus,
  OpsTaskTransitionMap,
} from './types'
import { OPS_CAPABILITY_TYPES, OPS_PROHIBITED_ACTIONS } from './types'

const ALL_PROHIBITED: readonly OpsProhibitedAction[] = OPS_PROHIBITED_ACTIONS

function transitions(requiresApproval: boolean): OpsTaskTransitionMap {
  const ready: readonly OpsTaskStatus[] = requiresApproval
    ? ['awaiting_approval', 'cancelled']
    : ['completed', 'cancelled', 'awaiting_approval']
  return {
    received: ['needs_information', 'ready', 'cancelled'],
    needs_information: ['ready', 'cancelled'],
    ready,
    awaiting_approval: ['executing', 'cancelled'],
    executing: ['completed', 'failed', 'cancelled'],
    completed: [],
    failed: [],
    cancelled: [],
  }
}

export interface OpsCapabilityDefinition {
  readonly type: OpsCapabilityType
  readonly riskLevel: OpsRiskLevel
  readonly requiresApproval: boolean
  readonly allowedTaskTransitions: OpsTaskTransitionMap
  readonly prohibitedActions: readonly OpsProhibitedAction[]
  readonly handler: OpsCapabilityHandlerRef
}

const CAPABILITIES: { readonly [K in OpsCapabilityType]: OpsCapabilityDefinition } = {
  transaction_draft: {
    type: 'transaction_draft',
    riskLevel: 'high',
    requiresApproval: true,
    allowedTaskTransitions: transitions(true),
    prohibitedActions: ALL_PROHIBITED,
    handler: { name: 'handleTransactionDraft' },
  },
  account_query: {
    type: 'account_query',
    riskLevel: 'low',
    requiresApproval: false,
    allowedTaskTransitions: transitions(false),
    prohibitedActions: ALL_PROHIBITED,
    handler: { name: 'handleAccountQuery' },
  },
  report_draft: {
    type: 'report_draft',
    riskLevel: 'high',
    requiresApproval: true,
    allowedTaskTransitions: transitions(true),
    prohibitedActions: ALL_PROHIBITED,
    handler: { name: 'handleReportDraft' },
  },
  document_ingest: {
    type: 'document_ingest',
    riskLevel: 'high',
    requiresApproval: true,
    allowedTaskTransitions: transitions(true),
    prohibitedActions: ALL_PROHIBITED,
    handler: { name: 'handleDocumentIngest' },
  },
  document_request: {
    type: 'document_request',
    riskLevel: 'high',
    requiresApproval: true,
    allowedTaskTransitions: transitions(true),
    prohibitedActions: ALL_PROHIBITED,
    handler: { name: 'handleDocumentRequest' },
  },
  email_review: {
    type: 'email_review',
    riskLevel: 'medium',
    requiresApproval: false,
    allowedTaskTransitions: transitions(false),
    prohibitedActions: ALL_PROHIBITED,
    handler: { name: 'handleEmailReview' },
  },
  message_draft: {
    type: 'message_draft',
    riskLevel: 'high',
    requiresApproval: true,
    allowedTaskTransitions: transitions(true),
    prohibitedActions: ALL_PROHIBITED,
    handler: { name: 'handleMessageDraft' },
  },
  contract_draft: {
    type: 'contract_draft',
    riskLevel: 'restricted',
    requiresApproval: true,
    allowedTaskTransitions: transitions(true),
    prohibitedActions: ALL_PROHIBITED,
    handler: { name: 'handleContractDraft' },
  },
}

export const OPS_CAPABILITY_REGISTRY: Readonly<typeof CAPABILITIES> = CAPABILITIES

export function isOpsCapabilityType(value: string): value is OpsCapabilityType {
  return (OPS_CAPABILITY_TYPES as readonly string[]).includes(value)
}

export function getCapability(type: string): OpsCapabilityDefinition {
  if (!isOpsCapabilityType(type)) {
    throw new Error(`unknown ops capability: ${type}`)
  }
  return CAPABILITIES[type]
}

export function listCapabilities(): readonly OpsCapabilityDefinition[] {
  return OPS_CAPABILITY_TYPES.map((type) => CAPABILITIES[type])
}
