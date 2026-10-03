/**
 * Offline certified client-report check.
 * Fixtures only. Does not open a database connection.
 */
import { join } from 'path'

import { renderClientAccountFixturePdf } from '../src/lib/pdf/renderClientAccountFixturePdf'
import { applyPdfText, verifyApprovedReports, writeVerifySummaries } from '../src/lib/report/clientAccount/verifyApprovedReports'
import { pdfPlainText } from './pdfPlainText'

async function main(): Promise<void> {
  const directory = join(process.cwd(), 'docs', 'planning', 'client-report-verify')
  const verified = []
  for (const client of verifyApprovedReports()) {
    if (!client.document) {
      verified.push(client)
      continue
    }
    const buffer = await renderClientAccountFixturePdf(client.document)
    const text = await pdfPlainText(buffer)
    verified.push(applyPdfText(client, text))
  }
  writeVerifySummaries(verified, directory)
  const failed = verified.filter((client) => client.summary.rendered && !client.summary.match)
  for (const client of verified) {
    const state = client.summary.rendered ? (client.summary.match ? 'match' : 'mismatch') : client.summary.status
    console.log(`${client.summary.clientSlug}\t${state}`)
  }
  if (failed.length > 0) {
    for (const client of failed) {
      console.error(client.summary.clientSlug)
      for (const mismatch of client.summary.mismatches) console.error(`  ${mismatch}`)
    }
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack || err.message : String(err))
  process.exit(1)
})
