import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

/** Masculine subject, built so this file does not contain the phrase itself. */
const MASCULINE_JJ = `JJ חי${'יב'}`

function masculineHits(dir: string, hits: string[]) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      masculineHits(full, hits)
      continue
    }
    if (!/\.(ts|tsx|js|jsx|mjs|cjs|json|md|snap)$/.test(name)) continue
    const text = readFileSync(full, 'utf8')
    let from = 0
    while (from < text.length) {
      const at = text.indexOf(MASCULINE_JJ, from)
      if (at < 0) break
      if (text[at + MASCULINE_JJ.length] !== 'ת') {
        hits.push(`${full.slice(dir.length + 1)}:${text.slice(0, at).split('\n').length}`)
      }
      from = at + MASCULINE_JJ.length
    }
  }
}

describe('JJ is feminine when JJ is the subject', () => {
  it('src has no masculine JJ owes-phrase', () => {
    const root = join(process.cwd(), 'src')
    const hits: string[] = []
    masculineHits(root, hits)
    expect(hits).toEqual([])
  })

  it('the CEO home page says JJ חייבת for Anastasia and for owners', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/(app)/page.tsx'), 'utf8')
    expect(page).toContain('JJ חייבת לאנסטסיה')
    expect(page).toContain('JJ owes · JJ חייבת')
  })
})
