/**
 * Shared Heebo font registration for serverless @react-pdf routes.
 * Reads TTFs from disk into data URIs so Deployment Protection cannot block fonts.
 */
import fs from 'fs'
import path from 'path'
import { Font } from '@react-pdf/renderer'

let fontsRegistered = false

export function registerJjPdfFonts(): void {
  if (fontsRegistered) return
  const fontDir = path.join(process.cwd(), 'public', 'fonts')
  const regularPath = path.join(fontDir, 'Heebo-Regular.ttf')
  const boldPath = path.join(fontDir, 'Heebo-Bold.ttf')
  if (!fs.existsSync(regularPath) || !fs.existsSync(boldPath)) {
    throw new Error('JJ PDF Heebo fonts missing from serverless bundle')
  }
  const regularData = fs.readFileSync(regularPath)
  const boldData = fs.readFileSync(boldPath)
  Font.register({
    family: 'Heebo',
    fonts: [
      { src: `data:font/ttf;base64,${regularData.toString('base64')}` },
      { src: `data:font/ttf;base64,${boldData.toString('base64')}`, fontWeight: 'bold' },
    ],
  })
  fontsRegistered = true
}
