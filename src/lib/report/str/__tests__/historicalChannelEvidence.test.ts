/**
 * historicalChannelEvidence — provider mapping + end-to-end statement math for recovered
 * Booking/Airbnb evidence (Yogev Port). No network: provider tested with a mock Supabase client;
 * statement math tested through the REAL composeOwnerStrStatement / buildStrStatementLine.
 *
 * Locked Yogev figures (approved, cent-exact vs production): Gross 4353.27 / Platform 794.98 /
 * Cleaning 850.00 / Mgmt 541.67 / Net Owner Payout 2166.62 (17 revenue reservations, Feb–Jun 2026).
 */
import {
  getHistoricalChannelEvidence,
  historicalPropertiesForOwner,
  mapHistoricalRow,
  mergeLiveAndHistoricalEvidence,
  HISTORICAL_MANAGED_CHECKIN_CUTOFF,
  type HistoricalEvidenceRow,
} from '../historicalChannelEvidence'
import { composeOwnerStrStatement } from '../ownerStrStatement'
import { belongsToStatementMonth } from '../statementEvidence'
import type { StatementReservationEvidence } from '../ownerStrStatement'

type Raw = HistoricalEvidenceRow
const AIRBNB: Raw[] = [
  { external_reservation_id:'HMZFF5ATA8', channel:'airbnb', provider:'airbnb', guest_name:'Subhalakshmi Raman', check_in_date:'2026-02-22', check_out_date:'2026-02-23', status:'paid', gross_amount:127.80, platform_fee:19.81, cleaning_fee:50, tax_amount:0, net_payout:107.99 },
  { external_reservation_id:'HM2Z9D5ECD', channel:'airbnb', provider:'airbnb', guest_name:'Lior Zorbal', check_in_date:'2026-03-02', check_out_date:'2026-03-04', status:'paid', gross_amount:216.80, platform_fee:33.60, cleaning_fee:50, tax_amount:0, net_payout:183.20 },
  { external_reservation_id:'HMK5EQYWF3', channel:'airbnb', provider:'airbnb', guest_name:'Marinos Kyriacou', check_in_date:'2026-05-09', check_out_date:'2026-05-10', status:'paid', gross_amount:149.00, platform_fee:23.10, cleaning_fee:50, tax_amount:0, net_payout:125.90 },
  { external_reservation_id:'HMWQNXAQ5C', channel:'airbnb', provider:'airbnb', guest_name:'Zaza K', check_in_date:'2026-05-15', check_out_date:'2026-05-16', status:'paid', gross_amount:160.00, platform_fee:24.80, cleaning_fee:50, tax_amount:0, net_payout:135.20 },
  { external_reservation_id:'HM9TXSPXF3', channel:'airbnb', provider:'airbnb', guest_name:'Jay Saadat', check_in_date:'2026-05-30', check_out_date:'2026-06-01', status:'paid', gross_amount:227.30, platform_fee:35.23, cleaning_fee:50, tax_amount:0, net_payout:192.07 },
]
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

function mockRpcClient(rows: Raw[]) {
  return {
    rpc: async (name: string, args: { p_property_id: string }) => {
      expect(name).toBe('pms_historical_reservations_for_property')
      expect(args.p_property_id).toBeTruthy()
      return { data: rows, error: null }
    },
    schema: () => { throw new Error('pms schema must not be queried directly') },
  } as any
}

describe('getHistoricalChannelEvidence (provider)', () => {
  it('maps recovered rows via RPC, excludes cancellations, and remaps booking → booking_direct', async () => {
    const ev = await getHistoricalChannelEvidence(mockRpcClient(ALL), 'pid', 'Yogev Port', '2026-08-15')
    expect(ev).toHaveLength(17)
    const channels = new Set(ev.map(e => e.channel))
    expect(channels).toEqual(new Set(['airbnb', 'booking_direct']))
    const dina = ev.find(e => e.reservationId === '6787931630')!
    expect(dina.grossEur).toBe(355.98); expect(dina.platformFeesEur).toBe(59.10)
    expect(dina.cleaningEur).toBe(50); expect(dina.taxesEur).toBe(0)
    expect(dina.platformPayoutEvidenceEur).toBe(296.88)
    expect(dina.guestName).toBe('[Guest]')
    expect(ev.every(e => e.channel !== 'booking')).toBe(true)
    expect(ev.every(e => !e.platformFeesSource.startsWith('hostaway'))).toBe(true)
  })
})

