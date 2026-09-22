/**
 * Minimal ZIP reader/writer for hostaway_owner_minimal_xlsx_v1.
 * Reads via the central directory. Supports store and deflate.
 * Bounds inflation so a compressed XLSX cannot expand without limit.
 * server-only.
 */

import 'server-only'

import { deflateRawSync, inflateRawSync } from 'zlib'

const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const EOCD_SIG = 0x06054b50
const ZIP64_SIZE = 0xffffffff

export const VM1_OS_ZIP_MAX_ENTRIES = 32
export const VM1_OS_ZIP_MAX_NAME_BYTES = 256
export const VM1_OS_ZIP_MAX_ENTRY_UNCOMPRESSED_BYTES = 512 * 1024
export const VM1_OS_ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES = 1024 * 1024

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

function need(bytes: Buffer, offset: number, length: number): void {
  if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 0) {
    throw new Error('malformed_xlsx')
  }
  if (offset > bytes.length || length > bytes.length - offset) throw new Error('malformed_xlsx')
}

function u16(bytes: Buffer, offset: number): number {
  need(bytes, offset, 2)
  return bytes.readUInt16LE(offset)
}

function u32(bytes: Buffer, offset: number): number {
  need(bytes, offset, 4)
  return bytes.readUInt32LE(offset)
}

function findEocd(bytes: Buffer): number {
  const min = Math.max(0, bytes.length - 22 - 65535)
  for (let i = bytes.length - 22; i >= min; i -= 1) {
    if (u32(bytes, i) === EOCD_SIG) {
      const commentLen = u16(bytes, i + 20)
      if (i + 22 + commentLen !== bytes.length) continue
      return i
    }
  }
  throw new Error('malformed_xlsx')
}

function inflateBounded(compressed: Buffer, declaredUncompressed: number): Buffer {
  if (declaredUncompressed < 1 || declaredUncompressed > VM1_OS_ZIP_MAX_ENTRY_UNCOMPRESSED_BYTES) {
    throw new Error('malformed_xlsx')
  }
  try {
    const out = inflateRawSync(compressed, { maxOutputLength: declaredUncompressed })
    if (out.length !== declaredUncompressed) throw new Error('malformed_xlsx')
    return out
  } catch {
    throw new Error('malformed_xlsx')
  }
}

export function readZipEntries(bytes: Buffer): Map<string, Buffer> {
  if (bytes.length < 22) throw new Error('malformed_xlsx')
  const eocd = findEocd(bytes)
  const countThisDisk = u16(bytes, eocd + 8)
  const count = u16(bytes, eocd + 10)
  const centralSize = u32(bytes, eocd + 12)
  const centralOffset = u32(bytes, eocd + 16)
  if (countThisDisk !== count || count < 1 || count > VM1_OS_ZIP_MAX_ENTRIES) {
    throw new Error('malformed_xlsx')
  }
  if (centralSize === ZIP64_SIZE || centralOffset === ZIP64_SIZE) throw new Error('malformed_xlsx')
  need(bytes, centralOffset, centralSize)
  if (centralOffset + centralSize > eocd) throw new Error('malformed_xlsx')

  const out = new Map<string, Buffer>()
  let cursor = centralOffset
  let totalUncompressed = 0
  for (let n = 0; n < count; n += 1) {
    if (u32(bytes, cursor) !== CENTRAL_SIG) throw new Error('malformed_xlsx')
    const method = u16(bytes, cursor + 10)
    const compressedSize = u32(bytes, cursor + 20)
    const uncompressedSize = u32(bytes, cursor + 24)
    const nameLen = u16(bytes, cursor + 28)
    const extraLen = u16(bytes, cursor + 30)
    const commentLen = u16(bytes, cursor + 32)
    const localOffset = u32(bytes, cursor + 42)
    need(bytes, cursor + 46, nameLen)
    if (nameLen < 1 || nameLen > VM1_OS_ZIP_MAX_NAME_BYTES) throw new Error('malformed_xlsx')
    const name = bytes.slice(cursor + 46, cursor + 46 + nameLen).toString('utf8').replace(/\\/g, '/')
    if (name.includes('..') || name.startsWith('/') || name.includes('\0')) throw new Error('malformed_xlsx')
    if (compressedSize === ZIP64_SIZE || uncompressedSize === ZIP64_SIZE || localOffset === ZIP64_SIZE) {
      throw new Error('malformed_xlsx')
    }
    if (u32(bytes, localOffset) !== LOCAL_SIG) throw new Error('malformed_xlsx')
    const localNameLen = u16(bytes, localOffset + 26)
    const localExtraLen = u16(bytes, localOffset + 28)
    const localCompressedSize = u32(bytes, localOffset + 18)
    const localUncompressedSize = u32(bytes, localOffset + 22)
    if (localCompressedSize !== compressedSize || localUncompressedSize !== uncompressedSize) {
      throw new Error('malformed_xlsx')
    }
    if (localNameLen !== nameLen) throw new Error('malformed_xlsx')
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    need(bytes, dataStart, compressedSize)
    if (dataStart + compressedSize > centralOffset) throw new Error('malformed_xlsx')
    if (uncompressedSize > VM1_OS_ZIP_MAX_ENTRY_UNCOMPRESSED_BYTES) throw new Error('malformed_xlsx')
    if (totalUncompressed + uncompressedSize > VM1_OS_ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error('malformed_xlsx')
    }
    const compressed = bytes.slice(dataStart, dataStart + compressedSize)
    let uncompressed: Buffer
    if (name.endsWith('/')) {
      if (uncompressedSize !== 0 || compressedSize !== 0) throw new Error('malformed_xlsx')
      uncompressed = Buffer.alloc(0)
    } else if (method === 0) {
      if (compressedSize !== uncompressedSize || compressed.length !== uncompressedSize) {
        throw new Error('malformed_xlsx')
      }
      uncompressed = compressed
    } else if (method === 8) {
      uncompressed = inflateBounded(compressed, uncompressedSize)
    } else {
      throw new Error('malformed_xlsx')
    }
    if (uncompressed.length !== uncompressedSize) throw new Error('malformed_xlsx')
    totalUncompressed += uncompressed.length
    if (!name.endsWith('/')) out.set(name, uncompressed)
    cursor += 46 + nameLen + extraLen + commentLen
    if (cursor > centralOffset + centralSize) throw new Error('malformed_xlsx')
  }
  if (cursor !== centralOffset + centralSize) throw new Error('malformed_xlsx')
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
