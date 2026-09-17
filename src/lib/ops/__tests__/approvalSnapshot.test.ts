import { assertSafeOpsMetadata, canonicalApprovalSnapshot, hashApprovalSnapshot } from '../approvalSnapshot'
import { OPS_APPROVAL_POLICY_VERSION } from '../types'
import type { OpsApprovalSnapshotInput } from '../types'

const BASE: OpsApprovalSnapshotInput = {
  artifactId: 'art-1',
  artifactVersion: 1,
  taskId: 'task-1',
  actionType: 'prepare_message_draft',
  policyVersion: OPS_APPROVAL_POLICY_VERSION,
  contentHash: 'a'.repeat(64),
  sensitivity: 'internal',
  recipientId: 'party-tamir',
  destination: 'whatsapp:+35700000000',
  attachments: [
    { id: 'att-1', version: 1 },
    { id: 'att-2', version: 3 },
  ],
}

describe('ops approval snapshot', () => {
  it('is deterministic for identical payloads regardless of object key order', () => {
    const shuffled: OpsApprovalSnapshotInput = {
      sensitivity: BASE.sensitivity,
      destination: BASE.destination,
      attachments: BASE.attachments,
      contentHash: BASE.contentHash,
      policyVersion: BASE.policyVersion,
      actionType: BASE.actionType,
      taskId: BASE.taskId,
      artifactVersion: BASE.artifactVersion,
      artifactId: BASE.artifactId,
      recipientId: BASE.recipientId,
    }
    expect(canonicalApprovalSnapshot(shuffled)).toBe(canonicalApprovalSnapshot(BASE))
    expect(hashApprovalSnapshot(shuffled)).toBe(hashApprovalSnapshot(BASE))
    expect(hashApprovalSnapshot(BASE)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('changes hash when recipient, content, attachment, or version changes', () => {
    const baseHash = hashApprovalSnapshot(BASE)
    expect(hashApprovalSnapshot({ ...BASE, recipientId: 'party-other' })).not.toBe(baseHash)
    expect(hashApprovalSnapshot({ ...BASE, destination: 'email:other@example.test' })).not.toBe(
      baseHash,
    )
    expect(hashApprovalSnapshot({ ...BASE, contentHash: 'b'.repeat(64) })).not.toBe(baseHash)
    expect(hashApprovalSnapshot({ ...BASE, artifactVersion: 2 })).not.toBe(baseHash)
    expect(
      hashApprovalSnapshot({
        ...BASE,
        attachments: [
          { id: 'att-1', version: 1 },
          { id: 'att-2', version: 4 },
        ],
      }),
    ).not.toBe(baseHash)
    expect(
      hashApprovalSnapshot({
        ...BASE,
        attachments: [
          { id: 'att-2', version: 3 },
          { id: 'att-1', version: 1 },
        ],
      }),
    ).not.toBe(baseHash)
  })

  it('does not treat the approval snapshot hash as the artifact content hash', () => {
    const snapshotHash = hashApprovalSnapshot(BASE)
    expect(snapshotHash).not.toBe(BASE.contentHash)
    expect(snapshotHash).toHaveLength(64)
    expect(BASE.contentHash).toHaveLength(64)
  })

  it('rejects secret values in audit-safe metadata', () => {
    expect(() => assertSafeOpsMetadata({ token: 'secret-value' })).toThrow(/secret key/)
    expect(() => assertSafeOpsMetadata({ refresh_token: 'x' })).toThrow(/secret key/)
    expect(() => assertSafeOpsMetadata({ nested: { signedUrl: 'https://example' } })).toThrow(
      /secret key/,
    )
    expect(() => assertSafeOpsMetadata({ body_length: 12, direction: 'inbound' })).not.toThrow()
  })
})
