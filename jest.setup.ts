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
 * These are MOCK values only — no real Supabase connection is made.
 * Tests that call real async service functions must mock their own DB layer.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock-test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-mock-anon-key-000000000000'
process.env.SUPABASE_SERVICE_KEY = 'test-mock-service-key-000000000000'
