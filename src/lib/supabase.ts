import { createClient } from '@supabase/supabase-js'
import { gateServiceReads } from '@/lib/auth/serviceRoleCompanyGate'

// Browser clients live in supabaseBrowser.ts. This module dynamically imports
// the staff-permission helper, which imports server-only and next/headers.
// A client component must not import this file. There is no build-time bypass.

export const MISSING_SERVICE_KEY_BLOCK = 'BLOCKED_BY_MISSING_SERVICE_KEY'

function rawServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    throw new Error(MISSING_SERVICE_KEY_BLOCK)
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function resolveSoleServiceCompany(): Promise<string> {
  const { data, error } = await rawServiceClient().rpc('resolve_service_read_company', {
    p_requested: null,
  })
  if (error || typeof data !== 'string' || data.length === 0) {
    throw new Error('BLOCKED_BY_COMPANY_CONTEXT')
  }
  return data
}

/**
 * Company-data client. An authenticated caller with no active staff role,
 * or no membership of the resolved company, never receives this client.
 * The permission check runs before rawServiceClient(), so a refused caller
 * does not open a service connection and does not read a relation.
 */
export async function createServiceClient() {
  const { requireStaffCompanyPermission } = await import('@/lib/auth/requireStaffCompanyPermission')
  await requireStaffCompanyPermission()
  return gateServiceReads(rawServiceClient(), resolveSoleServiceCompany)
}
