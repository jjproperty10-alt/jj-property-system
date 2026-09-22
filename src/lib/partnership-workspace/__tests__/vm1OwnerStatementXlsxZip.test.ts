import { VM1_OS_UPLOAD_REASON } from '../vm1OwnerStatementUploadContract'
import {
  VM1_OS_XLSX_MAX_COLS,
  VM1_OS_XLSX_MAX_ROWS,
  VM1_OS_XLSX_MAX_XML_BYTES,
  buildMinimalOwnerStatementXlsx,
  readFirstSheetRows,
} from '../vm1OwnerStatementXlsxParser'
import {
  VM1_OS_ZIP_MAX_ENTRIES,
  VM1_OS_ZIP_MAX_ENTRY_UNCOMPRESSED_BYTES,
  readZipEntries,
  writeZipEntries,
} from '../vm1OwnerStatementXlsxZip'
import { parseVm1OwnerStatementXlsx } from '../vm1OwnerStatementUploadService'

const HEADERS = [
  'reservation_id',
  'check_in',
  'check_out',
  'reservation_status',
  'gross_rental_revenue',
  'platform_fee',
  'guest_cleaning',
  'total_taxes',
  'management_charge',
  'net_owner_payout',
  'currency',
]

const VALID_ROW = [
  '65733679',
  '2026-09-03',
  '2026-09-06',
  'confirmed',
  '1000.00',
  '100.00',
  '50.00',
  '0.00',
  '150.00',
  '700.00',
  'EUR',
]

function validXlsx(): Buffer {
  return buildMinimalOwnerStatementXlsx(HEADERS, [VALID_ROW])
}

function patchDeclaredUncompressed(zip: Buffer, size: number): Buffer {
  const out = Buffer.from(zip)
  out.writeUInt32LE(size >>> 0, 22)
  const eocd = out.length - 22
  const centralOffset = out.readUInt32LE(eocd + 16)
  out.writeUInt32LE(size >>> 0, centralOffset + 24)
  return out
}

function sheetXlsx(sheetXml: string): Buffer {
  const workbook =
    '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'
  const rels =
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
  return writeZipEntries({
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    '_rels/.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': workbook,
    'xl/_rels/workbook.xml.rels': rels,
    'xl/worksheets/sheet1.xml': sheetXml,
  })
}

describe('VM1 Owner Statement XLSX ZIP bomb guards', () => {
  it('still reads a valid minimal Owner Statement workbook', () => {
    const rows = readFirstSheetRows(validXlsx())
    expect(rows.rows[0][0]).toBe('reservation_id')
    expect(rows.rows[1][0]).toBe('65733679')
    expect(parseVm1OwnerStatementXlsx(validXlsx()).ok).toBe(true)
  })

  it('rejects an oversized declared uncompressed size before inflation', () => {
    const poisoned = patchDeclaredUncompressed(validXlsx(), 80 * 1024 * 1024)
    expect(() => readZipEntries(poisoned)).toThrow('malformed_xlsx')
    expect(parseVm1OwnerStatementXlsx(poisoned)).toEqual({
      ok: false,
      reason: VM1_OS_UPLOAD_REASON.malformedXlsx,
    })
  })

  it('rejects a declared/actual uncompressed-size mismatch', () => {
    const mismatch = patchDeclaredUncompressed(validXlsx(), 4096)
    expect(() => readZipEntries(mismatch)).toThrow('malformed_xlsx')
  })

  it('rejects a highly compressible payload above the per-entry uncompressed cap', () => {
    const zeros = Buffer.alloc(VM1_OS_ZIP_MAX_ENTRY_UNCOMPRESSED_BYTES + 1, 0)
    const zip = writeZipEntries({ 'xl/worksheets/sheet1.xml': zeros })
    expect(() => readZipEntries(zip)).toThrow('malformed_xlsx')
    expect(parseVm1OwnerStatementXlsx(zip)).toEqual({
      ok: false,
      reason: VM1_OS_UPLOAD_REASON.malformedXlsx,
    })
  })

  it('rejects malformed central-directory offsets', () => {
    const zip = Buffer.from(validXlsx())
    const eocd = zip.length - 22
    zip.writeUInt32LE(0xfffffff0, eocd + 16)
    expect(() => readZipEntries(zip)).toThrow('malformed_xlsx')
    expect(parseVm1OwnerStatementXlsx(zip).ok).toBe(false)
  })

  it('rejects too many ZIP entries', () => {
    const files: Record<string, string> = {}
    for (let i = 0; i < VM1_OS_ZIP_MAX_ENTRIES + 1; i += 1) files[`n${i}.xml`] = '<a/>'
    const zip = writeZipEntries(files)
    expect(() => readZipEntries(zip)).toThrow('malformed_xlsx')
    expect(parseVm1OwnerStatementXlsx(zip)).toEqual({
      ok: false,
      reason: VM1_OS_UPLOAD_REASON.malformedXlsx,
    })
  })

  it('rejects worksheet XML above the XML size bound', () => {
    const pad = 'x'.repeat(VM1_OS_XLSX_MAX_XML_BYTES + 1)
    const zip = sheetXlsx(
      `<?xml version="1.0"?><worksheet><sheetData><c r="A1" t="inlineStr"><is><t>h</t></is></c></sheetData><!--${pad}--></worksheet>`,
    )
    expect(() => readFirstSheetRows(zip)).toThrow('malformed_xlsx')
    expect(parseVm1OwnerStatementXlsx(zip)).toEqual({
      ok: false,
      reason: VM1_OS_UPLOAD_REASON.malformedXlsx,
    })
  })

  it('rejects excessive row and column references', () => {
    const highRow = sheetXlsx(
      `<?xml version="1.0"?><worksheet><sheetData><c r="A${VM1_OS_XLSX_MAX_ROWS + 1}" t="inlineStr"><is><t>x</t></is></c></sheetData></worksheet>`,
    )
    const highCol = sheetXlsx(
      `<?xml version="1.0"?><worksheet><sheetData><c r="AG1" t="inlineStr"><is><t>x</t></is></c></sheetData></worksheet>`,
    )
    const hugeRef = sheetXlsx(
      '<?xml version="1.0"?><worksheet><sheetData><c r="A1048576" t="inlineStr"><is><t>x</t></is></c></sheetData></worksheet>',
    )
    expect(VM1_OS_XLSX_MAX_COLS).toBeLessThan(33)
    expect(() => readFirstSheetRows(highRow)).toThrow('malformed_xlsx')
    expect(() => readFirstSheetRows(highCol)).toThrow('malformed_xlsx')
    expect(() => readFirstSheetRows(hugeRef)).toThrow('malformed_xlsx')
    expect(parseVm1OwnerStatementXlsx(highRow).ok).toBe(false)
    expect(parseVm1OwnerStatementXlsx(highCol).ok).toBe(false)
    expect(parseVm1OwnerStatementXlsx(hugeRef).ok).toBe(false)
  })
})
