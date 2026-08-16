/**
 * historicalChannelEvidence — provider mapping + end-to-end statement math for recovered
 * Booking/Airbnb evidence (Yogev Port). No network: provider tested with a mock Supabase client;
 * statement math tested through the REAL composeOwnerStrStatement / buildStrStatementLine.
 *
 * Locked Yogev figures (approved, cent-exact vs production): Gross 4353.27 / Platform 794.98 /
 * Cleaning 850.00 / Mgmt 541.67 / Net Owner Payout 2166.62 (17 revenue reservations, Feb–Jun 2026).
 */
import { getHistoricalChannelEvidence } from '../historicalChannelEvidence'
import { composeOwnerStrStatement } from '../ownerStrStatement'
import { belongsToStatementMonth } from '../statementEvidence'

// Raw rows as stored in pms.historical_channel_reservation_evidence (subset of columns the provider reads).
type Raw = {
  external_reservation_id: string; channel: string; provider: string; guest_name: string | null
  check_in_date: string; check_out_date: string; status: string
  gross_amount: number; platform_fee: number; cleaning_fee: number | null; tax_amount: number | null; net_payout: number
}
const AIRBNB: Raw[] = [
  { external_reservation_id:'HMZFF5ATA8', channel:'airbnb', provider:'airbnb', guest_name:'Subhalakshmi Raman', check_in_date:'2026-02-22', check_out_date:'2026-02-23', status:'paid', gross_amount:127.80, platform_fee:19.81, cleaning_fee:50, tax_amount:0, net_payout:107.99 },
  { external_reservation_id:'HM2Z9D5ECD', channel:'airbnb', provider:'airbnb', guest_name:'Lior Zorbal', check_in_date:'2026-03-02', check_out_date:'2026-03-04', status:'paid', gross_amount:216.80, platform_fee:33.60, cleaning_fee:50, tax_amount:0, net_payout:183.20 },
  { external_reservation_id:'HMK5EQYWF3', channel:'airbnb', provider:'airbnb', guest_name:'Marinos Kyriacou', check_in_date:'2026-05-09', check_out_date:'2026-05-10', status:'paid', gross_amount:149.00, platform_fee:23.10, cleaning_fee:50, tax_amount:0, net_payout:125.90 },
  { external_reservation_id:'HMWQNXAQ5C', channel:'airbnb', provider:'airbnb', guest_name:'Zaza K', check_in_date:'2026-05-15', check_out_date:'2026-05-16', status:'paid', gross_amount:160.00, platform_fee:24.80, cleaning_fee:50, tax_amount:0, net_payout:135.20 },
  { external_reservation_id:'HM9TXSPXF3', channel:'airbnb', provider:'airbnb', guest_name:'Jay Saadat', check_in_date:'2026-05-30', check_out_date:'2026-06-01', status:'paid', gross_amount:227.30, platform_fee:35.23, cleaning_fee:50, tax_amount:0, net_payout:192.07 },
]
// Booking OK: platform_fee = gross - actual bank transfer; net_payout = actual bank transfer.
const BOOKING: Raw[] = [
  ['6857309149','2026-02-21','2026-02-22',135.37,29.24,106.13],['5719676235','2026-02-25','2026-02-28',263.45,56.91,206.54],
  ['5645013040','2026-02-28','2026-03-01',131.81,28.47,103.34],['6787931630','2026-03-21','2026-03-26',355.98,59.10,296.88],
  ['5792504831','2026-03-27','2026-03-30',266.00,57.46,208.54],['6399213483','2026-03-30','2026-04-06',582.90,125.91,456.99],
  ['6322568645','2026-04-08','2026-04-11',260.68,56.31,204.37],['5516432481','2026-04-19','2026-04-23',246.84,40.98,205.86],
  ['5850470360','2026-05-10','2026-05-13',197.63,32.80,164.83],['5045608409','2026-05-13','2026-05-14',104.68,17.37,87.31],
  ['5575493105','2026-05-16','2026-05-23',646.18,107.27,538.91],['5835564427','2026-06-03','2026-06-06',280.85,46.62,234.23],
].map(([id,ci,co,g,p,n]) => ({ external_reservation_id:String(id), channel:'booking', provider:'booking', guest_name:'Guest', check_in_date:String(ci), check_out_date:String(co), status:'ok', gross_amount:Number(g), platform_fee:Number(p), cleaning_fee:50, tax_amount:0, net_payout:Number(n) }))
const CANCELLED: Raw[] = [{ external_reservation_id:'5680934073', channel:'booking', provider:'booking', guest_name:'X', check_in_date:'2026-02-04', check_out_date:'2026-02-10', status:'cancelled', gross_amount:0, platform_fee:0, cleaning_fee:null, tax_amount:null, net_payout:0 }]
const ALL: Raw[] = [...AIRBNB, ...BOOKING, ...CANCELLED]

