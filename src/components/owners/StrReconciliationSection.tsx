/**
 * StrReconciliationSection — server-only mount for STR evidence reconciliation (P3B).
 * Reads read-only via ownerStrAuditAdapter and renders StrReconciliationPanel.
 * Fails safe: unknown property / error / no evidence => Needs Review message.
 */
import { getStrReconciliationByName } from '@/lib/owners/ownerStrAuditAdapter';
import { StrReconciliationPanel } from './StrReconciliationPanel';

export interface StrReconciliationSectionProps {
  readonly propertyName: string;
  readonly startDate?: string;
  readonly endDate?: string;
}

export async function StrReconciliationSection({ propertyName, startDate, endDate }: StrReconciliationSectionProps) {
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
      <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700 mb-2">
        Airbnb / STR evidence reconciliation
      </h2>
      {dto === null ? (
        <div data-testid="str-recon-unavailable" className="text-sm text-gray-600">
          STR evidence reconciliation is unavailable for this property (Needs Review).
        </div>
      ) : (
        <StrReconciliationPanel data={dto} />
      )}
    </section>
  );
}
