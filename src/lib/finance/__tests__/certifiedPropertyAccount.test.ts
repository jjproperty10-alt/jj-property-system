import React from 'react'
import { certifiedCents } from '../certifiedClientSettlementPresentation'
import {
  composeCertifiedPropertyAccount,
} from '../certifiedPropertyAccount'
import {
  CERTIFIED_PROPERTY_ACCOUNT_PACKS,
  composeLiveCertifiedPropertyAccount,
} from '@/lib/report/certifiedPropertyAccountPack'
import { URIEL_SHAPED_CERTIFIED } from '../__fixtures__/certifiedClientSettlement'
import type { CertifiedClientSettlementAvailable } from '../certifiedClientSettlementTypes'
import { OwnerPortfolioPdf } from '@/lib/pdf/OwnerSettlementPdfV3'
import fs from 'fs'
import path from 'path'

const V2_LINES: ReadonlyArray<{ evidenceRef: string; name: string; amount: number }> = [
  { evidenceRef: 'uriel-bridge-v2:kamares', name: 'Uriel Kamares', amount: -5543.22 },
  { evidenceRef: 'uriel-bridge-v2:oroklini', name: 'Uriel Oroklini 2 Bed', amount: 209.37 },
  { evidenceRef: 'uriel-bridge-v2:studio-kitty', name: 'Uriel Studio Kitty', amount: 4089 },
  { evidenceRef: 'uriel-bridge-v2:metro', name: 'Uriel Sharon English Metro', amount: 40850 },
  { evidenceRef: 'uriel-bridge-v2:debenhams', name: 'Uriel Debenhams', amount: 3805.25 },
  { evidenceRef: 'uriel-bridge-v2:kokkines', name: 'Uriel Kokkines', amount: 15125.63 },
  { evidenceRef: 'uriel-bridge-v2:behind-yoav', name: 'Apartment Neer Yoav Dekelia', amount: 44610.08 },
  { evidenceRef: 'uriel-bridge-v2:duplex', name: 'Uriel Duplex', amount: 16555.43 },
]

function v2Certified(): CertifiedClientSettlementAvailable {
  return {
    ...URIEL_SHAPED_CERTIFIED,
    openingDueToJj: 119701.54,
    overlayClosingDueToJj: 50701.54,
    remainingR: -50701.54,
    remainingS: 50701.54,
    closingDueToJj: 50701.54,
    propertyLines: V2_LINES.map((line, index) => ({
      lineOrder: index + 1,
      propertyKey: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      propertyName: line.name,
      componentCode: 'opening_property_obligation',
      amountDueToJj: line.amount,
      reason: 'test',
      evidenceRef: line.evidenceRef,
    })),
  }
}

function packSrc(): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'src/lib/report/certifiedPropertyAccountPack.ts'),
    'utf8',
  )
}

