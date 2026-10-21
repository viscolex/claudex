// Runs one Codex turn through Codex's app server, the protocol Codex's own
// apps speak, and prints what happens as JSON lines in the shape
// `codex exec --json` prints them (thread.started, turn.started,
// item.started / item.completed, turn.completed, turn.failed, error), plus
// what only the app server tells:
//
//   item.updated (todo_list)  Codex's own plan, each step pending, in progress or done
//   reasoning.live            the heading of what Codex is thinking about, as it starts on it
//   diff.updated              a task's diff as it grows: each file with lines added and removed
//   steer.sent / steer.failed a note handed to Codex while it works, or why it could not be
//   question / answered       Codex asking Claude something mid-run (its ask_claude tool), and the answer going back
//   told                      Codex telling Claude something mid-run without waiting (its tell_claude tool)
//   ask.unavailable           this Codex would not take the ask_claude tool; the run goes on without it
//   permit / permit.settled   something asking the person's permission mid-run (one of Codex's own tools, say
//                             a browser that wants to open a page, or Codex wanting more than its sandbox gives),
//                             and the answer going back
//   turn.interrupted          the turn ended because it was asked to stop
//   limits.updated            the plan's usage, as Codex reports it during the run
//   bridge.started            this helper's process and Codex's, for the check-in probe
//   thread.settings           the model, effort and service tier Codex actually runs with, and the
//                             instruction files it loaded (AGENTS.md and the like)
//   message.live              what Codex is writing to Claude right now (commentary), as it writes it;
//                             a final answer under a schema is only counted (message.writing), never shown half-made
//   command.output            the last lines a running command printed
//   tool.progress             a progress line from one of Codex's tools
//   image.generated           a picture Codex made: where it saved it, the prompt it used, whether its
//                             background is transparent, or why it failed
//   model.rerouted            Codex moved the turn to another model
//   notice                    a warning, config warning, deprecation notice or guardian warning
//   request.resolved          a request of Codex's (a question, a permission) was settled elsewhere
//
// The mod cannot write to a running process, so notes, answers and stops come
// in as files: each *.json put in the run's inbox folder ({ "type": "steer",
// "text", "from", "id" }, { "type": "answer", "call", "text" },
// { "type": "permit", "call", "allow", "choice", "persist" } or
// { "type": "stop" }) is read, acted on and deleted.
//
// With -PermitWait (ms), permission requests go to the person through the mod
// and wait that long for their answer (then they are declined); without it,
// they are declined at once. Writing outside what the run may write is never
// granted, and a device check only the Codex app can do is declined.
//
// With -Ask (the tool's description), a new thread gets an ask_claude tool
// through Codex's experimental API: Codex calls it and waits, the question is
// printed, and the answer from the inbox goes back as the tool's result (or,
// after -AskWait ms, a note that none came).
//
//   node appserver.mjs -Codex <codex> -Id <round> -Cwd <dir> -Model <model> -Effort <effort>
//     -Sandbox read-only|workspace-write -Schema <file> -Inbox <dir> [-Thread <id>] [-Images <JSON array>]
//     [-Ask <description>] [-AskWait <ms>] [-Tell <description>]   (-Tell gives it tell_claude too, with -Ask)
//     [-Later <description>]   (with -Ask: ask_claude_later too, a question it does not wait on)
//     [-PermitWait <ms>] [-Instructions <file>] [-Context <file>] [-Title <name>] [-Tier <service tier>]
//
// -Instructions is a text file of standing rules, sent as the thread's developer instructions on
// start and on resume. -Context is a JSON file { key: { value, kind } } (kind "application" for
// background, "untrusted" for logs and quoted material) sent with the turn as additional context.
// -Title names a new thread, so it reads well in the Codex app. Without -Schema the turn has no
// output schema (pictures). With -Envelope, stdin is one JSON object instead of the bare prompt:
// { prompt, instructions?, context? }, the same three things without side files.
//
// The prompt comes on stdin. Closing this helper closes Codex: the app server
// exits when its input ends.
import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { flags } from './lib.mjs'

const opts = flags()
const inbox = opts.inbox
const images = (() => {
  try {
    const list = JSON.parse(opts.images || '[]')
    return Array.isArray(list) ? list.map(String) : []
  } catch {
    return []
  }
})()

/** One JSON line on stdout; a reader that went away is no reason to crash. */
function out(event) {
  try {
    process.stdout.write(`${JSON.stringify(event)}\n`)
  } catch {}
}
process.stdout.on('error', () => undefined)

function readStdin() {
  return new Promise(resolve => {
    let text = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => (text += chunk))
    process.stdin.on('end', () => resolve(text))
    process.stdin.on('error', () => resolve(text))
  })
}

// ---------------------------------------------------------------------------
// The app server and its JSON-RPC

let child
let nextId = 1
const pending = new Map()

function send(message) {
  try {
    child?.stdin.write(`${JSON.stringify(message)}\n`)
  } catch {}
}

/** How long each kind of request may take before the run gives up on it. */
const DEADLINES = { initialize: 30_000, 'thread/start': 90_000, 'thread/resume': 90_000, 'turn/start': 90_000 }
const DEFAULT_DEADLINE = 60_000

function request(method, params, timeoutMs = DEADLINES[method] ?? DEFAULT_DEADLINE) {
  const id = nextId++
  send({ id, method, params })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!pending.delete(id)) return
      const err = new Error(`Codex did not answer ${method} within ${Math.round(timeoutMs / 1000)} s`)
      err.code = 'timeout'
      reject(err)
    }, timeoutMs)
    pending.set(id, {
      method,
      resolve: value => {
        clearTimeout(timer)
        resolve(value)
      },
      reject: err => {
        clearTimeout(timer)
        reject(err)
      },
    })
  })
}

