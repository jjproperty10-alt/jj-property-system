/**
 * StrReconciliationSection — server-only mount for STR evidence reconciliation (P3B).
 * Reads read-only via ownerStrAuditAdapter and renders StrReconciliationPanel.
 * Month-aligned: the page passes the SELECTED reservations window (startDate/endDate + label)
 * so the reconciliation follows the same period as the Reservations screen.
 * Fails safe: unknown property / error / no evidence => informative Needs Review / empty message.
 */
import { getStrReconciliationByName } from '@/lib/owners/ownerStrAuditAdapter';
import { StrReconciliationPanel } from './StrReconciliationPanel';

export interface StrReconciliationSectionProps {
  readonly propertyName: string;
  readonly startDate?: string;
  readonly endDate?: string;
  /** Human label for the selected window (e.g. "August 2026"), display only. */
  readonly periodLabel?: string;
}

export async function StrReconciliationSection({ propertyName, startDate, endDate, periodLabel }: StrReconciliationSectionProps) {
  const end = endDate ?? new Date().toISOString().slice(0, 10);
  const start = startDate ?? new Date(Date.now() - 3 * 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  let dto = null;
  try {
    dto = await getStrReconciliationByName(propertyName, start, end);
  } catch {
    dto = null;
  }
  return (
    <section data-testid="str-recon-section" className="bg-white rounded-lg border border-gray-200 p-4 mt-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700 mb-1">
        Airbnb / STR evidence reconciliation
      </h2>
      <div className="text-xs text-gray-400 mb-3">
        {propertyName}{periodLabel ? ` · ${periodLabel}` : ''}
      </div>
      {dto === null ? (
        <div data-testid="str-recon-unavailable" className="text-sm text-gray-600">
          STR evidence reconciliation is unavailable for this property (Needs Review).
        </div>
      ) : (
        <StrReconciliationPanel data={dto} periodLabel={periodLabel} />
      )}
    </section>
  );
}
