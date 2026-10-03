/**
 * Active JJ staff and membership of the resolved company, before any
 * service-role relation read on the CEO, decision, and ownership paths.
 *
 * Session client only for the two checks:
 *   - public.require_jj_staff(text[]) — SECURITY DEFINER, public schema, so
 *     session.rpc() can reach it. supabase/migrations has no CREATE for it.
 *     The throwaway test installs the verbatim harness body. p_allowed_roles
 *     null means any active jj_staff_config row. A raise, a null, or false
 *     is BLOCKED_BY_MISSING_PERMISSION.
 *   - public.is_company_member(uuid) — SECURITY INVOKER wrapper in
 *     supabase/migrations/20261003170000_public_is_company_member_wrapper.sql.
 *     The body returns access.is_company_member(p_company_id). PostgREST
 *     exposes public and lifecycle only, so the session client calls rpc()
 *     on the public schema. authenticated already has USAGE on schema access
 *     (20260924210000), which is why the wrapper does not adopt the owner
 *     role. An error, null, or false is BLOCKED_BY_MISSING_PERMISSION.
 *
 * Not called, because the finance schema is not exposed to PostgREST
 * (supabase/migrations/20260917120000_agent_transaction_draft_public_rpcs.sql):
 *   - finance.is_active_jj_staff() — migration 20260917090100, SECURITY DEFINER
 *   - finance.is_active_jj_admin() — migration 20260924180000, ceo or superadmin
 *     only, which is narrower than active staff.
 *
 * The company id comes from resolveSoleServiceCompany() after the staff check
 * and before membership. That RPC returns a uuid. It is not a relation read.
 * Relation selects stay behind the callers, and only after this function
 * returns.
 */
import { resolveSoleServiceCompany } from '@/lib/supabase'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

export const MISSING_PERMISSION_BLOCK = 'BLOCKED_BY_MISSING_PERMISSION'

type RpcResult = { data: unknown; error: { message?: string } | null }

function staffAccepted(result: RpcResult): boolean {
  return !result.error && typeof result.data === 'string' && result.data.length > 0
}

function memberAccepted(result: RpcResult): boolean {
  return !result.error && result.data === true
}

export async function requireStaffCompanyPermission(): Promise<{ userId: string; companyId: string }> {
  const session = createSupabaseServerClient()
  const { data, error } = await session.auth.getUser()
  const user = data?.user
  if (error || !user?.id) throw new Error(MISSING_PERMISSION_BLOCK)

  const staff = await session.rpc('require_jj_staff', { p_allowed_roles: null })
  if (!staffAccepted(staff)) throw new Error(MISSING_PERMISSION_BLOCK)

  const companyId = await resolveSoleServiceCompany()

  const member = await session.rpc('is_company_member', {
    p_company_id: companyId,
  })
  if (!memberAccepted(member)) throw new Error(MISSING_PERMISSION_BLOCK)

  return { userId: user.id, companyId }
}
