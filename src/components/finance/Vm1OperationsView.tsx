/**
 * Staff-only VM1 Property Operations table.
 * Operational Hostaway evidence. Not a certified report or settlement.
 */

import { AttentionBanner, DataTable, PageShell, StatusBadge, WorkspaceHeader } from '@/components/ds'
import type { Vm1ReservationRow, VerifiedVm1Identity } from '@/lib/partnership-workspace/vm1IdentityAdapter'
import { VM1_HOSTAWAY_LISTING_ID } from '@/lib/partnership-workspace/vm1Identity'
import {
  formatVm1EvidenceAmount,
  formatVm1OptionalText,
  VM1_NEW_PERIOD_NOTE,
  VM1_OPERATIONS_PROPERTY_LABEL,
  VM1_OPERATIONS_STAFF_NOTE,
  VM1_UNKNOWN_EVIDENCE_LABEL,
  vm1DispositionLabel,
  vm1EvidenceStateLabel,
} from '@/lib/partnership-workspace/vm1OperationsPresentation'
import { VM1_OPERATIONS_BACK_ROUTE } from '@/lib/partnership-workspace/vm1OperationsRoutes'

export interface Vm1OperationsViewProps {
  readonly identityStatus: 'verified' | 'blocked'
  readonly from: string | null
  readonly to: string | null
  readonly identity?: VerifiedVm1Identity
  readonly reservations?: readonly Vm1ReservationRow[]
  readonly errorTitle?: string
  readonly errorDescription?: string
}

const TABLE_COLUMNS = [
  { key: 'reservationId', label: 'Reservation ID', dir: 'ltr' as const },
  { key: 'channel', label: 'Channel' },
  { key: 'status', label: 'Status' },
  { key: 'checkIn', label: 'Check-in', dir: 'ltr' as const },
  { key: 'checkOut', label: 'Check-out', dir: 'ltr' as const },
  { key: 'nights', label: 'Nights', align: 'right' as const, dir: 'ltr' as const },
  { key: 'disposition', label: 'Operational disposition' },
  { key: 'evidenceState', label: 'Evidence state' },
  { key: 'totalPrice', label: 'Total price', align: 'right' as const, dir: 'ltr' as const },
  { key: 'cleaningFee', label: 'Cleaning fee', align: 'right' as const, dir: 'ltr' as const },
  { key: 'expectedPayout', label: 'Expected payout', align: 'right' as const, dir: 'ltr' as const },
  { key: 'hostPlatformFee', label: 'Host/platform fee', align: 'right' as const, dir: 'ltr' as const },
  { key: 'tax', label: 'Tax', align: 'right' as const, dir: 'ltr' as const },
]

function EvidenceAmount({ value }: { value: number | null }) {
  return (
    <span data-evidence-amount={value == null ? 'unknown' : 'present'} dir="ltr">
      {formatVm1EvidenceAmount(value)}
    </span>
  )
}

export function Vm1OperationsView({
  identityStatus,
  from,
  to,
  identity,
  reservations = [],
  errorTitle,
  errorDescription,
}: Vm1OperationsViewProps) {
  const listingId = identity?.hostawayListingId ?? VM1_HOSTAWAY_LISTING_ID
  const periodLabel = from && to ? `${from} → ${to}` : VM1_UNKNOWN_EVIDENCE_LABEL
  const identityVerified = identityStatus === 'verified'

  return (
    <div className="min-h-screen bg-gray-50" data-testid="vm1-operations-root" data-vm1-operations-root>
      <PageShell maxWidth="xl">
        <WorkspaceHeader
          title="Property Operations"
          subtitle="פעילות הנכס — TM20"
          backRoute={VM1_OPERATIONS_BACK_ROUTE}
        />

        <p
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          data-testid="vm1-operations-staff-note"
        >
          {VM1_OPERATIONS_STAFF_NOTE}
        </p>

        <dl className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Property</dt>
            <dd className="mt-1 text-sm text-gray-900" data-testid="vm1-operations-property">
              {VM1_OPERATIONS_PROPERTY_LABEL}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Operational period</dt>
            <dd className="mt-1 text-sm text-gray-900" data-testid="vm1-operations-period" dir="ltr">
              {periodLabel}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Canonical identity</dt>
            <dd className="mt-1" data-testid="vm1-operations-identity">
              <StatusBadge
                status={identityVerified ? 'confirmed' : 'critical'}
                label={identityVerified ? 'Verified' : 'Blocked'}
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Hostaway listing</dt>
            <dd className="mt-1 text-sm text-gray-900" data-testid="vm1-operations-listing" dir="ltr">
              {listingId}
            </dd>
          </div>
        </dl>

        <p className="mb-4 text-xs text-gray-500" data-testid="vm1-operations-period-clock">
          {VM1_NEW_PERIOD_NOTE}
        </p>

        <form method="get" className="mb-6 flex flex-wrap items-end gap-3" data-testid="vm1-operations-date-form">
          <label className="text-sm text-gray-700">
            From
            <input
              type="text"
              name="from"
              defaultValue={from ?? ''}
              inputMode="numeric"
              placeholder="YYYY-MM-DD"
              className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm"
              dir="ltr"
            />
          </label>
          <label className="text-sm text-gray-700">
            To
            <input
              type="text"
              name="to"
              defaultValue={to ?? ''}
              inputMode="numeric"
              placeholder="YYYY-MM-DD"
              className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm"
              dir="ltr"
            />
          </label>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800"
          >
            Apply range
          </button>
        </form>

        {!identityVerified ? (
          <div data-testid="vm1-operations-blocked">
            <AttentionBanner
              type="error"
              title={errorTitle ?? 'VM1 identity verification failed'}
              description={
                errorDescription ??
                'Operational reservation data is blocked. Staff: identity mismatch, missing mapping, or an invalid date range.'
              }
            />
          </div>
        ) : (
          <div data-testid="vm1-operations-table-wrap">
            <DataTable
              caption="VM1 Hostaway operational reservations"
              columns={TABLE_COLUMNS}
              rows={reservations.map((row) => ({
                reservationId: (
                  <span data-testid={`vm1-operations-row-${row.externalId}`} dir="ltr">
                    {row.externalId}
                  </span>
                ),
                channel: formatVm1OptionalText(row.channel),
                status: row.status,
                checkIn: formatVm1OptionalText(row.checkIn),
                checkOut: formatVm1OptionalText(row.checkOut),
                nights: formatVm1OptionalText(row.nights),
                disposition: (
                  <span data-testid={`vm1-operations-disposition-${row.externalId}`}>
                    {vm1DispositionLabel(row)}
                  </span>
                ),
                evidenceState: (
                  <span data-testid={`vm1-operations-evidence-${row.externalId}`}>
                    {vm1EvidenceStateLabel(row)}
                  </span>
                ),
                totalPrice: <EvidenceAmount value={row.totalPrice} />,
                cleaningFee: <EvidenceAmount value={row.cleaningFee} />,
                expectedPayout: <EvidenceAmount value={row.expectedPayout} />,
                hostPlatformFee: <EvidenceAmount value={row.hostServiceFee} />,
                tax: <EvidenceAmount value={row.taxAmount} />,
              }))}
            />
          </div>
        )}
      </PageShell>
    </div>
  )
}
