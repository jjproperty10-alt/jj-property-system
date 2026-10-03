/**
 * Every company-data path builds its client with createServiceClient().
 * That function awaits staff and membership before rawServiceClient(), so an
 * authenticated user with no staff role, or no company membership, gets no
 * service connection and no relation read.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const created: unknown[][] = []
const session = {
  userId: 'user-1' as string | null,
  staff: 'user-1' as string | null,
  member: true as boolean | null,
}

jest.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: session.userId ? { id: session.userId } : null },
        error: null,
      }),
    },
    rpc: async (fn: string) => {
      if (fn === 'require_jj_staff') {
        return session.staff
          ? { data: session.staff, error: null }
          : { data: null, error: { message: 'not staff' } }
      }
      if (fn === 'is_company_member') {
        return { data: session.member, error: null }
      }
      return { data: null, error: { message: fn } }
    },
  }),
}))

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => {
    created.push(args)
    return {
      rpc: async () => ({ data: 'company-1', error: null }),
      from() {
        throw new Error('relation read')
      },
    }
  },
}))

const root = path.resolve(__dirname, '..', '..', '..')

function productionFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === '__tests__') continue
      productionFiles(full, out)
    } else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') && !name.endsWith('.test.tsx')) {
      out.push(full)
    }
  }
  return out
}

function callsServiceClient(source: string): boolean {
  return source.split('\n').some((line) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return false
    return trimmed.includes('createServiceClient()')
  })
}

describe('createServiceClient fails closed for every company-data path', () => {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY

  beforeEach(() => {
    created.length = 0
    session.userId = 'user-1'
    session.staff = 'user-1'
    session.member = true
  })

  test('the factory checks staff and membership before it opens a service connection', () => {
    const source = readFileSync(path.join(root, 'src/lib/supabase.ts'), 'utf8')
    const body = source.slice(source.indexOf('export async function createServiceClient'))
    expect(body.indexOf('await requireStaffCompanyPermission()')).toBeGreaterThan(-1)
    expect(body.indexOf('await requireStaffCompanyPermission()')).toBeLessThan(body.indexOf('rawServiceClient()'))
    const callers = productionFiles(path.join(root, 'src'))
      .map((file) => path.relative(root, file))
      .filter((file) => file !== 'src/lib/supabase.ts')
      .filter((file) => callsServiceClient(readFileSync(path.join(root, file), 'utf8')))
    expect(callers.length).toBeGreaterThan(40)
    for (const file of callers) {
      const lines = readFileSync(path.join(root, file), 'utf8').split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue
        if (trimmed.includes('createServiceClient()')) {
          expect(trimmed).toContain('await createServiceClient()')
        }
      }
    }
  })

  test('no staff role opens no service connection', async () => {
    session.staff = null
    const { createServiceClient } = await import('@/lib/supabase')
    const before = created.length
    await expect(createServiceClient()).rejects.toThrow('BLOCKED_BY_MISSING_PERMISSION')
    expect(created.slice(before).some((call) => call[1] === serviceKey)).toBe(false)
  })

  test('no company membership reads no relation', async () => {
    session.member = false
    const { createServiceClient } = await import('@/lib/supabase')
    await expect(createServiceClient()).rejects.toThrow('BLOCKED_BY_MISSING_PERMISSION')
  })

  test('a null membership reads no relation', async () => {
    session.member = null
    const { createServiceClient } = await import('@/lib/supabase')
    await expect(createServiceClient()).rejects.toThrow('BLOCKED_BY_MISSING_PERMISSION')
  })

  test('an unauthenticated session opens no service connection', async () => {
    session.userId = null
    const { createServiceClient } = await import('@/lib/supabase')
    const before = created.length
    await expect(createServiceClient()).rejects.toThrow('BLOCKED_BY_MISSING_PERMISSION')
    expect(created.slice(before).some((call) => call[1] === serviceKey)).toBe(false)
  })

  test('a previously unguarded layout resolver returns nothing and reads no relation', async () => {
    session.staff = null
    const { resolveFrameUser } = await import('@/lib/nav/resolveFrameUser')
    const before = created.length
    await expect(resolveFrameUser()).resolves.toBeNull()
    expect(created.slice(before).some((call) => call[1] === serviceKey)).toBe(false)
  })
})
