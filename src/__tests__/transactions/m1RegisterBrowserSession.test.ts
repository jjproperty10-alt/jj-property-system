/**
 * M1 register/validation must use cookie-session Supabase client.
 * Plain `createClient` anon singleton has no login cookies → RLS returns 0 rows.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '../..')

function readApp(rel: string): string {
  return readFileSync(join(root, 'app/(app)', rel), 'utf8')
}

describe('M1 register browser session client', () => {
  const files = [
    'transactions/page.tsx',
    'transactions/new/page.tsx',
    'validation/page.tsx',
  ] as const

  it.each(files)('%s uses createSupabaseBrowserClient', (rel) => {
    const src = readApp(rel)
    expect(src).toContain("createSupabaseBrowserClient")
    expect(src).not.toMatch(/import\s*\{\s*supabase\s*\}\s*from\s*['"]@\/lib\/supabase['"]/)
  })
})
