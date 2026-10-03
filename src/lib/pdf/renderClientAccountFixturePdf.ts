/**
 * Offline PDF render for a client-account document that was already composed
 * from fixtures. No service client and no database.
 */
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { ClientAccountDocument } from '../report/clientAccount/types'
import { ClientAccountPdf } from './ClientAccountPdf'

export async function renderClientAccountFixturePdf(doc: ClientAccountDocument): Promise<Buffer> {
  const element = React.createElement(ClientAccountPdf, { doc })
  const buffer = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0])
  return Buffer.from(buffer)
}
