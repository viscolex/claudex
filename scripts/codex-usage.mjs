// Prints the Codex plan's usage as Codex last reported it: the rate-limit
// windows, credits and plan from the newest session log that carries them
// (~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl). Logs run to megabytes, so
// only their last part is read. One JSON line; {} when there is no reading.
import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { home, print } from './lib.mjs'

const root = join(home, '.codex', 'sessions')
const dirs = (p) => {
  try {
    return readdirSync(p, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => join(p, d.name))
  } catch {
    return []
  }
}

/** The last few megabytes of a file, as text. */
function tail(path, bytes = 4 * 1024 * 1024) {
  const size = statSync(path).size
  const start = Math.max(0, size - bytes)
  const buffer = Buffer.alloc(size - start)
  const fd = openSync(path, 'r')
  try {
    readSync(fd, buffer, 0, buffer.length, start)
  } finally {
    closeSync(fd)
  }
  return buffer.toString('utf8')
}

if (!existsSync(root)) {
  print({})
  process.exit(0)
}
// The three newest days, then their eight newest logs.
const days = dirs(root).flatMap(dirs).flatMap(dirs).sort().reverse().slice(0, 3)
const files = days
  .flatMap(day => {
    try {
      return readdirSync(day).filter(f => /^rollout-.*\.jsonl$/.test(f)).map(f => join(day, f))
    } catch {
      return []
    }
  })
  .map(path => ({ path, at: statSync(path).mtimeMs }))
  .sort((a, b) => b.at - a.at)
  .slice(0, 8)

for (const file of files) {
  const line = tail(file.path)
    .split(/\r?\n/)
    .filter(l => l.includes('"rate_limits":{'))
    .pop()
  if (!line) continue
  try {
    const event = JSON.parse(line)
    const limits = event.payload?.rate_limits ?? {}
    print({ at: event.timestamp, plan: limits.plan_type, primary: limits.primary, secondary: limits.secondary, credits: limits.credits, reached: limits.rate_limit_reached_type })
    process.exit(0)
  } catch {}
}
print({})
