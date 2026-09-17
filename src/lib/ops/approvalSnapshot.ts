import { createHash } from 'crypto'
import type { OpsApprovalSnapshotInput } from './types'
import { FORBIDDEN_OPS_METADATA_KEYS } from './types'

function canonicalize(value: unknown): unknown {
  if (value === undefined) return undefined
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(canonicalize)
  const record = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(record).sort()) {
    if (record[key] === undefined) continue
    out[key] = canonicalize(record[key])
  }
  return out
}

export function assertSafeOpsMetadata(metadata: Record<string, unknown>): void {
  const forbidden = new Set<string>(FORBIDDEN_OPS_METADATA_KEYS)
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (forbidden.has(key) || forbidden.has(key.toLowerCase())) {
        throw new Error(`ops metadata must not contain secret key: ${key}`)
      }
      walk(value)
    }
  }
  walk(metadata)
}

export function canonicalApprovalSnapshot(input: OpsApprovalSnapshotInput): string {
  const payload = {
    actionType: input.actionType,
    artifactId: input.artifactId,
    artifactVersion: input.artifactVersion,
    attachments: (input.attachments ?? []).map((item) => ({
      id: item.id,
      version: item.version,
    })),
    contentHash: input.contentHash,
    destination: input.destination ?? null,
    policyVersion: input.policyVersion,
    recipientId: input.recipientId ?? null,
    sensitivity: input.sensitivity,
    taskId: input.taskId,
  }
  assertSafeOpsMetadata(payload as unknown as Record<string, unknown>)
  return JSON.stringify(canonicalize(payload))
}

export function hashApprovalSnapshot(input: OpsApprovalSnapshotInput): string {
  return createHash('sha256').update(canonicalApprovalSnapshot(input), 'utf8').digest('hex')
}
