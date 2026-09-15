/**
 * @page /finance/external-partner/avi (loading)
 * @description Suspense loading skeleton for the Avi External Partner Report.
 * Shown while the server component fetches transaction data and composes the DTO.
 */

import { PageShell, WorkspaceHeader } from '@/components/ds'

function SkeletonBar({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-200 rounded animate-pulse ${className}`} />
}

export default function ExternalPartnerAviLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <PageShell maxWidth="xl">
        <WorkspaceHeader
          title="External Partner Report"
          subtitle="Avi — Villa Mazotos"
          backRoute="/finance"
        />

        <div className="space-y-6">
          {/* Audit warning skeleton */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <SkeletonBar className="h-4 w-64 mb-2" />
            <SkeletonBar className="h-3 w-full" />
            <SkeletonBar className="h-3 w-3/4 mt-1" />
          </div>

          {/* Control status skeleton */}
          <div className="jj-card p-4">
            <SkeletonBar className="h-4 w-32 mb-3" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <SkeletonBar className="h-8 rounded-lg" />
              <SkeletonBar className="h-8 rounded-lg" />
              <SkeletonBar className="h-8 rounded-lg" />
            </div>
          </div>

          {/* KPI cards skeleton */}
          <div>
            <SkeletonBar className="h-4 w-36 mb-4" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="jj-tile">
                  <SkeletonBar className="h-3 w-16 mb-2" />
                  <SkeletonBar className="h-6 w-24" />
                </div>
              ))}
            </div>
          </div>

          {/* Ownership skeleton */}
          <div className="jj-card p-4">
            <SkeletonBar className="h-4 w-24 mb-3" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between py-2.5">
                <SkeletonBar className="h-4 w-20" />
                <SkeletonBar className="h-5 w-24 rounded-full" />
              </div>
            ))}
          </div>

          {/* Layer breakdown skeleton */}
          <div className="jj-card overflow-hidden">
            <div className="p-4">
              <SkeletonBar className="h-4 w-36" />
            </div>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <SkeletonBar className="h-4 w-24" />
                <SkeletonBar className="h-4 w-20" />
              </div>
            ))}
          </div>

          {/* Table skeleton */}
          <div>
            <SkeletonBar className="h-4 w-32 mb-3" />
            <div className="jj-card overflow-hidden">
              <div className="hidden sm:block">
                <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex gap-8">
                  {[1, 2, 3, 4].map((i) => (
                    <SkeletonBar key={i} className="h-3 w-16" />
                  ))}
                </div>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="px-4 py-3 flex gap-8 border-b border-gray-100">
                    {[1, 2, 3, 4].map((j) => (
                      <SkeletonBar key={j} className="h-4 w-20" />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </PageShell>
    </div>
  )
}
