// Checks in on one Codex run that has gone quiet: is its process still there,
// is it doing anything, and when did it last write to its session log?
// The run's process is the bridge the mod names (-Pid, with Codex's app server
// and whatever that runs under it), or for a picture the codex whose command
// line names this mod's schemas folder and that started nearest the run's
// start (or, resumed, names its thread). Prints one JSON line.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { flags, home, powershell, print, run, windows } from './lib.mjs'

const { root = '', started = '0', thread = '', pid = '' } = flags()
const schemas = join(root, 'schemas')
const sleep = ms => new Promise(done => setTimeout(done, ms))

/** Every codex process: id, parent, start (ms) and command line. */
function processes() {
  if (windows) {
    const listed = powershell(
      "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'codex.exe' -or $_.ParentProcessId -ne $null } | ForEach-Object { [pscustomobject]@{ id = $_.ProcessId; parent = $_.ParentProcessId; name = $_.Name; start = if ($_.CreationDate) { [DateTimeOffset]::new($_.CreationDate).ToUnixTimeMilliseconds() } else { 0 }; command = $_.CommandLine } } | ConvertTo-Json -Compress",
    )
    const rows = JSON.parse(listed || '[]')
    return (Array.isArray(rows) ? rows : [rows]).map(r => ({ id: r.id, parent: r.parent, start: r.start, command: r.command ?? '', codex: r.name === 'codex.exe' }))
  }
  const r = run('ps', ['-axo', 'pid=,ppid=,lstart=,command='])
  return r.out
    .split('\n')
    .map(line => /^\s*(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+[\d:]+\s+\d{4})\s+(.*)$/.exec(line))
    .filter(Boolean)
    // The app's codex, or an npm install's platform binary (codex-aarch64-apple-darwin).
    .map(m => ({ id: Number(m[1]), parent: Number(m[2]), start: Date.parse(m[3]), command: m[4], codex: /(^|\/)codex[^/\s]*$/.test(m[4].split(' ')[0] ?? '') }))
}

/** CPU seconds used so far by these processes. */
function cpu(ids) {
  if (!ids.length) return 0
  if (windows) {
    const out = powershell(`(Get-Process -Id ${ids.join(',')} -ErrorAction SilentlyContinue | ForEach-Object { $_.TotalProcessorTime.TotalSeconds } | Measure-Object -Sum).Sum`)
    return Number(out.trim()) || 0
  }
  const r = run('ps', ['-o', 'time=', '-p', ids.join(',')])
  // [[dd-]hh:]mm:ss(.ss)
  return r.out
    .split('\n')
    .map(t => t.trim())
    .filter(Boolean)
    .reduce((sum, t) => {
      const [days, rest] = t.includes('-') ? t.split('-') : ['0', t]
      const parts = rest.split(':').map(Number)
      const secs = parts.reduce((acc, n) => acc * 60 + n, 0)
      return sum + Number(days) * 86400 + secs
    }, 0)
}

/** When Codex last wrote to its own session log for this thread, in seconds. */
function logAge() {
  if (!thread) return null
  const sessions = join(home, '.codex', 'sessions')
  if (!existsSync(sessions)) return null
  const dirs = p => {
    try {
      return readdirSync(p, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => join(p, d.name))
    } catch {
      return []
    }
  }
  // Recent days first: logs are filed by the day they began.
  const days = dirs(sessions).flatMap(dirs).flatMap(dirs).sort().reverse().slice(0, 7)
  for (const day of days) {
    const name = readdirSync(day).find(f => f.includes(thread) && f.endsWith('.jsonl'))
    if (name) return Math.round((Date.now() - statSync(join(day, name)).mtimeMs) / 1000)
  }
  return null
}

try {
  const all = processes()
  let mine = pid ? all.find(p => p.id === Number(pid)) : undefined
  if (!pid) {
    const runs = all.filter(p => p.codex && p.command.includes(schemas) && /\bexec\b/.test(p.command))
    mine = thread ? runs.find(p => p.command.includes(thread)) : undefined
    if (!mine && runs.length) {
      const at = Number(started)
      mine = [...runs].sort((a, b) => Math.abs(a.start - at) - Math.abs(b.start - at))[0]
      if (mine && Math.abs(mine.start - at) > 180_000) mine = undefined
    }
  }
  // How busy it is: CPU time of the run and everything under it (a bridge's Codex, and Codex's commands), over three seconds.
  let busy = 0
  if (mine) {
    const ids = [mine.id]
    for (let i = 0; i < ids.length && ids.length < 64; i++) for (const p of all) if (p.parent === ids[i] && !ids.includes(p.id)) ids.push(p.id)
    const before = cpu(ids)
    await sleep(3000)
    busy = Math.round((cpu(ids) - before) * 1000) / 1000
  }
  print({ ok: true, found: Boolean(mine), pid: mine?.id ?? null, busy, logAge: logAge() })
} catch (err) {
  print({ ok: false, error: err instanceof Error ? err.message : String(err) })
}
