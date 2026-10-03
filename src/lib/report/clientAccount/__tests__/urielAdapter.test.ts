/**
 * Uriel adapter on the offline fixtures. Garden wording is required for the Metro cent.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

import { urielAdapter } from '../adapters/uriel'
import { ClientAccountBlock } from '../composeCertifiedAccount'
import { PRESENTATION_TAGS, URIEL_GARDEN_2_LABEL, URIEL_SHARON_CREDIT_LABEL } from '../presentationTags'
import { URIEL_PENDING_DESCRIPTION_IDS } from '../__fixtures__/urielOpenItems'
import { renderUrielFixture } from '../urielFixtureReport'

const UNAPPROVED_DESCRIPTION_IDS = [...URIEL_PENDING_DESCRIPTION_IDS]
const NOT_TAGGED = [
  'd3d31222-a746-4b3e-af22-40db870bb5d6',
  '3d7fdff5-9ec6-4a26-b2f8-00cdef0c2c6b',
  ...UNAPPROVED_DESCRIPTION_IDS,
]

describe('Uriel adapter', () => {
  test('the adapter carries identity and scope, and the pending labels are named constants', () => {
    expect(urielAdapter.clientSlug).toBe('uriel')
    expect(urielAdapter.identity).toEqual({ kind: 'entity', entityId: '2944e9ad-c298-4dbf-b666-26561d934b61' })
    expect(urielAdapter.linkedRowPropertyNames).toEqual(['Efi Dekelia'])
    expect(urielAdapter.reportType).toBe('full_account')
    expect(URIEL_GARDEN_2_LABEL).toBe('עבודת גינה נוספת')
    expect(URIEL_SHARON_CREDIT_LABEL).toBe('זיכוי שרון — ללא מזומן')
    const source = readFileSync(join(process.cwd(), 'src/lib/report/clientAccount/adapters/uriel.ts'), 'utf8')
    expect(source.includes('process.env')).toBe(false)
    for (const id of NOT_TAGGED) expect(source.includes(id)).toBe(false)
    const tags = readFileSync(join(process.cwd(), 'src/lib/report/clientAccount/presentationTags.ts'), 'utf8')
    expect(tags.includes('TODO(Yossi)')).toBe(true)
    for (const id of NOT_TAGGED) expect(PRESENTATION_TAGS[id]).toBeUndefined()
    expect(PRESENTATION_TAGS['49d7a85f-9b32-429e-8c5e-297747f66586']?.clientLabel).toBe('ציוד כללי')
  })

  test('without the garden_2 charge Metro blocks at 40700 against 40850', () => {
    expect.assertions(3)
    try {
      renderUrielFixture({ omitGarden2: true })
    } catch (err) {
      expect(err).toBeInstanceOf(ClientAccountBlock)
      const message = err instanceof Error ? err.message : String(err)
      expect(message).toContain('40700')
      expect(message).toContain('40850')
    }
  })
})