/** An error Codex answered with, keeping its code and data for whoever reads the failure. */
function rpcError(method, error) {
  const err = new Error(error.message || `${method} failed`)
  if (error.code !== undefined) err.code = error.code
  if (error.data !== undefined) err.data = error.data
  return err
}

/**
 * What Codex asks of us: a question for Claude (ask_claude) waits for its
 * answer; a permission request goes to the person (see permitAsked);
 * approvals of commands and file changes are refused (these runs never ask
 * for any), as is anything else.
 */
function answer(message) {
  if (message.method === 'item/tool/call' && message.params?.tool === ASK_TOOL && opts.ask) return askClaude(message)
  if (message.method === 'item/tool/call' && message.params?.tool === TELL_TOOL && opts.tell) return tellClaude(message)
  if (message.method === 'item/tool/call' && message.params?.tool === LATER_TOOL && opts.later) return askLater(message)
  if (message.method === 'mcpServer/elicitation/request' || message.method === 'item/permissions/requestApproval') return permitAsked(message)
  if (message.method === 'item/commandExecution/requestApproval' || message.method === 'item/fileChange/requestApproval') {
    send({ id: message.id, result: { decision: 'decline' } })
  } else {
    send({ id: message.id, error: { code: -32601, message: 'Not available in this run' } })
  }
}

// ---------------------------------------------------------------------------
// Codex asking Claude, mid-run

const ASK_TOOL = 'ask_claude'
const ASK_WAIT = Number(opts.askwait) > 0 ? Number(opts.askwait) : 8 * 60_000
/** Questions waiting for an answer, by call: the request to answer, and its timer. */
const asked = new Map()

function askClaude(message) {
  const call = String(message.params?.callId ?? message.id)
  const args = message.params?.arguments ?? {}
  const question = String(typeof args === 'string' ? args : (args.question ?? '')).trim()
  if (!question) {
    send({ id: message.id, result: { contentItems: [{ type: 'inputText', text: 'Ask one specific question.' }], success: false } })
    return
  }
  const timer = setTimeout(() => reply(call, 'Claude has not answered in time. Carry on with your own judgement, and say in your final answer what you assumed.', true), ASK_WAIT)
  asked.set(call, { id: message.id, timer })
  questions.set(call, question)
  out({ type: 'question', call_id: call, question })
}

/** Every question asked in this run, by call: a late answer goes in saying which one it answers. */
const questions = new Map()

const LATER_TOOL = 'ask_claude_later'

/**
 * A question Codex does not wait on: it gets a ticket at once and carries on
 * with what does not depend on the answer. The answer arrives as a note
 * (see readInbox: an answer with nothing waiting on it is steered in), or,
 * once the turn has ended, as the start of its next round.
 */
function askLater(message) {
  const call = String(message.params?.callId ?? message.id)
  const args = message.params?.arguments ?? {}
  const question = String(typeof args === 'string' ? args : (args.question ?? '')).trim()
  if (!question) {
    send({ id: message.id, result: { contentItems: [{ type: 'inputText', text: 'Ask one specific question.' }], success: false } })
    return
  }
  questions.set(call, question)
  send({
    id: message.id,
    result: {
      contentItems: [{ type: 'inputText', text: `Asked Claude (ticket ${call}). Carry on with whatever does not depend on the answer: it reaches you as a message when Claude replies. If you finish first, say in your final answer what you assumed; the answer then starts your next round.` }],
      success: true,
    },
  })
  out({ type: 'question', call_id: call, question, later: true })
}

const TELL_TOOL = 'tell_claude'

/** Codex tells Claude something without waiting: printed for the mod, and Codex carries on at once. */
function tellClaude(message) {
  const args = message.params?.arguments ?? {}
  const text = String(typeof args === 'string' ? args : (args.message ?? '')).trim()
  send({ id: message.id, result: { contentItems: [{ type: 'inputText', text: text ? 'Claude has it.' : 'Say something.' }], success: Boolean(text) } })
  if (text) out({ type: 'told', call_id: String(message.params?.callId ?? message.id), text })
}

// ---------------------------------------------------------------------------
// The person's permission, mid-run

const PERMIT_WAIT = Number(opts.permitwait) > 0 ? Number(opts.permitwait) : 0
/** This run of the bridge, in the ids it gives out. */
const ATTEMPT = `${process.pid.toString(36)}${Math.random().toString(36).slice(2, 6)}`
/** Permission requests waiting for the person, by call: the request, and its timer. */
const permits = new Map()

/** A form field's choices: the value each sends and the words it shows. */
function optionsOf(field) {
  const titled = field?.oneOf ?? field?.anyOf ?? field?.items?.anyOf
  if (Array.isArray(titled)) return titled.map(o => ({ value: String(o.const), label: String(o.title ?? o.const) }))
  const values = field?.enum ?? field?.items?.enum
  if (Array.isArray(values)) return values.map((v, i) => ({ value: String(v), label: String(field.enumNames?.[i] ?? v) }))
  return []
}

/** A form's one choice field (the person's buttons), if it has one. */
function choiceField(schema) {
  return Object.entries(schema?.properties ?? {}).find(([, field]) => optionsOf(field).length)
}

/**
 * What an accepted form sends: only what the person chose, nothing made up.
 * `choice` is the index of the option they pressed. `null` when the form
 * cannot be answered that way (another required field, or a choice that
 * matches none of its options): it is declined instead.
 */
