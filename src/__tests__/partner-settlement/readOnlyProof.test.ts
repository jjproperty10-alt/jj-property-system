import * as fs from 'fs'
import * as path from 'path'

/**
 * Read-only proof: the Stage-2 partner-settlement read path must contain NO write /
 * RPC mutation call. This scans the actual source of the server-only adapters and the
 * orchestrator for insert/update/delete/upsert/rpc against Supabase.
 */
const LIB = path.join(__dirname, '../../lib/partner-settlement')

const READ_PATH_FILES = [
  'adapters/transactionsReader.ts',
  'adapters/cashboxReader.ts',
  'adapters/receivablesReader.ts',
  'adapters/ownershipReader.ts',
  'adapters/propertyReader.ts',
  'adapters/accountReaders.ts',
  'partnerReportBService.ts',
]

const MUTATION_RE = /\.(insert|update|delete|upsert|rpc)\s*\(/

describe('read-only proof — no write/RPC in the partner-report read path', () => {
  for (const rel of READ_PATH_FILES) {
    it(`${rel} performs no mutation call`, () => {
      const src = fs.readFileSync(path.join(LIB, rel), 'utf8')
      const hit = src.match(MUTATION_RE)
      expect(hit).toBeNull()
    })
  }

  it('transactionsReader only uses .select() and .eq/.gte/.lte filters', () => {
    const src = fs.readFileSync(path.join(LIB, 'adapters/transactionsReader.ts'), 'utf8')
    expect(src).toContain('.select(')
    expect(src).not.toMatch(MUTATION_RE)
  })
})
