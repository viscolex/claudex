// A smoke test against the real Codex, for after the Codex app updates: does
// this Codex still take everything the mod sends? Prints PASS/FAIL lines and
// exits non-zero when anything fails. Runs on Windows and macOS alike.
//
//   node scripts/smoke.mjs            no model runs, no quota: version (and whether it is newer than the
//                                     Codex this Claudex was checked against), account, usage, models
//                                     (the default among them), the requests that resume, fork and read
//                                     back threads, and a thread opened with the mod's exact setup
//                                     (ask/tell tools through the experimental API, granular approvals,
//                                     developer instructions)
//   node scripts/smoke.mjs --turn     also one tiny turn through the bridge, in its JSON schema
//                                     (a few thousand tokens of the plan's quota)
//   node scripts/smoke.mjs --codex <path>   a Codex other than the one the mod would find
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TESTED, VERSION, findCodex } from './lib.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const codex = args.includes('--codex') ? args[args.indexOf('--codex') + 1] : findCodex()
const results = []
const pass = (name, detail = '') => results.push({ ok: true, name, detail })
const fail = (name, detail = '') => results.push({ ok: false, name, detail })
/** Worth knowing, not a failure. */
const notes = []

/** "0.166" out of "0.166.0-alpha.5.1", as a number to compare. */
const minor = version => Number(/^\d+\.(\d+)/.exec(String(version ?? ''))?.[1] ?? NaN)

/**
 * A request the mod sends, asked about a thread that does not exist: Codex knows the request and takes its
 * parameters when it answers that the thread is missing, rather than that the method or a field is unknown.
 */
function takes(answer) {
  const e = answer.error
  if (!e) return true
  return e.code !== -32601 && !/unknown (field|variant|method)|method not found/i.test(String(e.message ?? ''))
}

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

  const hello = await server.request('initialize', { clientInfo: { name: 'claudex_smoke', title: 'Claudex (smoke test)', version: VERSION }, capabilities: { experimentalApi: true } })
  if (hello.error) return fail('initialize', hello.error.message)
  server.notify('initialized')
  pass('initialize', hello.result?.userAgent ?? '')
  const version = /\/(\d+\.\d+\.\d+[^\s(]*)/.exec(String(hello.result?.userAgent ?? ''))?.[1]
  if (version) {
    const at = minor(version)
    if (at > minor(TESTED.to)) notes.push(`Codex ${version} is newer than the ${TESTED.from}–${TESTED.to} Claudex ${VERSION} was checked against: run with --turn too, and look at what changed.`)
    else if (at < minor(TESTED.from)) notes.push(`Codex ${version} is older than the ${TESTED.from}–${TESTED.to} Claudex ${VERSION} was checked against: update the Codex app.`)
  }

  const account = await server.request('account/read', {})
  if (account.error) fail('account/read', account.error.message)
  else if (!account.result?.account) fail('signed in', 'no account: sign in to Codex with ChatGPT')
  else {
    const a = account.result.account
    pass('signed in', `${a.type}${a.planType ? ` · ${a.planType}` : ''}${a.workspaceName ? ` · ${a.workspaceName}` : ''}`)
    if (a.type === 'gcp') notes.push('A Google Cloud account: Codex has no pictures or web search on it, and no usage limits to show.')
  }

  const limits = await server.request('account/rateLimits/read', {})
  if (limits.error) fail('account/rateLimits/read', limits.error.message)
  else {
    const r = limits.result ?? {}
    const windows = [r.rateLimits?.primary, r.rateLimits?.secondary].filter(Boolean).map(w => `${w.windowDurationMins / 60 >= 24 ? `${w.windowDurationMins / 1440}d` : `${w.windowDurationMins / 60}h`} ${w.usedPercent}%`)
    const resets = Number(r.rateLimitResetCredits?.availableCount ?? 0)
    pass('account/rateLimits/read', [windows.join(', ') || 'no windows', resets ? `${resets} free reset${resets > 1 ? 's' : ''}` : '', r.rateLimits?.spendControlReached ? 'spend control reached' : ''].filter(Boolean).join(' · '))
  }

  const models = await server.request('model/list', { limit: 100 })
  if (models.error) fail('model/list', models.error.message)
  else {
    const ids = (models.result?.data ?? []).filter(m => !m.hidden).map(m => m.id)
    pass('model/list', ids.join(', '))
    // The mod's default model (its manifest's): a run with no pick of the person's uses it.
    const fallback = (() => {
      try {
        return String(JSON.parse(readFileSync(join(here, '..', '.claude-plugin', 'plugin.json'), 'utf8')).userConfig?.model?.default ?? '')
      } catch {
        return ''
      }
    })()
    if (fallback) (ids.includes(fallback) ? pass : fail)('the default model is offered', ids.includes(fallback) ? fallback : `${fallback} is not in Codex's list: change the default in .claude-plugin/plugin.json`)
  }

  // What carries a conversation on, starts a task from a review, reads back a dropped answer and a thread's cost.
  const nothing = '00000000-0000-7000-8000-000000000000'
  const shapes = [
    ['thread/resume (without its turns)', 'thread/resume', { threadId: nothing, excludeTurns: true }],
    ['thread/fork (attached to its source)', 'thread/fork', { threadId: nothing, attachToSource: true, excludeTurns: true }],
    // Optional: a Codex without it (0.166 alphas) cannot read a dropped answer back, and the run goes on.
    ['thread/items/list', 'thread/items/list', { threadId: nothing, limit: 1 }, 'not in this Codex yet: a dropped answer cannot be read back'],
    ['account/usage/read for a thread', 'account/usage/read', { threadId: nothing }],
  ]
  for (const [name, method, params, optional] of shapes) {
    const answer = await server.request(method, params)
    if (takes(answer)) pass(name, answer.error ? 'known' : 'answered')
    else if (optional) pass(name, optional)
    else fail(name, answer.error.message)
  }

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
    for (const n of notes) console.log(`NOTE  ${n}`)
    const failed = results.filter(r => !r.ok).length
    console.log(failed ? `\n${failed} failed` : '\nAll good')
    process.exit(failed ? 1 : 0)
  })
