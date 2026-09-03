/**
 * Proves the client-report screen has a deterministic back link into the app.
 * Chrome only — no accounting, DTO, or PDF changes.
 */
import fs from 'fs'
import path from 'path'

const PAGE = fs.readFileSync(
  path.join(process.cwd(), 'src/app/client-report-rc3/page.tsx'),
  'utf8'
)
const LABELS = fs.readFileSync(
  path.join(process.cwd(), 'src/lib/report/labels.ts'),
  'utf8'
)

describe('Client report back navigation', () => {
  it('links back to /owners with a Next.js Link, not history.back()', () => {
    expect(PAGE).toContain('href="/owners"')
    expect(PAGE).toContain("from 'next/link'")
    expect(PAGE).toContain("t('backToOwners'")
    expect(PAGE).not.toContain('history.back()')
    expect(PAGE).not.toContain('router.back(')
  })

  it('hides the back control in print output', () => {
    expect(PAGE).toMatch(/href="\/owners"[\s\S]*?print-hide|print-hide[\s\S]*?href="\/owners"/)
  })

  it('has bilingual Back / חזרה labels', () => {
    expect(LABELS).toContain("backToOwners:")
    expect(LABELS).toContain("'Back'")
    expect(LABELS).toContain("'חזרה'")
  })
})
