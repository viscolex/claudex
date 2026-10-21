// Gives a Codex task its own git worktree: a copy of the repository at HEAD
// with the user's uncommitted changes (tracked and new files) carried over and
// committed as the task's base, so the task's diff is Codex's work alone.
// Then the main checkout's installed dependencies are linked in (see linkDeps)
// and the project's own checks are listed, so Codex can verify its work.
// Prints one JSON line.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { flags, git, home, linkDeps, print, unlinkDeps } from './lib.mjs'

/** The project's own checks, as commands Codex can run: package.json scripts first, then other toolchains'. */
function checksOf(repo) {
  const checks = []
  try {
    const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'))
    const runner = existsSync(join(repo, 'pnpm-lock.yaml')) ? 'pnpm' : existsSync(join(repo, 'yarn.lock')) ? 'yarn' : existsSync(join(repo, 'bun.lockb')) || existsSync(join(repo, 'bun.lock')) ? 'bun' : 'npm'
    for (const name of Object.keys(pkg.scripts ?? {})) {
      if (!/^(test|tests|lint|typecheck|type-check|check|tsc|test:[\w-]+|lint:[\w-]+)$/.test(name)) continue
      checks.push(runner === 'npm' && name === 'test' ? 'npm test' : runner === 'yarn' ? `yarn ${name}` : `${runner} run ${name}`)
    }
  } catch {}
  if (existsSync(join(repo, 'Cargo.toml'))) checks.push('cargo test --offline')
  if (existsSync(join(repo, 'go.mod'))) checks.push('go test ./...')
  if (existsSync(join(repo, 'pyproject.toml')) || existsSync(join(repo, 'pytest.ini'))) checks.push('pytest')
  return checks.slice(0, 12)
}

const { repo, id } = flags()
try {
  if (!repo || !id) throw new Error('usage: node task.mjs -Repo <repo> -Id <id>')
  // Not under the app's own data folders: Windows redirects a Store app's
  // writes there, so other programs would not find the worktree at its path.
  const base = join(home, '.claude', 'claudex')
  const worktree = join(base, 'worktrees', id)
  const patches = join(base, 'patches')
  mkdirSync(patches, { recursive: true })
  if (existsSync(worktree)) {
    unlinkDeps(worktree)
    rmSync(worktree, { recursive: true, force: true })
  }

  git(['-C', repo, 'worktree', 'add', '--detach', worktree, 'HEAD'])

  // Tracked changes, as a binary patch git writes itself.
  const carry = join(patches, `${id}.carry.patch`)
  git(['-C', repo, 'diff', 'HEAD', '--binary', `--output=${carry}`])
  if (statSync(carry).size > 0) git(['-C', worktree, 'apply', '--whitespace=nowarn', carry])
  rmSync(carry, { force: true })

  // New files that are not ignored, up to 5 MB each.
  const untracked = git(['-C', repo, 'ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)
  let copied = 0
  for (const rel of untracked) {
    const from = join(repo, rel)
    try {
      const stat = statSync(from)
      if (!stat.isFile() || stat.size > 5 * 1024 * 1024) continue
    } catch {
      continue
    }
    const to = join(worktree, rel)
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(from, to)
    copied++
  }

  git(['-C', worktree, 'add', '-A'])
  git(['-C', worktree, '-c', 'user.name=Codex task', '-c', 'user.email=codex-task@localhost', 'commit', '-q', '--no-verify', '--allow-empty', '-m', 'Codex task base'])
  const head = git(['-C', worktree, 'rev-parse', 'HEAD']).trim().split(/\r?\n/).pop()

  // After the base commit, and only what git ignores: the links never reach the task's diff.
  const linked = linkDeps(repo, worktree)
  print({ ok: true, worktree, base: head, patch: join(patches, `${id}.patch`), carried: copied, linked, checks: checksOf(repo) })
} catch (err) {
  print({ ok: false, error: err instanceof Error ? err.message : String(err) })
}
