/**
 * Reviewed presentation tags. They attach client wording and grouping only.
 * Amount, sign, category, date and client charge stay on the ledger row.
 * Transaction ids live here, never in a client adapter.
 *
 * REVIEW-6 source digest: the Orit REVIEW-6 render-summary sha. The repo does
 * not store another copy of that digest; the prefix is 0129011a.
 */

import { ClientAccountBlock } from './composeCertifiedAccount'
import { displayWhitelistViolations } from './terminology'
import type { LedgerRow } from './types'

export const REVIEW6_RENDER_SHA = '0129011a119924d0b45b45f7482a88fef266977c0694e712397fa9d6cb916e4e'

/** Yossi approved this source for the Orit report display only. The ledger row is unchanged. */
export const ORIT_ELECTRICITY_DISPLAY_APPROVAL =
  'Yossi approved this source for the Orit report display only. The ledger row is unchanged.'

export interface PresentationTag {
  readonly client: string
  readonly displayGroupKey?: string
  readonly displayGroupLabel?: string
  readonly clientLabel?: string
  readonly approvalRef: string
}

const ORIT = 'orit-rob'
const ORIT_PREPARATION = 'orit-preparation'
const ORIT_PREPARATION_LABEL = 'חומרי הכנה וניקיון יסודי'

export const PRESENTATION_TAGS: Readonly<Record<string, PresentationTag>> = {
  'bbdaca28-734d-43b5-88b8-4b7ff61390dc': {
    client: ORIT,
    displayGroupKey: ORIT_PREPARATION,
    displayGroupLabel: ORIT_PREPARATION_LABEL,
    approvalRef: REVIEW6_RENDER_SHA,
  },
  '2e5dcf81-edaa-4e7a-81b6-869f0c132892': {
    client: ORIT,
    displayGroupKey: ORIT_PREPARATION,
    displayGroupLabel: ORIT_PREPARATION_LABEL,
    approvalRef: REVIEW6_RENDER_SHA,
  },
  'dc4e1b6f-18fe-4c79-a5d2-5c90573bf6f9': {
    client: ORIT,
    clientLabel: 'חשמל',
    approvalRef: ORIT_ELECTRICITY_DISPLAY_APPROVAL,
  },
}

/**
 * Fail closed when a presentation copy would move an economic field.
 * Client charge is part of the amount: COALESCE(client_charge, amount_eur).
 */
export function assertPresentationEconomics(before: LedgerRow, after: LedgerRow): void {
  if (Math.sign(before.amountEur) !== Math.sign(after.amountEur)) {
    throw new ClientAccountBlock('BLOCKED_PRESENTATION', 'A presentation tag would change the sign.')
  }
  if (before.amountEur !== after.amountEur || before.clientCharge !== after.clientCharge) {
    throw new ClientAccountBlock('BLOCKED_PRESENTATION', 'A presentation tag would change the amount.')
  }
  if (before.category !== after.category) {
    throw new ClientAccountBlock('BLOCKED_PRESENTATION', 'A presentation tag would change the category.')
  }
  if (before.date !== after.date) {
    throw new ClientAccountBlock('BLOCKED_PRESENTATION', 'A presentation tag would change the date.')
  }
}

function wording(label: string | undefined): string {
  return (label || '').trim()
}

/**
 * Copy presentation fields onto rows of `clientSlug` only.
 * A tag for this client whose row is absent, a tag for another client, or
 * wording outside the display whitelist blocks the report.
 */
export function applyPresentationTags(
  rows: readonly LedgerRow[],
  clientSlug: string | undefined,
  tags: Readonly<Record<string, PresentationTag>> = PRESENTATION_TAGS,
): LedgerRow[] {
  const present = new Set(rows.map((row) => row.id))
  if (clientSlug) {
    const missing = Object.keys(tags).filter((id) => tags[id].client === clientSlug && !present.has(id))
    if (missing.length > 0) {
      throw new ClientAccountBlock('BLOCKED_PRESENTATION', `Presentation tag for ${missing[0]} is missing from the data.`)
    }
  }
  return rows.map((row) => {
    const tag = tags[row.id]
    if (!tag) return row
    if (tag.client !== clientSlug) {
      throw new ClientAccountBlock('BLOCKED_PRESENTATION', `Presentation tag for ${row.id} belongs to another client.`)
    }
    const groupLabel = wording(tag.displayGroupLabel)
    const clientLabel = wording(tag.clientLabel)
    if (tag.displayGroupKey && !groupLabel) {
      throw new ClientAccountBlock('BLOCKED_PRESENTATION', 'A presentation tag has no client wording.')
    }
    if (!tag.approvalRef.trim()) {
      throw new ClientAccountBlock('BLOCKED_PRESENTATION', 'A presentation tag has no approval reference.')
    }
    const labels = [groupLabel, clientLabel].filter((label) => label.length > 0)
    if (labels.length === 0) {
      throw new ClientAccountBlock('BLOCKED_PRESENTATION', 'A presentation tag has no client wording.')
    }
    for (let i = 0; i < labels.length; i += 1) {
      if (displayWhitelistViolations(labels[i]).length > 0) {
        throw new ClientAccountBlock('BLOCKED_PRESENTATION', 'A presentation tag uses wording that is not for the client.')
      }
    }
    const next: LedgerRow = {
      ...row,
      ...(tag.displayGroupKey ? { displayGroupKey: tag.displayGroupKey, displayGroupLabel: groupLabel } : {}),
      ...(clientLabel ? { clientLabel } : {}),
    }
    assertPresentationEconomics(row, next)
    return next
  })
}
