/**
 * @module partner-settlement/adapters/propertyReader
 * @description READ-ONLY partner-scope property resolver (QA fix #2).
 *
 * Resolves the canonical partner scope FIRST from property_definitions and NEVER
 * starts from every reporting_name in v_rc3_classified. Pure filtering lives in
 * ../scope.ts (unit-tested). Client-management-only properties are excluded.
 */

import 'server-only'
import { createServiceClient } from '@/lib/supabase'
import {
  filterPartnerScope, splitPropertyScopeSets,
  type PropertyRef, type PropertyDefRow, type PropertyScopeSets,
} from '../scope'

export type { PropertyRef } from '../scope'

export async function readPartnerScopeProperties(): Promise<PropertyRef[]> {
  const db = createServiceClient()
  const { data } = await db
    .from('property_definitions')
    .select('canonical_name, reporting_name, relationship_type')
  return filterPartnerScope((data as PropertyDefRow[]) ?? [])
}

/**
 * Partner/client property name sets for ledger scope enforcement (QA #185-3).
 * Returns null on source failure so the caller can fail closed.
 */
export async function readPropertyScopeSets(): Promise<PropertyScopeSets | null> {
  const db = createServiceClient()
  const { data, error } = await db
    .from('property_definitions')
    .select('canonical_name, reporting_name, relationship_type')
  if (error || data == null) return null
  return splitPropertyScopeSets(data as PropertyDefRow[])
}