describe('Yogev owner statement (engine, Feb–Jun 2026)', () => {
  it('produces the locked cent-exact totals through the certified composer', async () => {
    const evidence = (await getHistoricalChannelEvidence(mockRpcClient(ALL), 'pid', 'Yogev Port', '2026-08-15'))
      .filter(e => belongsToStatementMonth(e.checkIn, '2026-02-01', '2026-06-30'))
    const st = composeOwnerStrStatement({
      ownerName: 'Yogev', properties: ['Yogev Port'], periodStart: '2026-02-01', periodEnd: '2026-06-30',
      periodLabel: 'Feb–Jun 2026', issuedDate: '2026-08-15', reservations: evidence, extras: [],
      jjPlatformIncomeInPeriodEur: null, jjPlatformIncomeIsAggregate: false,
    })
    expect(st.activity).toHaveLength(17)
    expect(st.totals.needsReviewCount).toBe(0)
    expect(st.totals.grossEur).toBe(4353.27)
    expect(st.totals.platformFeesEur).toBe(794.98)
    expect(st.totals.cleaningEur).toBe(850.00)
    expect(st.totals.managementFeeEur).toBe(541.67)
    expect(st.totals.taxesEur).toBe(0)
    expect(st.totals.netOwnerPayoutEur).toBe(2166.62)
  })
})

describe('regression safety: property with no historical evidence', () => {
  it('returns nothing (Hostaway-mapped properties are unaffected)', async () => {
    const ev = await getHistoricalChannelEvidence(mockRpcClient([]), 'hostaway-prop', 'Tamir Dekelia', '2026-08-15')
    expect(ev).toEqual([])
  })
})

describe('historical management cutoff', () => {
  const after: Raw = {
    external_reservation_id: 'POST-CUTOFF', channel: 'booking', provider: 'booking', guest_name: 'X',
    check_in_date: '2026-06-11', check_out_date: '2026-06-14', status: 'ok',
    gross_amount: 999, platform_fee: 100, cleaning_fee: 50, tax_amount: 0, net_payout: 849,
  }
  const onCutoff: Raw = {
    external_reservation_id: 'ON-CUTOFF', channel: 'booking', provider: 'booking', guest_name: 'X',
    check_in_date: HISTORICAL_MANAGED_CHECKIN_CUTOFF, check_out_date: '2026-06-12', status: 'ok',
    gross_amount: 100, platform_fee: 10, cleaning_fee: 50, tax_amount: 0, net_payout: 90,
  }

  it('Uriel: drops check_in after 2026-06-10 and keeps the cutoff date', async () => {
    const ev = await getHistoricalChannelEvidence(mockRpcClient([after, onCutoff]), 'uriel', 'Uriel Duplex', '2026-09-07')
    expect(ev.map(e => e.reservationId)).toEqual(['ON-CUTOFF'])
    expect(ev.every(e => e.checkIn <= '2026-06-10')).toBe(true)
  })

  it('Tom: drops check_in after 2026-06-10', async () => {
    const ev = await getHistoricalChannelEvidence(mockRpcClient([after]), 'tom', 'Tom Dekelia', '2026-09-07')
    expect(ev).toEqual([])
  })
})