describe('certified property account compose', () => {
  test('fixture evidence refs are unavailable rather than blocked', () => {
    expect(composeLiveCertifiedPropertyAccount(URIEL_SHAPED_CERTIFIED)).toEqual({
      status: 'unavailable',
      reason: 'no_pack',
    })
  })

  test('every layer and property closing is integer-cent exact', () => {
    const composed = composeLiveCertifiedPropertyAccount(v2Certified())
    expect(composed.status).toBe('ready')
    if (composed.status !== 'ready') return

    const opening = composed.statement.properties.reduce(
      (sum, page) => sum + (certifiedCents(page.closingDueToJj) ?? 0),
      0,
    )
    expect(opening).toBe(11970154)
    expect(certifiedCents(composed.statement.certified.closingDueToJj)).toBe(5070154)

    for (const page of composed.statement.properties) {
      for (const layer of page.contracts) {
        const agreed = certifiedCents(layer.agreedAmount)
        const paid = certifiedCents(layer.paidCredited)
        const remaining = certifiedCents(layer.remainingDueToJj)
        expect(agreed).not.toBeNull()
        expect(paid).not.toBeNull()
        expect(remaining).not.toBeNull()
        expect((agreed ?? 0) - (paid ?? 0)).toBe(remaining)
      }
      for (const row of page.operating) {
        const charges = certifiedCents(row.chargesToOwner)
        const credits = certifiedCents(row.ownerCredits)
        const net = certifiedCents(row.netEffectDueToJj)
        expect(charges).not.toBeNull()
        expect(credits).not.toBeNull()
        expect(net).not.toBeNull()
        expect((charges ?? 0) - (credits ?? 0)).toBe(net)
      }
      const last = page.closingBridge[page.closingBridge.length - 1]
      expect(certifiedCents(last.amountDueToJj)).toBe(certifiedCents(page.closingDueToJj))
    }
  })

  test('property-specific contract statuses and closings match the owner statement', () => {
    const composed = composeLiveCertifiedPropertyAccount(v2Certified())
    expect(composed.status).toBe('ready')
    if (composed.status !== 'ready') return
    const byName = new Map(composed.statement.properties.map((page) => [page.propertyName, page]))

    const kamares = byName.get('Uriel Kamares')!
    expect(kamares.closingDueToJj).toBe(-5543.22)
    expect(kamares.overallState).toBe('partially_closed')
    expect(kamares.contracts).toEqual([])
    expect(kamares.explanationHe).toContain('כל חודשי השכירות ההיסטוריים סגורים')

    const oro = byName.get('Uriel Oroklini 2 Bed')!
    expect(oro.closingDueToJj).toBe(209.37)
    expect(oro.contracts).toEqual([])
    expect(oro.operating.map((row) => row.labelEn)).toEqual(['Key', 'Lock replacement', 'Cleaning', 'Plumber'])

    const studio = byName.get('Uriel Studio Kitty')!
    expect(studio.closingDueToJj).toBe(4089)
    expect(studio.contracts.map((layer) => [layer.layer, layer.status, layer.remainingDueToJj])).toEqual([
      ['purchase', 'closed', 0],
      ['sale', 'closed', 0],
      ['renovation', 'partially_paid', 4089],
    ])
    expect(studio.explanationHe).toContain('שתי עבודות הבטון')
    expect(studio.explanationHe).not.toContain('שני עבודות')

    const metro = byName.get('Uriel Sharon English Metro')!
    expect(metro.closingDueToJj).toBe(40850)
    expect(metro.contracts).toHaveLength(1)
    expect(metro.contracts[0]).toMatchObject({
      layer: 'sale',
      agreedAmount: 280000,
      paidCredited: 239450,
      remainingDueToJj: 40550,
      status: 'partially_paid',
    })
    expect(metro.explanationHe).toContain('חוזה המכירה')
    expect(metro.explanationHe).not.toContain('יתרת רכישה/מכירה')

    const debenhams = byName.get('Uriel Debenhams')!
    expect(debenhams.contracts[0]).toMatchObject({
      layer: 'renovation',
      agreedAmount: 3800,
      paidCredited: 0,
      remainingDueToJj: 3800,
      status: 'open',
    })

    const kokkines = byName.get('Uriel Kokkines')!
    expect(kokkines.contracts.find((layer) => layer.layer === 'renovation')).toMatchObject({
      agreedAmount: 40000,
      paidCredited: 25000,
      remainingDueToJj: 15000,
      status: 'partially_paid',
    })

    const dekelia = byName.get('Apartment Neer Yoav Dekelia')!
    expect(dekelia.closingDueToJj).toBe(44610.08)
    expect(dekelia.strMonths.map((row) => row.ownerNet)).toEqual([947.25, 1525.77, 961.96])
    expect(dekelia.explanationHe).toContain('7,000')
    expect(dekelia.explanationHe).toContain('13,900')
    expect(dekelia.explanationHe).toContain('01.06.2026')

    const duplex = byName.get('Uriel Duplex')!
    expect(duplex.closingDueToJj).toBe(16555.43)
    expect(duplex.contracts.find((layer) => layer.layer === 'renovation')?.remainingDueToJj).toBe(22145)
    expect(duplex.explanationHe).toContain('תשעה חודשים כפול 500')
    expect(duplex.explanationHe).toContain('1,251.41')
    expect(duplex.explanationHe).toContain('5,500')
  })

  test('a mismatched certified line fails closed', () => {
    const dto = v2Certified()
    const broken: CertifiedClientSettlementAvailable = {
      ...dto,
      propertyLines: dto.propertyLines.map((line, index) =>
        index === 2 ? { ...line, amountDueToJj: 4099 } : line,
      ),
    }
    expect(composeLiveCertifiedPropertyAccount(broken).status).toBe('blocked')
  })

  test('partial pack coverage fails closed', () => {
    const onlyOne = new Map([[
      'uriel-bridge-v2:kamares',
      CERTIFIED_PROPERTY_ACCOUNT_PACKS.get('uriel-bridge-v2:kamares')!,
    ]])
    expect(composeCertifiedPropertyAccount(v2Certified(), onlyOne)).toEqual({
      status: 'blocked',
      reason: 'incomplete',
    })
  })

  test('ready account PDF is executive + one page per property + control', () => {
    const dto = v2Certified()
    const doc: any = OwnerPortfolioPdf({
      reports: [],
      lang: 'he',
      certifiedSettlement: dto,
      ownerName: 'Uriel',
    })
    const pages = React.Children.toArray(doc.props.children) as any[]
    expect(pages.length).toBe(10)
    expect(pages[0].props.statement.certified.closingDueToJj).toBe(50701.54)
    expect(pages[pages.length - 1].props.statement.certified.closingDueToJj).toBe(50701.54)
  })

  test('account pack and PDF do not expose forbidden client wording', () => {
    const src = packSrc()
    expect(src).not.toMatch(/Jacob|Anastasia|RC3|FIFO|Overall Net|Current Balance/)
    expect(src).not.toContain('2944e9ad-c298-4dbf-b666-26561d934b61')
    expect(src).not.toContain('119701.54')
    expect(src).not.toContain('50701.54')
    const pdf = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/pdf/CertifiedPropertyAccountPdf.tsx'),
      'utf8',
    )
    expect(pdf).not.toMatch(/Jacob|Anastasia|RC3|FIFO|Overall Net|Current Balance/)
  })
})
