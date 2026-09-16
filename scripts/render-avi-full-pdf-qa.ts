/**
 * Outside-repo QA render for full Avi react-pdf (HE/EN).
 * Writes PDFs under C:\jj_avi_bundle_v2 — not committed.
 */
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { composeAviCertifiedCanonicalFixtureReport } from '@/lib/partner-settlement/external-partner/aviCanonicalComposeFixture'
import { renderAviPartnerReportPdf } from '@/lib/pdf/renderAviPartnerReportPdf'
import { sanitizeAviReportClientPayload } from '@/components/finance/aviReportPresentation'

async function main() {
  const outDir = 'C:\\jj_avi_bundle_v2'
  fs.mkdirSync(outDir, { recursive: true })
  const built = composeAviCertifiedCanonicalFixtureReport()
  const report = sanitizeAviReportClientPayload(built)
  if (report.status !== 'certified') throw new Error('not certified')

  for (const lang of ['he', 'en'] as const) {
    const buffer = await renderAviPartnerReportPdf(report, lang)
    const file = path.join(outDir, `avi-partner-report-${lang}-react-pdf-qa-v8.pdf`)
    fs.writeFileSync(file, buffer)
    const sha = crypto.createHash('sha256').update(buffer).digest('hex')
    const head = buffer.slice(0, 8).toString('latin1')
    console.log(
      JSON.stringify({
        lang,
        file,
        bytes: buffer.length,
        sha256: sha,
        magic: head,
      }),
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
