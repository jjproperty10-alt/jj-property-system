// Enumerated from OwnerFinancialDTO (src/lib/owners/ownerWorkspaceTypes.ts).
// Sections/departments keyed by identity (type[,propertyName]) not array index.
type Kind = 'eur' | 'eur|null';
// Nullability taken from the REAL type (ownerWorkspaceTypes.ts):
//   EuroAmount = string | null  -> nullable. overallNet.* and departments[].* are plain `string` -> non-null.
export const PATHS: { re: RegExp; type: Kind }[] = [
  // position.* are all EuroAmount (nullable) - incl. closingBalanceEur ("Null until RC2") [FIX #1]
  { re: /^\$\.position\.(incomeEur|expensesEur|netEur|paidToOwnerEur|pendingEur|closingBalanceEur)$/, type: 'eur|null' },
  // overallNet.netEur/displayAmountEur are `string` (non-null); departments[].* are `string` (non-null)
  { re: /^\$\.overallNet\.(netEur|displayAmountEur)$/,                              type: 'eur' },
  { re: /^\$\.overallNet\.departments\[[^\]]+\]\.(closingBalanceEur|normalizedEur|displayAmountEur)$/, type: 'eur' },
  // sections[].incomeEur/expensesEur/netEur/closingBalanceEur are EuroAmount (nullable) [FIX #1]
  { re: /^\$\.sections\[[^\]]+\]\.(incomeEur|expensesEur|netEur|closingBalanceEur)$/, type: 'eur|null' },
  { re: /^\$\.sections\[[^\]]+\]\.(ownerDirectionAmountEur|openingBalanceEur)$/,      type: 'eur|null' },
  { re: /^\$\.sections\[[^\]]+\]\.rows\[[^\]]+\]\.(amountEur|clientChargeEur|marginEur|actualCostEur)$/, type: 'eur|null' },
];
const idOf = (o: any): string =>
  o && typeof o === 'object'
    ? (o.type != null ? `${o.type}${o.propertyName != null ? '|' + o.propertyName : ''}` : JSON.stringify(o?.label ?? Object.keys(o).sort()))
    : String(o);
function match(path: string): Kind | null { for (const p of PATHS) if (p.re.test(path)) return p.type; return null; }

export type Val = number | null;
// flatten manifest paths -> number|null; fail-fast on NaN and on null at a non-nullable path [FIX #3]
export function acctMap(dto: any): Record<string, Val> {
  const out: Record<string, Val> = {};
  const walk = (v: any, path: string) => {
    if (Array.isArray(v)) { v.forEach(x => walk(x, `${path}[${idOf(x)}]`)); return; }
    if (v && typeof v === 'object') { for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`); return; }
    const t = match(path); if (!t) return;
    if (v === null) { if (t === 'eur|null') { out[path] = null; return; } throw new Error(`[t38] unexpected null at ${path}`); }
    const n = typeof v === 'string' ? parseFloat(v) : v;
    if (typeof n !== 'number' || Number.isNaN(n)) throw new Error(`[t38] non-numeric/NaN at ${path} (${JSON.stringify(v)})`);
    out[path] = n;
  };
  walk(dto, '$');
  return out;
}

export type Change =
  | { path: string; kind: 'delta'; delta: number }
  | { path: string; kind: 'set';   to: number }     // null/absent -> number  [FIX #3]
  | { path: string; kind: 'clear'; from: number };  // number -> null/absent  [FIX #3]
// null and absent are both "no value" (NONE); every NONE<->number transition is a real change.
export function changes(before: Record<string, Val>, after: Record<string, Val>): Change[] {
  const v = (m: Record<string, Val>, k: string): number | null => (k in m && m[k] !== null) ? (m[k] as number) : null;
  const out: Change[] = [];
  for (const k of Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))) {
    const b = v(before, k), a = v(after, k);
    if (b === null && a === null) continue;
    if (b === null) out.push({ path: k, kind: 'set', to: a as number });
    else if (a === null) out.push({ path: k, kind: 'clear', from: b });
    else { const d = Math.round((a - b) * 100) / 100; if (d !== 0) out.push({ path: k, kind: 'delta', delta: d }); }
  }
  return out;
}
// discover the Villa Mazotos section identity from the baseline (fail-closed if absent) [FIX #2/#4]
export function vmSectionId(before: Record<string, Val>): string {
  for (const k of Object.keys(before)) { const m = /^\$\.sections\[([^\]]*Villa Mazotos[^\]]*)\]\./.exec(k); if (m) return m[1]; }
  throw new Error('[t38-provision] no Villa Mazotos section in the baseline OwnerFinancialDTO - seed property_owners attribution before the app test.');
}
export const present = (m: Record<string, Val>, path: string): boolean => (path in m) && m[path] !== null;
export const find = (ch: Change[], path: string): Change | undefined => ch.find(c => c.path === path);
