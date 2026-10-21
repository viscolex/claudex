import { expect, test } from 'claude-code/testing'
import { shrink } from '../scripts/pixels.mjs'
import { decodeLosslessWebp } from '../scripts/webp-lossless.mjs'

// Small lossless WebP images of our own patterns, made with sharp, and an FNV-1a hash of the pixels sharp
// decodes from them: a gradient (predictors, colour transform), three colours (a palette, pixels packed),
// shapes on transparency (back-references, the colour cache) and noise.
const FIXTURES: { kind: string; width: number; height: number; webp: string; hash: number }[] = [
  {
    "kind": "gradient",
    "width": 37,
    "height": 23,
    "webp": "UklGRpAAAABXRUJQVlA4TIQAAAAvJIAFELmM6H/sIqL/YWDjto0k98n/H7yHxthqS1tIkEKaXmBg+s2mbUPxamrIFVE+T61stZfp/UbgmzYDoiGUIZoFf0o0RPUD/DR+8oJQx08eEMr4yQui8ZMXROMnj7jfSbZERrIl0p6TLVH1fvKCd+InD/ydqFnk7+Qg+maiix8w0QA=",
    "hash": 996024145
  },
  {
    "kind": "palette",
    "width": 19,
    "height": 11,
    "webp": "UklGRi4AAABXRUJQVlA4TCIAAAAvEoACEBcQ8y8gKPJ/tPkP+IAw20hj36GdzORPIKL/0cgH",
    "hash": 948450951
  },
  {
    "kind": "sprite",
    "width": 64,
    "height": 48,
    "webp": "UklGRnYAAABXRUJQVlA4TGkAAAAvP8ALEBcgEEhxJDMtEEhxEDMtEEgCG3vA+Q+o/sAoktxG+3JCZTxCIRwC4ETzogKAiP6TTdqQMZlKr4A5TKeyUOMhjfdo766fnT4cnfrhhD7clekThCPeLvoE4Yi3izoJuFu8n+oTaAEA",
    "hash": 2738986953
  },
  {
    "kind": "noise",
    "width": 20,
    "height": 20,
    "webp": "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",
    "hash": 290365443
  }
]

const bytes = (base64: string) => Uint8Array.from(atob(base64), c => c.charCodeAt(0))
const fnv = (data: Uint8Array) => {
  let h = 0x811c9dc5
  for (let i = 0; i < data.length; i++) h = Math.imul(h ^ (data[i] as number), 0x01000193) >>> 0
  return h
}

test('the built-in decoder reads lossless WebP exactly as sharp does', () => {
  for (const f of FIXTURES) {
    const image = decodeLosslessWebp(bytes(f.webp))
    expect([f.kind, image.width, image.height, fnv(image.rgba)]).toEqual([f.kind, f.width, f.height, f.hash])
  }
})

test('lossy WebP says so instead of drawing garbage', () => {
  const lossy = new Uint8Array(36)
  lossy.set([...'RIFF'].map(c => c.charCodeAt(0)), 0)
  lossy.set([...'WEBPVP8 '].map(c => c.charCodeAt(0)), 8)
  expect(() => decodeLosslessWebp(lossy)).toThrow(/Lossy WebP is not supported/)
})

test('frames shrink by area, and transparent edges never darken the colour', () => {
  // A 4×4 of opaque red on the left half, transparent on the right, shrunk to 2×2.
  const src = new Uint8Array(4 * 4 * 4)
  for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) src.set([255, 0, 0, 255], (y * 4 + x) * 4)
  const small = shrink(src, 4, { x: 0, y: 0, w: 4, h: 4 }, 2, 2)
  expect(Array.from(small.subarray(0, 8))).toEqual([255, 0, 0, 255, 0, 0, 0, 0])
  // Shrunk to 1×1: half covered, still pure red at half opacity.
  expect(Array.from(shrink(src, 4, { x: 0, y: 0, w: 4, h: 4 }, 1, 1))).toEqual([255, 0, 0, 128])
})
