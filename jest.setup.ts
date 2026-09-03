/**
 * jest.setup.ts — Test environment bootstrapper
 *
 * Sets required environment variables BEFORE any module is loaded by Jest.
 * Must run via `setupFiles` (not `setupFilesAfterFramework`) so that module-level
 * side effects in src/lib/supabase.ts receive valid env vars at import time.
 *
 * Root cause this fixes:
 *   src/lib/supabase.ts:4 creates `export const supabase = createClient(url, key)`
 *   at module level. Without NEXT_PUBLIC_SUPABASE_URL set, the import chain
 *   partnerStatement.test.ts → partnerStatementService.ts → supabase.ts throws
 *   "supabaseUrl is required" before any test body runs.
 *
 * DEFAULT (every ordinary suite): install MOCK values, OVERWRITING anything already
 * in the environment — no test can accidentally use live Supabase credentials that
 * happen to be present. No real Supabase connection is made.
 *
 * LIVE INTEGRATION OPT-IN (fail-closed): ONLY when T38_LIVE_INTEGRATION === '1'
 * (set exclusively by the cert2 QA runner for the Jest child process) do we PRESERVE
 * the externally supplied cert2 values (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY /
 * SUPABASE_SERVICE_KEY). The opt-in must be explicit; its absence keeps all suites mocked.
 */

if (process.env.T38_LIVE_INTEGRATION === '1') {
  // Live cert2 integration run: keep the runner-provided real env as-is. Do NOT install mocks.
} else {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock-test.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-mock-anon-key-000000000000'
  process.env.SUPABASE_SERVICE_KEY = 'test-mock-service-key-000000000000'
}
