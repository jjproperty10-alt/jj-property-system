/**
 * @page /finance/external-partner/avi/operations (loading)
 * Staff-only skeleton. Same back target as the loaded operations page.
 */

import { PageShell, WorkspaceHeader } from '@/components/ds'
import { VM1_OPERATIONS_BACK_ROUTE } from '@/lib/partnership-workspace/vm1OperationsRoutes'

function SkeletonBar({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-200 rounded animate-pulse ${className}`} />
}

export default function Vm1PropertyOperationsLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <PageShell maxWidth="xl">
        <WorkspaceHeader
          title="Property Operations"
          subtitle="פעילות הנכס — TM20"
          backRoute={VM1_OPERATIONS_BACK_ROUTE}
        />
        <SkeletonBar className="h-12 w-full mb-4" />
        <SkeletonBar className="h-32 w-full mb-4" />
        <SkeletonBar className="h-64 w-full" />
      </PageShell>
    </div>
  )
}
