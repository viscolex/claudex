// Reads the Codex plan's live usage the way Codex's own clients do: the
// app-server's account/rateLimits/read request. No model runs, so no quota is
// spent. Prints one JSON line.
//
//   node codex-limits.mjs <path to codex.exe>
import { spawn } from 'node:child_process'

const [codex] = process.argv.slice(2)
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
      send({ id: 2, method: 'account/rateLimits/read' })
    } else if (message.id === 2) {
      if (message.error) return finish({ ok: false, error: message.error.message ?? 'Codex could not read the usage' })
      finish({ ok: true, ...message.result })
    }
  }
})
child.on('error', err => finish({ ok: false, error: err.message }))
child.on('exit', code => finish({ ok: false, error: `codex app-server stopped (${code})` }))

send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'claudex', title: 'Claudex', version: '2.6.0' } } })
