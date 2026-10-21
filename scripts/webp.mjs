// Writes a WebP copy of a picture for the web, using the project's own sharp.
// Prints one JSON line.
//
//   node webp.mjs <in> <out.webp> <project dir> [max side] [quality]
import { createRequire } from 'node:module'
import { statSync } from 'node:fs'
import { join } from 'node:path'

const [input, output, project, maxSide = '1600', quality = '82'] = process.argv.slice(2)

function loadSharp() {
  for (const from of [project, process.cwd()].filter(Boolean)) {
    try {
      return createRequire(join(from, 'package.json'))('sharp')
    } catch {}
  }
  throw new Error('WebP export needs sharp in this project (npm install sharp)')
}

try {
  if (!input || !output) throw new Error('usage: node webp.mjs <in> <out.webp> <project dir> [max side] [quality]')
  const sharp = loadSharp()
  const max = Number(maxSide)
  const info = await sharp(input)
    .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: Number(quality), alphaQuality: 90, effort: 5 })
    .toFile(output)
  console.log(JSON.stringify({ ok: true, path: output, width: info.width, height: info.height, bytes: statSync(output).size }))
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }))
}
