/**
 * @page /finance/external-partner/avi/operations
 * @description Staff-only VM1 / TM20 Property Operations view.
 *
 * Operational Hostaway activity through the Phase 1 identity adapter
 * (listing 412148). Not a partner settlement, statement, P&L, or certified report.
 *
 * AUTHORIZATION: authenticateStatementUser — identical to Partner Reports.
 * FAIL CLOSED before any data is loaded:
 *   - NO_SESSION            -> redirect('/login')
 *   - NOT_STAFF / INACTIVE  -> notFound()
 *
 * No Avi login. Not exposed through a share token.
 */

import 'server-only'
import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createServiceClient } from '@/lib/supabase'
import { Vm1OperationsView } from '@/components/finance/Vm1OperationsView'
import { loadVm1OperationsView } from '@/lib/partnership-workspace/vm1OperationsService'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'JJ — Property Operations — TM20',
  robots: { index: false, follow: false },
}

interface Props {
  searchParams: { from?: string | string[]; to?: string | string[] }
}

export default async function Vm1PropertyOperationsPage({ searchParams }: Props) {
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    if (auth.error === 'NO_SESSION') {
      redirect('/login')
    }
    notFound()
  }

  const loaded = await loadVm1OperationsView({
    client: createServiceClient(),
    fromParam: searchParams.from,
    toParam: searchParams.to,
  })

  if (!loaded.ok) {
    return (
      <Vm1OperationsView
        identityStatus="blocked"
        from={loaded.from}
        to={loaded.to}
        errorTitle={
          loaded.kind === 'invalid_range'
            ? 'Operational date range is invalid'
            : 'VM1 identity verification failed'
        }
        errorDescription="Operational reservation data is not shown. The range or VM1 identity did not verify."
      />
    )
  }

  return (
    <Vm1OperationsView
      identityStatus="verified"
      from={loaded.from}
      to={loaded.to}
      identity={loaded.identity}
      reservations={loaded.reservations}
      forecastLines={loaded.forecastLines}
      draftAdmissionLines={loaded.draftAdmissionLines}
      ownerStatementLines={loaded.ownerStatementLines ?? []}
      ownerStatementEvidenceOk={loaded.ownerStatementEvidence?.ok}
      ownerStatementEvidenceReason={
        loaded.ownerStatementEvidence != null && !loaded.ownerStatementEvidence.ok
          ? loaded.ownerStatementEvidence.reason
          : null
      }
      expenseAdmission={loaded.expenseAdmission}
    />
  )
}