function contentFor(schema, choice) {
  const fields = Object.keys(schema?.properties ?? {})
  const required = new Set(schema?.required ?? [])
  const chosen = choiceField(schema)
  if (fields.some(key => key !== chosen?.[0] && required.has(key))) return null
  if (!chosen) return {}
  const [key, field] = chosen
  const picked = Number.isInteger(choice) ? optionsOf(field)[choice] : undefined
  if (!picked) return required.has(key) ? null : {}
  return { [key]: field.type === 'array' ? [picked.value] : picked.value }
}

/** A path in a permission request, as words. */
const pathWords = e => String(e?.path?.path ?? e?.path?.pattern ?? e?.path?.value?.kind ?? e ?? '?')

/** What a request asks, in the person's terms; `refuse` when it cannot be granted here. */
function permitOf(method, p) {
  if (method === 'item/permissions/requestApproval') {
    const fs = p.permissions?.fileSystem ?? {}
    const writes = [...(fs.write ?? []), ...(fs.entries ?? []).filter(e => e.access === 'write')].map(pathWords)
    const reads = [...(fs.read ?? []), ...(fs.entries ?? []).filter(e => e.access === 'read')].map(pathWords)
    const network = Boolean(p.permissions?.network?.enabled)
    const wants = [network ? 'the network' : '', reads.length ? `to read ${reads.slice(0, 3).join(', ')}` : ''].filter(Boolean).join(' and ')
    const reason = String(p.reason ?? '').trim()
    if (!wants) return { kind: 'access', title: 'Codex wants to write files', message: reason || `To write ${writes.slice(0, 3).join(', ')}`, refuse: 'Codex writes only in its own copy of the repository' }
    return { kind: 'access', title: `Codex wants ${wants}`, message: reason, ...(writes.length ? { note: 'Writing stays off; only the rest is granted' } : {}) }
  }
  const mode = String(p.mode ?? 'form')
  const server = String(p.serverName ?? '')
  if (mode === 'openai/userVerification') return { kind: 'verify', server, title: String(p.title ?? 'A device check'), message: String(p.description ?? ''), refuse: 'Only the Codex app can do this check' }
  if (mode === 'url') return { kind: 'link', server, title: String(p.message ?? '').split('\n')[0].slice(0, 160) || 'Open a link', message: String(p.message ?? ''), url: String(p.url ?? '') }
  const chosen = choiceField(p.requestedSchema)
  const first = chosen ? optionsOf(chosen[1]) : []
  // What the tool lets an answer keep: for this conversation ("session"), or from now on ("always").
  const meta = p._meta ?? {}
  const persist = [].concat(meta.persist ?? []).filter(x => x === 'session' || x === 'always')
  const title = String(p.message ?? '').split('\n')[0].slice(0, 160) || 'Permission'
  // A form asking for more than one choice cannot be put to the person as buttons.
  const extra = Object.keys(p.requestedSchema?.properties ?? {}).filter(key => key !== chosen?.[0] && (p.requestedSchema?.required ?? []).includes(key))
  if (extra.length) return { kind: 'form', server, title, message: String(p.message ?? ''), refuse: `It also asks for ${extra.slice(0, 3).join(', ')}, which the mod cannot ask you` }
  return {
    kind: 'form',
    server,
    title,
    message: String(p.message ?? ''),
    options: first.map(o => o.label),
    ...(persist.length ? { persist } : {}),
    ...(meta.origin ? { origin: String(meta.origin) } : {}),
    ...(meta.connector_name ? { tool: String(meta.connector_name) } : {}),
  }
}

/** Which of our open calls a request id belongs to: a question for Claude, or a permission. */
function callOfRequest(requestId) {
  for (const [call, waiting] of asked) if (waiting.id === requestId) return { call, kind: 'question' }
  for (const [call, waiting] of permits) if (waiting.id === requestId) return { call, kind: 'permit' }
  return undefined
}

/** Codex settled one of its requests itself (the turn moved on, or another client answered): drop ours. */
function requestResolved(p) {
  const found = callOfRequest(p.requestId)
  if (!found) return
  if (found.kind === 'question') {
    const waiting = asked.get(found.call)
    asked.delete(found.call)
    clearTimeout(waiting?.timer)
    out({ type: 'answered', call_id: found.call, timeout: false, closed: true })
  } else {
    const waiting = permits.get(found.call)
    permits.delete(found.call)
    clearTimeout(waiting?.timer)
    out({ type: 'permit.settled', call_id: found.call, allow: false, timeout: false, resolved: true })
  }
  out({ type: 'request.resolved', call_id: found.call, kind: found.kind })
}

function permitAsked(message) {
  // Request ids start again in every app server: this attempt's own mark keeps a stale button from answering a new one.
  const call = `permit-${ATTEMPT}-${message.id}`
  const ask = permitOf(message.method, message.params ?? {})
  if (process.env.CODEX_BRIDGE_DEBUG) process.stderr.write(`permit request ${message.method}: ${JSON.stringify(message.params).slice(0, 4000)}\n`)
  permits.set(call, { id: message.id, method: message.method, params: message.params ?? {} })
  // Nothing is granted once the run is stopping or over.
  if (stopping || finished || turnDone) {
    out({ type: 'permit', call_id: call, ...ask, refused: 'The run was ending' })
    permitAnswer(call, false)
    return
  }
  if (ask.refuse || !PERMIT_WAIT) {
    out({ type: 'permit', call_id: call, ...ask, refused: ask.refuse ?? 'This run does not ask' })
    permitAnswer(call, false)
    return
  }
  ;(permits.get(call) ?? {}).timer = setTimeout(() => permitAnswer(call, false, undefined, true), PERMIT_WAIT)
  out({ type: 'permit', call_id: call, ...ask })
}

