/**
 * StrReconciliationPanel — read-only display of Hostaway STR evidence reconciliation (P3B).
 * Shows evidence/review state only. Never presents a Hostaway-derived amount as owner-facing authority.
 */
import type { StrReconciliationDTO } from '@/lib/hostaway-audit';

const STATUS_LABEL: Record<string, string> = {
  match: 'Match',
  variance: 'Variance',
  missing_in_jj: 'Missing in JJ',
  missing_in_hostaway: 'Missing in Hostaway',
  aggregate_only: 'Aggregate only',
  insufficient_evidence: 'Needs Review',
};

const eur = (n: number | null) => (n === null ? '—' : `€${n.toFixed(2)}`);

export interface StrReconciliationPanelProps {
  readonly data: StrReconciliationDTO;
  /** Human label for the selected window (e.g. "August 2026"), display only. */
  readonly periodLabel?: string;
}

export function StrReconciliationPanel({ data, periodLabel }: StrReconciliationPanelProps) {
  if (!data.hasActiveEngagement) {
    return (
      <div data-testid="str-recon-no-engagement" className="text-sm text-gray-600">
        No active Airbnb/STR service engagement for this property — evidence reconciliation is unavailable (Needs Review).
      </div>
    );
  }
  if (data.periods.length === 0) {
    return (
      <div data-testid="str-recon-empty" className="text-sm text-gray-600">
        No Airbnb/STR activity{periodLabel ? ` in ${periodLabel}` : ' in this period'} — no Hostaway
        reservations and no JJ ledger entries to reconcile.
      </div>
    );
  }
  return (
    <div data-testid="str-recon-panel">
      <div className="text-sm text-gray-700 mb-2">
        {data.summary.match} match · {data.summary.variance} variance · {data.summary.missingInJj} missing in JJ ·{' '}
        {data.summary.missingInHostaway} missing in Hostaway · {data.summary.insufficient} needs review
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th>Period</th><th>Hostaway (evidence)</th><th>JJ ledger</th><th>Variance</th><th>Status</th><th>Confidence</th><th>Review reason</th>
          </tr>
        </thead>
        <tbody>
          {data.periods.map((p, i) => (
            <tr key={i} data-testid="str-recon-row">
              <td>{p.period}</td>
              <td>{eur(p.hostawayAmount)}</td>
              <td>{eur(p.jjAmount)}</td>
              <td>{eur(p.variance)}</td>
              <td>{STATUS_LABEL[p.status] ?? p.status}</td>
              <td>{p.confidence}</td>
              <td className="text-gray-500">{p.needsReviewReason ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
