/**
 * Minimal ZIP reader/writer for hostaway_owner_minimal_xlsx_v1.
 * Reads via the central directory. Supports store and deflate.
 * server-only.
 */

import 'server-only'

import { deflateRawSync, inflateRawSync } from 'zlib'

const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const EOCD_SIG = 0x06054b50

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i]
    for (let b = 0; b < 8; b += 1) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb88320 & mask)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function findEocd(bytes: Buffer): number {
  const min = Math.max(0, bytes.length - 22 - 65535)
  for (let i = bytes.length - 22; i >= min; i -= 1) {
    if (bytes.readUInt32LE(i) === EOCD_SIG) return i
  }
  throw new Error('malformed_xlsx')
}

export function readZipEntries(bytes: Buffer): Map<string, Buffer> {
  if (bytes.length < 22) throw new Error('malformed_xlsx')
  const eocd = findEocd(bytes)
  const count = bytes.readUInt16LE(eocd + 10)
  const centralSize = bytes.readUInt32LE(eocd + 12)
  const centralOffset = bytes.readUInt32LE(eocd + 16)
  if (centralOffset + centralSize > bytes.length) throw new Error('malformed_xlsx')
  const out = new Map<string, Buffer>()
  let cursor = centralOffset
  for (let n = 0; n < count; n += 1) {
    if (bytes.readUInt32LE(cursor) !== CENTRAL_SIG) throw new Error('malformed_xlsx')
    const method = bytes.readUInt16LE(cursor + 10)
    const compressedSize = bytes.readUInt32LE(cursor + 20)
    const nameLen = bytes.readUInt16LE(cursor + 28)
    const extraLen = bytes.readUInt16LE(cursor + 30)
    const commentLen = bytes.readUInt16LE(cursor + 32)
    const localOffset = bytes.readUInt32LE(cursor + 42)
    const name = bytes.slice(cursor + 46, cursor + 46 + nameLen).toString('utf8').replace(/\\/g, '/')
    if (bytes.readUInt32LE(localOffset) !== LOCAL_SIG) throw new Error('malformed_xlsx')
    const localNameLen = bytes.readUInt16LE(localOffset + 26)
    const localExtraLen = bytes.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    const dataEnd = dataStart + compressedSize
    if (dataEnd > bytes.length) throw new Error('malformed_xlsx')
    const compressed = bytes.slice(dataStart, dataEnd)
    let uncompressed: Buffer
    if (method === 0) uncompressed = compressed
    else if (method === 8) uncompressed = inflateRawSync(compressed)
    else throw new Error('malformed_xlsx')
    if (!name.endsWith('/')) out.set(name, uncompressed)
    cursor += 46 + nameLen + extraLen + commentLen
  }
  if (out.size === 0) throw new Error('malformed_xlsx')
  return out
}

export function writeZipEntries(files: Record<string, string | Buffer>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, body] of Object.entries(files)) {
    const raw = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8')
    const compressed = deflateRawSync(raw)
    const nameBuf = Buffer.from(name, 'utf8')
    const crc = crc32(raw)
    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(LOCAL_SIG, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    nameBuf.copy(local, 30)
    locals.push(local, compressed)
    const central = Buffer.alloc(46 + nameBuf.length)
    central.writeUInt32LE(CENTRAL_SIG, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    nameBuf.copy(central, 46)
    centrals.push(central)
    offset += local.length + compressed.length
  }
  const localBuf = Buffer.concat(locals)
  const centralBuf = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(EOCD_SIG, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(centrals.length, 8)
  eocd.writeUInt16LE(centrals.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(localBuf.length, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([localBuf, centralBuf, eocd])
}