// Minimal chainable mock of the service client's .schema().from().select().eq().eq().eq() → {data,error}.
function mockClient(rows: Raw[]) {
  const q: any = { select: () => q, eq: () => q, then: (res: (v: { data: Raw[]; error: null }) => unknown) => res({ data: rows, error: null }) }
  return { schema: () => ({ from: () => q }) } as any
}

describe('getHistoricalChannelEvidence (provider)', () => {
  it('maps recovered rows, excludes cancellations, and remaps booking → booking_direct', async () => {
    const ev = await getHistoricalChannelEvidence(mockClient(ALL), 'pid', 'Yogev Port', '2026-08-15')
    expect(ev).toHaveLength(17)                                   // 5 airbnb + 12 booking ok, 1 cancelled dropped
    const channels = new Set(ev.map(e => e.channel))
    expect(channels).toEqual(new Set(['airbnb', 'booking_direct']))   // never raw 'booking' (avoids +1.6%)
    const dina = ev.find(e => e.reservationId === '6787931630')!
    expect(dina.grossEur).toBe(355.98); expect(dina.platformFeesEur).toBe(59.10)
    expect(dina.cleaningEur).toBe(50); expect(dina.taxesEur).toBe(0)
    expect(dina.platformPayoutEvidenceEur).toBe(296.88)
    expect(dina.guestName).toBe('[Guest]')                        // past checkout → masked
    expect(ev.every(e => e.channel !== 'booking')).toBe(true)
  })
})

describe('Yogev owner statement (engine, Feb–Jun 2026)', () => {
  it('produces the locked cent-exact totals through the certified composer', async () => {
    const evidence = (await getHistoricalChannelEvidence(mockClient(ALL), 'pid', 'Yogev Port', '2026-08-15'))
      .filter(e => belongsToStatementMonth(e.checkIn, '2026-02-01', '2026-06-30'))
    const st = composeOwnerStrStatement({
      ownerName: 'Yogev', properties: ['Yogev Port'], periodStart: '2026-02-01', periodEnd: '2026-06-30',
      periodLabel: 'Feb–Jun 2026', issuedDate: '2026-08-15', reservations: evidence, extras: [],
      jjPlatformIncomeInPeriodEur: null, jjPlatformIncomeIsAggregate: false,
    })
    expect(st.activity).toHaveLength(17)
    expect(st.totals.needsReviewCount).toBe(0)                    // taxes=0 evidenced → no Needs Review
    expect(st.totals.grossEur).toBe(4353.27)
    expect(st.totals.platformFeesEur).toBe(794.98)
    expect(st.totals.cleaningEur).toBe(850.00)
    expect(st.totals.managementFeeEur).toBe(541.67)
    expect(st.totals.taxesEur).toBe(0)
    expect(st.totals.netOwnerPayoutEur).toBe(2166.62)            // ← Yogev production gate
  })
})

describe('regression safety: property with no historical evidence', () => {
  it('returns nothing (Hostaway-mapped properties are unaffected)', async () => {
    const ev = await getHistoricalChannelEvidence(mockClient([]), 'hostaway-prop', 'Tamir Dekelia', '2026-08-15')
    expect(ev).toEqual([])
  })
})
