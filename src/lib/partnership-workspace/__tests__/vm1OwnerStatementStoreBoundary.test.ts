/**
 * Phase 2B.3E application contract: Operations stays fail-closed.
 * Does not wire the Owner Statement store. No Production SHA/amounts.
 */
import * as fs from 'fs'
import * as path from 'path'
import { loadVm1OperationsView } from '../vm1OperationsService'
import { VM1_OS_EVIDENCE_REASON } from '../vm1OwnerStatementEvidence'
import { AVI_CERTIFIED_NET_EUR } from '@/lib/partner-settlement/external-partner/aviCertifiedIdentity'
import { VM1_APPROVED_FUTURE_DRAFT_EXPENSE_TRANSACTION_ID } from '../vm1ExpenseAdmission'
import { admitVm1DraftReservations } from '../vm1DraftAdmission'

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
}

const NOW = new Date(Date.UTC(2026, 8, 17))

describe('VM1 Owner Statement store is not wired into Operations', () => {
  it('Production service still fail-closes with missingStore and zero admitted revenue', async () => {
    const client = {
      rpc: (name: string) => {
        if (name === 'resolve_property_canonical') {
          return Promise.resolve({
            data: [
              {
                status: 'resolved',
                canonical_property_id: '4eb09c84-907a-404c-b19a-7856f73fadff',
                canonical_name: 'Villa Mazotos',
                candidates: null,
              },
            ],
            error: null,
          })
        }
        if (name === 'pms_reservations_for_property') {
          return Promise.resolve({
            data: [
              {
                external_id: '65733679',
                external_property_id: '412148',
                channel: 'airbnb',
                status: 'confirmed',
                check_in: '2026-09-03',
                check_out: '2026-09-06',
                expectedPayout: 999,
                airbnbExpectedPayoutAmount: 999,
              },
            ],
            error: null,
          })
        }
        return Promise.resolve({ data: null, error: { message: `unexpected rpc ${name}` } })
      },
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return Promise.resolve({ data: [], error: null })
                  },
                }
              },
            }
          },
        }
      },
    }

    const loaded = await loadVm1OperationsView({
      client,
      fromParam: '2026-08-30',
      toParam: '2026-11-30',
      now: NOW,
    })
    if (!loaded.ok) throw new Error(loaded.reason)
    expect(loaded.ownerStatementEvidence.ok).toBe(false)
    expect(loaded.ownerStatementEvidence.reason).toBe(VM1_OS_EVIDENCE_REASON.missingStore)
    expect(loaded.ownerStatementLines).toEqual([])
    expect(loaded.draftAdmissionLines.filter((l) => l.admittedCandidate)).toHaveLength(0)
    expect(loaded.draftAdmissionLines.some((l) => l.externalId === '65733679' && l.admittedCandidate)).toBe(
      false,
    )
  })

  it('does not call store wrappers, inject fixture SHA, or split 50/25/25', () => {
    const service = read('src/lib/partnership-workspace/vm1OperationsService.ts')
    const adapter = read('src/lib/partnership-workspace/vm1OwnerStatementEvidence.ts')
    expect(service).not.toContain('ingest_partnership_owner_statement_document')
    expect(service).not.toContain('read_partnership_owner_statement_for_listing')
    expect(service).not.toContain('void_partnership_owner_statement_document')
    expect(service).toContain('VM1_OS_EVIDENCE_REASON.missingStore')
    expect(adapter).not.toContain('b2945e7f')
    expect(service).not.toContain('b2945e7f')
    expect(service + adapter).not.toContain('50/25/25')
    expect(service).not.toContain('expectedPayout')
  })

  it('keeps Avi Certified net, Internet expense id, and 53139113 exclusion unchanged', () => {
    expect(AVI_CERTIFIED_NET_EUR).toBe(594.25)
    expect(VM1_APPROVED_FUTURE_DRAFT_EXPENSE_TRANSACTION_ID).toBe(
      'efe4e1f5-8524-5266-ab10-4eedaa5b3e76',
    )
    const admitted = admitVm1DraftReservations(
      [
        {
          externalId: '53139113',
          listingId: '412148',
          channel: 'airbnb',
          status: 'confirmed',
          checkIn: '2026-08-20',
          checkOut: '2026-08-25',
          nights: 5,
          totalPrice: 100,
          cleaningFee: 0,
          hostServiceFee: 0,
          expectedPayout: 999,
          taxAmount: 0,
          paymentStatus: 'Paid',
          cancellationDate: null,
          disposition: 'already_certified',
          reason: 'Certified Avi stay.',
        },
      ],
      {
        asOfIso: '2026-09-17',
        certifiedReservationIds: new Set(['53139113']),
      },
    )
    if (!admitted.ok) throw new Error(admitted.reason)
    expect(admitted.lines[0]?.admissionState).toBe('excluded')
    expect(admitted.lines[0]?.admittedCandidate).toBe(false)
  })
})
