/**
 * What the Uriel engine does today on the open decisions.
 * Wording choices that are still pending are recorded beside them.
 * This file does not change the engine.
 */
import { term } from '../terminology'
import type { ClientAccountDocument, DisplayLine } from '../types'

export const URIEL_PENDING_DESCRIPTION_IDS = [
  '37630a81-f33c-4070-90f6-4c8db8888d2e',
  '8d149fbf-3654-4d79-9007-4bd6f16dd90a',
  'e8503b83-4066-4fcd-8f4e-07d0f635d90e',
  '226c1b1b-bfeb-48b1-82cb-b462c41f929a',
] as const

const EFI_LABEL_ROW = 'd3d31222-a746-4b3e-af22-40db870bb5d6'
const SPLIT_RENT_ROW = '3d7fdff5-9ec6-4a26-b2f8-00cdef0c2c6b'
const KAMARES_RECEIPT = 'ba646d2d-9122-4909-ae02-8a67739a0172'

export interface UrielEngineNote {
  readonly id: string
  readonly title: string
  readonly engineToday: string
}

function linesOf(doc: ClientAccountDocument): DisplayLine[] {
  const lines: DisplayLine[] = []
  for (let i = 0; i < doc.properties.length; i += 1) {
    const property = doc.properties[i]
    for (let j = 0; j < property.lines.length; j += 1) lines.push(property.lines[j])
    for (let u = 0; u < property.units.length; u += 1) {
      const unit = property.units[u]
      for (let j = 0; j < unit.lines.length; j += 1) lines.push(unit.lines[j])
    }
  }
  return lines
}

function forSource(lines: readonly DisplayLine[], id: string): DisplayLine[] {
  return lines.filter((line) => line.sourceIds.includes(id))
}

function describe(lines: readonly DisplayLine[]): string {
  if (lines.length === 0) return 'not present in the rendered lines'
  return lines.map((line) => {
    const paid = line.paymentMonthLabel ? ` paid ${line.paymentMonthLabel}` : ''
    return `${line.clientText} | ${line.monthLabel}${paid} | ${line.amount.toFixed(2)} | ${line.directionText}`
  }).join('; ')
}

/** The 1,500 receipt is allocated to three months. Only the first line keeps the source id. */
function allocatedRent(lines: readonly DisplayLine[], id: string): DisplayLine[] {
  const sourced = lines.filter((line) => line.sourceIds.includes(id))
  if (sourced.length === 0) return []
  const text = sourced[0].clientText
  const months = ['אפריל 2026', 'מאי 2026', 'יוני 2026']
  return lines.filter((line) => line.clientText === text
    && line.countedIn === sourced[0].countedIn
    && months.includes(line.monthLabel)
    && (line.sourceIds.includes(id) || line.sourceIds.length === 0))
}

export function urielEngineNotes(doc: ClientAccountDocument): {
  readonly openItems: readonly UrielEngineNote[]
  readonly pendingDescriptions: readonly UrielEngineNote[]
  readonly neer: string
} {
  const lines = linesOf(doc)
  const caption = term('chargeDefaulted', doc.reportLanguage)
  const flagged = lines.filter((line) => line.clientChargeDefaulted).length
  const neer = doc.properties.find((property) => property.propertyName === 'Apartment Neer Yoav Dekelia')
  return {
    neer: neer
      ? `Apartment Neer Yoav Dekelia stays inside the Uriel report at ${neer.amountDueToJj.toFixed(2)} ${neer.direction}. Placement is pending Yossi.`
      : 'Apartment Neer Yoav Dekelia is missing from the rendered report.',
    openItems: [
      {
        id: 'charge-defaulted-caption',
        title: 'No separate charge caption',
        engineToday: `The engine prints "${caption}" on ${flagged} lines whose client_charge is null (clientChargeDefaulted). The caption is not hidden.`,
      },
      {
        id: EFI_LABEL_ROW,
        title: 'Cross-entity Efi Dekelia label',
        engineToday: `Row ${EFI_LABEL_ROW} stays on the raw label. Presentation tags are applied to admitted rows only, not to linked Efi rows. Rendered: ${describe(forSource(lines, EFI_LABEL_ROW))}.`,
      },
      {
        id: SPLIT_RENT_ROW,
        title: 'Duplex 1,500 rent line',
        engineToday: `Row ${SPLIT_RENT_ROW} is not one 1,500 line. The engine allocates it to three 500.00 rent lines. Rendered: ${describe(allocatedRent(lines, SPLIT_RENT_ROW))}.`,
      },
      {
        id: KAMARES_RECEIPT,
        title: 'Kamares 1,800 date display',
        engineToday: `Additional receipt ${KAMARES_RECEIPT} stays one June 2026 line. It is not split across March and April. Rendered: ${describe(forSource(lines, KAMARES_RECEIPT))}.`,
      },
    ],
    pendingDescriptions: URIEL_PENDING_DESCRIPTION_IDS.map((id) => ({
      id,
      title: 'Description pending an approval on record',
      engineToday: `No presentation tag. Raw or default label. Rendered: ${describe(forSource(lines, id))}.`,
    })),
  }
}
