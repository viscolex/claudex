// Asks Codex's app server who is signed in, which version it is, and which
// models it offers: initialize, account/read and model/list. No model runs, so
// no quota is spent. Prints one JSON line:
//
//   { ok: true, version, userAgent, codexHome, signedIn, account: { type, plan }, models: [...] }
//   { ok: false, stage, error }   stage: "start" (Codex would not start), "handshake", "account"
//
//   node codex-probe.mjs <path to codex.exe> [--no-models]
import { spawn } from 'node:child_process'

const [codex, ...rest] = process.argv.slice(2)
const withModels = !rest.includes('--no-models')
let done = false
let buffer = ''
let stderr = ''
const result = { ok: true }

function finish(value) {
  if (done) return
  done = true
  clearTimeout(timer)
  console.log(JSON.stringify(value))
  try {
    child.kill()
  } catch {}
  setTimeout(() => process.exit(0), 50)
}

const fail = (stage, error) => finish({ ok: false, stage, error: String(error).slice(0, 400), ...(stderr.trim() ? { stderr: stderr.trim().split(/\r?\n/).slice(-3).join(' ').slice(0, 300) } : {}) })

/** "0.163.0-alpha.10.2" out of a user agent like "claudex/0.163.0-alpha.10.2 (Windows …)". */
const versionOf = ua => /\/(\d+\.\d+\.\d+[^\s(]*)/.exec(String(ua))?.[1] ?? null

let child
try {
  child = spawn(codex, ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
} catch (err) {
  fail('start', err instanceof Error ? err.message : String(err))
}
const timer = setTimeout(() => fail('handshake', 'Codex did not answer within 20 s'), 20_000)
const send = message => {
  try {
    child.stdin.write(`${JSON.stringify(message)}\n`)
  } catch {}
}

const models = []
function askModels(cursor) {
  send({ id: 3, method: 'model/list', params: { limit: 100, ...(cursor ? { cursor } : {}) } })
}

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
      if (message.error) return fail('handshake', message.error.message ?? 'Codex refused the handshake')
      result.userAgent = String(message.result?.userAgent ?? '')
      result.version = versionOf(result.userAgent)
      result.codexHome = message.result?.codexHome ?? null
      send({ method: 'initialized' })
      send({ id: 2, method: 'account/read', params: {} })
    } else if (message.id === 2) {
      if (message.error) return fail('account', message.error.message ?? 'Codex could not read the account')
      const account = message.result?.account ?? null
      result.signedIn = Boolean(account)
      result.requiresAuth = Boolean(message.result?.requiresOpenaiAuth)
      result.account = account ? { type: String(account.type ?? ''), ...(account.planType ? { plan: String(account.planType) } : {}) } : null
      if (withModels) askModels()
      else finish(result)
    } else if (message.id === 3) {
      // A model list Codex will not give is no reason to fail the probe: the mod keeps its own.
      if (message.error) return finish({ ...result, models: [] })
      for (const m of message.result?.data ?? []) {
        if (m.hidden) continue
        models.push({
          id: String(m.id ?? m.model ?? ''),
          name: String(m.displayName ?? m.id ?? ''),
          description: String(m.description ?? '').slice(0, 200),
          isDefault: Boolean(m.isDefault),
          efforts: (m.supportedReasoningEfforts ?? []).map(e => String(e.reasoningEffort ?? e)).filter(Boolean),
          defaultEffort: m.defaultReasoningEffort ? String(m.defaultReasoningEffort) : null,
          tiers: (m.serviceTiers ?? []).map(t => ({ id: String(t.id), name: String(t.name ?? t.id) })),
          images: (m.inputModalities ?? []).includes('image'),
        })
      }
      const next = message.result?.nextCursor
      if (next && models.length < 300) askModels(next)
      else finish({ ...result, models })
    }
  }
})
child.stderr.setEncoding('utf8')
child.stderr.on('data', text => {
  stderr = (stderr + text).slice(-2000)
})
child.on('error', err => fail('start', err.message))
child.on('exit', code => fail('handshake', `codex app-server stopped (${code})`))

send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'claudex', title: 'Claudex', version: '2.6.0' } } })
