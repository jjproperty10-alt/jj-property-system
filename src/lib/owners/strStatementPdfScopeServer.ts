/**
 * Server-only STR PDF property resolution. Presentation routing — same statement engine.
 * Does not compute totals; it only chooses which canonical properties the existing composer receives.
 */
import 'server-only'
import { createServiceClient } from '@/lib/supabase'
import { getOwnerWorkspace, getOwnerServiceEngagements } from '@/lib/owners/ownerWorkspaceService'
import { selectStrProperties, includeHistoricalStrProperties, type StrPropertyRef } from '@/lib/owners/selectStrProperties'
import { historicalPropertiesForOwner, listHistoricalStrProperties } from '@/lib/report/str/historicalChannelEvidence'
import {
  filterEligibleProperties,
  matchHistoricalPropertiesToSlug,
  ownerNameFromHistoricalProperty,
} from '@/lib/owners/strStatementPdfScope'

export type StrPdfScopeResult =
  | { readonly ok: true; readonly ownerName: string; readonly properties: StrPropertyRef[] }
  | { readonly ok: false; readonly status: number; readonly message: string }

export async function resolveStrStatementPdfScope(
  slug: string,
  propertyId: string | null,
): Promise<StrPdfScopeResult> {
  const sb = createServiceClient()
  const workspace = await getOwnerWorkspace(slug)

  let ownerName: string
  let eligible: StrPropertyRef[]

  if (workspace) {
    const services = await getOwnerServiceEngagements(slug)
    const strProps = selectStrProperties(services)
    const histProps = await historicalPropertiesForOwner(sb, workspace.identity.properties)
    eligible = includeHistoricalStrProperties(strProps, histProps)
    ownerName = workspace.identity.name
  } else {
    const hist = await listHistoricalStrProperties(sb)
    const matched = matchHistoricalPropertiesToSlug(hist, slug)
    if (matched.length === 0) {
      return { ok: false, status: 404, message: 'Owner not found' }
    }
    if (matched.length > 1 && !(propertyId ?? '').trim()) {
      return { ok: false, status: 400, message: 'Multiple historical properties match this slug; pass property=<uuid>' }
    }
    eligible = matched
    ownerName = ownerNameFromHistoricalProperty(matched[0].name)
  }

  const filtered = filterEligibleProperties(eligible, propertyId)
  if (!filtered.ok) return filtered
  return { ok: true, ownerName, properties: filtered.properties }
}
