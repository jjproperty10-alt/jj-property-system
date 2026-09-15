/**
 * Avi-visible expense classification: renovation contract vs execution cash,
 * Airbnb billed pool vs cashbox execution, and the 202-row artifact totals.
 */
import * as fs from 'fs'
import * as path from 'path'
import {
  classifyAviVisibleExpenseLayer,
  projectAviExpenseCompleteness,
  projectAviVisibleExpenses,
  roundEur,
} from '@/lib/partner-settlement/external-partner'
import type { ExternalPartnerInternalRow } from '@/lib/partner-settlement/external-partner'
import {
  AMOUNTS,
  TX,
  VM1_CANONICAL_CLASSIFICATION,
} from './aviGoldenFixture'

const RENOVATION_CONTRACT_ID = '8257e2f4-88f0-45aa-be63-4512680e29ad'
const PLUMBER_ID = 'fa51910c-67f8-4782-97b4-f7ad332ac5d1'
const AIRBNB_POOL_CASH_IDS = [
  '02183eec-0936-4043-9f07-1264013ae855',
  '736e607f-6051-4928-989e-26f9ad3e86bf',
  'b9239808-c0fc-4342-a489-3d5c10ecb3db',
] as const
const GARDENER_ID = '98ce79c4-cb44-4dc0-a807-32010d529ac1'
const FUNDING_PAYMENT_IDS = [
  TX.aviPurchaseFunding,
  TX.aviPremium,
  TX.aviToJacob,
  TX.aviReno5000,
  TX.aviReno20000,
] as const

function internal(overrides: Partial<ExternalPartnerInternalRow> & Pick<ExternalPartnerInternalRow, 'id'>): ExternalPartnerInternalRow {
  return {
    visibility: 'internal',
    date: '2025-01-01',
    propertyName: 'Villa Mazotos',
    category: 'Renovation',
    subcategory: 'Workers',
    description: null,
    payer: 'Yossi',
    rawPayer: 'Yossi',
    attributedPayer: null,
    attributionSource: null,
    payee: 'company',
    amountEur: 0,
    clientCharge: null,
    notes: null,
    kNote: null,
    isDeleted: false,
    reviewStatus: 'active',
    aviControl: null,
    ...overrides,
  }
}

describe('classifyAviVisibleExpenseLayer — renovation contract vs execution', () => {
  it('keeps the renovation contract as a partner-chargeable renovation row', () => {
    expect(classifyAviVisibleExpenseLayer('Renovation', 'Renovation Contract')).toBe('renovation')
  })

  it('keeps plumber residual as partner-chargeable renovation', () => {
    expect(classifyAviVisibleExpenseLayer('Renovation', 'Plumber')).toBe('renovation')
  })

  it('hides internal renovation execution subcategories', () => {
    for (const sub of [
      'Workers',
      'Materials',
      'Contractors',
      'Furniture',
      'Electrical Appliances',
      'Alouminiom',
      'Pool Service',
    ]) {
      expect(classifyAviVisibleExpenseLayer('Renovation', sub)).toBeNull()
    }
  })

  it('hides renovation client payment funding', () => {
    expect(classifyAviVisibleExpenseLayer('Renovation', 'Client Payment')).toBeNull()
  })

  it('hides the purchase contract', () => {
    expect(classifyAviVisibleExpenseLayer('Purchase', 'Purchase Contract')).toBeNull()
  })
})

describe('classifyAviVisibleExpenseLayer — Airbnb pool billing vs cash execution', () => {
  it('keeps billing-only pool invoices (amount 0, client_charge 120)', () => {
    expect(
      classifyAviVisibleExpenseLayer('Airbnb', 'Pool Service', {
        amountEur: 0,
        clientCharge: 120,
      }),
    ).toBe('airbnb')
  })

  it('keeps the marked-up pool charge (client_charge replaces cost)', () => {
    expect(
      classifyAviVisibleExpenseLayer('Airbnb', 'Pool Service', {
        amountEur: 250,
        clientCharge: 450,
      }),
    ).toBe('airbnb')
  })

  it('hides cashbox pool execution with no client_charge', () => {
    expect(
      classifyAviVisibleExpenseLayer('Airbnb', 'Pool Service', {
        amountEur: 476,
        clientCharge: null,
      }),
    ).toBeNull()
  })

  it('hides platform income', () => {
    expect(classifyAviVisibleExpenseLayer('Airbnb', 'Platform Income')).toBeNull()
  })
})

