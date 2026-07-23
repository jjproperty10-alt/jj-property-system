/**
 * Overview Tab — "What requires attention right now?"
 *
 * Sections (in order of urgency):
 * 1. Financial summary headline
 * 2. Open items requiring attention
 * 3. Recommended next action
 * 4. Upcoming events preview
 * 5. Contract renewal alert
 * 6. Recent activity feed
 */

import { KpiCard, MoneyValue, AttentionBanner, EmptyState, UnknownValue } from '@/components/ds'
import type { OwnerOverviewDTO } from '@/lib/owners/ownerWorkspaceTypes'

export interface OverviewTabProps {
  dto: OwnerOverviewDTO
  ownerName: string
}

const URGENCY_CONFIG = {
  high: { className: 'border-red-200 bg-red-50', label: 'High priority' },
  medium: { className: 'border-amber-200 bg-amber-50', label: 'Medium priority' },
  low: { className: 'border-gray-200 bg-gray-50', label: 'Low priority' },
}

const ITEM_TYPE_ICONS: Record<string, string> = {
  correction: '⚠',
  approval: '✓',
  missing_document: '📄',
  maintenance: '🔧',
  payment: '💳',
}

const ACTIVITY_ICONS: Record<string, string> = {
  statement_sent: '📤',
  payment_received: '💶',
  correction_opened: '⚠',
  correction_closed: '✓',
  document_added: '📎',
  maintenance_completed: '🔧',
}

export function OverviewTab({ dto, ownerName }: OverviewTabProps) {
  const { financial, openItems, nextAction, upcomingPreview, contractRenewalAlert, recentActivity } = dto

  return (
    <div className="space-y-6">

      {/* Next action CTA */}
      {nextAction && (
        <div className={`rounded-lg border p-4 flex items-center justify-between gap-3 ${URGENCY_CONFIG[nextAction.urgency].className}`}>
          <p className="text-sm font-medium text-gray-800">{nextAction.label}</p>
          <a
            href={nextAction.href}
            className="flex-shrink-0 text-sm font-semibold text-blue-700 hover:text-blue-900 whitespace-nowrap"
          >
            Take action →
          </a>
        </div>
      )}

      {/* Financial headline */}
      <section aria-labelledby="overview-financial-heading">
        <h2 id="overview-financial-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Financial Position
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label="Balance"
            value={
              financial.balanceEur != null
                ? <MoneyValue amount={parseFloat(financial.balanceEur)} size="lg" />
                : <UnknownValue reason="Opening balance pending" />
            }
          />
          <KpiCard
            label="Pending"
            value={
              financial.pendingEur != null
                ? <MoneyValue amount={parseFloat(financial.pendingEur)} size="lg" />
                : <UnknownValue reason="Pending calculation" />
            }
          />
          <KpiCard
            label="Last payment"
            value={
              <span className="text-sm font-semibold text-gray-700" dir="ltr">
                {financial.lastPaymentAt ? formatDate(financial.lastPaymentAt) : '—'}
              </span>
            }
          />
          <KpiCard
            label="Next expected"
            value={
              <span className="text-sm font-semibold text-gray-700" dir="ltr">
                {financial.nextPaymentAt ? formatDate(financial.nextPaymentAt) : '—'}
              </span>
            }
          />
        </div>
      </section>

      {/* Contract renewal alert */}
      {contractRenewalAlert && (
        <AttentionBanner>
          <span className="font-semibold">{contractRenewalAlert.propertyName}</span> contract renews in{' '}
          <span className="font-semibold">{contractRenewalAlert.daysUntilRenewal} days</span>{' '}
          ({formatDate(contractRenewalAlert.renewalDate)}).
        </AttentionBanner>
      )}

      {/* Open items */}
      <section aria-labelledby="overview-open-heading">
        <h2 id="overview-open-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Open Items
        </h2>
        {openItems.length === 0 ? (
          <EmptyState icon="✅" title="Nothing open" description="No corrections, approvals or missing documents." />
        ) : (
          <ul className="space-y-2" role="list" aria-label="Open items requiring attention">
            {openItems.map(item => {
              const cfg = URGENCY_CONFIG[item.urgency]
              return (
                <li
                  key={item.id}
                  className={`flex items-start gap-3 border rounded-lg px-4 py-3 ${cfg.className}`}
                  aria-label={`${cfg.label}: ${item.label}`}
                >
                  <span aria-hidden className="text-base">{ITEM_TYPE_ICONS[item.type] ?? '•'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{item.label}</p>
                    {item.propertyName && (
                      <p className="text-xs text-gray-500 mt-0.5">{item.propertyName}</p>
                    )}
                    {item.dueDate && (
                      <p className="text-xs text-gray-400 mt-0.5" dir="ltr">Due: {formatDate(item.dueDate)}</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Upcoming preview */}
      {upcomingPreview.length > 0 && (
        <section aria-labelledby="overview-upcoming-heading">
          <h2 id="overview-upcoming-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Upcoming
          </h2>
          <ul className="space-y-2" role="list">
            {upcomingPreview.map(event => (
              <li key={event.id} className="flex items-center justify-between gap-3 text-sm border border-gray-100 rounded-lg px-4 py-2.5 bg-white">
                <span className="font-medium text-gray-800">{event.title}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {event.propertyName && (
                    <span className="text-xs text-gray-400">{event.propertyName}</span>
                  )}
                  <time className="text-xs text-gray-500" dateTime={event.dueDate} dir="ltr">
                    {formatDate(event.dueDate)}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recent activity */}
      <section aria-labelledby="overview-activity-heading">
        <h2 id="overview-activity-heading" className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Recent Activity · {ownerName}
        </h2>
        {recentActivity.length === 0 ? (
          <EmptyState
            icon="🔔"
            title="Nothing new since your last visit"
            description="Check back after your next activity"
          />
        ) : (
          <ul className="divide-y divide-gray-100" role="list">
            {recentActivity.map(item => (
              <li key={item.id} className="flex items-center gap-3 py-2.5">
                <span aria-hidden>{ACTIVITY_ICONS[item.type] ?? '•'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">{item.label}</p>
                  {item.propertyName && (
                    <p className="text-xs text-gray-500">{item.propertyName}</p>
                  )}
                </div>
                <time
                  className="text-xs text-gray-400 flex-shrink-0"
                  dateTime={item.occurredAt}
                  dir="ltr"
                >
                  {formatDate(item.occurredAt.slice(0, 10))}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch {
    return iso
  }
}
