// A decoder for lossless WebP (VP8L), the format the Codex app's companion
// sprite sheets use, so the mod can cut them with no image library installed.
// It follows the WebP lossless bitstream specification (RFC 9649). Lossy WebP
// is not supported: decoding one throws.
//
//   decodeLosslessWebp(bytes) -> { width, height, rgba }  (rgba: 4 bytes a pixel)

const CODE_LENGTH_ORDER = [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

// The 120 short distance codes: each an (x, y) offset back from the current pixel.
// prettier-ignore
const PLANE = [
  0, 1, 1, 0, 1, 1, -1, 1, 0, 2, 2, 0, 1, 2, -1, 2,
  2, 1, -2, 1, 2, 2, -2, 2, 0, 3, 3, 0, 1, 3, -1, 3,
  3, 1, -3, 1, 2, 3, -2, 3, 3, 2, -3, 2, 0, 4, 4, 0,
  1, 4, -1, 4, 4, 1, -4, 1, 3, 3, -3, 3, 2, 4, -2, 4,
  4, 2, -4, 2, 0, 5, 3, 4, -3, 4, 4, 3, -4, 3, 5, 0,
  1, 5, -1, 5, 5, 1, -5, 1, 2, 5, -2, 5, 5, 2, -5, 2,
  4, 4, -4, 4, 3, 5, -3, 5, 5, 3, -5, 3, 0, 6, 6, 0,
  1, 6, -1, 6, 6, 1, -6, 1, 2, 6, -2, 6, 6, 2, -6, 2,
  4, 5, -4, 5, 5, 4, -5, 4, 3, 6, -3, 6, 6, 3, -6, 3,
  0, 7, 7, 0, 1, 7, -1, 7, 5, 5, -5, 5, 7, 1, -7, 1,
  4, 6, -4, 6, 6, 4, -6, 4, 2, 7, -2, 7, 7, 2, -7, 2,
  3, 7, -3, 7, 7, 3, -7, 3, 5, 6, -5, 6, 6, 5, -6, 5,
  8, 0, 4, 7, -4, 7, 7, 4, -7, 4, 8, 1, 8, 2, 6, 6,
  -6, 6, 8, 3, 5, 7, -5, 7, 7, 5, -7, 5, 8, 4, 6, 7,
  -6, 7, 7, 6, -7, 6, 8, 5, 7, 7, -7, 7, 8, 6, 8, 7,
]

/** The bitstream, read least significant bit first. */
class Bits {
  constructor(data, start) {
    this.data = data
    this.pos = start
    this.acc = 0
    this.n = 0
  }
  fill(count) {
    while (this.n < count) {
      this.acc |= (this.pos < this.data.length ? this.data[this.pos] : 0) << this.n
      this.pos++
      this.n += 8
    }
  }
  read(count) {
    if (count === 0) return 0
    this.fill(count)
    const v = this.acc & ((1 << count) - 1)
    this.acc >>>= count
    this.n -= count
    return v
  }
  peek8() {
    this.fill(8)
    return this.acc & 0xff
  }
  skip(count) {
    this.acc >>>= count
    this.n -= count
  }
}

function reverse(code, length) {
  let r = 0
  for (let i = 0; i < length; i++) r = (r << 1) | ((code >> i) & 1)
  return r
}

/** A canonical prefix code from its code lengths, with a table for codes of up to 8 bits. */
function buildCode(lengths) {
  const counts = new Uint16Array(16)
  let count = 0
  let only = 0
  for (let s = 0; s < lengths.length; s++) {
    const l = lengths[s]
    if (l) {
      counts[l]++
      count++
      only = s
    }
  }
  // A code of one symbol takes no bits.
  if (count <= 1) return { single: count ? only : 0 }
  const at = new Uint16Array(17)
  for (let l = 1; l < 16; l++) at[l + 1] = at[l] + counts[l]
  const symbols = new Uint16Array(count)
  for (let s = 0; s < lengths.length; s++) if (lengths[s]) symbols[at[lengths[s]]++] = s
  const fast = new Int32Array(256).fill(-1)
  let code = 0
  let k = 0
  for (let l = 1; l < 16; l++) {
    for (let j = 0; j < counts[l]; j++, k++, code++) {
      if (l <= 8) for (let f = reverse(code, l); f < 256; f += 1 << l) fast[f] = (symbols[k] << 4) | l
    }
    code <<= 1
  }
  return { counts, symbols, fast }
}

function readSymbol(br, code) {
  if (code.single !== undefined) return code.single
  const hit = code.fast[br.peek8()]
  if (hit >= 0) {
    br.skip(hit & 15)
    return hit >> 4
  }
  // A longer code, a bit at a time.
  let c = 0
  let first = 0
  let index = 0
  for (let len = 1; len < 16; len++) {
    c |= br.read(1)
    const n = code.counts[len]
    if (c - n < first) return code.symbols[index + (c - first)]
    index += n
    first = (first + n) << 1
    c <<= 1
  }
  throw new Error('Invalid prefix code in the WebP data')
}

function readCode(br, alphabet) {
  const lengths = new Uint8Array(alphabet)
  if (br.read(1)) {
    // A simple code: one or two symbols given outright.
    const two = br.read(1)
    const s0 = br.read(br.read(1) ? 8 : 1)
    if (s0 >= alphabet) throw new Error('Invalid symbol in the WebP data')
    lengths[s0] = 1
    if (two) {
      const s1 = br.read(8)
      if (s1 >= alphabet) throw new Error('Invalid symbol in the WebP data')
      lengths[s1] = 1
    }
    return buildCode(lengths)
  }
  const codeLengths = new Uint8Array(19)
  const n = br.read(4) + 4
  for (let i = 0; i < n; i++) codeLengths[CODE_LENGTH_ORDER[i]] = br.read(3)
  const lengthCode = buildCode(codeLengths)
  let max = alphabet
  if (br.read(1)) {
    max = 2 + br.read(2 + 2 * br.read(3))
    if (max > alphabet) throw new Error('Invalid code lengths in the WebP data')
  }
  let s = 0
  let prev = 8
  while (s < alphabet) {
    if (max-- === 0) break
    const c = readSymbol(br, lengthCode)
    if (c < 16) {
      lengths[s++] = c
      if (c) prev = c
    } else {
      let repeat = br.read([2, 3, 7][c - 16]) + [3, 3, 11][c - 16]
      if (s + repeat > alphabet) throw new Error('Invalid code lengths in the WebP data')
      const v = c === 16 ? prev : 0
      while (repeat-- > 0) lengths[s++] = v
    }
  }
  return buildCode(lengths)
}

function prefixValue(br, prefix) {
  if (prefix < 4) return prefix + 1
  const extra = (prefix - 2) >> 1
  return ((2 + (prefix & 1)) << extra) + br.read(extra) + 1
}

const sub = (size, bits) => (size + (1 << bits) - 1) >> bits

/** Adds two pixels channel by channel, each modulo 256. */
function add(a, b) {
  const ag = (((a >>> 8) & 0xff00ff) + ((b >>> 8) & 0xff00ff)) & 0xff00ff
  const rb = ((a & 0xff00ff) + (b & 0xff00ff)) & 0xff00ff
  return ((ag << 8) | rb) >>> 0
}

const avg = (a, b) => ((((a ^ b) & 0xfefefefe) >>> 1) + ((a & b) >>> 0)) >>> 0

const ch = (p, s) => (p >>> s) & 0xff
const clamp = v => (v < 0 ? 0 : v > 255 ? 255 : v)

function select(L, T, TL) {
  let pL = 0
  let pT = 0
  for (const s of [24, 16, 8, 0]) {
    pL += Math.abs(ch(T, s) - ch(TL, s))
    pT += Math.abs(ch(L, s) - ch(TL, s))
  }
  return pL < pT ? L : T
}

function addSubtractFull(a, b, c) {
  let out = 0
  for (const s of [24, 16, 8, 0]) out |= clamp(ch(a, s) + ch(b, s) - ch(c, s)) << s
  return out >>> 0
}

function addSubtractHalf(a, b) {
  let out = 0
  for (const s of [24, 16, 8, 0]) {
    const x = ch(a, s)
    out |= clamp(x + Math.trunc((x - ch(b, s)) / 2)) << s
  }
  return out >>> 0
}

function predictor(mode, L, T, TL, TR) {
  switch (mode) {
    case 0:
      return 0xff000000
    case 1:
      return L
    case 2:
      return T
    case 3:
      return TR
    case 4:
      return TL
    case 5:
      return avg(avg(L, TR), T)
    case 6:
      return avg(L, TL)
    case 7:
      return avg(L, T)
    case 8:
      return avg(TL, T)
    case 9:
      return avg(T, TR)
    case 10:
      return avg(avg(L, TL), avg(T, TR))
    case 11:
      return select(L, T, TL)
    case 12:
      return addSubtractFull(L, T, TL)
    case 13:
      return addSubtractHalf(avg(L, T), TL)
    default:
      return 0xff000000
  }
}

/** One image of the stream: the main one (level 0, with transforms and meta codes) or a sub-image. */
function decodeImage(br, width, height, level0) {
  const transforms = []
  let xsize = width
  if (level0) {
    while (br.read(1)) {
      const type = br.read(2)
      if (type === 0 || type === 1) {
        const bits = br.read(3) + 2
        const data = decodeImage(br, sub(xsize, bits), sub(height, bits), false).pixels
        transforms.push({ type, bits, data, xsize })
      } else if (type === 2) {
        transforms.push({ type, xsize })
      } else {
        const size = br.read(8) + 1
        const table = decodeImage(br, size, 1, false).pixels
        for (let i = 1; i < size; i++) table[i] = add(table[i], table[i - 1])
        const widthBits = size <= 2 ? 3 : size <= 4 ? 2 : size <= 16 ? 1 : 0
        transforms.push({ type, table, widthBits, xsize })
        xsize = sub(xsize, widthBits)
      }
    }
  }
  let cacheBits = 0
  if (br.read(1)) {
    cacheBits = br.read(4)
    if (cacheBits < 1 || cacheBits > 11) throw new Error('Invalid colour cache in the WebP data')
  }
  let groupBits = 0
  let groupWidth = 0
  let groupImage = null
  let groupCount = 1
  if (level0 && br.read(1)) {
    groupBits = br.read(3) + 2
    groupWidth = sub(xsize, groupBits)
    const meta = decodeImage(br, groupWidth, sub(height, groupBits), false).pixels
    groupImage = new Uint32Array(meta.length)
    for (let i = 0; i < meta.length; i++) {
      groupImage[i] = (meta[i] >> 8) & 0xffff
      if (groupImage[i] + 1 > groupCount) groupCount = groupImage[i] + 1
    }
  }
  const cacheSize = cacheBits ? 1 << cacheBits : 0
  const groups = []
  for (let g = 0; g < groupCount; g++) groups.push([readCode(br, 280 + cacheSize), readCode(br, 256), readCode(br, 256), readCode(br, 256), readCode(br, 40)])

  const total = xsize * height
  const pixels = new Uint32Array(total)
  const cache = cacheBits ? new Uint32Array(cacheSize) : null
  const shift = 32 - cacheBits
  const mask = groupImage ? (1 << groupBits) - 1 : -1
  let cached = 0
  let i = 0
  let x = 0
  let y = 0
  let codes = groups[0]
  while (i < total) {
    if (groupImage && (x & mask) === 0) codes = groups[groupImage[(y >> groupBits) * groupWidth + (x >> groupBits)]]
    const s = readSymbol(br, codes[0])
    if (s < 256) {
      const r = readSymbol(br, codes[1])
      const b = readSymbol(br, codes[2])
      const a = readSymbol(br, codes[3])
      pixels[i++] = ((a << 24) | (r << 16) | (s << 8) | b) >>> 0
      if (++x === xsize) {
        x = 0
        y++
      }
    } else if (s < 280) {
      const length = prefixValue(br, s - 256)
      const code = prefixValue(br, readSymbol(br, codes[4]))
      let dist = code - 120
      if (code <= 120) {
        dist = PLANE[2 * (code - 1)] + PLANE[2 * (code - 1) + 1] * xsize
        if (dist < 1) dist = 1
      }
      if (dist > i || i + length > total) throw new Error('Invalid back-reference in the WebP data')
      for (let k = 0; k < length; k++, i++) pixels[i] = pixels[i - dist]
      x += length
      while (x >= xsize) {
        x -= xsize
        y++
      }
      if (groupImage && i < total) codes = groups[groupImage[(y >> groupBits) * groupWidth + (x >> groupBits)]]
    } else {
      if (!cache) throw new Error('Invalid colour cache use in the WebP data')
      // Every pixel so far goes into the cache before a lookup.
      while (cached < i) {
        const p = pixels[cached++]
        cache[Math.imul(0x1e35a7bd, p) >>> shift] = p
      }
      pixels[i++] = cache[s - 280]
      if (++x === xsize) {
        x = 0
        y++
      }
    }
  }
  return { pixels, transforms, xsize }
}

function undoPredictor(img, t, height) {
  const w = t.xsize
  const bw = sub(w, t.bits)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      let p
      if (y === 0) p = x === 0 ? 0xff000000 : img[i - 1]
      else if (x === 0) p = img[i - w]
      // The top-right of the last column is the first pixel of this row, as the pixels lie in memory.
      else p = predictor((t.data[(y >> t.bits) * bw + (x >> t.bits)] >> 8) & 15, img[i - 1], img[i - w], img[i - w - 1], img[i - w + 1])
      img[i] = add(img[i], p)
    }
  }
}

