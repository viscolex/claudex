// A smoke test against the real Codex, for after the Codex app updates: does
// this Codex still take everything the mod sends? Prints PASS/FAIL lines and
// exits non-zero when anything fails. Runs on Windows and macOS alike.
//
//   node scripts/smoke.mjs            no model runs, no quota: version, account, models, and a thread
//                                     opened with the mod's exact setup (ask/tell tools through the
//                                     experimental API, granular approvals, developer instructions)
//   node scripts/smoke.mjs --turn     also one tiny turn through the bridge, in its JSON schema
//                                     (a few thousand tokens of the plan's quota)
//   node scripts/smoke.mjs --codex <path>   a Codex other than the one the mod would find
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findCodex } from './lib.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const codex = args.includes('--codex') ? args[args.indexOf('--codex') + 1] : findCodex()
const results = []
const pass = (name, detail = '') => results.push({ ok: true, name, detail })
const fail = (name, detail = '') => results.push({ ok: false, name, detail })

/** Codex's app server, spoken to directly: requests with deadlines. */
function appServer(cwd) {
  const child = spawn(codex, ['app-server'], { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  let buffer = ''
  let id = 0
  const waiting = new Map()
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    buffer += chunk
    for (let at = buffer.indexOf('\n'); at >= 0; at = buffer.indexOf('\n')) {
      const line = buffer.slice(0, at).trim()
      buffer = buffer.slice(at + 1)
      if (!line.startsWith('{')) continue
      try {
        const m = JSON.parse(line)
        if (m.id !== undefined && m.method === undefined && waiting.has(m.id)) {
          waiting.get(m.id)(m)
          waiting.delete(m.id)
        } else if (m.id !== undefined && m.method) {
          // A request of Codex's (none expected here): answered so nothing hangs.
          child.stdin.write(`${JSON.stringify({ id: m.id, error: { code: -32601, message: 'smoke test' } })}\n`)
        }
      } catch {}
    }
  })
  const request = (method, params, ms = 30_000) =>
    new Promise(resolve => {
      const n = ++id
      const timer = setTimeout(() => {
        waiting.delete(n)
        resolve({ error: { message: `no answer to ${method} in ${ms / 1000} s` } })
      }, ms)
      waiting.set(n, m => {
        clearTimeout(timer)
        resolve(m)
      })
      child.stdin.write(`${JSON.stringify({ id: n, method, params })}\n`)
    })
  const notify = method => child.stdin.write(`${JSON.stringify({ method })}\n`)
  const close = () => {
    try {
      child.stdin.end()
    } catch {}
    setTimeout(() => child.kill(), 1000).unref()
  }
  return { child, request, notify, close }
}

async function main() {
  if (!codex) {
    fail('find Codex', 'no Codex app or codex CLI found')
    return
  }
  pass('find Codex', codex)
  const scratch = mkdtempSync(join(tmpdir(), 'codex-smoke-'))
  const server = appServer(scratch)
  await new Promise(done => {
    server.child.once('spawn', done)
    server.child.once('error', err => {
      fail('start the app server', err.message)
      done()
    })
  })
  if (results.some(r => !r.ok)) return

  const hello = await server.request('initialize', { clientInfo: { name: 'claudex_smoke', title: 'Claudex (smoke test)', version: '2.6.0' }, capabilities: { experimentalApi: true } })
  if (hello.error) return fail('initialize', hello.error.message)
  server.notify('initialized')
  pass('initialize', hello.result?.userAgent ?? '')

  const account = await server.request('account/read', {})
  if (account.error) fail('account/read', account.error.message)
  else if (!account.result?.account) fail('signed in', 'no account: sign in to Codex with ChatGPT')
  else pass('signed in', `${account.result.account.type}${account.result.account.planType ? ` · ${account.result.account.planType}` : ''}`)

  const models = await server.request('model/list', { limit: 100 })
  if (models.error) fail('model/list', models.error.message)
  else pass('model/list', (models.result?.data ?? []).filter(m => !m.hidden).map(m => m.id).join(', '))

  // The mod's own thread setup, as appserver.mjs sends it, on a thread that is never saved.
  const tool = (name, field) => ({ type: 'function', name, description: `smoke test ${name}`, inputSchema: { type: 'object', properties: { [field]: { type: 'string' } }, required: [field], additionalProperties: false } })
  const opened = await server.request(
    'thread/start',
    {
      cwd: scratch,
      sandbox: 'read-only',
      ephemeral: true,
      approvalPolicy: { granular: { mcp_elicitations: true, rules: false, sandbox_approval: false, request_permissions: true, skill_approval: false } },
      developerInstructions: 'Smoke test: standing rules arrive as developer instructions.',
      dynamicTools: [tool('ask_claude', 'question'), tool('tell_claude', 'message')],
    },
    60_000,
  )
  if (opened.error) fail('thread/start with the mod setup', opened.error.message)
  else pass('thread/start with the mod setup', `model ${opened.result?.model ?? '?'} · instructions from ${(opened.result?.instructionSources ?? []).length} file(s)`)
  server.close()

  if (args.includes('--turn')) {
    // One tiny turn through the bridge itself, in the reply schema, with the envelope the mod sends.
    const envelope = JSON.stringify({
      prompt: 'Smoke test. Reply in the JSON schema: verdict "answer", answer "OK", summary "OK", findings and responses empty. Do not read any files.',
      instructions: 'You are being smoke-tested. Answer at once, in the schema.',
      context: { background: { value: 'A connectivity check for the Claude Code mod.', kind: 'application' } },
    })
    const ran = spawnSync(
      process.execPath,
      [join(here, 'appserver.mjs'), '-Codex', codex, '-Id', 'smoke', '-Cwd', scratch, '-Effort', 'low', '-Sandbox', 'read-only', '-Schema', join(here, '..', 'schemas', 'reply.schema.json'), '-Inbox', join(scratch, 'inbox'), '-Envelope', '1', '-Title', 'Codex mod smoke test'],
      { input: envelope, encoding: 'utf8', timeout: 240_000, windowsHide: true },
    )
    const events = (ran.stdout ?? '').split(/\r?\n/).filter(l => l.startsWith('{')).map(l => JSON.parse(l))
    const answer = events.find(e => e.type === 'item.completed' && e.item?.type === 'agent_message')
    let parsed
    try {
      parsed = JSON.parse(answer?.item?.text ?? 'null')
    } catch {}
    if (ran.status === 0 && events.some(e => e.type === 'turn.completed') && parsed?.verdict === 'answer') pass('a turn through the bridge', `exit 0 · ${events.find(e => e.type === 'codex.version')?.version ?? ''}`)
    else fail('a turn through the bridge', events.find(e => e.type === 'turn.failed')?.error?.message ?? `exit ${ran.status}: ${(ran.stderr ?? '').trim().slice(-300)}`)
  }
  try {
    rmSync(scratch, { recursive: true, force: true })
  } catch {}
}

main()
  .catch(err => fail('smoke test', err instanceof Error ? err.message : String(err)))
  .finally(() => {
    for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  ·  ${r.detail}` : ''}`)
    const failed = results.filter(r => !r.ok).length
    console.log(failed ? `\n${failed} failed` : '\nAll good')
    process.exit(failed ? 1 : 0)
  })
