// Shared by the mod's Node helpers: which system this is, where things live,
// running commands, and the one JSON line each helper prints. The helpers run
// the same on Windows and macOS; where the systems differ, each takes its own
// built-in tools.
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, symlinkSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const windows = process.platform === 'win32'
export const mac = process.platform === 'darwin'
export const home = process.env.USERPROFILE || process.env.HOME || homedir()

/** The helper's flags, as the mod passes them: -Name value. */
export function flags(argv = process.argv.slice(2)) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const m = /^-{1,2}([A-Za-z]+)$/.exec(argv[i])
    if (!m) continue
    out[m[1].toLowerCase()] = argv[i + 1] ?? ''
    i++
  }
  return out
}

/** The one JSON line a helper prints. */
export function print(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

/** Runs a command: its exit code, its output and its error output. */
export function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024, ...options })
  return { code: r.status ?? (r.error ? -1 : 0), out: r.stdout ?? '', err: r.stderr || (r.error ? String(r.error) : '') }
}

/** git, throwing with its last words when it fails (it reports progress on stderr, so the exit code decides). */
export function git(args) {
  const r = run('git', args)
  if (r.code !== 0) throw new Error(`git ${args.join(' ')}: ${(r.err || r.out).trim().split(/\r?\n/).slice(-3).join(' ')}`)
  return r.out
}

/** A PowerShell one-off on Windows: its output. */
export function powershell(command) {
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command]).out
}

/**
 * Where a command is. On a Mac, apps start with a short PATH, so a login
 * shell is asked for the person's own.
 */
export function which(name) {
  if (windows) {
    const r = run('where', [name])
    return r.code === 0 ? r.out.split(/\r?\n/).find(Boolean)?.trim() : undefined
  }
  for (const shell of ['/bin/zsh', '/bin/bash']) {
    if (!existsSync(shell)) continue
    const r = run(shell, ['-lc', `command -v ${name}`])
    const found = r.out.trim().split('\n').pop()
    if (r.code === 0 && found?.startsWith('/')) return found
  }
  return undefined
}

/** The Codex app's own folder of resources (its CLI and its art), when it is installed. */
export function codexApp() {
  if (windows) {
    const at = powershell("(Get-AppxPackage -Name 'OpenAI.Codex*' -ErrorAction SilentlyContinue | Sort-Object Version -Descending | Select-Object -First 1).InstallLocation").trim()
    const resources = at ? join(at, 'app', 'resources') : ''
    return resources && existsSync(resources) ? resources : undefined
  }
  if (mac) {
    for (const app of ['/Applications/Codex.app', join(home, 'Applications', 'Codex.app')]) {
      const resources = join(app, 'Contents', 'Resources')
      if (existsSync(resources)) return resources
    }
  }
  return undefined
}

/** The Codex CLI: the one inside the Codex app (it moves with every update), else one on PATH. */
export function findCodex() {
  const app = codexApp()
  if (app) {
    for (const rel of windows ? [['codex.exe']] : [['codex'], ['bin', 'codex']]) {
      const p = join(app, ...rel)
      if (existsSync(p)) return p
    }
  }
  if (windows) return which('codex.exe') ?? which('codex')
  const found = which('codex')
  if (found) return found
  for (const p of ['/opt/homebrew/bin/codex', '/usr/local/bin/codex', join(home, '.local', 'bin', 'codex')]) {
    if (existsSync(p)) return p
  }
  return undefined
}

/** Opens a file, folder or link the way the system does. */
export function openWithSystem(target) {
  if (windows) return run('explorer.exe', [target])
  return run(mac ? 'open' : 'xdg-open', [target])
}

// ---------------------------------------------------------------------------
// A task's dependencies: linked in from the main checkout, never copied.
//
// A Codex task's worktree has no installed packages. When the repository's own
// are installed and git ignores them, the worktree gets a link to them (a
// junction on Windows, which needs no admin rights; a directory symlink on
// macOS and Linux), so Codex can run the project's tests. `git worktree remove`
// deletes THROUGH such a link, so every removal unlinks them first (unlinkDeps).

/** The folders a task may link in from the main checkout. */
export const DEP_LINKS = ['node_modules']

/** Links the main checkout's installed, git-ignored dependency folders into a worktree: the names linked. */
export function linkDeps(repo, worktree) {
  const linked = []
  for (const name of DEP_LINKS) {
    const from = join(repo, name)
    const to = join(worktree, name)
    try {
      if (!existsSync(from) || existsSync(to)) continue
      // Only what git ignores: a link git tracked would land in the task's diff.
      if (run('git', ['-C', repo, 'check-ignore', '-q', name]).code !== 0) continue
      symlinkSync(from, to, windows ? 'junction' : 'dir')
      // A `node_modules/` rule matches the folder but not a symlink to it (macOS), so git
      // may list the link here: stageTask in the hooks takes it back out of the index before any diff.
      linked.push(name)
    } catch {}
  }
  return linked
}

/** Removes the dependency links from a worktree, leaving what they point at alone: run before any removal.
 *  Fails closed: a link that cannot be removed throws, so the caller never deletes through it. */
export function unlinkDeps(worktree) {
  for (const name of DEP_LINKS) {
    const p = join(worktree, name)
    let stat
    try {
      stat = lstatSync(p)
    } catch (err) {
      if (err?.code === 'ENOENT') continue
      throw new Error(`Could not inspect ${p}, so the worktree was left in place: ${err?.message ?? err}`)
    }
    if (!stat.isSymbolicLink()) continue
    try {
      unlinkSync(p)
    } catch (err) {
      throw new Error(`Could not remove the dependency link ${p}, so the worktree was left in place: ${err?.message ?? err}`)
    }
    if (existsSync(p)) throw new Error(`The dependency link ${p} is still there, so the worktree was left in place.`)
  }
}