function undoColour(img, t, height) {
  const w = t.xsize
  const bw = sub(w, t.bits)
  const int8 = v => (v << 24) >> 24
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const e = t.data[(y >> t.bits) * bw + (x >> t.bits)]
      const argb = img[i]
      const green = int8((argb >> 8) & 0xff)
      let red = (argb >> 16) & 0xff
      let blue = argb & 0xff
      red = (red + ((int8(e & 0xff) * green) >> 5)) & 0xff
      blue = (blue + ((int8((e >> 8) & 0xff) * green) >> 5) + ((int8((e >> 16) & 0xff) * int8(red)) >> 5)) & 0xff
      img[i] = ((argb & 0xff00ff00) | (red << 16) | blue) >>> 0
    }
  }
}

function undoSubtractGreen(img) {
  for (let i = 0; i < img.length; i++) {
    const p = img[i]
    const g = (p >> 8) & 0xff
    img[i] = ((p & 0xff00ff00) | ((((p >> 16) & 0xff) + g) & 0xff) << 16 | (((p & 0xff) + g) & 0xff)) >>> 0
  }
}

function undoIndexing(img, t, height) {
  const w = t.xsize
  const packed = sub(w, t.widthBits)
  const per = 8 >> t.widthBits
  const mask = (1 << per) - 1
  const lane = (1 << t.widthBits) - 1
  const out = new Uint32Array(w * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < w; x++) {
      const v = img[y * packed + (x >> t.widthBits)]
      const idx = ((v >> 8) >> ((x & lane) * per)) & mask
      out[y * w + x] = idx < t.table.length ? t.table[idx] : 0
    }
  }
  return out
}

