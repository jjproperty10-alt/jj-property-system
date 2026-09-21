import React from 'react'
import { composeCertifiedOwnerStatement } from '../certifiedPropertyBridge'
import { certifiedCents } from '../certifiedClientSettlementPresentation'
import { composeLiveCertifiedOwnerStatement, CERTIFIED_PROPERTY_BRIDGE_PACKS } from '@/lib/report/certifiedPropertyBridgePack'
import { URIEL_SHAPED_CERTIFIED } from '../__fixtures__/certifiedClientSettlement'
import type { CertifiedClientSettlementAvailable } from '../certifiedClientSettlementTypes'
import { OwnerPortfolioPdf } from '@/lib/pdf/OwnerSettlementPdfV3'

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

describe('certified property bridge compose', () => {
  test('fixture evidence refs are unavailable rather than blocked', () => {
    expect(composeLiveCertifiedOwnerStatement(URIEL_SHAPED_CERTIFIED)).toEqual({
      status: 'unavailable',
      reason: 'no_pack',
    })
  })

  test('v2 pack reconciles every line, opening cents, and STR months', () => {
    const composed = composeLiveCertifiedOwnerStatement(v2Certified())
    expect(composed.status).toBe('ready')
    if (composed.status !== 'ready') return
    const opening = composed.statement.properties.reduce(
      (sum, page) => sum + (certifiedCents(page.certifiedBalanceDueToJj) ?? 0),
      0,
    )
    expect(opening).toBe(11970154)
    expect(certifiedCents(composed.statement.certified.closingDueToJj)).toBe(5070154)
    const dekelia = composed.statement.properties.find((p) => p.propertyName === 'Apartment Neer Yoav Dekelia')
    expect(dekelia?.strMonths.map((m) => m.ownerNet)).toEqual([947.25, 1525.77, 961.96])
    const studio = composed.statement.properties.find((p) => p.propertyName === 'Uriel Studio Kitty')
    expect(studio?.certifiedBalanceDueToJj).toBe(4089)
    expect(studio?.components.some((c) => c.effectDueToJj === -1500 && c.sourceStatus === 'approved_adjustment')).toBe(true)
    expect(studio?.components.some((c) => /internal|Jacob|JJ P&L/i.test(`${c.labelEn} ${c.detailEn ?? ''}`))).toBe(false)
    const oro = composed.statement.properties.find((p) => p.propertyName === 'Uriel Oroklini 2 Bed')
    expect(oro?.components.map((c) => c.labelEn)).toEqual(['Key', 'Lock replacement', 'Cleaning', 'Plumber'])
    const metro = composed.statement.properties.find((p) => p.propertyName === 'Uriel Sharon English Metro')
    expect(metro?.components.filter((c) => c.labelEn.startsWith('Garden')).map((c) => c.effectDueToJj)).toEqual([150, 150])
  })

  test('a mismatched certified line fails closed', () => {
    const dto = v2Certified()
    const broken: CertifiedClientSettlementAvailable = {
      ...dto,
      propertyLines: dto.propertyLines.map((line, index) =>
        index === 2 ? { ...line, amountDueToJj: 4099 } : line,
      ),
    }
    expect(composeLiveCertifiedOwnerStatement(broken).status).toBe('blocked')
  })

  test('partial pack coverage fails closed', () => {
    const onlyOne = new Map([[
      'uriel-bridge-v2:kamares',
      CERTIFIED_PROPERTY_BRIDGE_PACKS.get('uriel-bridge-v2:kamares')!,
    ]])
    expect(composeCertifiedOwnerStatement(v2Certified(), onlyOne)).toEqual({
      status: 'blocked',
      reason: 'incomplete',
    })
  })

  test('ready statement PDF is cover + one page per property + cross-check', () => {
    const dto = v2Certified()
    const doc: any = OwnerPortfolioPdf({
      reports: [],
      lang: 'he',
      certifiedSettlement: dto,
      ownerName: 'Uriel',
    })
    const pages = React.Children.toArray(doc.props.children) as any[]
    expect(pages.length).toBe(10)
    expect(pages[0].props.dto.closingDueToJj).toBe(50701.54)
    expect(pages[pages.length - 1].props.statement.certified.closingDueToJj).toBe(50701.54)
  })
})
