// Reads the Codex plan's live usage the way Codex's own clients do: the
// app-server's account/rateLimits/read request. No model runs, so no quota is
// spent. Prints one JSON line.
//
//   node codex-limits.mjs <path to codex.exe>                  the plan's usage, its free resets among it
//   node codex-limits.mjs <path to codex.exe> -Thread <id>     what one Codex thread has used so far
//                                                              (account/usage/read: credits, and dollars on a dollar plan)
//   node codex-limits.mjs <path to codex.exe> -Reset <key>     uses one free rate-limit reset (only ever when the person
//                                                              confirmed it); the key makes a retry of the same press safe
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

const VERSION = (() => {
  try {
    return String(JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8')).version)
  } catch {
    return '0'
  }
})()

const [codex, ...rest] = process.argv.slice(2)
const flag = name => (rest.includes(name) ? String(rest[rest.indexOf(name) + 1] ?? '') : '')
const thread = flag('-Thread')
const reset = flag('-Reset')
let done = false
let buffer = ''

function finish(result) {
  if (done) return
  done = true
  clearTimeout(timer)
  console.log(JSON.stringify(result))
  try {
    child.kill()
  } catch {}
  setTimeout(() => process.exit(0), 50)
}

const child = spawn(codex, ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
const timer = setTimeout(() => finish({ ok: false, error: 'Codex did not answer within 20 s' }), 20_000)
const send = message => child.stdin.write(`${JSON.stringify(message)}\n`)

/** Micro-units (credits or dollars) as plain numbers; Codex sends them as integers. */
const micros = value => (value === null || value === undefined || value === '' ? null : Number(value) / 1e6)

child.stdout.on('data', chunk => {
  buffer += chunk
  for (let at = buffer.indexOf('\n'); at >= 0; at = buffer.indexOf('\n')) {
    const line = buffer.slice(0, at).trim()
    buffer = buffer.slice(at + 1)
    if (!line.startsWith('{')) continue
    let message
    try {
      message = JSON.parse(line)
    } catch {
      continue
    }
    if (message.id === 1) {
      if (message.error) return finish({ ok: false, error: message.error.message ?? 'Codex refused the handshake' })
      send({ method: 'initialized' })
      if (thread) send({ id: 2, method: 'account/usage/read', params: { threadId: thread } })
      else if (reset) send({ id: 2, method: 'account/rateLimitResetCredit/consume', params: { idempotencyKey: reset } })
      else send({ id: 2, method: 'account/rateLimits/read' })
    } else if (message.id === 2) {
      if (message.error) return finish({ ok: false, error: message.error.message ?? 'Codex could not read the usage' })
      if (thread) {
        const u = message.result?.threadUsage
        if (!u) return finish({ ok: true, thread, usage: null })
        return finish({
          ok: true,
          thread,
          usage: { credits: micros(u.estimatedUsageCreditsMicros), usd: micros(u.nativeUsageUsdMicros ?? u.estimatedUsageUsdMicros) },
        })
      }
      finish({ ok: true, ...message.result })
    }
  }
})
child.on('error', err => finish({ ok: false, error: err.message }))
child.on('exit', code => finish({ ok: false, error: `codex app-server stopped (${code})` }))

send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'claudex', title: 'Claudex', version: VERSION }, ...(thread || reset ? { capabilities: { experimentalApi: true } } : {}) } })