export function decodeLosslessWebp(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const tag = (at) => String.fromCharCode(data[at], data[at + 1], data[at + 2], data[at + 3])
  if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP') throw new Error('Not a WebP file')
  let at = 12
  let start = -1
  while (at + 8 <= data.length) {
    const id = tag(at)
    const size = data[at + 4] | (data[at + 5] << 8) | (data[at + 6] << 16) | (data[at + 7] << 24)
    if (id === 'VP8L') {
      start = at + 8
      break
    }
    if (id === 'VP8 ') throw new Error('Lossy WebP is not supported')
    at += 8 + size + (size & 1)
  }
  if (start < 0) throw new Error('No lossless image data in this WebP file')
  const br = new Bits(data, start)
  if (br.read(8) !== 0x2f) throw new Error('Not a lossless WebP image')
  const width = br.read(14) + 1
  const height = br.read(14) + 1
  br.read(1)
  if (br.read(3) !== 0) throw new Error('Unknown lossless WebP version')
  const main = decodeImage(br, width, height, true)
  let img = main.pixels
  for (let t = main.transforms.length - 1; t >= 0; t--) {
    const tr = main.transforms[t]
    if (tr.type === 0) undoPredictor(img, tr, height)
    else if (tr.type === 1) undoColour(img, tr, height)
    else if (tr.type === 2) undoSubtractGreen(img)
    else img = undoIndexing(img, tr, height)
  }
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const p = img[i]
    rgba[i * 4] = (p >> 16) & 0xff
    rgba[i * 4 + 1] = (p >> 8) & 0xff
    rgba[i * 4 + 2] = p & 0xff
    rgba[i * 4 + 3] = p >>> 24
  }
  return { width, height, rgba }
}