/** The person's answer goes back in the shape its request takes; `persist` keeps an allow for the conversation or for good. */
function permitAnswer(call, allow, choice, timeout = false, persist) {
  const waiting = permits.get(call)
  if (!waiting) return false
  permits.delete(call)
  clearTimeout(waiting.timer)
  const p = waiting.params
  if (waiting.method === 'item/permissions/requestApproval') {
    const fs = p.permissions?.fileSystem
    const granted = allow
      ? {
          ...(p.permissions?.network ? { network: p.permissions.network } : {}),
          ...(fs?.read?.length || fs?.entries?.length ? { fileSystem: { ...(fs.read ? { read: fs.read } : {}), ...(fs.entries ? { entries: fs.entries.filter(e => e.access !== 'write') } : {}) } } : {}),
        }
      : {}
    send({ id: waiting.id, result: { permissions: granted, scope: 'turn' } })
  } else {
    // An allow that cannot be answered faithfully (no such option) is a decline.
    const content = allow && p.mode !== 'url' ? contentFor(p.requestedSchema, choice) : null
    if (allow && p.mode !== 'url' && content === null) allow = false
    const keep = allow && persist && [].concat(p._meta?.persist ?? []).includes(persist) ? persist : undefined
    send({ id: waiting.id, result: allow ? { action: 'accept', content, ...(keep ? { _meta: { persist: keep } } : {}) } : { action: 'decline' } })
  }
  out({ type: 'permit.settled', call_id: call, allow, ...(allow && choice !== undefined ? { choice } : {}), ...(allow && persist ? { persist } : {}), timeout })
  return true
}

/** The answer goes back to Codex as the tool's result; Codex carries on. */
function reply(call, text, timeout = false, ok = true) {
  const waiting = asked.get(call)
  if (!waiting) return false
  asked.delete(call)
  clearTimeout(waiting.timer)
  send({ id: waiting.id, result: { contentItems: [{ type: 'inputText', text }], success: ok } })
  // Not ok (the run stopping): Codex never got an answer, so it is no "answered".
  out({ type: 'answered', call_id: call, timeout, ...(ok ? {} : { closed: true }) })
  return true
}

function onLine(line) {
  if (!line.startsWith('{')) return
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  if (message.id !== undefined && message.method === undefined) {
    const waiting = pending.get(message.id)
    if (!waiting) return
    pending.delete(message.id)
    if (message.error) waiting.reject(rpcError(waiting.method, message.error))
    else waiting.resolve(message.result ?? {})
    return
  }
  if (message.id !== undefined && message.method) {
    // A request this bridge cannot handle still gets an answer (and a "no" where one is asked for).
    try {
      return answer(message)
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err)
      if (message.method === 'mcpServer/elicitation/request') return send({ id: message.id, result: { action: 'decline' } })
      if (message.method === 'item/permissions/requestApproval') return send({ id: message.id, result: { permissions: {}, scope: 'turn' } })
      if (message.method === 'item/tool/call') return send({ id: message.id, result: { contentItems: [{ type: 'inputText', text: `The bridge failed: ${why}` }], success: false } })
      return send({ id: message.id, error: { code: -32603, message: why } })
    }
  }
  if (message.method) onNotification(message.method, message.params ?? {})
}

// ---------------------------------------------------------------------------
// One turn, as it happens

let threadId = ''
let turnId = ''
let turnDone = false
let stopping = false
let finished = false
/** Notes that came before the turn had started: handed over once it has. */
const early = []
/** Token counts for the whole thread; the turn's own are the difference from before it began. */
let before
let total

const LIVE_GAP = 1200
const STREAM_GAP = 700
/** Each agent message's phase and text so far, by item: commentary is shown as it comes, a schema answer only counted. */
const messages = new Map()
/** Each running command's output so far (its tail), by item. */
const outputs = new Map()
const streamTimers = new Map()

/** Runs `show` for a key at most every STREAM_GAP, the newest state winning. */
function throttle(key, show) {
  if (streamTimers.has(key)) return
  streamTimers.set(
    key,
    setTimeout(() => {
      streamTimers.delete(key)
      show()
    }, STREAM_GAP),
  )
}

function flushStream(key) {
  const t = streamTimers.get(key)
  if (t) clearTimeout(t)
  streamTimers.delete(key)
}

/** The last few lines of some output, bounded. */
function tailOf(text, lines = 6, chars = 700) {
  const clean = String(text ?? '').replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '')
  return clean.split('\n').filter(l => l.trim()).slice(-lines).join('\n').slice(-chars)
}

function messageDelta(p) {
  const id = String(p.itemId ?? '')
  const m = messages.get(id) ?? { phase: null, text: '' }
  m.text = (m.text + String(p.delta ?? '')).slice(-6000)
  messages.set(id, m)
  throttle(`m:${id}`, () => {
    const now = messages.get(id)
    if (!now) return
    // A final answer under an output schema is JSON being written: counted, not shown half-made.
    if (opts.schema && now.phase !== 'commentary') out({ type: 'message.writing', item_id: id, chars: now.text.length })
    else out({ type: 'message.live', item_id: id, text: now.text.slice(-1500), phase: now.phase })
  })
}

function outputDelta(p) {
  const id = String(p.itemId ?? '')
  outputs.set(id, (String(outputs.get(id) ?? '') + String(p.delta ?? '')).slice(-4000))
  throttle(`o:${id}`, () => out({ type: 'command.output', item_id: id, tail: tailOf(outputs.get(id)) }))
}
const DIFF_GAP = 1500
const reasoning = new Map()
let liveTimer
let lastLive = ''
let lastLiveAt = 0
let diffTimer
let diffWaiting
let lastDiff = ''
let lastDiffAt = 0

