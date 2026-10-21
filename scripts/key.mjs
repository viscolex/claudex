// Keys a flat magenta ground out of a PNG and writes a transparent PNG.
// A colour-difference key: magenta is where min(R, B) rises above G, which
// skin, browns, greens and blues almost never do. Prints one JSON line.
//
//   node key.mjs <in.png> <out.png>
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { inflateSync, deflateSync, crc32 } from 'node:zlib'

const [input, output] = process.argv.slice(2)

function decode(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10]
  if (!sig.every((b, i) => buf[i] === b)) throw new Error('Only PNG pictures can be cut out')
  let width = 0, height = 0, depth = 0, type = 0, interlace = 0
  let palette, trns
  const idat = []
  for (let at = 8; at < buf.length; ) {
    const len = buf.readUInt32BE(at)
    const name = buf.toString('latin1', at + 4, at + 8)
    const data = buf.subarray(at + 8, at + 8 + len)
    if (name === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      depth = data[8]
      type = data[9]
      interlace = data[12]
    } else if (name === 'PLTE') palette = data
    else if (name === 'tRNS') trns = data
    else if (name === 'IDAT') idat.push(data)
    else if (name === 'IEND') break
    at += 12 + len
  }
  if (interlace) throw new Error('Interlaced PNGs are not supported')
  if (depth !== 8 && depth !== 16) throw new Error(`PNG bit depth ${depth} is not supported`)
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type]
  if (!channels) throw new Error(`PNG colour type ${type} is not supported`)
  const bpp = channels * (depth / 8)
  const stride = width * bpp
  const raw = inflateSync(Buffer.concat(idat))
  const rows = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const out = rows.subarray(y * stride, (y + 1) * stride)
    const prev = y ? rows.subarray((y - 1) * stride, y * stride) : undefined
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= bpp ? prev[x - bpp] : 0
      let v = line[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      out[x] = v & 255
    }
  }
  const step = depth / 8
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const s = (k) => rows[i * bpp + k * step]
    let r, g, b, a = 255
    if (type === 0) r = g = b = s(0)
    else if (type === 4) { r = g = b = s(0); a = s(1) }
    else if (type === 2) { r = s(0); g = s(1); b = s(2) }
    else if (type === 6) { r = s(0); g = s(1); b = s(2); a = s(3) }
    else {
      const p = s(0)
      r = palette[p * 3]; g = palette[p * 3 + 1]; b = palette[p * 3 + 2]
      a = trns && p < trns.length ? trns[p] : 255
    }
    rgba.set([r, g, b, a], i * 4)
  }
  return { width, height, rgba }
}

function chunk(name, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(name, 4, 'latin1')
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0)
  return Buffer.concat([head, data, tail])
}

function encode({ width, height, rgba }) {
  const stride = width * 4
  const out = Buffer.alloc((stride + 1) * height)
  const trial = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const line = rgba.subarray(y * stride, (y + 1) * stride)
    const prev = y ? rgba.subarray((y - 1) * stride, y * stride) : undefined
    // Each row takes the filter that leaves the smallest residue.
    let bestCost = Infinity
    for (let f = 0; f < 5; f++) {
      let cost = 0
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? line[x - 4] : 0
        const b = prev ? prev[x] : 0
        const c = prev && x >= 4 ? prev[x - 4] : 0
        let p = 0
        if (f === 1) p = a
        else if (f === 2) p = b
        else if (f === 3) p = (a + b) >> 1
        else if (f === 4) {
          const q = a + b - c
          const pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c)
          p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
        }
        const v = (line[x] - p) & 255
        trial[x] = v
        cost += v < 128 ? v : 256 - v
      }
      if (cost < bestCost) {
        bestCost = cost
        out[y * (stride + 1)] = f
        trial.copy(out, y * (stride + 1) + 1)
      }
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(out, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function key(img) {
  const { rgba } = img
  let kept = 0
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2]
    const m = Math.max(0, Math.min(r, b) - g)
    const t = Math.min(1, Math.max(0, (m / 255 - 0.12) / (0.75 - 0.12)))
    const alpha = 1 - t * t * (3 - 2 * t)
    if (alpha <= 0) {
      rgba[i] = rgba[i + 1] = rgba[i + 2] = rgba[i + 3] = 0
      continue
    }
    // Take the magenta back out, then undo the blend at the edges.
    const div = alpha < 1 ? alpha : 1
    rgba[i] = Math.min(255, Math.round((r - m) / div))
    rgba[i + 1] = Math.min(255, Math.round(g / div))
    rgba[i + 2] = Math.min(255, Math.round((b - m) / div))
    rgba[i + 3] = Math.round(rgba[i + 3] * alpha)
    if (rgba[i + 3] > 8) kept++
  }
  return kept / (rgba.length / 4)
}

try {
  if (!input || !output) throw new Error('usage: node key.mjs <in.png> <out.png>')
  const img = decode(readFileSync(input))
  const kept = key(img)
  if (kept < 0.002) throw new Error('Nothing was left after keying: the picture is all magenta')
  if (kept > 0.995) throw new Error('No magenta ground was found to key out')
  writeFileSync(output, encode(img))
  console.log(JSON.stringify({ ok: true, path: output, width: img.width, height: img.height, bytes: statSync(output).size, kept: Math.round(kept * 1000) / 1000 }))
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }))
}
