import type { OpsCapabilityType, OpsTaskStatus, OpsTaskTransitionMap } from './types'
import { getCapability } from './capabilityRegistry'

export function isTerminalTaskStatus(status: OpsTaskStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

export function allowedTaskTransitions(
  capabilityType: OpsCapabilityType,
): OpsTaskTransitionMap {
  return getCapability(capabilityType).allowedTaskTransitions
}

export function canTransitionTask(
  capabilityType: OpsCapabilityType,
  from: OpsTaskStatus,
  to: OpsTaskStatus,
): boolean {
  if (from === to) return true
  return allowedTaskTransitions(capabilityType)[from].includes(to)
}

export function assertTaskTransition(
  capabilityType: OpsCapabilityType,
  from: OpsTaskStatus,
  to: OpsTaskStatus,
): void {
  if (!canTransitionTask(capabilityType, from, to)) {
    throw new Error(`ops task transition rejected: ${capabilityType} ${from} -> ${to}`)
  }
}
