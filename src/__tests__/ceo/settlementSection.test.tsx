import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SettlementSection, type Settlement } from '@/components/ceo/SettlementSection'

const filled: Settlement = {
  yossi_cashbox_balance: -10,
  jacob_cashbox_balance: 30,
  jj_cashbox_total: 4,
  jj_cashbox_per_partner: 2,
  anastasia_pending_jj_asset: 0,
  anastasia_asset_per_partner: 0,
  due_to_owners_total: 8,
  due_to_owners_per_partner: 4,
  settlement_delta: 40,
  settlement_amount: 20,
  transfer_direction: 'Jacob pays Yossi',
}

describe('SettlementSection', () => {
  it('shows only an unavailable notice when the settlement source is missing', () => {
    const html = renderToStaticMarkup(
      <SettlementSection settlement={null} yossiBalance={-36671.82} jacobBalance={74079.54} />,
    )

    expect(html).toContain('נתון לא זמין')
    expect(html).toContain('סילוק בין שותפים')
    expect(html).not.toContain('Official Result')
    expect(html).not.toContain('authoritative')
    expect(html).not.toContain('Formula')
    expect(html).not.toContain('Delta')
    expect(html).not.toContain('€')
    expect(html).not.toContain('36671')
    expect(html).not.toContain('74079')
  })

  it('shows the official result only when a settlement row is present', () => {
    const html = renderToStaticMarkup(
      <SettlementSection settlement={filled} yossiBalance={-10} jacobBalance={30} />,
    )

    expect(html).toContain('Official Result')
    expect(html).toContain('€20,00')
    expect(html).toContain('Delta: €40,00')
    expect(html).not.toContain('נתון לא זמין')
  })
})
