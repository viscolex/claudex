// Writing RGBA pixels as a PNG with nothing but Node (each row with the filter that suits it).
import { deflateSync } from 'node:zlib'

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  Buffer.from(data).copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

const paeth = (a, b, c) => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** RGBA pixels as a PNG file. */
export function encodePng(width, height, rgba) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  const row = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const cur = rgba.subarray(y * stride, (y + 1) * stride)
    const up = y ? rgba.subarray((y - 1) * stride, y * stride) : new Uint8Array(stride)
    // Each row takes the filter whose output is smallest in sum: it usually compresses best.
    let best = 0
    let bestSum = Infinity
    let bestRow = cur
    for (let f = 0; f < 5; f++) {
      let sum = 0
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? cur[i - 4] : 0
        const b = up[i]
        const c = i >= 4 ? up[i - 4] : 0
        const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c)
        const v = (cur[i] - pred) & 0xff
        row[i] = v
        sum += v < 128 ? v : 256 - v
      }
      if (sum < bestSum) {
        bestSum = sum
        best = f
        bestRow = Uint8Array.from(row)
      }
    }
    raw[y * (stride + 1)] = best
    raw.set(bestRow, y * (stride + 1) + 1)
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(width, 0)
  head.writeUInt32BE(height, 4)
  head[8] = 8
  head[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