describe('Tom Dekelia historical-only rules', () => {
  const tomBooking: Raw = {
    external_reservation_id: '15587938-1', channel: 'booking', provider: 'booking', guest_name: 'G',
    check_in_date: '2026-02-17', check_out_date: '2026-02-20', status: 'ok',
    gross_amount: 427.64, platform_fee: 92.37, cleaning_fee: 50, tax_amount: 31.18, net_payout: 203.27,
  }
  const tomJun4: Raw = {
    external_reservation_id: 'TOM-JUN4', channel: 'booking', provider: 'booking', guest_name: 'G',
    check_in_date: '2026-06-04', check_out_date: '2026-06-07', status: 'ok',
    gross_amount: 500, platform_fee: 50, cleaning_fee: 50, tax_amount: 0, net_payout: 401.09,
  }
  const fakeAirbnb: Raw = {
    external_reservation_id: 'SHOULD-NOT-EXIST', channel: 'airbnb', provider: 'airbnb', guest_name: 'G',
    check_in_date: '2026-03-01', check_out_date: '2026-03-03', status: 'paid',
    gross_amount: 300, platform_fee: 0, cleaning_fee: 0, tax_amount: 0, net_payout: 300,
  }

  it('keeps Booking stays through cutoff including 2026-06-04', async () => {
    const ev = await getHistoricalChannelEvidence(mockRpcClient([tomBooking, tomJun4]), 'tom', 'Tom Dekelia', '2026-09-07')
    expect(ev.map(e => e.reservationId).sort()).toEqual(['15587938-1', 'TOM-JUN4'])
    expect(ev.every(e => e.channel === 'booking_direct')).toBe(true)
    expect(ev.every(e => e.checkIn <= '2026-06-10')).toBe(true)
  })

  it('does not invent Airbnb revenue — only rows present in recovered evidence appear', async () => {
    const recoveredOnly = await getHistoricalChannelEvidence(mockRpcClient([tomBooking, tomJun4]), 'tom', 'Tom Dekelia', '2026-09-07')
    expect(recoveredOnly.every(e => e.channel !== 'airbnb')).toBe(true)
  })

  it('€300 direct rental is not OTA evidence and is dropped', () => {
    const mapped = mapHistoricalRow({
      external_reservation_id: 'direct-300', channel: 'direct', provider: 'direct', guest_name: 'Tenant',
      check_in_date: '2026-05-03', check_out_date: '2026-05-06', status: 'paid',
      gross_amount: 300, platform_fee: 0, cleaning_fee: 0, tax_amount: 0, net_payout: 300,
    }, 'Tom Dekelia', '2026-09-07')
    expect(mapped).toBeNull()
  })

  it('a recovered Airbnb row would map if present — Tom recovered set has none', async () => {
    const withAirbnb = await getHistoricalChannelEvidence(mockRpcClient([tomBooking, fakeAirbnb]), 'tom', 'Tom Dekelia', '2026-09-07')
    expect(withAirbnb.filter(e => e.channel === 'airbnb')).toHaveLength(1)
    const without = await getHistoricalChannelEvidence(mockRpcClient([tomBooking]), 'tom', 'Tom Dekelia', '2026-09-07')
    expect(without.filter(e => e.channel === 'airbnb')).toHaveLength(0)
  })
})

describe('mergeLiveAndHistoricalEvidence (no double count)', () => {
  const live: StatementReservationEvidence = {
    reservationId: 'SAME', channel: 'airbnb', propertyName: 'P', guestName: 'G',
    checkIn: '2026-05-01', checkOut: '2026-05-03', nights: 2,
    grossEur: 100, platformFeesEur: 10, platformFeesSource: 'hostaway:airbnbListingHostFee',
    cleaningEur: 50, taxesEur: 0, platformPayoutEvidenceEur: 90,
  }
  const hist: StatementReservationEvidence = {
    ...live,
    platformFeesSource: 'airbnb:actual_platform_fee',
    grossEur: 999,
  }

  it('keeps the live row when reservationId collides', () => {
    const merged = mergeLiveAndHistoricalEvidence([live], [hist])
    expect(merged).toHaveLength(1)
    expect(merged[0].grossEur).toBe(100)
    expect(merged[0].platformFeesSource.startsWith('hostaway')).toBe(true)
  })

  it('appends historical rows with new ids (historical-only property)', () => {
    const onlyHist = mergeLiveAndHistoricalEvidence([], [{ ...hist, reservationId: 'HIST-1' }])
    expect(onlyHist).toHaveLength(1)
    expect(onlyHist[0].reservationId).toBe('HIST-1')
  })

  it('never labels historical provider as hostaway', () => {
    expect(hist.platformFeesSource).not.toContain('hostaway')
  })
})

describe('hostaway provider rows are rejected', () => {
  it('mapHistoricalRow drops provider=hostaway', () => {
    const ev = mapHistoricalRow({
      external_reservation_id: 'x', channel: 'airbnb', provider: 'hostaway', guest_name: 'G',
      check_in_date: '2026-05-01', check_out_date: '2026-05-02', status: 'paid',
      gross_amount: 1, platform_fee: 0, cleaning_fee: 0, tax_amount: 0, net_payout: 1,
    }, 'P', '2026-09-07')
    expect(ev).toBeNull()
  })
})

describe('historicalPropertiesForOwner', () => {
  it('keeps only exact managed names and does not query pms schema', async () => {
    const sb = {
      rpc: async (name: string) => {
        expect(name).toBe('pms_historical_property_ids')
        return { data: [{ property_id: 'u' }, { property_id: 't' }], error: null }
      },
      from: (table: string) => {
        expect(table).toBe('property_definitions')
        return {
          select: () => ({
            in: async () => ({
              data: [
                { property_id: 'u', property_name: 'Uriel Duplex' },
                { property_id: 't', property_name: 'Tom Dekelia' },
              ],
              error: null,
            }),
          }),
        }
      },
      schema: () => { throw new Error('pms schema must not be queried directly') },
    } as any
    const out = await historicalPropertiesForOwner(sb, ['Uriel Duplex', 'Someone Else'])
    expect(out).toEqual([{ id: 'u', name: 'Uriel Duplex' }])
  })
})