function onNotification(method, p) {
  if (p.threadId && threadId && p.threadId !== threadId) return
  switch (method) {
    case 'turn/started':
      turnId = p.turn?.id ?? turnId
      out({ type: 'turn.started' })
      handOverEarly()
      break
    case 'item/started':
      itemStarted(p.item ?? {})
      break
    case 'item/completed':
      itemCompleted(p.item ?? {})
      break
    case 'item/reasoning/summaryTextDelta':
      reasoningDelta(p)
      break
    case 'item/agentMessage/delta':
      messageDelta(p)
      break
    case 'item/commandExecution/outputDelta':
      outputDelta(p)
      break
    case 'item/mcpToolCall/progress':
      if (p.message) out({ type: 'tool.progress', item_id: String(p.itemId ?? ''), message: String(p.message).slice(0, 300) })
      break
    case 'model/rerouted':
      out({ type: 'model.rerouted', from: String(p.fromModel ?? ''), to: String(p.toModel ?? ''), reason: String(p.reason ?? '') })
      break
    case 'warning':
    case 'guardianWarning':
      if (p.message) out({ type: 'notice', kind: method, text: String(p.message).slice(0, 600) })
      break
    case 'configWarning':
    case 'deprecationNotice':
      if (p.summary) out({ type: 'notice', kind: method, text: String(p.summary).slice(0, 300), ...(p.details ? { details: String(p.details).slice(0, 600) } : {}) })
      break
    case 'serverRequest/resolved':
      requestResolved(p)
      break
    case 'turn/plan/updated':
      out({
        type: 'item.updated',
        item: {
          id: 'plan',
          type: 'todo_list',
          items: (p.plan ?? []).map(s => ({ text: String(s.step ?? ''), completed: s.status === 'completed', status: s.status })),
        },
      })
      break
    case 'turn/diff/updated':
      diffUpdated(String(p.diff ?? ''))
      break
    case 'thread/tokenUsage/updated':
      tokens(p.tokenUsage)
      break
    case 'account/rateLimits/updated':
      if (p.rateLimits) out({ type: 'limits.updated', rate_limits: p.rateLimits })
      break
    case 'error':
      out(p.willRetry ? { type: 'retrying', message: String(p.error?.message ?? '') } : { type: 'error', message: String(p.error?.message ?? 'Codex reported an error') })
      break
    case 'turn/completed':
      turnCompleted(p.turn ?? {})
      break
  }
}

function itemStarted(item) {
  if (item.type === 'agentMessage') messages.set(String(item.id), { phase: item.phase ?? null, text: '' })
  else if (item.type === 'imageGeneration') out({ type: 'item.started', item: { id: item.id, type: 'image_generation' } })
  if (item.type === 'commandExecution') out({ type: 'item.started', item: { id: item.id, type: 'command_execution', command: String(item.command ?? '') } })
  else if (item.type === 'webSearch') out({ type: 'item.started', item: { id: item.id, type: 'web_search', query: String(item.query ?? '') } })
  else if (item.type === 'mcpToolCall') out({ type: 'item.started', item: { id: item.id, type: 'mcp_tool_call', server: item.server, tool: item.tool } })
}

function itemCompleted(item) {
  if (item.type === 'commandExecution') {
    flushStream(`o:${item.id}`)
    const tail = tailOf(item.aggregatedOutput ?? outputs.get(String(item.id)) ?? '')
    outputs.delete(String(item.id))
    out({ type: 'item.completed', item: { id: item.id, type: 'command_execution', command: String(item.command ?? ''), exit_code: item.exitCode ?? null, status: item.status, ...(tail ? { output: tail } : {}) } })
  } else if (item.type === 'imageGeneration') {
    out({
      type: 'image.generated',
      item_id: String(item.id ?? ''),
      saved_path: item.savedPath ? String(item.savedPath) : null,
      revised_prompt: item.revisedPrompt ? String(item.revisedPrompt).slice(0, 2000) : null,
      transparent: item.transparentBackground === true,
      failure: item.failure ? String(item.failure.message ?? item.failure.kind ?? JSON.stringify(item.failure)).slice(0, 400) : null,
      status: String(item.status ?? ''),
    })
  } else if (item.type === 'fileChange') {
    const changes = (Array.isArray(item.changes) ? item.changes : []).map(c => ({ path: String(c.path ?? ''), kind: typeof c.kind === 'string' ? c.kind : String(c.kind?.type ?? 'update') }))
    out({ type: 'item.completed', item: { id: item.id, type: 'file_change', changes } })
  } else if (item.type === 'reasoning') {
    for (const key of [...reasoning.keys()]) if (key.startsWith(`${item.id}:`)) reasoning.delete(key)
    const text = (Array.isArray(item.summary) ? item.summary : []).join('\n\n')
    out({ type: 'item.completed', item: { id: item.id, type: 'reasoning', text } })
  } else if (item.type === 'agentMessage') {
    flushStream(`m:${item.id}`)
    messages.delete(String(item.id))
    out({ type: 'item.completed', item: { id: item.id, type: 'agent_message', text: String(item.text ?? ''), phase: item.phase ?? null } })
  }
}

/**
 * The line Codex is on, once there is a whole one: a summary's heading when
 * it has written it out, else its first sentence. Shown at most every
 * LIVE_GAP, the newest winning.
 */