describe('projectAviVisibleExpenses — 202-row certified artifact', () => {
  const csvPath = path.join(process.cwd(), VM1_CANONICAL_CLASSIFICATION.classificationArtifact)
  const text = fs.readFileSync(csvPath, 'utf8').replace(/\r\n/g, '\n')
  const lines = text.trim().split('\n')
  const header = lines[0].split(',')
  const idx = (name: string) => header.indexOf(name)

  const rows: ExternalPartnerInternalRow[] = lines.slice(1).map((line) => {
    const cols = line.split(',')
    const amount = Number(cols[idx('amount_eur')])
    const cc = Number(cols[idx('client_charge')])
    return internal({
      id: cols[idx('txn_id')],
      date: cols[idx('date')],
      category: cols[idx('category')],
      subcategory: cols[idx('subcategory')],
      payer: cols[idx('payer')] || null,
      rawPayer: cols[idx('payer')] || null,
      payee: cols[idx('payee')] || null,
      amountEur: amount,
      clientCharge: cc > 0 ? cc : null,
    })
  })

  const paymentIds = new Set<string>(FUNDING_PAYMENT_IDS)
  const expenses = projectAviVisibleExpenses(rows, paymentIds, 50)

  const sumLayer = (layer: string) =>
    expenses.filter((e) => e.layer === layer).reduce((s, e) => s + (e.amountEur ?? 0), 0)

  it('reads the 202-row artifact', () => {
    expect(rows).toHaveLength(202)
  })

  it('shows exactly 101 partner-chargeable expense rows after the approved overlay', () => {
    expect(expenses).toHaveLength(101)
  })

  it('renovation is the contract plus the plumber residual, not execution cash', () => {
    const reno = expenses.filter((e) => e.layer === 'renovation')
    expect(reno).toHaveLength(2)
    const contract = reno.find((e) => e.id === RENOVATION_CONTRACT_ID)!
    const plumber = reno.find((e) => e.id === PLUMBER_ID)!
    expect(contract.amountEur).toBe(72199.14)
    expect(contract.subcategory).toBe('Renovation Contract')
    expect(plumber.amountEur).toBe(15)
    expect(plumber.subcategory).toBe('Plumber')
    expect(roundEur((contract.amountEur ?? 0) + (plumber.amountEur ?? 0))).toBe(AMOUNTS.renovation)
    expect(sumLayer('renovation')).toBe(AMOUNTS.renovation)
    expect(expenses.some((e) => e.id === TX.germanWorkerOnce)).toBe(false)
    expect(expenses.some((e) => e.subcategory === 'Workers')).toBe(false)
    expect(expenses.some((e) => e.subcategory === 'Materials')).toBe(false)
    expect(expenses.some((e) => e.subcategory === 'Contractors')).toBe(false)
  })

  it('does not list Airbnb pool vendor cash rows; gardener is Garden Maintenance', () => {
    for (const id of AIRBNB_POOL_CASH_IDS) {
      expect(expenses.some((e) => e.id === id)).toBe(false)
    }
    const gardener = expenses.find((e) => e.id === GARDENER_ID)
    expect(gardener?.layer).toBe('airbnb')
    expect(gardener?.subcategory).toBe('Garden Maintenance')
    expect(gardener?.amountEur).toBe(280)
    expect(gardener?.aviShareEur).toBe(140)
    expect(sumLayer('airbnb')).toBe(14727.53)
    const billedPool = expenses.filter(
      (e) => e.category === 'Airbnb' && e.subcategory === 'Pool Service',
    )
    expect(billedPool).toHaveLength(20)
    expect(billedPool.some((e) => e.id === TX.airbnbMarkup200)).toBe(false)
    const equipment = expenses.find((e) => e.id === TX.airbnbMarkup200)
    expect(equipment?.subcategory).toBe('Pool Equipment')
    expect(equipment?.amountEur).toBe(450)
    expect(equipment?.aviShareEur).toBe(225)
    const overlayPool = expenses.filter((e) => e.id.startsWith('pending-ledger:pool-2026-'))
    expect(overlayPool).toHaveLength(9)
    expect(overlayPool.every((e) => e.amountEur === 120)).toBe(true)
    expect(overlayPool.every((e) => e.aviShareEur === 60)).toBe(true)
    expect(new Set(overlayPool.map((e) => e.id)).size).toBe(9)
    const internet = expenses.find((e) => e.id === TX.mgmtInternet30)
    expect(internet?.layer).toBe('airbnb')
    expect(internet?.amountEur).toBe(30)
    expect(internet?.aviShareEur).toBe(15)
    const electricity = expenses.find((e) => e.id === TX.mgmtElectricity181)
    expect(electricity?.layer).toBe('airbnb')
    expect(electricity?.amountEur).toBe(181.79)
    expect(electricity?.aviShareEur).toBe(90.89)
  })

  it('totals by layer match the approved partner obligation', () => {
    expect(sumLayer('renovation')).toBe(72214.14)
    expect(sumLayer('airbnb')).toBe(14727.53)
    expect(sumLayer('management')).toBe(0)
    expect(sumLayer('deal_expense')).toBe(14300)
    expect(expenses.filter((e) => e.layer === 'management')).toHaveLength(0)
    expect(expenses.filter((e) => e.layer === 'deal_expense')).toHaveLength(6)
    expect(expenses.some((e) => e.id === TX.mgmtPool480)).toBe(false)
    expect(expenses.find((e) => e.id === TX.mgmtInternet30)?.layer).toBe('airbnb')
    expect(expenses.find((e) => e.id === TX.mgmtElectricity181)?.layer).toBe('airbnb')
  })

  it('visible approved charges total 101241.67 and Avi 50% share 50620.84', () => {
    const total = roundEur(expenses.reduce((s, e) => s + (e.amountEur ?? 0), 0))
    expect(total).toBe(101241.67)
    expect(roundEur(total * 0.5)).toBe(50620.84)
    const sumShareCents = (layer: string) =>
      expenses
        .filter((e) => e.layer === layer)
        .reduce((s, e) => s + Math.round((e.aviShareEur ?? 0) * 100), 0)
    expect(sumShareCents('renovation')).toBe(3610707)
    expect(sumShareCents('airbnb')).toBe(736377)
    expect(sumShareCents('management')).toBe(0)
    expect(sumShareCents('deal_expense')).toBe(715000)
    expect(expenses.reduce((s, e) => s + Math.round((e.aviShareEur ?? 0) * 100), 0)).toBe(5062084)
  })

  it('replaces amount with client_charge once and never adds them', () => {
    const markupPool = expenses.find((e) => e.id === TX.airbnbMarkup200)
    const markupOther = expenses.find((e) => e.id === TX.airbnbMarkup70)
    expect(markupPool?.amountEur).toBe(450)
    expect(markupPool?.subcategory).toBe('Pool Equipment')
    expect(markupPool?.amountEur).not.toBe(250)
    expect(markupPool?.amountEur).not.toBe(700)
    expect(markupOther?.amountEur).toBe(320)
    expect(markupOther?.amountEur).not.toBe(250)
    expect(markupOther?.amountEur).not.toBe(570)
  })

  it('deal expenses are the six Purchase Expenses rows including 6750', () => {
    const deal = expenses.filter((e) => e.layer === 'deal_expense')
    expect(deal).toHaveLength(6)
    const row6750 = deal.find((e) => e.id === TX.purchaseExpJacob6750)
    expect(row6750?.amountEur).toBe(6750)
    expect(row6750?.aviShareEur).toBe(3375)
    expect(row6750?.subcategory).toBe('Purchase Expenses')
    expect(roundEur(deal.reduce((s, e) => s + (e.amountEur ?? 0), 0))).toBe(14300)
    expect(roundEur(deal.reduce((s, e) => s + (e.aviShareEur ?? 0), 0))).toBe(7150)
  })

  it('has no overlap between expense rows and the five Avi funding payments', () => {
    const expenseIds = new Set(expenses.map((e) => e.id))
    for (const id of FUNDING_PAYMENT_IDS) {
      expect(expenseIds.has(id)).toBe(false)
      expect(rows.some((r) => r.id === id)).toBe(true)
    }
    expect(expenses.some((e) => e.id === TX.purchaseContract)).toBe(false)
    expect(expenses.some((e) => e.subcategory === 'Client Payment')).toBe(false)
    expect(expenses.some((e) => e.subcategory === 'Platform Income')).toBe(false)
    expect(expenses.some((e) => e.subcategory === 'Purchase Payment')).toBe(false)
    expect(expenses.some((e) => e.subcategory === 'Premium')).toBe(false)
    expect(expenses.some((e) => e.subcategory === 'Purchase Contract')).toBe(false)
  })

  it('treats a non-zero certified layer with no detail rows as incomplete', () => {
    const completeness = projectAviExpenseCompleteness(
      [
        { key: 'acquisition', label: 'Acquisition', totalChargeEur: 500000, aviShareEur: 250000, aviFundingEur: null, semanticNet: null },
        { key: 'deal_expense', label: 'Acquisition / Deal expenses', totalChargeEur: 14300, aviShareEur: 7150, aviFundingEur: 5600, semanticNet: null },
        { key: 'renovation', label: 'Renovation', totalChargeEur: 72214.14, aviShareEur: 36107.07, aviFundingEur: 25000, semanticNet: null },
        { key: 'airbnb', label: 'Airbnb', totalChargeEur: 14727.53, aviShareEur: 7363.77, aviFundingEur: 19640.34, semanticNet: null },
        { key: 'management', label: 'Management', totalChargeEur: 0, aviShareEur: 0, aviFundingEur: null, semanticNet: 'Settled' },
      ],
      expenses.filter((e) => e.layer === 'airbnb'),
    )
    expect(completeness.complete).toBe(false)
    expect(completeness.departmentsMissingDetailRows).toEqual(['deal_expense', 'renovation'])
  })
})
