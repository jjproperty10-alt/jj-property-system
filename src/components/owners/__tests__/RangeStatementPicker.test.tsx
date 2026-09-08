import renderer, { act } from 'react-test-renderer'
import { RangeStatementPicker } from '../RangeStatementPicker'

const DEKELIA = '47f53dde-9882-4f7c-ba49-3effeb937848'
const RADISSON = '20d9571e-6bf7-4307-ba4b-59ae5eb21241'

const find = (t: renderer.ReactTestRenderer, id: string): any[] => {
  const o: any[] = []
  const w = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (n.props && n.props['data-testid'] === id) o.push(n)
    ;(n.children || []).forEach(w)
  }
  w(t.toJSON())
  return o
}

describe('RangeStatementPicker', () => {
  it('keeps combined owner href when property is omitted (single-property owners)', () => {
    const t = renderer.create(
      <RangeStatementPicker
        slug="orit"
        defaultMonth="2026-08"
        properties={[{ id: 'c74e3ff2-cf7c-477a-8dad-ac11e45540ba', name: 'Orit Rob Pingodes' }]}
      />,
    )
    expect(find(t, 'range-property')).toHaveLength(0)
    expect(find(t, 'range-statement-link')[0].props.href).toBe(
      '/owners/orit/statement/range/pdf?from=2026-06&to=2026-08',
    )
  })

  it('defaults Tamir to combined, then can select Dekelia-only', () => {
    const t = renderer.create(
      <RangeStatementPicker
        slug="tamir"
        defaultMonth="2026-07"
        properties={[
          { id: DEKELIA, name: 'Tamir Dekelia' },
          { id: RADISSON, name: 'Tamir Radisson' },
        ]}
      />,
    )
    expect(find(t, 'range-property')).toHaveLength(1)
    expect(find(t, 'range-statement-link')[0].props.href).toBe(
      '/owners/tamir/statement/range/pdf?from=2026-05&to=2026-07',
    )
    act(() => {
      t.root.findByProps({ 'data-testid': 'range-property' }).props.onChange({ target: { value: DEKELIA } })
    })
    expect(find(t, 'range-statement-link')[0].props.href).toBe(
      `/owners/tamir/statement/range/pdf?from=2026-05&to=2026-07&property=${DEKELIA}`,
    )
  })
})