function reasoningDelta(p) {
  const key = `${p.itemId}:${p.summaryIndex ?? 0}`
  const text = (reasoning.get(key) ?? '') + String(p.delta ?? '')
  reasoning.set(key, text)
  const lead = text.replace(/^\s+/, '')
  const nl = lead.indexOf('\n')
  let line = ''
  if (nl > 0) line = lead.slice(0, nl)
  else {
    const stop = lead.search(/[.!?](\s|$)/)
    if (stop > 0 && !lead.startsWith('**')) line = lead.slice(0, stop + 1)
  }
  line = line.replace(/\*\*/g, '').trim()
  if (!line || line === lastLive) return
  const show = () => {
    liveTimer = undefined
    if (line === lastLive) return
    lastLive = line
    lastLiveAt = Date.now()
    out({ type: 'reasoning.live', item_id: String(p.itemId ?? ''), text: line })
  }
  clearTimeout(liveTimer)
  const wait = LIVE_GAP - (Date.now() - lastLiveAt)
  if (wait <= 0) show()
  else liveTimer = setTimeout(show, wait)
}

/** Each file in a unified diff, with the lines it adds and removes. */
function filesOf(diff) {
  const files = []
  let file
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const m = / b\/(.+)$/.exec(line)
      file = { path: m ? m[1] : line.slice(11), added: 0, removed: 0 }
      files.push(file)
    } else if (!file) continue
    else if (line.startsWith('+++ ') || line.startsWith('--- ')) continue
    else if (line.startsWith('+')) file.added++
    else if (line.startsWith('-')) file.removed++
  }
  return files
}

function diffUpdated(diff) {
  diffWaiting = filesOf(diff)
  const show = () => {
    diffTimer = undefined
    if (!diffWaiting) return
    const key = JSON.stringify(diffWaiting)
    const files = diffWaiting
    diffWaiting = undefined
    if (key === lastDiff) return
    lastDiff = key
    lastDiffAt = Date.now()
    out({ type: 'diff.updated', files })
  }
  if (diffTimer) return
  const wait = DIFF_GAP - (Date.now() - lastDiffAt)
  if (wait <= 0) show()
  else diffTimer = setTimeout(show, wait)
}

function tokens(usage) {
  if (!usage?.total) return
  total = usage.total
  if (!before) {
    const last = usage.last ?? {}
    before = Object.fromEntries(['inputTokens', 'cachedInputTokens', 'outputTokens', 'reasoningOutputTokens'].map(k => [k, Math.max(0, Number(total[k] ?? 0) - Number(last[k] ?? 0))]))
  }
}

function turnUsage() {
  if (!total) return {}
  const d = k => Math.max(0, Number(total[k] ?? 0) - Number(before?.[k] ?? 0))
  return { input_tokens: d('inputTokens'), cached_input_tokens: d('cachedInputTokens'), output_tokens: d('outputTokens'), reasoning_output_tokens: d('reasoningOutputTokens') }
}

function turnCompleted(turn) {
  if (turnDone) return
  turnDone = true
  // What was still waiting to be shown goes out first.
  if (diffTimer) {
    clearTimeout(diffTimer)
    diffTimer = undefined
    if (diffWaiting) out({ type: 'diff.updated', files: diffWaiting })
  }
  clearTimeout(liveTimer)
  const usage = turnUsage()
  if (turn.status === 'completed') out({ type: 'turn.completed', usage })
  else if (turn.status === 'interrupted') out({ type: 'turn.interrupted', usage })
  else out({ type: 'turn.failed', error: { message: String(turn.error?.message ?? 'Codex could not finish the turn.') }, usage })
  for (const note of early.splice(0)) out({ type: 'steer.failed', id: note.id, text: note.text, from: note.from, error: 'Codex had already finished' })
  for (const key of [...streamTimers.keys()]) flushStream(key)
  // A failed turn is no success: the exit code says so too, for whoever reads only that.
  finish(turn.status === 'completed' || turn.status === 'interrupted' ? 0 : 3)
}

// ---------------------------------------------------------------------------
// Notes and stops, from the inbox folder

function steer(note) {
  if (turnDone || stopping) return out({ type: 'steer.failed', id: note.id, text: note.text, from: note.from, error: 'Codex had already finished' })
  if (!turnId) return void early.push(note)
  request('turn/steer', { threadId, expectedTurnId: turnId, input: [{ type: 'text', text: String(note.text ?? ''), text_elements: [] }] })
    .then(() => out({ type: 'steer.sent', id: note.id, text: note.text, from: note.from }))
    .catch(err => out({ type: 'steer.failed', id: note.id, text: note.text, from: note.from, error: err instanceof Error ? err.message : String(err) }))
}

function handOverEarly() {
  for (const note of early.splice(0)) steer(note)
}

async function stop() {
  if (stopping || finished) return
  stopping = true
  for (const call of [...asked.keys()]) reply(call, 'The run was stopped.', false, false)
  for (const call of [...permits.keys()]) permitAnswer(call, false)
  if (turnId && !turnDone) {
    request('turn/interrupt', { threadId, turnId }).catch(() => undefined)
    // Codex ends the turn as interrupted; give it a moment, then go regardless.
    const until = Date.now() + 5000
    while (!turnDone && Date.now() < until) await new Promise(done => setTimeout(done, 100))
  }
  if (!turnDone) {
    turnDone = true
    out({ type: 'turn.interrupted', usage: turnUsage() })
  }
  finish(0)
}

