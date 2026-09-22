/**
 * Operations reads the Production Owner Statement store through a JWT
 * client. Empty store is missing_evidence. No ingest, void, admission, or split.
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

describe('VM1 Owner Statement store reader wiring', () => {
  it('Production empty store is missing_evidence with zero admitted revenue', async () => {
    const identityClient = {
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
    const osCalls: Array<{ name: string; args: Record<string, unknown> | undefined }> = []
    const ownerStatementClient = {
      rpc: (name: string, args?: Record<string, unknown>) => {
        osCalls.push({ name, args })
        return Promise.resolve({ data: { ok: false, reason: 'missing_evidence' }, error: null })
      },
    }

    const loaded = await loadVm1OperationsView({
      client: identityClient,
      ownerStatementClient,
      fromParam: '2026-08-30',
      toParam: '2026-11-30',
      now: NOW,
    })
    if (!loaded.ok) throw new Error(loaded.reason)
    expect(loaded.ownerStatementEvidence.ok).toBe(false)
    if (loaded.ownerStatementEvidence.ok) throw new Error('expected missing_evidence')
    expect(loaded.ownerStatementEvidence.kind).toBe('missing_evidence')
    expect(loaded.ownerStatementEvidence.reason).toBe(VM1_OS_EVIDENCE_REASON.missingEvidence)
    expect(loaded.ownerStatementLines).toEqual([])
    expect(loaded.draftAdmissionLines.filter((l) => l.admittedCandidate)).toHaveLength(0)
    expect(loaded.draftAdmissionLines.some((l) => l.externalId === '65733679' && l.admittedCandidate)).toBe(
      false,
    )
    expect(osCalls).toEqual([
      {
        name: 'read_partnership_owner_statement_for_listing',
        args: { p_listing_id: '412148', p_from: '2026-08-30', p_to: '2026-11-30' },
      },
    ])
  })

  it('does not call ingest or void wrappers, inject fixture SHA, or split 50/25/25', () => {
    const service = read('src/lib/partnership-workspace/vm1OperationsService.ts')
    const adapter = read('src/lib/partnership-workspace/vm1OwnerStatementEvidence.ts')
    const reader = read('src/lib/partnership-workspace/vm1OwnerStatementStoreReader.ts')
    expect(service).not.toContain('ingest_partnership_owner_statement_document')
    expect(service).toContain('readVm1PartnershipOwnerStatementForListing')
    expect(reader).toContain('read_partnership_owner_statement_for_listing')
    expect(service).not.toContain('void_partnership_owner_statement_document')
    expect(reader).not.toContain('ingest_partnership_owner_statement_document')
    expect(reader).not.toContain('void_partnership_owner_statement_document')
    expect(service).not.toContain('VM1_OS_EVIDENCE_REASON.missingStore')
    expect(adapter).not.toContain('b2945e7f')
    expect(service).not.toContain('b2945e7f')
    expect(reader).not.toContain('b2945e7f')
    expect(service + adapter + reader).not.toContain('50/25/25')
    expect(service).not.toContain('expectedPayout')
    expect(service).not.toContain('authoritativeEvidenceByReservationId')
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

  it('gates default privileges on catalog membership instead of supabase_admin unconditionally', () => {
    const sql = read('supabase/migrations/20260920120000_partnership_owner_statement_evidence.sql')
    expect(sql).toContain('pg_auth_members')
    expect(sql).toContain('current_user')
    expect(sql).not.toMatch(/FOREACH r IN ARRAY ARRAY\['postgres',\s*'supabase_admin'\]/)
    expect(sql).not.toMatch(/EXCEPTION WHEN insufficient_privilege/)
    expect(sql).not.toContain('SET ROLE supabase_admin')
  })
})
