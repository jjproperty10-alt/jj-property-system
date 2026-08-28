/**
 * P-UI-504d — Electricity sub-meter (Kiti-group) note gating.
 *
 * The note explains that electricity is shown as GROSS master-property bills paid
 * by JJ, with tenant sub-meter reimbursements recorded on the individual Kiti
 * units and reconciled only at the Kiti-group level. It is therefore relevant
 * ONLY to properties that belong to that verified Kiti electricity-submeter group.
 *
 * BUSINESS RULE (Yossi): the note must be gated by a VERIFIED property association
 * — NEVER by guessing from the property name, and NEVER by "the property has an
 * electricity line" (that fires on ~25 unrelated properties, e.g. Neer Yoav
 * Dekelia, which merely has ordinary electricity bills).
 *
 * The current schema has NO verified association for this group: property_definitions
 * has no group/building/meter field, addresses are null, and there is no distinct
 * sub-meter transaction subcategory. Until a verified grouping exists, the note is
 * NOT shown for any property (conservative + correct — it will never appear on an
 * unrelated report). To enable it, populate VERIFIED_ELECTRICITY_SUBMETER_PROPERTY_IDS
 * with the confirmed Kiti-group property_ids (UUIDs) — do NOT switch to name matching.
 */

/** Verified Kiti electricity-submeter group members, by property_id (UUID). */
export const VERIFIED_ELECTRICITY_SUBMETER_PROPERTY_IDS: ReadonlySet<string> =
  new Set<string>([
    // (empty) — awaiting Yossi's verified Kiti-group property_ids.
  ])

/**
 * Minimal shape this gate reads. property_id is the ONLY verified key used for
 * membership; reporting_name is accepted for structural compatibility with
 * RC3PropertyReport but is NEVER used to decide the gate (name matching is
 * disallowed by the business rule).
 */
export interface ElectricityNoteReportRef {
  property_id?: string | null
  reporting_name?: string | null
}

/**
 * True only when the report's property is a VERIFIED member of the Kiti
 * electricity-submeter group. Name-based detection is intentionally not used.
 */
export function shouldShowElectricitySubmeterNote(report: ElectricityNoteReportRef): boolean {
  const id = report.property_id
  return typeof id === 'string' && VERIFIED_ELECTRICITY_SUBMETER_PROPERTY_IDS.has(id)
}
