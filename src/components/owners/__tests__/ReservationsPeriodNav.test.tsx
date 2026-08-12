import renderer from 'react-test-renderer'
import { ReservationsPeriodNav } from '../ReservationsPeriodNav'

const find = (t: any, id: string): any[] => {
  const o: any[] = []
  const w = (n: any) => { if (!n || typeof n !== 'object') return; if (n.props && n.props['data-testid'] === id) o.push(n); (n.children || []).forEach(w) }
  w(t.toJSON()); return o
}

describe('ReservationsPeriodNav', () => {
  it('renders label + prev/next hrefs', () => {
    const t = renderer.create(
      <ReservationsPeriodNav selectedLabel="August 2026" prevHref="?tab=reservations&resMonth=2026-07" nextHref="?tab=reservations&resMonth=2026-09" />,
    )
    expect(find(t, 'res-period-label')[0].children.join('')).toContain('August 2026')
    expect(find(t, 'res-period-prev')[0].props.href).toBe('?tab=reservations&resMonth=2026-07')
    expect(find(t, 'res-period-next')[0].props.href).toBe('?tab=reservations&resMonth=2026-09')
  })

  it('shows auto-default note when provided', () => {
    const t = renderer.create(
      <ReservationsPeriodNav selectedLabel="September 2026" prevHref="#" nextHref="#" autoDefaultedLabel="September 2026" />,
    )
    expect(find(t, 'res-period-autodefault').length).toBe(1)
  })

  it('shows latest-active link only when provided', () => {
    const withLink = renderer.create(
      <ReservationsPeriodNav selectedLabel="August 2026" prevHref="#" nextHref="#" latestActiveLabel="September 2026" latestActiveHref="?tab=reservations&resMonth=2026-09" />,
    )
    expect(find(withLink, 'res-period-latest-link').length).toBe(1)
    const without = renderer.create(<ReservationsPeriodNav selectedLabel="August 2026" prevHref="#" nextHref="#" />)
    expect(find(without, 'res-period-latest-link').length).toBe(0)
  })
})
