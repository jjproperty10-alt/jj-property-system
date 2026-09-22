/**
 * Canonical payload hash matching partnership.owner_statement_payload_hash.
 * server-only.
 */

import 'server-only'

import { createHash } from 'crypto'
import type { Vm1OwnerStatementUploadLine } from './vm1OwnerStatementUploadContract'

export function sha256Hex(bytes: Buffer | Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function canonicalOwnerStatementLinePart(line: Vm1OwnerStatementUploadLine): string {
  return [
    line.reservation_id.trim(),
    line.check_in.trim(),
    line.check_out.trim(),
    line.reservation_status.trim(),
    line.gross_rental_revenue,
    line.platform_fee,
    line.guest_cleaning,
    line.total_taxes,
    line.management_charge,
    line.net_owner_payout,
    line.currency.trim(),
    line.source_row_reference.trim(),
    line.reconciliation_status.trim(),
  ].join('|')
}

export function canonicalOwnerStatementLinesText(lines: readonly Vm1OwnerStatementUploadLine[]): string {
  return lines
    .map(canonicalOwnerStatementLinePart)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .join('\n')
}

export function normalizedOwnerStatementPayloadHash(
  lines: readonly Vm1OwnerStatementUploadLine[],
): string {
  return sha256Hex(canonicalOwnerStatementLinesText(lines))
}
