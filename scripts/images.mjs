// Host-side helper for the mod's pictures: finds the Codex CLI, makes
// folders, and turns a finished PNG into the JPEG thumbnails the transcript
// card and the gallery pane draw, and the larger one its viewer draws.
// Thumbnails are made with the system's own tools: System.Drawing on Windows
// (thumb.ps1), sips on a Mac. Prints one JSON line.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findCodex, flags, home, mac, print, run, windows } from './lib.mjs'

const generated = join(home, '.codex', 'generated_images')
const cache = windows
  ? join(process.env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'codex-images')
  : mac
    ? join(home, 'Library', 'Caches', 'codex-images')
    : join(home, '.cache', 'codex-images')

/** Every file under a folder, all the way down. */
function walk(dir) {
  let out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out = out.concat(walk(p))
    else if (entry.isFile()) out.push(p)
  }
  return out
}

/** A picture's size, read by sips. */
function sipsSize(path) {
  const r = run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path])
  return { width: Number(/pixelWidth: (\d+)/.exec(r.out)?.[1] ?? 0), height: Number(/pixelHeight: (\d+)/.exec(r.out)?.[1] ?? 0) }
}

/** The thumbnails of one picture: [{ name, out, max, quality, budget, floor?, shrink? }]. */
function thumbs(input, jobs) {
  if (windows) {
    const script = join(dirname(fileURLToPath(import.meta.url)), 'thumb.ps1')
    const spec = Buffer.from(JSON.stringify(jobs), 'utf8').toString('base64')
    const r = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-In', input, '-Spec', spec])
    const out = JSON.parse(r.out.trim().split(/\r?\n/).pop() || '{}')
    if (out.ok === false) throw new Error(out.error)
    return out
  }
  if (!mac) throw new Error('Picture thumbnails are made with Windows or macOS tools')
  const size = sipsSize(input)
  const result = { ok: true, ...size }
  for (const job of jobs) {
    mkdirSync(dirname(job.out), { recursive: true })
    let max = job.max
    for (;;) {
      let quality = job.quality
      let bytes
      do {
        const args = ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality)]
        if (Math.max(size.width, size.height) > max) args.push('-Z', String(max))
        run('sips', [...args, input, '--out', job.out])
        bytes = statSync(job.out).size
        quality -= 8
      } while (bytes > job.budget && quality >= (job.floor ?? 36))
      result[job.name] = { path: job.out, ...sipsSize(job.out), bytes }
      if (!job.shrink || bytes <= job.budget || max * 0.85 < 480) break
      max = Math.floor(max * 0.85)
    }
  }
  return result
}

const { mode, path, id, since, thread, from } = flags()
try {
  if (mode === 'find') {
    print({ codex: findCodex() ?? null, generated, cache })
  } else if (mode === 'mkdir') {
    mkdirSync(path, { recursive: true })
    print({ ok: true })
  } else if (mode === 'finish') {
    let adopted = null
    // Where Codex said it saved the picture (its image item's savedPath): taken as it is.
    if (!existsSync(path) && from && existsSync(from)) {
      mkdirSync(dirname(path), { recursive: true })
      copyFileSync(from, path)
      adopted = from
    }
    if (!existsSync(path) && thread) {
      // Codex answered without saying or copying the file: take the newest image this job's own thread
      // wrote in Codex's store (generated_images/<thread>/). Never another run's: without the thread, nothing.
      const root = join(generated, thread)
      const after = Number(since) || 0
      if (after > 0 && existsSync(root)) {
        const found = walk(root)
          .filter(p => p.toLowerCase().endsWith('.png'))
          .map(p => ({ p, at: statSync(p).mtimeMs }))
          .filter(x => x.at >= after)
          .sort((a, b) => b.at - a.at)[0]
        if (found) {
          mkdirSync(dirname(path), { recursive: true })
          copyFileSync(found.p, path)
          adopted = found.p
        }
      }
    }
    if (!existsSync(path)) throw new Error('Codex finished without saving an image.')
    const made = thumbs(path, [
      { name: 'sm', out: join(cache, 'thumbs', `${id}-sm.jpg`), max: 240, quality: 76, budget: 16000 },
      { name: 'lg', out: join(cache, 'thumbs', `${id}-lg.jpg`), max: 560, quality: 82, budget: 64000 },
    ])
    print({ ok: true, width: made.width, height: made.height, bytes: statSync(path).size, adopted, sm: made.sm, lg: made.lg })
  } else if (mode === 'view') {
    // The viewer's picture is drawn inside an Svg of at most 131072 characters,
    // so its JPEG stays under 94000 bytes: quality steps down to 62, then the
    // size shrinks, so it gets smaller before it gets blocky.
    if (!existsSync(path)) throw new Error('The image file is gone.')
    const made = thumbs(path, [{ name: 'xl', out: join(cache, 'thumbs', `${id}-xl.jpg`), max: 1600, quality: 86, budget: 94000, floor: 62, shrink: true }])
    print({ ok: true, xl: made.xl })
  } else {
    throw new Error(`Unknown mode: ${mode}`)
  }
} catch (err) {
  print({ ok: false, error: err instanceof Error ? err.message : String(err) })
}
