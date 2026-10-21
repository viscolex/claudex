// Lists or removes the worktrees Codex tasks ran in. Only folders under the
// mod's own worktrees folder are touched; the task patches stay. Prints one
// JSON line.
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { flags, home, print, run, unlinkDeps, windows } from './lib.mjs'

const root = join(home, '.claude', 'claudex', 'worktrees')
/** Where the Codex mod Claudex replaces kept its tasks: carried-over tasks still live there. */
const older = join(home, '.claude', 'codex-mod', 'worktrees')
const { mode = 'list', path = '' } = flags()

/** A folder's size, all the way down. */
function size(dir) {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    try {
      if (entry.isDirectory()) total += size(p)
      else if (entry.isFile()) total += statSync(p).size
    } catch {}
  }
  return total
}

try {
  if (mode === 'list') {
    const dirs = []
    for (const [dir, legacy] of [[root, false], [older, true]]) {
      if (!existsSync(dir)) continue
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const full = join(dir, entry.name)
        const stat = statSync(full)
        dirs.push({ name: entry.name, path: full, ageHours: Math.round(((Date.now() - (stat.birthtimeMs || stat.ctimeMs)) / 3_600_000) * 10) / 10, bytes: size(full), ...(legacy ? { legacy: true } : {}) })
      }
    }
    print({ ok: true, dirs })
    process.exit(0)
  }

  const full = resolve(path)
  const same = (a, b) => (windows ? a.toLowerCase() === b.toLowerCase() : a === b)
  const within = dir => same(full.slice(0, (resolve(dir) + sep).length), resolve(dir) + sep)
  if (!within(root) && !within(older)) throw new Error(`Not a Codex task worktree: ${path}`)
  if (!existsSync(full)) {
    print({ ok: true, removed: false })
    process.exit(0)
  }

  // The dependency links go first: `git worktree remove` would delete through them into the main checkout.
  unlinkDeps(full)
  // Let git forget the worktree, then make sure the folder is gone.
  const common = run('git', ['-C', full, 'rev-parse', '--path-format=absolute', '--git-common-dir'])
  if (common.code === 0 && common.out.trim()) {
    const repo = dirname(common.out.trim())
    run('git', ['-C', repo, 'worktree', 'remove', '--force', full])
    if (existsSync(full)) rmSync(full, { recursive: true, force: true })
    run('git', ['-C', repo, 'worktree', 'prune'])
  } else {
    rmSync(full, { recursive: true, force: true })
  }
  print({ ok: true, removed: true })
} catch (err) {
  print({ ok: false, error: err instanceof Error ? err.message : String(err) })
}
