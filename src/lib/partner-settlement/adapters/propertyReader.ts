/**
 * @module partner-settlement/adapters/propertyReader
 * @description READ-ONLY property list + relationship type.
 * Distinct reporting_name from the certified RC3 classified view; relationship_type
 * enriched from property_definitions where a canonical-name match exists.
 */

import 'server-only'
import { createServiceClient } from '@/lib/supabase'

export interface PropertyRef {
  readonly reportingName: string
  readonly relationshipType: string | null
}

export async function readProperties(): Promise<PropertyRef[]> {
  const db = createServiceClient()

  const { data: rc3 } = await db
    .from('v_rc3_classified')
    .select('reporting_name')
    .not('reporting_name', 'is', null)

  const names = Array.from(
    new Set(((rc3 as { reporting_name: string | null }[]) ?? [])
      .map(r => r.reporting_name)
      .filter((n): n is string => !!n)),
  ).sort()

  // relationship type (best-effort enrichment)
  const relByName = new Map<string, string | null>()
  try {
    const { data: defs } = await db
      .from('property_definitions')
      .select('canonical_name, relationship_type')
    for (const d of ((defs as { canonical_name: string | null; relationship_type: string | null }[]) ?? [])) {
      if (d.canonical_name) relByName.set(d.canonical_name, d.relationship_type)
    }
  } catch {
    // enrichment optional
  }

  return names.map(reportingName => ({
    reportingName,
    relationshipType: relByName.get(reportingName) ?? null,
  }))
}
