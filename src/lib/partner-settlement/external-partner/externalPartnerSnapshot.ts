/**
 * @module partner-settlement/external-partner/externalPartnerSnapshot
 * @description Approved Villa Mazotos cutoff snapshot as version control.
 *
 * The 202-row classification is an approved snapshot at the cutoff, not a rule
 * that live `transactions` must always contain 202 rows. New rows after the
 * cutoff are bound beside the snapshot and never mutate it.
 *
 * The 202 rows themselves are not embedded here — only hash / version / count.
 */

import type {
  ExternalPartnerApprovedSnapshot,
  ExternalPartnerSnapshotBinding,
  RawExternalPartnerTransaction,
} from './externalPartnerReadTypes'
import { isInExternalPartnerReadScope } from './externalPartnerReader'

export const VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT: ExternalPartnerApprovedSnapshot =
  Object.freeze({
    kind: 'approved_cutoff_snapshot',
    propertyName: 'Villa Mazotos',
    cutoffDate: '2026-08-29',
    approvedRowCount: 202,
    version: 'vm1-classification-202-v1',
    sha256: '0477bfc5f2285425d55af6793f9d09bf829ee62387fb5b2a42bc0958478baf97',
    classificationArtifact:
      'docs/handoffs/JJ_CLAUDE_UNPUSHED_HANDOFF_2026-09-02/03_handoff_bundle/VM1_transaction_classification.csv',
  })

/**
 * Attach live reads to the frozen snapshot without changing it.
 * Post-cutoff live rows are listed separately; `approvedRowCount` stays 202.
 */
export function bindLiveRowsToApprovedSnapshot(
  liveRows: readonly RawExternalPartnerTransaction[],
): ExternalPartnerSnapshotBinding {
  const inScope = liveRows.filter(isInExternalPartnerReadScope)
  const liveRowsAfterCutoff = inScope.filter(
    (row) => row.date > VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT.cutoffDate,
  )
  return {
    snapshot: VM1_APPROVED_EXTERNAL_PARTNER_SNAPSHOT,
    liveRowsInScope: inScope,
    liveRowsAfterCutoff,
  }
}