let poll
function readInbox() {
  let names = []
  try {
    names = readdirSync(inbox)
      .filter(n => n.endsWith('.json'))
      .sort()
  } catch {
    return
  }
  for (const name of names) {
    const path = join(inbox, name)
    let note
    try {
      note = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      // Half written: read again next time, unless it has been sitting there a while.
      try {
        if (Date.now() - statSync(path).mtimeMs < 3000) continue
      } catch {}
    }
    // Claimed by renaming it out of the way: a file that cannot be moved (held by a scanner) is left
    // for the next poll rather than acted on now and again later.
    const taken = `${path}.taken`
    try {
      renameSync(path, taken)
    } catch {
      continue
    }
    try {
      rmSync(taken, { force: true })
    } catch {}
    if (!note || typeof note !== 'object') continue
    if (note.type === 'stop') void stop()
    else if (note.type === 'answer' && String(note.text ?? '').trim()) {
      // Codex stopped waiting meanwhile: the answer goes in as a note, saying which question it answers.
      const call = String(note.call ?? '')
      if (!reply(call, String(note.text))) {
        const question = questions.get(call)
        steer({ id: String(note.id ?? call), from: note.from, text: question ? `An answer to your earlier question “${question}”:\n\n${note.text}` : String(note.text) })
      }
    } else if (note.type === 'steer' && String(note.text ?? '').trim()) steer(note)
    else if (note.type === 'permit') {
      // Once the run is stopping, an answer can only say no.
      permitAnswer(String(note.call ?? ''), note.allow === true && !stopping && !finished, Number.isInteger(note.choice) ? note.choice : undefined, false, note.persist === 'session' || note.persist === 'always' ? note.persist : undefined)
    }
  }
}

/** Leaves once what was printed has gone out. */
function leave(code) {
  try {
    process.stdout.write('', () => process.exit(code))
  } catch {
    process.exit(code)
  }
}

function finish(code) {
  if (finished) return
  finished = true
  clearInterval(poll)
  for (const call of [...permits.keys()]) permitAnswer(call, false)
  try {
    if (inbox) rmSync(inbox, { recursive: true, force: true })
  } catch {}
  try {
    child?.stdin.end()
  } catch {}
  // The app server leaves when its input ends; make sure of it.
  const timer = setTimeout(() => {
    try {
      child?.kill()
    } catch {}
    leave(code)
  }, 1500)
  if (!child || child.exitCode !== null) {
    clearTimeout(timer)
    leave(code)
  } else child.once('exit', () => {
    clearTimeout(timer)
    leave(code)
  })
}

// Inboxes a crashed or killed bridge left behind, two days on: no round runs that long.
const STALE_INBOX_MS = 2 * 24 * 3600_000

function sweepRuns() {
  const runs = dirname(inbox)
  if (basename(runs) !== 'runs') return
  try {
    for (const name of readdirSync(runs)) {
      const path = join(runs, name)
      if (path === inbox) continue
      try {
        const st = statSync(path)
        if (st.isDirectory() && Date.now() - st.mtimeMs > STALE_INBOX_MS) rmSync(path, { recursive: true, force: true })
      } catch {}
    }
  } catch {}
}

// ---------------------------------------------------------------------------

/** The standing rules and the turn's context, from -Envelope's stdin or from -Instructions / -Context files. */
const brief = { instructions: undefined, context: undefined }

function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

