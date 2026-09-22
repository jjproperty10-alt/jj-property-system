/**
 * hostaway_owner_minimal_xlsx_v1 sheet reader.
 * Does not keep Excel bytes, filename, or raw JSON after parse.
 * server-only.
 */

import 'server-only'

import { readZipEntries, writeZipEntries } from './vm1OwnerStatementXlsxZip'

export const VM1_OS_XLSX_MAX_XML_BYTES = 256 * 1024
export const VM1_OS_XLSX_MAX_ROWS = 512
export const VM1_OS_XLSX_MAX_COLS = 32
export const VM1_OS_XLSX_MAX_CELLS = 4096

export type Vm1OsSheetCell = string | number
export type Vm1OsSheetRow = readonly Vm1OsSheetCell[]

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function xmlText(bytes: Buffer | undefined, label: string): string {
  if (bytes == null) {
    if (label === 'sharedStrings') return ''
    throw new Error('malformed_xlsx')
  }
  if (bytes.length > VM1_OS_XLSX_MAX_XML_BYTES) throw new Error('malformed_xlsx')
  return bytes.toString('utf8')
}

function colRow(ref: string): { col: number; row: number } {
  const match = /^([A-Z]{1,2})(\d{1,3})$/.exec(ref.toUpperCase())
  if (match == null) throw new Error('malformed_xlsx')
  let col = 0
  for (const ch of match[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
  const row = Number(match[2])
  if (!Number.isInteger(row) || row < 1 || row > VM1_OS_XLSX_MAX_ROWS) throw new Error('malformed_xlsx')
  if (col < 1 || col > VM1_OS_XLSX_MAX_COLS) throw new Error('malformed_xlsx')
  return { col: col - 1, row }
}

function sharedStrings(xml: string): string[] {
  const out: string[] = []
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/gi
  let si: RegExpExecArray | null
  while ((si = siRe.exec(xml)) != null) {
    const texts: string[] = []
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/gi
    let t: RegExpExecArray | null
    while ((t = tRe.exec(si[1])) != null) texts.push(decodeXmlEntities(t[1]))
    out.push(texts.join(''))
  }
  return out
}

function firstSheetPath(entries: Map<string, Buffer>): string {
  const wb = xmlText(entries.get('xl/workbook.xml'), 'workbook')
  const sheet = /<sheet\b[^>]*\bname="([^"]*)"[^>]*\br:id="([^"]+)"/i.exec(wb)
    ?? /<sheet\b[^>]*\br:id="([^"]+)"[^>]*\bname="([^"]*)"/i.exec(wb)
  const rels = xmlText(entries.get('xl/_rels/workbook.xml.rels'), 'rels')
  if (sheet != null) {
    const rId = sheet[1].startsWith('rId') ? sheet[1] : sheet[2]
    const rel = new RegExp(`Id="${rId}"[^>]*Target="([^"]+)"`, 'i').exec(rels)
      ?? new RegExp(`Target="([^"]+)"[^>]*Id="${rId}"`, 'i').exec(rels)
    if (rel != null) {
      const target = rel[1].replace(/^\//, '')
      const path = target.startsWith('xl/') ? target : `xl/${target.replace(/^\.\//, '')}`
      if (entries.has(path)) return path
    }
  }
  let fallback: string | undefined
  entries.forEach((_value, key) => {
    if (fallback == null && /xl\/worksheets\/sheet\d+\.xml$/i.test(key)) fallback = key
  })
  if (fallback == null) throw new Error('malformed_xlsx')
  return fallback
}

function cellValue(cellXml: string, strings: readonly string[]): Vm1OsSheetCell | null {
  const t = /\bt="([^"]+)"/.exec(cellXml)?.[1] ?? ''
  if (t === 'inlineStr') {
    const inline = /<t\b[^>]*>([\s\S]*?)<\/t>/i.exec(cellXml)
    return inline != null ? decodeXmlEntities(inline[1]).trim() : ''
  }
  const v = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(cellXml)
  if (v == null) return null
  const raw = decodeXmlEntities(v[1]).trim()
  if (t === 's') {
    const idx = Number(raw)
    if (!Number.isInteger(idx) || strings[idx] == null) throw new Error('malformed_xlsx')
    return strings[idx].trim()
  }
  if (t === 'b') return raw
  if (raw === '') return null
  if (/^[+-]?\d+(\.\d+)?$/.test(raw) && !/[eE]/.test(raw)) return Number(raw)
  return raw
}

export function readFirstSheetRows(bytes: Buffer): { sheetName: string; rows: Vm1OsSheetRow[] } {
  const entries = readZipEntries(bytes)
  const sheetPath = firstSheetPath(entries)
  const sheetXml = xmlText(entries.get(sheetPath), 'sheet')
  const strings = xmlText(entries.get('xl/sharedStrings.xml'), 'sharedStrings')
  const shared = strings === '' ? [] : sharedStrings(strings)
  if (shared.length > VM1_OS_XLSX_MAX_CELLS) throw new Error('malformed_xlsx')
  const grid = new Map<string, Vm1OsSheetCell>()
  let maxRow = 0
  let maxCol = 0
  let cellCount = 0
  const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi
  let cell: RegExpExecArray | null
  while ((cell = cellRe.exec(sheetXml)) != null) {
    cellCount += 1
    if (cellCount > VM1_OS_XLSX_MAX_CELLS) throw new Error('malformed_xlsx')
    const ref = /\br="([^"]+)"/.exec(cell[1])?.[1]
    if (ref == null) throw new Error('malformed_xlsx')
    const pos = colRow(ref)
    const value = cellValue(`<c ${cell[1]}>${cell[2]}</c>`, shared)
    if (value == null || value === '') continue
    grid.set(`${pos.row}:${pos.col}`, value)
    if (pos.row > maxRow) maxRow = pos.row
    if (pos.col > maxCol) maxCol = pos.col
  }
  if (maxRow < 1) throw new Error('malformed_xlsx')
  const rows: Vm1OsSheetRow[] = []
  for (let r = 1; r <= maxRow; r += 1) {
    const row: Vm1OsSheetCell[] = []
    let empty = true
    for (let c = 0; c <= maxCol; c += 1) {
      const value = grid.get(`${r}:${c}`)
      row.push(value ?? '')
      if (value != null && value !== '') empty = false
    }
    if (!empty) rows.push(row)
  }
  return { sheetName: 'S1', rows }
}

function colLetter(index: number): string {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildMinimalOwnerStatementXlsx(headers: readonly string[], dataRows: readonly (readonly (string | number)[])[]): Buffer {
  const rowsXml: string[] = []
  const all = [headers, ...dataRows]
  all.forEach((row, idx) => {
    const r = idx + 1
    const cells = row
      .map((value, col) => {
        const ref = `${colLetter(col)}${r}`
        if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`
        return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(String(value))}</t></is></c>`
      })
      .join('')
    rowsXml.push(`<row r="${r}">${cells}</row>`)
  })
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml.join('')}</sheetData></worksheet>`
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`
  return writeZipEntries({
    '[Content_Types].xml': types,
    '_rels/.rels': rootRels,
    'xl/workbook.xml': workbook,
    'xl/_rels/workbook.xml.rels': rels,
    'xl/worksheets/sheet1.xml': sheet,
  })
}
