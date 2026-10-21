// Cuts the Codex companion's animations out of the installed Codex app's
// sprite sheet into small strips for the mod's scenes, so they follow the
// app's own art as it updates. Where the app's art cannot be read (a CLI
// installed on its own, an app that moved it), the strips bundled with the
// mod in assets/mascot are used instead.
// Needs nothing but Node: the sheet is lossless WebP, which webp-lossless.mjs
// decodes, and the strips are written as PNG. Prints one JSON line; a cache of
// the same sheet is reused.
//
//   node mascot.mjs <codex.exe> <project dir (unused)> <out dir>
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { shrink } from './pixels.mjs'
import { encodePng } from './png.mjs'
import { decodeLosslessWebp } from './webp-lossless.mjs'

const [codex, , out] = process.argv.slice(2)
const bundled = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'mascot')

/** The strips that ship with the mod, their files at full paths. */
function bundledManifest() {
  const m = JSON.parse(readFileSync(join(bundled, 'manifest.json'), 'utf8'))
  for (const r of Object.values(m.rows)) r.file = join(bundled, r.file)
  return { ...m, bundled: true }
}

// The sheet: 8 columns of 192 × 208 frames, one animation per row.
const CELL = { w: 192, h: 208 }
const ROWS = [
  { name: 'idle', row: 0, frames: 7, fps: 6 },
  { name: 'wave', row: 3, frames: 4, fps: 6 },
  { name: 'jump', row: 4, frames: 5, fps: 8 },
  { name: 'dizzy', row: 5, frames: 8, fps: 6 },
  { name: 'think', row: 6, frames: 6, fps: 5 },
  { name: 'work', row: 7, frames: 6, fps: 7 },
  { name: 'happy', row: 8, frames: 6, fps: 7 },
]
const HEIGHT = 96
/** Bumped when the strips are made differently, so an older cache is cut again. */
const FORMAT = 2

/** One file from an Electron app.asar, by a name pattern. */
function fromAsar(asar, pattern) {
  const fd = openSync(asar, 'r')
  try {
    const head = Buffer.alloc(16)
    readSync(fd, head, 0, 16, 0)
    const headerSize = head.readUInt32LE(4)
    const json = Buffer.alloc(head.readUInt32LE(12))
    readSync(fd, json, 0, json.length, 16)
    const tree = JSON.parse(json.toString('utf8'))
    let hit
    const walk = (node, path) => {
      for (const [name, entry] of Object.entries(node.files ?? {})) {
        const p = path ? `${path}/${name}` : name
        if (entry.files) walk(entry, p)
        else if (!hit && pattern.test(p)) hit = { path: p, size: entry.size, offset: Number(entry.offset) }
      }
    }
    walk(tree, '')
    if (!hit) return undefined
    const data = Buffer.alloc(hit.size)
    readSync(fd, data, 0, hit.size, 8 + headerSize + hit.offset)
    return { name: hit.path.split('/').pop(), data }
  } finally {
    closeSync(fd)
  }
}

try {
  if (!codex || !out) throw new Error('usage: node mascot.mjs <codex.exe> <project dir> <out dir>')
  // The app's resources hold both the CLI and the art (Windows: app\resources;
  // a Mac: Codex.app/Contents/Resources); a CLI installed on its own has no art.
  const asar = [join(dirname(codex), 'app.asar'), join(dirname(dirname(codex)), 'app.asar'), '/Applications/Codex.app/Contents/Resources/app.asar'].find(p => existsSync(p))
  if (!asar) throw new Error('The Codex app (with its companion art) was not found next to the Codex CLI')
  const sheet = fromAsar(asar, /(^|\/)codex-spritesheet[^/]*\.webp$/)
  if (!sheet) throw new Error('No Codex companion sprite sheet in this Codex app')
  const manifestPath = join(out, 'manifest.json')
  if (existsSync(manifestPath)) {
    const cached = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (cached.source === sheet.name && cached.format === FORMAT) {
      console.log(JSON.stringify({ ok: true, cached: true, ...cached }))
      process.exit(0)
    }
  }
  const image = decodeLosslessWebp(sheet.data)
  mkdirSync(out, { recursive: true })
  const frameW = Math.round((CELL.w * HEIGHT) / CELL.h)
  const rows = {}
  for (const r of ROWS) {
    // Frame by frame, so no frame bleeds into the next as it shrinks.
    const strip = new Uint8Array(r.frames * frameW * HEIGHT * 4)
    for (let f = 0; f < r.frames; f++) {
      const frame = shrink(image.rgba, image.width, { x: f * CELL.w, y: r.row * CELL.h, w: CELL.w, h: CELL.h }, frameW, HEIGHT)
      for (let y = 0; y < HEIGHT; y++) strip.set(frame.subarray(y * frameW * 4, (y + 1) * frameW * 4), (y * r.frames * frameW + f * frameW) * 4)
    }
    const png = encodePng(r.frames * frameW, HEIGHT, strip)
    const file = join(out, `codex-${r.name}.png`)
    writeFileSync(file, png)
    rows[r.name] = { file, frames: r.frames, fps: r.fps, bytes: png.length }
  }
  const manifest = { source: sheet.name, format: FORMAT, frameW, frameH: HEIGHT, rows }
  writeFileSync(manifestPath, JSON.stringify(manifest))
  console.log(JSON.stringify({ ok: true, cached: false, ...manifest }))
} catch (err) {
  try {
    console.log(JSON.stringify({ ok: true, cached: true, ...bundledManifest(), why: err instanceof Error ? err.message : String(err) }))
  } catch {
    console.log(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }))
  }
}