async function main() {
  let prompt = await readStdin()
  if (opts.envelope) {
    const env = JSON.parse(prompt)
    prompt = String(env.prompt ?? '')
    if (typeof env.instructions === 'string' && env.instructions.trim()) brief.instructions = env.instructions.trim()
    if (env.context && typeof env.context === 'object') brief.context = env.context
  }
  if (!brief.instructions && opts.instructions) brief.instructions = readFileSync(opts.instructions, 'utf8').trim() || undefined
  if (!brief.context && opts.context) brief.context = readJsonFile(opts.context)
  if (!opts.codex) throw new Error('usage: node appserver.mjs -Codex <codex> -Cwd <dir> … (the prompt on stdin)')
  if (inbox) {
    mkdirSync(inbox, { recursive: true })
    poll = setInterval(readInbox, 250)
    sweepRuns()
  }
  // A .mjs stand-in (for trying the bridge without a model) runs under Node.
  const [command, args] = /\.m?js$/i.test(opts.codex) ? [process.execPath, [opts.codex, 'app-server']] : [opts.codex, ['app-server']]
  child = spawn(command, args, { cwd: opts.cwd || undefined, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  // A write after Codex has gone (a late note, a decline at the end) must not crash the bridge.
  child.stdin.on('error', () => undefined)
  out({ type: 'bridge.started', pid: process.pid, codex_pid: child.pid ?? null })
  let buffer = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    buffer += chunk
    for (let at = buffer.indexOf('\n'); at >= 0; at = buffer.indexOf('\n')) {
      const line = buffer.slice(0, at).trim()
      buffer = buffer.slice(at + 1)
      onLine(line)
    }
  })
  child.stderr.setEncoding('utf8')
  // Codex's own log lines, less the noise its plugins and skills make as it starts and stops.
  child.stderr.on('data', text => {
    const kept = text
      .replace(/\x1b\[[0-9;]*m/g, '')
      .split('\n')
      .filter(line => line.trim() && !/skills_extension|rmcp::|mcp_connection|codex_plugins/.test(line))
    if (kept.length) process.stderr.write(`${kept.join('\n')}\n`)
  })
  child.on('error', err => {
    out({ type: 'turn.failed', error: { message: `Could not start Codex: ${err.message}` } })
    finish(1)
  })
  child.on('exit', code => {
    if (finished) return
    for (const waiting of pending.values()) waiting.reject(new Error(`Codex stopped (exit ${code})`))
    pending.clear()
    if (!turnDone) out({ type: 'turn.failed', error: { message: `Codex stopped (exit ${code})` } })
    finish(1)
  })

  // The ask_claude tool needs Codex's experimental API, and so do some permission requests and a turn's additional context.
  const hello = await request('initialize', { clientInfo: { name: 'claudex', title: 'Claudex', version: '2.6.0' }, ...(opts.ask || opts.permitwait || Object.keys(brief.context ?? {}).length ? { capabilities: { experimentalApi: true } } : {}) })
  send({ method: 'initialized' })
  if (hello?.userAgent) out({ type: 'codex.version', user_agent: String(hello.userAgent), version: versionOf(hello.userAgent) })
  if (stopping) return

  const sandbox = opts.sandbox === 'workspace-write' ? 'workspace-write' : 'read-only'
  // Nothing is ever asked of the person but what a tool of Codex's own asks for (a browser wanting a site),
  // and that only when the mod puts it to them; the sandbox's limits are never up for approval.
  // request_permissions lets Codex ask for more than its sandbox (the network, a folder to read): such asks go to
  // the person, who can grant reading and the network but never writing (see permitAnswer).
  const approvalPolicy = PERMIT_WAIT ? { granular: { mcp_elicitations: true, rules: false, sandbox_approval: false, request_permissions: true, skill_approval: false } } : 'never'
  const developerInstructions = brief.instructions
  const setup = { cwd: opts.cwd || undefined, model: opts.model || undefined, sandbox, approvalPolicy, ...(developerInstructions ? { developerInstructions } : {}) }
  let opened
  if (opts.thread) opened = await request('thread/resume', { threadId: opts.thread, ...setup })
  else if (opts.ask) {
    const tools = [
      {
        type: 'function',
        name: ASK_TOOL,
        description: opts.ask,
        inputSchema: { type: 'object', properties: { question: { type: 'string', description: 'One short, specific question.' } }, required: ['question'], additionalProperties: false },
      },
      ...(opts.later
        ? [
            {
              type: 'function',
              name: LATER_TOOL,
              description: opts.later,
              inputSchema: { type: 'object', properties: { question: { type: 'string', description: 'One short, specific question.' } }, required: ['question'], additionalProperties: false },
            },
          ]
        : []),
      ...(opts.tell
        ? [
            {
              type: 'function',
              name: TELL_TOOL,
              description: opts.tell,
              inputSchema: { type: 'object', properties: { message: { type: 'string', description: 'What Claude should know, in a sentence or two.' } }, required: ['message'], additionalProperties: false },
            },
          ]
        : []),
    ]
    try {
      opened = await request('thread/start', { ...setup, dynamicTools: tools })
    } catch (err) {
      // A Codex that does not take these tools (its error names them, or the experimental API they need): the run goes on without them. Any other failure, such as an unsupported model, is the run's.
      const why = err instanceof Error ? err.message : String(err)
      if (!/dynamic.?tools|experimental/i.test(why)) throw err
      out({ type: 'ask.unavailable', message: why })
      opened = await request('thread/start', setup)
    }
  } else opened = await request('thread/start', setup)
  threadId = String(opened.thread?.id ?? opts.thread ?? '')
  if (!threadId) throw new Error('Codex did not open a thread')
  out({ type: 'thread.started', thread_id: threadId })
  out({
    type: 'thread.settings',
    model: opened.model ?? null,
    effort: opened.reasoningEffort ?? null,
    tier: opened.serviceTier ?? null,
    instructions: Array.isArray(opened.instructionSources) ? opened.instructionSources.map(String).slice(0, 20) : [],
  })
  // A new thread gets the card's title, so it reads well in the Codex app; never worth failing the run over.
  if (opts.title && !opts.thread) request('thread/name/set', { threadId, name: String(opts.title).slice(0, 120) }).catch(() => undefined)
  if (stopping) return

  let outputSchema
  if (opts.schema) outputSchema = JSON.parse(readFileSync(opts.schema, 'utf8'))
  const input = [...images.map(path => ({ type: 'localImage', path })), { type: 'text', text: prompt, text_elements: [] }]
  let additionalContext
  const entries = Object.entries(brief.context ?? {}).filter(([, e]) => e && typeof e.value === 'string' && e.value.trim())
  if (entries.length) additionalContext = Object.fromEntries(entries.map(([k, e]) => [k, { value: e.value, kind: e.kind === 'untrusted' ? 'untrusted' : 'application' }]))
  const started = await request('turn/start', {
    threadId,
    input,
    cwd: opts.cwd || undefined,
    model: opts.model || undefined,
    effort: opts.effort || undefined,
    summary: 'detailed',
    outputSchema,
    ...(additionalContext ? { additionalContext } : {}),
    ...(opts.tier && opts.tier !== 'default' ? { serviceTier: opts.tier } : {}),
  })
  if (!turnId && started.turn?.id) {
    turnId = String(started.turn.id)
    handOverEarly()
  }
  // A stop that came while the turn was being set up.
  if (stopping && !turnDone) {
    stopping = false
    await stop()
  }
}

/** "0.163.0-alpha.10.2" out of a user agent like "claudex/0.163.0-alpha.10.2 (Windows …)". */
function versionOf(userAgent) {
  return /\/(\d+\.\d+\.\d+[^\s(]*)/.exec(String(userAgent))?.[1] ?? null
}

main().catch(err => {
  if (finished) return
  out({
    type: 'turn.failed',
    error: { message: err instanceof Error ? err.message : String(err), ...(err?.code !== undefined ? { code: err.code } : {}), ...(err?.data !== undefined ? { data: err.data } : {}) },
  })
  finish(1)
})
