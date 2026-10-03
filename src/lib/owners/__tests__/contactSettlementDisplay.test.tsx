import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { OverviewTab } from '@/components/owners/tabs/OverviewTab'
import type { OwnerOverviewDTO } from '../ownerWorkspaceTypes'
import { mapContactSettlementToDisplay } from '../contactSettlementDisplay'

function overview(viewNet: string): OwnerOverviewDTO {
  const view = Number(viewNet)
  return {
    financial: {
      balanceDirection: view > 0 ? 'owner_owes_jj' : view < 0 ? 'jj_owes_owner' : 'balanced',
      balanceEur: String(Math.abs(view)),
      pendingEur: null,
      lastPaymentAt: null,
      nextPaymentAt: null,
      balanceSource: 'contact_settlement',
      contactSettlementViewNet: viewNet,
    },
    openItems: [],
    nextAction: null,
    upcomingPreview: [],
    contractRenewalAlert: null,
    recentActivity: [],
  }
}

describe('mapContactSettlementToDisplay', () => {
  it('maps a negative view net to a positive display and JJ owes the owner', () => {
    const shown = mapContactSettlementToDisplay(-6319.89, 'Ofri')
    expect(shown.viewNet).toBe(-6319.89)
    expect(shown.displayAmount).toBe(6319.89)
    expect(shown.directionText).toBe('JJ חייבת ל-Ofri')
  })

  it('maps a positive view net to a negative display and the owner owes JJ', () => {
    expect(mapContactSettlementToDisplay(1933.09, 'Tom', 'masculine')).toEqual({
      viewNet: 1933.09,
      displayAmount: -1933.09,
      directionText: 'Tom חייב ל-JJ',
    })
    expect(mapContactSettlementToDisplay(1933.09, 'Orit Rob', 'feminine').directionText)
      .toBe('Orit Rob חייבת ל-JJ')
    expect(mapContactSettlementToDisplay(1933.09, 'Liron and Alon').directionText)
      .toBe('Liron and Alon חייב/חייבת ל-JJ')
  })

  it('maps zero to a zero display and the zero sentence', () => {
    expect(mapContactSettlementToDisplay(0, 'Miranta')).toEqual({
      viewNet: 0,
      displayAmount: 0,
      directionText: 'היתרה אפס',
    })
  })
})

describe('OverviewTab contact-settlement headline', () => {
  it('shows the display sentence for a negative view net, a positive view net, and zero', () => {
    const negative = renderToStaticMarkup(<OverviewTab dto={overview('-6319.89')} ownerName="Ofri" />)
    expect(negative).toContain('JJ חייבת ל-Ofri')
    expect(negative).toContain('6,319.89')

    const positive = renderToStaticMarkup(<OverviewTab dto={overview('1933.09')} ownerName="Tom" />)
    expect(positive).toContain('Tom חייב/חייבת ל-JJ')
    expect(positive).toContain('1,933.09')

    const zero = renderToStaticMarkup(<OverviewTab dto={overview('0')} ownerName="Miranta" />)
    expect(zero).toContain('היתרה אפס')
  })
})
