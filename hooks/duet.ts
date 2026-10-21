// Claudex's look: "the stage". One card language for the band above the
// prompt, the cards in the chat and the pane's hero, after Branchline's: a
// dark ground with a dot grid and a wash of colour, a tracked kicker that says
// who is doing what, one big line that says it plainly.
//
// Under the words, Claude and Codex stand on one floor, a spotlight on
// whoever has the move. What Codex does lands on the floor between them as
// beads, one a step (a file read, a search, a command, an edit, a thought),
// each popping out of Codex and pushing the older ones along toward Claude:
// the work so far, at a glance. Notes travel the floor as envelopes; a
// question waits there for Claude; findings land on it in their colours.
import {
  BAND_CONTROLS,
  CLAUDE,
  CODEX,
  type BandHero,
  type BandResult,
  type BandRow,
  type Banter,
  type ClawdMood,
  type Sprite,
  type Stage as CardStage,
  clawd,
  codexAvatar,
  codexSprite,
  confetti,
  escape,
  fit,
  liveClock,
  settle,
} from './art'

// ---------------------------------------------------------------------------
// Tokens

export const D = {
  ground: '#14141c',
  ink: '#f4f2ee',
  claude: '#E0875F',
  codex: '#8B93F8',
  you: '#fbbf24',
  good: '#34d399',
  warn: '#fbbf24',
  bad: '#fb7185',
  violet: '#a78bfa',
  dim: '#8b8b98',
} as const

export const SANS = `Inter, 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif`
export const MONO = `'JetBrains Mono', 'Cascadia Code', Consolas, ui-monospace, monospace`

/** Who holds the move. */
export type Actor = 'codex' | 'claude' | 'you' | 'both'

export function actorColour(a: Actor) {
  return a === 'claude' ? D.claude : a === 'you' ? D.you : a === 'both' ? D.violet : D.codex
}

/** Roughly how wide a line of text sets, so lines are cut before they run into something. */
const width = (text: string, size: number, mono = false) => text.length * size * (mono ? 0.6 : 0.52)
const room = (px: number, size: number, mono = false) => Math.max(4, Math.floor(px / (size * (mono ? 0.6 : 0.52))))
const n1 = (v: number) => v.toFixed(1)

/** A short stable id for one drawing's defs (several drawings share a page). */
function idOf(...parts: (string | number | undefined)[]) {
  let h = 2166136261
  for (const ch of parts.join('|')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return `d${(h >>> 0).toString(36)}`
}

const EASE = 'calcMode="spline" keyTimes="0;1" keySplines=".2 .8 .2 1"'

// ---------------------------------------------------------------------------
// Ground

/** The card: ink, a faint dot grid, the mover's colour washing in from its side, and a rim. */
function ground(id: string, W: number, H: number, colour: string, o: { controls?: number; rx?: number; from?: 'left' | 'right' } = {}) {
  const rx = o.rx ?? 16
  const controls = o.controls ?? 0
  const DW = W - controls
  const fromRight = o.from === 'right'
  return {
    defs: `<linearGradient id="${id}-wash" x1="${fromRight ? 1 : 0}" y1="0" x2="${fromRight ? 0 : 1}" y2=".7"><stop offset="0" stop-color="${colour}" stop-opacity=".22"/><stop offset=".5" stop-color="${colour}" stop-opacity=".05"/><stop offset="1" stop-color="${colour}" stop-opacity="0"/></linearGradient>
<pattern id="${id}-dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#fff" fill-opacity=".055"/></pattern>
<linearGradient id="${id}-panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1b25"/><stop offset="1" stop-color="#15151d"/></linearGradient>
<clipPath id="${id}-card"><rect width="${W}" height="${H}" rx="${rx}"/></clipPath>`,
    body: `<g clip-path="url(#${id}-card)"><rect width="${W}" height="${H}" fill="${D.ground}"/><rect width="${DW}" height="${H}" fill="url(#${id}-dots)"/><rect width="${DW}" height="${H}" fill="url(#${id}-wash)"/>${
      controls ? `<rect x="${DW}" width="${controls}" height="${H}" fill="url(#${id}-panel)"/><path d="M${DW + 0.5} 0V${H}" stroke="#fff" stroke-opacity=".07"/>` : ''
    }</g><rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="${rx - 0.5}" fill="none" stroke="#fff" stroke-opacity=".09"/>`,
  }
}

/** Fades and lifts a line into place as it changes: the news of the moment. */
function arrive(inner: string, delay = 0) {
  return `<g opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${delay}s" dur="0.4s" fill="freeze"/><animateTransform attributeName="transform" type="translate" from="0 5" to="0 0" begin="${delay}s" dur="0.45s" fill="freeze" ${EASE}/>${inner}</g>`
}

// ---------------------------------------------------------------------------
// Words

/** How wide a kicker sets: capitals, tracked. */
const kickerWidth = (words: string) => words.length * (10.5 * 0.66 + 1.5)

/** A kicker cut to its room: the part after the last dot goes first. */
function fitKicker(words: string, px: number) {
  if (kickerWidth(words) <= px) return words
  const head = words.split(' · ')[0] as string
  if (kickerWidth(head) <= px) return head
  return fit(head, Math.max(4, Math.floor(px / (10.5 * 0.66 + 1.5))))
}

/** The kicker: who does what, in tracked capitals, in the mover's colour. */
function kicker(x: number, y: number, words: string, colour: string) {
  return `<text x="${x}" y="${y}" font-size="10.5" font-weight="750" letter-spacing="1.5" fill="${colour}">${escape(words.toUpperCase())}</text>`
}

const VERB = /^(Reading|Searching|Listing|Running|Editing|Planning|Checking git:|Getting|Setting up|Handing|Waiting for)\s+(.+)$/

/** The headline: "Reading <file>" sets the verb quiet and the file in mono; Codex's own words go in quotes. */
function headline(x: number, y: number, maxW: number, text: string, o: { thought?: boolean; size?: number; colour?: string; quote?: string } = {}) {
  const size = o.size ?? 19
  if (o.thought) {
    const q = o.quote ?? D.codex
    const said = fit(text, room(maxW - 18, size * 0.88))
    return `<text x="${x}" y="${y}" font-size="${n1(size * 0.88)}" font-weight="560" fill="${o.colour ?? '#ebe8ff'}"><tspan fill="${q}" font-weight="800">“</tspan>${escape(said)}<tspan fill="${q}" font-weight="800">”</tspan></text>`
  }
  const m = VERB.exec(text)
  if (m && /[./\\]|^[\w-]+$/.test(m[2] as string)) {
    const verb = m[1] as string
    const vw = width(verb, size) + size * 0.42
    const what = fit(m[2] as string, room(maxW - vw, size * 0.86, true))
    return `<text x="${x}" y="${y}" font-size="${size}" font-weight="500" fill="#fff" fill-opacity=".5">${escape(verb)}</text><text x="${n1(x + vw)}" y="${y}" font-size="${n1(size * 0.86)}" font-family="${MONO}" font-weight="650" fill="${o.colour ?? D.ink}">${escape(what)}</text>`
  }
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="720" letter-spacing="-.25" fill="${o.colour ?? D.ink}">${escape(fit(text, room(maxW, size)))}</text>`
}

/** A long line over two, cut at a word. */
function twoLines(text: string, perLine: number): [string, string?] {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= perLine) return [t]
  let cut = t.lastIndexOf(' ', perLine)
  if (cut < perLine * 0.5) cut = perLine
  return [t.slice(0, cut).trim(), fit(t.slice(cut).trim(), perLine)]
}

/** The facts line: a small progress rail first when there is one, then facts with soft dots between. */
function facts(x: number, y: number, maxW: number, items: (string | [string, string])[], progress?: { steps: number; current: number; label: string; colour: string; live: boolean; id: string }) {
  let out = ''
  let at = x
  if (progress && progress.steps > 1) {
    const segW = Math.min(18, Math.max(10, 90 / progress.steps))
    for (let i = 0; i < progress.steps; i++) {
      const sx = at + i * (segW + 3)
      const done = i < progress.current
      const now = i === progress.current
      out += `<rect x="${n1(sx)}" y="${y - 7}" width="${n1(segW)}" height="5" rx="2.5" fill="${done || now ? progress.colour : '#fff'}" fill-opacity="${done ? 1 : now ? 0.35 : 0.12}"/>`
      if (now && progress.live) out += `<rect x="${n1(sx)}" y="${y - 7}" width="${n1(segW)}" height="5" rx="2.5" fill="${progress.colour}"><animate attributeName="opacity" values=".2;1;.2" dur="1.6s" repeatCount="indefinite"/></rect>`
    }
    at += progress.steps * (segW + 3) + 6
    const count = `${Math.min(progress.current + 1, progress.steps)}/${progress.steps}`
    const name = fit(progress.label, room(Math.min(maxW - (at - x), 240) - 30, 11.5))
    out += `<text x="${n1(at)}" y="${y}" font-size="11.5" fill="#fff" fill-opacity=".72"><tspan fill="${progress.colour}" font-weight="750">${count}</tspan><tspan dx="6">${escape(name)}</tspan></text>`
    at += width(count, 11.5) + width(name, 11.5) + 16
  }
  const start = at
  const parts: string[] = []
  for (const f of items) {
    const [text, colour] = Array.isArray(f) ? f : [f, '']
    if (!text) continue
    const w = width(text, 11.5) + 16
    if (at + w > x + maxW) break
    // A dot between facts, and before the first when the rail comes first.
    const dot = parts.length || start > x
    parts.push(`<tspan${dot && parts.length ? ' dx="8"' : ''}>${dot ? '<tspan fill-opacity=".35">•</tspan> ' : ''}<tspan${colour ? ` fill="${colour}" fill-opacity="1"` : ''}>${escape(text)}</tspan></tspan>`)
    at += w
  }
  if (parts.length) out += `<text x="${n1(start)}" y="${y}" font-size="11.5" fill="#fff" fill-opacity=".5">${parts.join('')}</text>`
  return out
}

/** The clock in the corner: a live dot (or quiet), the time counting by itself. */
function clockCorner(right: number, y: number, r: { clock?: number; time: string; stalled?: boolean; live: boolean; id: string; label?: string }) {
  const clockW = 4 * 13 * 0.62 + 6
  const dot = r.stalled ? D.warn : r.live ? D.good : '#fff'
  const word = r.label ?? (r.stalled ? 'quiet' : r.live ? 'live' : '')
  const ww = word.length * 7.2 + 4
  return (
    (word
      ? `<circle cx="${n1(right - clockW - ww - 10)}" cy="${y - 4}" r="3" fill="${dot}"${r.live || r.stalled ? '' : ' fill-opacity=".5"'}>${r.live ? '<animate attributeName="opacity" values="1;.25;1" dur="1.6s" repeatCount="indefinite"/>' : ''}</circle><text x="${n1(right - clockW - ww - 3)}" y="${y}" font-size="10" font-weight="700" letter-spacing="1" fill="${dot}" fill-opacity="${r.live || r.stalled ? 0.9 : 0.45}">${escape(word.toUpperCase())}</text>`
      : '') +
    (r.clock !== undefined
      ? liveClock(r.clock, right, y, { size: 13, colour: D.ink, weight: 650, anchor: 'end', id: `${r.id}-clock` })
      : `<text x="${right}" y="${y}" text-anchor="end" font-size="13" font-weight="650" fill="${D.ink}">${escape(r.time)}</text>`)
  )
}

// ---------------------------------------------------------------------------
// The stage: the floor, the two of them, the spotlight, the beads

/** One step of the work, as a bead on the floor. */
export type Bead = {
  kind: 'Read' | 'Search' | 'Run' | 'Edit' | 'Note' | 'Think' | 'Git' | 'List' | 'Plan' | 'claude' | 'you' | 'finding' | 'ticket' | 'answer'
  label?: string
  /** A finding's weight, which colours it. */
  severity?: 'high' | 'medium' | 'low'
  /** A step of Claude's own (its tools, while Codex works): Claude's colour, on Claude's side of the floor. */
  claude?: boolean
}

const GLYPH: Record<Bead['kind'], string> = {
  Read: '<path d="M-3.2 -4.2h4.2l2.4 2.4v6h-6.6z" fill="none" stroke-width="1.3" stroke-linejoin="round"/><path d="M-1.6 .2h3.4M-1.6 2.2h3.4" stroke-width="1.2" stroke-linecap="round"/>',
  Search: '<circle cx="-.8" cy="-.8" r="2.9" fill="none" stroke-width="1.4"/><path d="M1.4 1.4l2.4 2.4" stroke-width="1.5" stroke-linecap="round"/>',
  Run: '<path d="M-3.6 -2.6l2.4 2.2-2.4 2.2" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M.4 2.6h3.4" stroke-width="1.4" stroke-linecap="round"/>',
  Edit: '<path d="M-3.4 3.4l.5-2.1 4.6-4.6a.8.8 0 0 1 1.1 0l.5.5a.8.8 0 0 1 0 1.1l-4.6 4.6z" fill="none" stroke-width="1.2" stroke-linejoin="round"/>',
  Note: '<path d="M-3.4 .6c0-2 1-3 2.4-3.4M.6 .6c0-2 1-3 2.4-3.4" fill="none" stroke-width="1.4" stroke-linecap="round"/><circle cx="-2.2" cy="1.6" r="1.3"/><circle cx="1.8" cy="1.6" r="1.3"/>',
  Think: '<circle cx="-2.4" cy="0" r="1.1"/><circle cx="0" cy="0" r="1.1"/><circle cx="2.4" cy="0" r="1.1"/>',
  Git: '<circle cx="-2" cy="-2.6" r="1.3" fill="none" stroke-width="1.2"/><circle cx="-2" cy="2.8" r="1.3" fill="none" stroke-width="1.2"/><circle cx="2.4" cy="-.6" r="1.3" fill="none" stroke-width="1.2"/><path d="M-2 -1.3v2.8M2.4 .7c0 1.4-1.4 1.8-3.2 2" fill="none" stroke-width="1.2"/>',
  List: '<path d="M-3.4 -2.6h6.8M-3.4 0h6.8M-3.4 2.6h4.4" stroke-width="1.3" stroke-linecap="round"/>',
  Plan: '<path d="M-3.6 -2.2l1 1 1.6-1.8M-3.6 2l1 1 1.6-1.8M.8 -1.6h3M.8 2.6h3" fill="none" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
  claude: '<rect x="-3.6" y="-2.6" width="7.2" height="5.2" rx=".8" fill="none" stroke-width="1.2"/><path d="M-3.6 -2.6L0 .4l3.6-3" fill="none" stroke-width="1.2" stroke-linejoin="round"/>',
  you: '<rect x="-3.6" y="-2.6" width="7.2" height="5.2" rx=".8" fill="none" stroke-width="1.2"/><path d="M-3.6 -2.6L0 .4l3.6-3" fill="none" stroke-width="1.2" stroke-linejoin="round"/>',
  finding: '',
  ticket: '<circle r="4.4" fill="none" stroke-width="1.3"/><path d="M-1.5 -1.2a1.6 1.6 0 1 1 2.2 1.5c-.6.3-.7.6-.7 1.1" fill="none" stroke-width="1.2" stroke-linecap="round"/><circle cx="0" cy="2.9" r=".6"/>',
  answer: '<path d="M-3.4 .2l2.1 2.1 4.6-4.8" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
}

const SEV = { high: D.bad, medium: D.warn, low: D.dim } as const

function beadColour(b: Bead) {
  if (b.claude) return D.claude
  return b.kind === 'claude' || b.kind === 'ticket' || b.kind === 'answer' ? D.claude : b.kind === 'you' ? D.you : b.kind === 'finding' ? SEV[b.severity ?? 'low'] : D.codex
}

function beadBody(b: Bead, r: number) {
  const c = beadColour(b)
  if (b.kind === 'finding') return `<circle r="${r}" fill="${c}" fill-opacity=".2" stroke="${c}" stroke-width="1.5"/><text y="3.4" text-anchor="middle" font-size="${n1(r * 0.95)}" font-weight="800" fill="${c}">${escape(b.label ?? '')}</text>`
  return `<circle r="${r}" fill="${D.ground}"/><circle r="${r}" fill="${c}" fill-opacity=".18" stroke="${c}" stroke-opacity=".85" stroke-width="1.3"/><g stroke="${c}" fill="${c}">${GLYPH[b.kind]}</g>`
}

/** A chip's words: a file's name, a search, a command; whole, unless it is very long. Notes go by icon. */
function chipText(b: Bead) {
  if (b.kind === 'ticket') return 'for Claude'
  if (b.kind === 'answer') return 'answered'
  if (!b.label || b.kind === 'Note' || b.kind === 'Think' || b.kind === 'Plan' || b.kind === 'claude' || b.kind === 'you') return ''
  const t = b.label.split('\\').join('/').trim()
  const name = b.kind === 'Read' || b.kind === 'Edit' || b.kind === 'List' ? (t.split('/').filter(Boolean).pop() ?? t) : b.kind === 'Run' ? t.split(/\s+/).slice(0, 2).join(' ') : t
  return name.length > 22 ? `${name.slice(0, 21)}…` : name
}

/** A short name for a bead's label: a file's name, a command's first word. */
function beadLabel(b: Bead) {
  // Codex's own words and notes go by their icon alone: a sentence cut short reads as noise.
  if (!b.label || b.kind === 'finding' || b.kind === 'Note' || b.kind === 'Think' || b.kind === 'Plan' || b.kind === 'claude' || b.kind === 'you') return ''
  const t = b.label.replace(/\\/g, '/')
  const name = b.kind === 'Read' || b.kind === 'Edit' ? (t.split('/').filter(Boolean).pop() ?? t) : t
  return fit(name, 15)
}

/**
 * A speech bubble beside whoever speaks, its tail toward them: three typing
 * dots, then the words typing themselves in.
 */
function bubble(text: string, x: number, y: number, o: { side: 'left' | 'right'; tint: string; begin: number; room: number; id: string }) {
  const size = 11.5
  const words = fit(text.replace(/\s+/g, ' ').trim(), Math.max(6, Math.floor((o.room - 24) / (size * 0.53))))
  const w = Math.round(Math.max(44, words.length * size * 0.53 + 24))
  const h = 24
  // `side`: which side of the speaker the bubble opens on.
  const bx = o.side === 'right' ? x : x - w
  const tail = o.side === 'right' ? `M${bx + 1} ${y + 3}L${bx - 7} ${y + 9}L${bx + 1} ${y + 9}Z` : `M${bx + w - 1} ${y + 3}L${bx + w + 7} ${y + 9}L${bx + w - 1} ${y + 9}Z`
  const b = o.begin
  const dots = [0, 1, 2].map(i => `<circle cx="${n1(bx + w / 2 - 7 + i * 7)}" cy="${y}" r="2" fill="#fff" fill-opacity=".6"><animate attributeName="cy" values="${y};${y - 2.5};${y}" dur=".6s" begin="${(i * 0.12).toFixed(2)}s" repeatCount="indefinite"/></circle>`).join('')
  const body =
    `<path d="${tail}" fill="#262632" stroke="${o.tint}" stroke-opacity=".55" stroke-linejoin="round"/>` +
    `<rect x="${bx}" y="${y - h / 2}" width="${w}" height="${h}" rx="12" fill="#262632" stroke="${o.tint}" stroke-opacity=".55"/>` +
    `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.1;.8;1" begin="${b.toFixed(2)}s" dur=".65s" fill="freeze"/>${dots}</g>` +
    `<clipPath id="${o.id}"><rect x="${bx + 8}" y="${y - h / 2}" width="0" height="${h}"><animate attributeName="width" from="0" to="${w - 14}" begin="${(b + 0.6).toFixed(2)}s" dur="${Math.min(0.9, 0.25 + words.length * 0.025).toFixed(2)}s" fill="freeze"/></rect></clipPath>` +
    `<text x="${bx + 12}" y="${y + 4}" font-size="${size}" font-weight="620" fill="${D.ink}" clip-path="url(#${o.id})">${escape(words)}</text>`
  const ox = o.side === 'right' ? bx - 7 : bx + w + 7
  return `<g transform="translate(${n1(ox)} ${y + 9})"><g opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${b.toFixed(2)}s" dur=".12s" fill="freeze"/><animateTransform attributeName="transform" type="scale" values=".4;1.08;1" keyTimes="0;.6;1" begin="${b.toFixed(2)}s" dur=".32s" fill="freeze"/><g transform="translate(${n1(-ox)} ${-(y + 9)})">${body}</g></g></g>`
}

export type Stage = {
  actor: Actor
  codexSprite?: Sprite
  claudeMood?: ClawdMood
  /** The person sits in Claude's place (they started it from the pane). */
  you?: boolean
  /** The steps so far, oldest first; the newest pops out of Codex. */
  beads?: Bead[]
  /** Work goes on: beads slide, the spotlight breathes. Still while blocked. */
  live?: boolean
  /** A question waits on the floor for Claude; the person's OK; a note on its way. */
  waiting?: 'ask' | 'permit'
  note?: 'toCodex' | 'toClaude' | 'both'
  /** Findings land one by one rather than the newest alone. */
  landing?: boolean
  party?: boolean
  verdictColour?: string
  /** What they say as it lands: Codex first, then Claude. */
  banter?: Banter
  /** Codex thinks aloud: dots over it. */
  thinking?: boolean
  /** Gone quiet: a sweat drop and a slow sway. */
  stalled?: boolean
  /** Nothing runs: now and then one tosses the other a note. */
  idle?: boolean
  /** Claude's own recent steps while Codex works: from Claude's end of the floor, toward the middle. */
  claudeBeads?: Bead[]
}

/**
 * The floor across the card's foot, Claude standing at its left end and
 * Codex at its right, the spotlight on the mover, and between them the beads.
 */
function stage(s: Stage, x0: number, x1: number, floor: number, id: string) {
  const colour = actorColour(s.actor)
  const lx = x0 + 32
  const rx = x1 - 36
  const u = 3.1
  let out = ''

  // The spotlight: a soft cone from above onto whoever has the move, and its pool on the floor.
  const spots = s.actor === 'both' ? [lx, rx] : [s.actor === 'codex' ? rx : lx]
  const spotW = 54
  out += `<defs><linearGradient id="${id}-cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${colour}" stop-opacity="0"/><stop offset="1" stop-color="${colour}" stop-opacity=".2"/></linearGradient><radialGradient id="${id}-pool"><stop offset="0" stop-color="${colour}" stop-opacity=".5"/><stop offset="1" stop-color="${colour}" stop-opacity="0"/></radialGradient>
<linearGradient id="${id}-floor" x1="${lx}" x2="${rx}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${s.you ? D.you : D.claude}" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="${D.codex}" stop-opacity=".55"/></linearGradient></defs>`
  for (const spotX of spots)
    out += `<g><path d="M${n1(spotX - 10)} 0L${n1(spotX + 10)} 0L${n1(spotX + spotW)} ${floor}L${n1(spotX - spotW)} ${floor}Z" fill="url(#${id}-cone)">${s.live ? `<animate attributeName="opacity" values=".75;1;.75" dur="3s" repeatCount="indefinite"/>` : ''}</path><ellipse cx="${n1(spotX)}" cy="${floor}" rx="${n1(spotW)}" ry="7" fill="url(#${id}-pool)"/></g>`

  // The floor itself.
  out += `<path d="M${x0} ${floor}H${x1}" stroke="url(#${id}-floor)" stroke-width="1.5"/>`

  // Claude (or the person) on the left, Codex on the right; the one without the move a little back.
  const claudeBack = s.actor === 'codex' || s.actor === 'you'
  const codexBack = s.actor === 'claude' || s.actor === 'you'
  // Clawd always stands at the left (the person's moves are told by the amber light and what waits on the floor).
  const claudeFig = clawd(lx, floor - 5 * u - 1, u, s.claudeMood ?? (claudeBack ? 'watch' : 'idle'))
  const youFig = ''
  const codexSize = 62
  const codexFig = s.codexSprite ? codexSprite(s.codexSprite, rx, floor - codexSize * 0.46, codexSize) : codexAvatar(rx, floor - 17, 15)
  out += `<ellipse cx="${lx}" cy="${floor + 1}" rx="24" ry="3" fill="#000" opacity=".5"/><ellipse cx="${rx}" cy="${floor + 1}" rx="22" ry="3" fill="#000" opacity=".5"/>`
  // A little life: Codex bobs at its work; on a win both hop, twice, as the result lands.
  const hop = (begin: number) => `<animateTransform attributeName="transform" type="translate" values="0 0;0 -13;0 0" keyTimes="0;.45;1" begin="${begin}s" dur="0.5s" repeatCount="2" fill="freeze" calcMode="spline" keySplines=".2 .7 .4 1;.5 0 .8 .4"/>`
  const bob = `<animateTransform attributeName="transform" type="translate" values="0 0;0 -2.5;0 0" dur="1.3s" repeatCount="indefinite" calcMode="spline" keyTimes="0;.5;1" keySplines=".4 0 .6 1;.4 0 .6 1"/>`
  // Handing over a new step: a quick hop as the chip leaves its hands.
  const handoff = `<animateTransform attributeName="transform" type="translate" values="0 0;0 -7;0 0" keyTimes="0;.4;1" dur="0.4s" fill="freeze" calcMode="spline" keySplines=".2 .7 .4 1;.5 0 .8 .4"/>`
  const sway = `<animateTransform attributeName="transform" type="rotate" values="-3 ${rx} ${floor};3 ${rx} ${floor};-3 ${rx} ${floor}" dur="3.2s" repeatCount="indefinite"/>`
  const codexMove = s.party ? hop(0.7) : s.stalled ? sway : s.live && s.actor !== 'claude' ? bob : ''
  const codexHop = s.live && !s.party && (s.beads?.length ?? 0) > 0 ? handoff : ''
  out += youFig
  out += `<g opacity="${claudeBack ? 0.62 : 1}"><g>${s.party ? hop(0.55) : ''}${claudeFig}</g></g><g opacity="${codexBack ? 0.62 : 1}"><g>${codexMove}<g>${codexHop}${codexFig}</g></g></g>`
  // Thinking: three dots rising in a bubble over Codex.
  if (s.thinking && !s.stalled) {
    const bx = rx + 20
    const by = floor - 66
    out += `<g transform="translate(${bx} ${by})"><circle cx="-14" cy="16" r="2.4" fill="#2a2a38" stroke="${D.codex}" stroke-opacity=".5"/><rect x="-12" y="-9" width="30" height="18" rx="9" fill="#2a2a38" stroke="${D.codex}" stroke-opacity=".5"/>${[0, 1, 2]
      .map(i => `<circle cx="${-3 + i * 7}" cy="0" r="2.2" fill="${D.codex}"><animate attributeName="cy" values="0;-2.6;0" dur=".9s" begin="${(i * 0.15).toFixed(2)}s" repeatCount="indefinite"/><animate attributeName="opacity" values=".4;1;.4" dur=".9s" begin="${(i * 0.15).toFixed(2)}s" repeatCount="indefinite"/></circle>`)
      .join('')}</g>`
  }
  // Gone quiet: a sweat drop sliding down Codex's side.
  if (s.stalled) out += `<path d="M${rx + 18} ${floor - 52}q3 5 0 7q-3-2 0-7z" fill="#7dd3fc"><animateTransform attributeName="transform" type="translate" values="0 0;0 10" dur="1.6s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;0" dur="1.6s" repeatCount="indefinite"/></path>`
  // Idle: every so often one tosses the other a note, which the other catches.
  if (s.idle) {
    const arc = (from: number, to: number, begin: number, tint: string) =>
      `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.1;.9;1" dur="1.4s" begin="${begin}s" fill="freeze"/><animateMotion path="M${from} ${floor - 30}Q${(from + to) / 2} ${floor - 78} ${to} ${floor - 30}" dur="1.4s" begin="${begin}s" fill="freeze" ${EASE}/><g><animateTransform attributeName="transform" type="rotate" values="0;360" dur="1.4s" begin="${begin}s" fill="freeze"/><rect x="-6" y="-4" width="12" height="8" rx="1.5" fill="${D.ink}"/><circle cx="3.8" cy="2.2" r="1.6" fill="${tint}"/></g></g>`
    out += arc(lx + 22, rx - 24, 1.2, D.claude) + arc(rx - 24, lx + 22, 4.2, D.codex)
  }

  // The person's place: over Claude, a call for them.
  if (s.waiting === 'permit') {
    const gate = lx + 78
    out += `<g transform="translate(${gate} ${floor})"><g><animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0" dur="1.8s" repeatCount="indefinite"/><rect x="-13" y="-30" width="26" height="22" rx="6" fill="${D.you}" fill-opacity=".18" stroke="${D.you}" stroke-width="1.5"/><path d="M-5.5 -30v-5a5.5 5.5 0 0 1 11 0v5" fill="none" stroke="${D.you}" stroke-width="1.8"/><circle cy="-19" r="2.4" fill="${D.you}"/></g><ellipse cy="1" rx="16" ry="2.2" fill="${D.you}" opacity=".35"/></g>`
    out += `<path d="M${gate + 22} ${floor - 4}H${rx - 34}" stroke="${D.you}" stroke-opacity=".5" stroke-dasharray="2 5"/>`
  }

  // A question: the envelope sits on the floor before Claude, sealed with a question mark, nudging it.
  if (s.waiting === 'ask') {
    const ex = lx + 74
    out += `<path d="M${ex + 16} ${floor - 9}H${rx - 34}" stroke="${D.codex}" stroke-opacity=".45" stroke-dasharray="2 5"/>`
    out += `<g transform="translate(${ex} ${floor - 9})"><g><animateTransform attributeName="transform" type="translate" values="0 0;-3 -2;0 0" dur="1.4s" repeatCount="indefinite"/><rect x="-11" y="-7.5" width="22" height="15" rx="2.5" fill="${D.ink}"/><path d="M-11 -7.5L0 1.5L11 -7.5" fill="none" stroke="${D.ground}" stroke-width="1.3" stroke-linejoin="round"/><circle cx="8" cy="5" r="6" fill="${D.codex}"/><text x="8" y="8.4" text-anchor="middle" font-size="9" font-weight="800" fill="${D.ground}">?</text></g></g>`
    out += `<g transform="translate(${rx + 18} ${floor - 70})"><g><animateTransform attributeName="transform" type="scale" values="0;1.15;1" keyTimes="0;.6;1" dur=".4s" fill="freeze"/><circle r="9" fill="${D.codex}"/><text y="4" text-anchor="middle" font-size="12" font-weight="800" fill="${D.ground}">?</text></g></g>`
  }

  // Claude's own steps, from its end toward the middle (newest nearest the middle), never past it.
  let claudeEnd = lx + 40
  if (s.claudeBeads?.length && !s.waiting) {
    const ch = 20
    const top = floor - ch - 3
    const limit = (lx + rx) / 2 - 10
    let at = lx + 42
    const placed: string[] = []
    for (const b of s.claudeBeads.slice(-4)) {
      const text = chipText(b)
      const w = text ? 24 + width(text, 10.5, true) + 8 : 22
      if (at + w > limit) break
      const newest = b === s.claudeBeads[s.claudeBeads.length - 1]
      placed.push(
        `<g opacity="${newest ? 1 : 0.7}"><rect x="${n1(at)}" y="${top}" width="${n1(w)}" height="${ch}" rx="${ch / 2}" fill="${D.claude}" fill-opacity="${newest ? 0.2 : 0.07}" stroke="${D.claude}" stroke-opacity="${newest ? 0.9 : 0.4}"/><g transform="translate(${n1(at + 11)} ${n1(top + ch / 2)}) scale(.95)" stroke="${D.claude}" fill="${D.claude}">${GLYPH[b.kind]}</g>${text ? `<text x="${n1(at + 22)}" y="${top + 14}" font-size="10.5" font-family="${MONO}" fill="#fff" fill-opacity="${newest ? 0.95 : 0.6}">${escape(text)}</text>` : ''}</g>`,
      )
      at += w + 6
    }
    out += placed.join('')
    claudeEnd = Math.max(claudeEnd, at + 8)
  }

  // The trail: each step a chip standing on the floor, its icon and its name inside, laid out
  // from Codex leftward by the room each really needs; what does not fit drops off the far end.
  const beads = s.beads ?? []
  if (beads.length && !s.waiting) {
    const ch = 20
    const top = floor - ch - 3
    const startX = rx - 44
    const endX = claudeEnd
    const chips: { b: Bead; x: number; w: number; text: string }[] = []
    let at = startX
    for (let i = beads.length - 1; i >= 0 && chips.length < 10; i--) {
      const b = beads[i] as Bead
      const text = chipText(b)
      const w = b.kind === 'finding' ? 30 : text ? 24 + width(text, 10.5, true) + 8 : 22
      if (at - w < endX) break
      at -= w
      chips.unshift({ b, x: at, w, text })
      at -= 6
    }
    const chip = (c: (typeof chips)[number], newest: boolean) => {
      const colour = beadColour(c.b)
      const cy = top + ch / 2
      if (c.b.kind === 'finding')
        return `<rect x="${n1(c.x)}" y="${top}" width="${c.w}" height="${ch}" rx="${ch / 2}" fill="${colour}" fill-opacity=".18" stroke="${colour}" stroke-width="1.3"/><text x="${n1(c.x + c.w / 2)}" y="${top + 14}" text-anchor="middle" font-size="10.5" font-weight="800" fill="${colour}">${escape(c.b.label ?? '')}</text>`
      return (
        `<rect x="${n1(c.x)}" y="${top}" width="${n1(c.w)}" height="${ch}" rx="${ch / 2}" fill="${newest ? colour : '#fff'}" fill-opacity="${newest ? 0.2 : 0.06}" stroke="${colour}" stroke-opacity="${newest ? 0.9 : 0.35}"/>` +
        `<g transform="translate(${n1(c.x + 11)} ${n1(cy)}) scale(.95)" stroke="${colour}" fill="${colour}">${GLYPH[c.b.kind]}</g>` +
        (c.text ? `<text x="${n1(c.x + 22)}" y="${top + 14}" font-size="10.5" font-family="${MONO}" font-weight="${newest ? 650 : 500}" fill="#fff" fill-opacity="${newest ? 0.95 : 0.6}">${escape(c.text)}</text>` : '')
      )
    }
    let rest = ''
    let newest = ''
    chips.forEach((c, i) => {
      const last = i === chips.length - 1
      if (s.landing) {
        const begin = (0.35 + i * 0.12).toFixed(2)
        rest += `<g opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${begin}s" dur=".15s" fill="freeze"/><animateTransform attributeName="transform" type="translate" values="0 -22;0 2;0 0" keyTimes="0;.7;1" begin="${begin}s" dur=".5s" fill="freeze"/>${chip(c, false)}</g>`
      } else if (last && s.live) {
        // The newest pops out of Codex and settles into its place; a ring marks the landing.
        newest = `<g opacity="0"><animate attributeName="opacity" from="0" to="1" dur=".2s" fill="freeze"/><animateTransform attributeName="transform" type="translate" from="${n1(rx - 20 - c.x)} -18" to="0 0" dur=".6s" fill="freeze" ${EASE}/>${chip(c, true)}</g>`
      } else {
        rest += `<g opacity="${n1(Math.max(0.45, 1 - (chips.length - 1 - i) * 0.08))}">${chip(c, last)}</g>`
      }
    })
    // Live, the older chips slide along by the newest one's room: the trail moves on.
    const shift = chips.length ? (chips[chips.length - 1] as (typeof chips)[number]).w + 6 : 0
    out += s.live && !s.landing && chips.length > 1 ? `<g><animateTransform attributeName="transform" type="translate" from="${n1(shift)} 0" to="0 0" dur=".6s" fill="freeze" ${EASE}/>${rest}</g>${newest}` : rest + newest
    // A faint pulse runs along the floor from Codex toward Claude while work goes on.
    if (s.live) out += `<circle cy="${floor}" r="2" fill="${colour}"><animate attributeName="cx" from="${rx - 30}" to="${lx + 30}" dur="2.8s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.9;0" dur="2.8s" repeatCount="indefinite"/></circle>`
  }

  // A note on its way along the floor.
  const envelope = (from: number, to: number, tint: string, begin = 0) =>
    `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.12;.85;1" dur="2.2s" begin="${begin}s" repeatCount="indefinite"/><animateMotion path="M${from} ${floor - 26}Q${(from + to) / 2} ${floor - 46} ${to} ${floor - 26}" dur="2.2s" begin="${begin}s" repeatCount="indefinite" ${EASE}/><rect x="-7" y="-4.6" width="14" height="9.2" rx="1.8" fill="${D.ink}"/><path d="M-7 -4.6L0 .8L7 -4.6" fill="none" stroke="${D.ground}" stroke-width="1.1" stroke-linejoin="round"/><circle cx="4.6" cy="2.6" r="1.9" fill="${tint}"/></g>`
  if (s.note === 'toCodex') out += envelope(lx + 20, rx - 22, s.you ? D.you : D.claude)
  if (s.note === 'toClaude') out += envelope(rx - 22, lx + 20, D.codex)
  if (s.note === 'both') out += envelope(lx + 20, rx - 22, D.claude) + envelope(rx - 22, lx + 20, D.codex, 1.1)

  if (s.banter) {
    const half = (rx - lx) / 2 - 40
    out += bubble(s.banter.codex, rx - 40, floor - 36, { side: 'left', tint: D.codex, begin: 0.95, room: half, id: `${id}-says` })
    if (s.banter.claude) out += bubble(s.banter.claude, lx + 36, floor - 36, { side: 'right', tint: s.you ? D.you : D.claude, begin: 2.05, room: half, id: `${id}-answers` })
  }
  if (s.party) out += confetti((lx + rx) / 2, floor - 30, 0.5, [s.verdictColour ?? D.good, D.claude, D.codex, '#ffd54a', D.ink])
  return out
}

// ---------------------------------------------------------------------------
// The band: one job, large

export const DUET_HERO_HEIGHT = 144
export const DUET_TALL_HEIGHT = 170

export type DuetHero = BandHero & { beads?: Bead[]; claudeBeads?: Bead[]; askedAgo?: string; checks?: string; controls?: number; ref?: string }

function actorOf(r: BandHero): Actor {
  if (r.permit) return 'you'
  if (r.turn === 'claude' || r.asking) return 'claude'
  if (r.turn === 'both') return 'both'
  return 'codex'
}

function kickerOf(r: BandHero, actor: Actor) {
  if (r.permit) return 'Needs your OK'
  if (r.asking) return 'Codex asks Claude · paused'
  if (r.queued) return 'Codex · queued'
  if (r.stalled) return 'Codex · gone quiet'
  if (actor === 'claude') return `Claude's turn · ${r.headline}`
  if (actor === 'both') return `Both at work · ${r.headline}`
  return `${r.you ? 'Codex, for you' : 'Codex'} · ${r.headline}`
}

function progressOf(r: BandHero) {
  if (r.plan?.steps.length && r.kind !== 'image') {
    const steps = r.plan.steps
    const current = steps.findIndex(s => s !== 'done')
    return { steps: steps.length, current: current < 0 ? steps.length : current, label: r.plan.now ?? '' }
  }
  if (r.strip) return { steps: r.strip.labels.length, current: r.strip.current, label: r.strip.labels[r.strip.current] ?? r.strip.labels[r.strip.labels.length - 1] ?? '' }
  return undefined
}

/**
 * One job live on the band: who does what and how long (the kicker and the
 * clock), what is happening now (the headline), progress and facts, and the
 * stage under them. The band draws its Buttons over the panel on the right,
 * and a permission's answers in the middle of a tall one's floor.
 */
export function duetHeroSvg(r: DuetHero, width_: number) {
  const W = Math.round(Math.max(560, width_))
  const tall = Boolean(r.permit || r.asking)
  const H = tall ? DUET_TALL_HEIGHT : DUET_HERO_HEIGHT
  const controls = r.controls ?? BAND_CONTROLS
  const DW = W - controls
  const actor = actorOf(r)
  const colour = r.stalled ? D.warn : actorColour(actor)
  const id = idOf('hero', W, r.title, r.kind, actor)
  const live = !r.queued && !r.permit && !r.asking && !r.codexDone && !r.stalled
  const g = ground(id, W, H, colour, { controls, from: actor === 'codex' ? 'right' : 'left' })

  const x = 24
  const right = DW - 22
  const textW = right - x
  const clockRoom = 124
  const k = fitKicker(kickerOf(r, actor), textW - clockRoom)
  const kw = kickerWidth(k) + 10
  const titleRoom = textW - kw - clockRoom
  const line1 =
    kicker(x, 30, k, colour) +
    (titleRoom > 50 ? `<text x="${n1(x + kw)}" y="30" font-size="12" font-weight="560" fill="#fff" fill-opacity=".55">${escape(fit(r.title, room(titleRoom, 12)))}</text>` : '') +
    clockCorner(right, 30, { clock: r.clock, time: r.time, stalled: r.stalled, live, id, label: r.queued ? 'queued' : r.codexDone ? (r.timeLabel ?? 'waiting') : undefined })

  let line2 = ''
  let next = 82
  if (r.asking || r.permit) {
    const [a, b] = twoLines(r.doing.replace(/^🔒\s*/, ''), room(textW, 17))
    const q = (t: string, open: boolean, close: boolean) => `${open && r.asking ? `<tspan fill="${D.codex}" font-weight="800">“</tspan>` : ''}${escape(t)}${close && r.asking ? `<tspan fill="${D.codex}" font-weight="800">”</tspan>` : ''}`
    line2 = arrive(`<text x="${x}" y="58" font-size="17" font-weight="640" fill="${D.ink}">${q(a, true, !b)}</text>` + (b ? `<text x="${x}" y="80" font-size="17" font-weight="640" fill="${D.ink}">${q(b, false, true)}</text>` : ''))
    next = b ? 102 : 82
  } else {
    const what = r.codexDone || r.queued ? r.doing : r.doing || r.headline
    line2 = arrive(headline(x, 60, textW, what, { thought: r.thought, colour: r.stalled ? D.warn : undefined }))
  }

  let items: (string | [string, string])[] = []
  const async: [string, string][] = [
    ...(r.tickets ? [[`? ${r.tickets} question${r.tickets === 1 ? '' : 's'} for Claude · Codex carries on`, D.claude] as [string, string]] : []),
    ...(r.nextUp ? [[`⏭ ${r.nextUp} queued for the next round`, D.violet] as [string, string]] : []),
  ]
  if (r.asking) items = [[`Waiting for Claude's answer${r.askedAgo ? ` · asked ${r.askedAgo}` : ''}`, D.claude], 'Codex carries on once it has it']
  else if (r.permit) items = [['Codex waits for you', D.you], 'Allow it once, always for this site, or deny']
  else if (r.steer) {
    const who = r.steer.from === 'codex' ? 'Codex told Claude' : `${r.steer.from === 'claude' ? 'Claude' : 'You'} told Codex`
    items = [[`✉ ${who}: ${fit(r.steer.text, 70)}`, r.steer.from === 'codex' ? D.codex : r.steer.from === 'claude' ? D.claude : D.you]]
  } else if (r.growing && r.kind === 'task') items = [`${r.growing.files} file${r.growing.files === 1 ? '' : 's'} changed`, [`+${r.growing.added}`, D.good], [`−${r.growing.removed}`, D.bad], r.checks ?? '', r.codexModel]
  else
    items = [
      r.counts.files ? `${r.counts.files} file${r.counts.files === 1 ? '' : 's'} read` : '',
      r.counts.searches ? `${r.counts.searches} search${r.counts.searches === 1 ? '' : 'es'}` : '',
      r.counts.edits ? `${r.counts.edits} edit${r.counts.edits === 1 ? '' : 's'}` : '',
      r.scope ?? '',
      r.codexModel,
    ]
  if (async.length && !r.asking && !r.permit) items = [...async, ...items]
  const pr = r.asking || r.permit || async.length ? undefined : progressOf(r)
  const line3 = facts(x, next, textW, items, pr ? { ...pr, colour, live, id } : undefined)

  const floor = H - 16
  const scene = stage(
    {
      actor,
      codexSprite: r.codexSprite,
      claudeMood: r.claudeMood,
      you: r.you || r.permit,
      beads: r.beads,
      live,
      waiting: r.permit ? 'permit' : r.asking ? 'ask' : undefined,
      note: r.permit || r.asking ? undefined : r.toward === 'codex' ? 'toCodex' : r.toward === 'claude' ? 'toClaude' : r.toward === 'both' ? 'both' : undefined,
      thinking: live && actor === 'codex' && (r.thought || r.phase === 'thinking') && r.kind !== 'task',
      stalled: r.stalled,
      claudeBeads: r.claudeBeads,
    },
    14,
    DW - 14,
    floor,
    id,
  )

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${SANS}">
<defs>${g.defs}</defs>
${g.body}
<g clip-path="url(#${id}-card)">${scene}</g>
${line1}
${line2}
${line3}
</svg>`
}

// ---------------------------------------------------------------------------
// The band: several jobs, one row each

export const DUET_ROW_HEIGHT = 62

export function duetRowSvg(r: BandRow & { controls?: number }, width_: number) {
  const W = Math.round(Math.max(r.controls === 0 ? 260 : 480, width_))
  const H = DUET_ROW_HEIGHT
  const controls = r.controls ?? BAND_CONTROLS
  const DW = W - controls
  const actor: Actor = r.permit ? 'you' : r.asking || r.turn === 'claude' ? 'claude' : r.turn === 'both' ? 'both' : 'codex'
  const colour = r.stalled ? D.warn : actorColour(actor)
  const id = idOf('row', W, r.title, actor)
  const live = !r.queued && !r.permit && !r.asking && !r.stalled
  const g = ground(id, W, H, colour, { controls, rx: 14 })
  // The mover alone, standing on a short floor at the left.
  const fx = 36
  const floor = H - 12
  const who =
    actor === 'claude'
      ? clawd(fx, floor - 13, 2.6, r.claudeMood ?? 'think')
      : actor === 'you'
        ? `<g transform="translate(${fx} ${floor - 15})"><circle r="12" fill="${D.you}" fill-opacity=".2" stroke="${D.you}" stroke-width="1.4"/><circle cy="-3" r="3.6" fill="${D.you}"/><path d="M-6.6 7.4a6.6 5.6 0 0 1 13.2 0" fill="${D.you}"/></g>`
        : r.codexSprite
          ? codexSprite(r.codexSprite, fx, floor - 19, 40)
          : codexAvatar(fx, floor - 15, 13)
  const scene = `<ellipse cx="${fx}" cy="${floor - 2}" rx="26" ry="6" fill="${colour}" opacity=".25"/><path d="M12 ${floor}H62" stroke="${colour}" stroke-opacity=".5"/>${who}`
  const x = 76
  const right = DW - 18
  const textW = right - x
  const extra = [r.tickets ? `${r.tickets} for Claude` : '', r.nextUp ? `${r.nextUp} next` : ''].filter(Boolean).join(' · ')
  const k = fitKicker(r.permit ? 'Needs your OK' : r.asking ? 'Codex asks Claude' : r.stalled ? 'Gone quiet' : r.queued ? 'Queued' : extra ? `${r.tag} · ${extra}` : r.tag, textW - 124)
  const kw = kickerWidth(k) + 10
  const line1 = kicker(x, 25, k, colour) + `<text x="${n1(x + kw)}" y="25" font-size="12" font-weight="560" fill="#fff" fill-opacity=".55">${escape(fit(r.title, room(textW - kw - 124, 12)))}</text>` + clockCorner(right, 25, { clock: r.clock, time: r.time, stalled: r.stalled, live, id })
  const line2 = arrive(headline(x, 47, textW, r.asking || r.permit ? r.doing.replace(/^🔒\s*/, '') : r.doing, { thought: r.thought || r.asking, size: 14.5 }))
  const pulse = live ? `<rect x="0" y="${H - 2}" width="80" height="2" fill="${colour}" opacity=".8"><animate attributeName="x" from="-80" to="${DW}" dur="2.4s" repeatCount="indefinite"/></rect>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${SANS}">
<defs>${g.defs}</defs>
${g.body}
<g clip-path="url(#${id}-card)">${scene}${pulse}</g>
${line1}
${line2}
</svg>`
}

// ---------------------------------------------------------------------------
// The band: a result as it lands

export const DUET_RESULT_HEIGHT = 160

export type DuetResult = BandResult & { severities?: { high: number; medium: number; low: number }; ago?: string; findings?: { id: string; severity: 'high' | 'medium' | 'low' }[] }

/** Open findings by weight, as pills. */
function severityPills(x: number, y: number, sev: { high: number; medium: number; low: number }) {
  let at = x
  let out = ''
  for (const [key, colour] of [['high', D.bad], ['medium', D.warn], ['low', D.dim]] as const) {
    const count = sev[key]
    if (!count) continue
    const text = `${count} ${key}`
    // Bold, so wider than plain text sets: measured generously, so the word never runs out of its pill.
    const w = text.length * 11 * 0.64 + 26
    out += `<rect x="${n1(at)}" y="${y - 13}" width="${n1(w)}" height="19" rx="9.5" fill="${colour}" fill-opacity=".16"/><circle cx="${n1(at + 9.5)}" cy="${y - 3.5}" r="3" fill="${colour}"/><text x="${n1(at + 17)}" y="${y}" font-size="11" font-weight="700" fill="${colour}">${escape(text)}</text>`
    at += w + 6
  }
  return { svg: out, end: at }
}

export function duetResultSvg(r: DuetResult, width_: number) {
  const W = Math.round(Math.max(480, width_))
  const H = DUET_RESULT_HEIGHT
  const controls = r.controls ?? BAND_CONTROLS
  const DW = W - controls
  const colour = r.colour
  const id = idOf('result', W, r.title, r.stamp)
  const g = ground(id, W, H, colour, { controls })
  const good = r.kind === 'approve' || r.kind === 'approve_with_nits' || r.kind === 'task' || r.kind === 'task_applied'
  const failed = r.kind === 'failed' || r.kind === 'task_failed'

  const x = 24
  const right = DW - 22
  const textW = right - x
  const k = fitKicker(`${r.tag} · ${r.ago ?? 'just now'}`, textW / 2)
  const kw = kickerWidth(k) + 10
  const line1 = arrive(kicker(x, 30, k, colour) + `<text x="${n1(x + kw)}" y="30" font-size="12" font-weight="560" fill="#fff" fill-opacity=".55">${escape(fit(r.title, room(textW - kw, 12)))}</text>`, 0.05)
  // The verdict, large, stamped in; the gist beside it.
  const stampSize = 22
  const sw = width(r.stamp, stampSize) * 1.04 + 16
  const summary = r.summary ? fit(r.summary, room(textW - sw - 6, 13.5)) : ''
  const stamp = `<g transform="translate(${x} 62)"><g opacity="0"><animate attributeName="opacity" from="0" to="1" begin=".15s" dur=".1s" fill="freeze"/><animateTransform attributeName="transform" type="scale" values="1.6;.96;1" keyTimes="0;.7;1" begin=".15s" dur=".4s" fill="freeze"/>${
    r.moment === 'wobble' ? `<g><animateTransform attributeName="transform" type="rotate" values="0;-4;3;-1;0" begin=".55s" dur=".5s" fill="freeze"/>` : '<g>'
  }<text font-size="${stampSize}" font-weight="800" letter-spacing="-.4" fill="${colour}">${escape(r.stamp)}</text></g></g></g>`
  const line2 = stamp + (summary ? arrive(`<text x="${n1(x + sw)}" y="61" font-size="13.5" fill="#fff" fill-opacity=".8">${escape(summary)}</text>`, 0.45) : '')
  const pills = r.severities ? severityPills(x, 88, r.severities) : { svg: '', end: x }
  const rest = r.facts.filter(f => !/\bhigh$/.test(f))
  const line3 = arrive(pills.svg + facts(pills.end + (pills.svg ? 4 : 0), 88, right - pills.end, rest), 0.6)

  const floor = H - 16
  const beads: Bead[] = (r.findings ?? []).map(f => ({ kind: 'finding', label: f.id, severity: f.severity }))
  const scene = stage(
    {
      actor: 'both',
      codexSprite: r.codexSprite,
      claudeMood: r.claudeMood ?? (failed ? 'sad' : good ? 'happy' : 'nod'),
      beads,
      landing: true,
      banter: r.banter,
      party: r.moment === 'spark',
      verdictColour: colour,
    },
    14,
    DW - 14,
    floor,
    id,
  )

  const drawn = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${SANS}">
<defs>${g.defs}</defs>
${g.body}
<g clip-path="url(#${id}-card)"><rect width="${DW}" height="3" fill="${colour}" opacity=".9"/>${scene}</g>
${line1}
${line2}
${line3}
</svg>`
  return settle(drawn)
}

// ---------------------------------------------------------------------------
// The mark

/** "Claudex" as a wordmark: Claude's colour running into Codex's. */
export function wordmarkSvg(size = 15) {
  const w = Math.round(width('Claudex', size) * 1.12 + 4)
  const h = Math.round(size * 1.35)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${SANS}"><defs><linearGradient id="wm${size}" x1="0" x2="1"><stop offset="0" stop-color="${D.claude}"/><stop offset=".55" stop-color="${D.violet}"/><stop offset="1" stop-color="${D.codex}"/></linearGradient></defs><text x="1" y="${(size * 1.05).toFixed(1)}" font-size="${size}" font-weight="800" letter-spacing="-.3" fill="url(#wm${size})">Claudex</text></svg>`
}

export { CLAUDE, CODEX }

// ---------------------------------------------------------------------------
// The pane's hero: the project, what is going on, the two of them on the floor

export type PaneHero = {
  project: string
  /** Who has the move now, across this chat's work. */
  actor: Actor | 'idle'
  /** The big line: what is going on. */
  title: string
  /** One line of story under it. */
  story: string
  running: number
  needYou: number
  elsewhere: number
  usage?: { percent: number; window: string }
  codexSprite?: Sprite
  claudeMood?: ClawdMood
  beads?: Bead[]
  /** A win just landed: they cheer. */
  party?: boolean
  /** Codex's tool waits on the person's OK (the lock), rather than other things waiting on them. */
  permit?: boolean
  /** A poke: who was poked, and what they trade. */
  banter?: Banter
}

export const PANE_HERO_HEIGHT = 196

export function paneHeroSvg(h: PaneHero, width_: number) {
  const W = Math.max(300, Math.round(width_))
  const H = PANE_HERO_HEIGHT
  const actor: Actor = h.actor === 'idle' ? 'both' : h.actor
  const colour = h.actor === 'idle' ? D.violet : actorColour(h.actor)
  const id = idOf('pane', W, h.actor, h.title)
  const g = ground(id, W, H, colour, { rx: 18, from: h.actor === 'codex' ? 'right' : 'left' })
  const x0 = 22
  const xEnd = W - 22

  // Line one: the mark and project, the status on the right (the most important first; what does not fit goes).
  const mark = `<text x="${x0}" y="32" font-size="11" font-weight="800" letter-spacing="2.2"><tspan fill="${D.claude}">CLAUD</tspan><tspan fill="${D.codex}">EX</tspan><tspan fill="#fff" fill-opacity=".45" font-weight="650"> · ${escape(fit(h.project, 22).toUpperCase())}</tspan></text>`
  const status: [string, string][] = []
  if (h.needYou) status.push([`● ${h.needYou} NEED${h.needYou === 1 ? 'S' : ''} YOU`, D.you])
  if (h.running) status.push([`● ${h.running} RUNNING`, D.codex])
  if (h.elsewhere) status.push([`${h.elsewhere} IN OTHER CHATS`, D.dim])
  if (h.usage) status.push([`${h.usage.window.toUpperCase()} ${Math.round(h.usage.percent)}%`, h.usage.percent >= 90 ? D.bad : h.usage.percent >= 75 ? D.warn : D.dim])
  const headRoom = xEnd - x0 - (8 + h.project.length) * 9 - 10
  const wide = (list: [string, string][]) => list.reduce((w, [t]) => w + t.length * 8 + 14, 0)
  while (status.length && wide(status) > headRoom) status.pop()
  const spans = status
    .slice()
    .reverse()
    .map(([t, c], i) => `<tspan fill="${c}"${i ? ' dx="14"' : ''}>${escape(t)}</tspan>`)
    .join('')
  const right = status.length ? `<text x="${xEnd}" y="32" text-anchor="end" font-size="10.5" font-weight="750" letter-spacing="1.2">${spans}</text>` : ''

  // The big line and the story.
  const fs = Math.max(19, Math.min(30, (xEnd - x0) / (Math.max(8, h.title.length) * 0.55)))
  const title = arrive(`<text x="${x0 - 1}" y="${n1(46 + fs * 0.85)}" font-size="${n1(fs)}" font-weight="780" letter-spacing="-.6" fill="${D.ink}">${escape(fit(h.title, room(xEnd - x0, fs)))}</text>`)
  const story = arrive(`<text x="${x0}" y="${n1(46 + fs * 0.85 + 22)}" font-size="12.5" fill="#fff" fill-opacity=".58">${escape(fit(h.story, room(xEnd - x0, 12.5)))}</text>`, 0.12)

  const floor = H - 18
  const scene = stage(
    {
      actor,
      codexSprite: h.codexSprite,
      claudeMood: h.claudeMood,
      beads: h.beads,
      you: h.actor === 'you',
      idle: h.actor === 'idle',
      live: h.actor === 'codex' || h.actor === 'both',
      waiting: h.permit ? 'permit' : undefined,
      landing: h.actor === 'you' && !h.permit,
      banter: h.banter,
      party: h.party,
      verdictColour: D.good,
    },
    10,
    W - 10,
    floor,
    id,
  )
  const drawn = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${SANS}">
<defs>${g.defs}</defs>
${g.body}
<g clip-path="url(#${id}-card)">${scene}</g>
${mark}
${right}
${title}
${story}
</svg>`
  return h.actor === 'idle' || h.party || h.banter ? settle(drawn, 10) : drawn
}

// ---------------------------------------------------------------------------
// The card in the chat: the band's look at the card's width, with no panel

/** A round's card: live, it is the band's hero held still (the band plays it); landed, the result. */
export function duetCardSvg(s: CardStage & { clock?: number }, width_: number) {
  const W = Math.round(Math.max(420, width_))
  const tag = s.tag ?? (s.kind === 'task' ? 'Task' : s.kind === 'image' ? 'Picture' : 'Review')
  if (s.phase === 'done' || s.phase === 'failed') {
    const sev = s.severities
    const findings = s.findings?.slice(0, 9)
    const facts = [
      s.consensus ? `Claude agrees ${s.consensus.agree}/${s.consensus.total}` : '',
      s.diff ? `${s.diff.files} file${s.diff.files === 1 ? '' : 's'} +${s.diff.added} −${s.diff.removed}` : '',
      s.time,
      s.tokens ?? '',
      s.codexModel,
    ].filter(Boolean)
    return duetResultSvg(
      {
        tag,
        title: s.headline,
        stamp: s.stamp ?? (s.phase === 'failed' ? 'Could not finish' : 'Answered'),
        kind: s.phase === 'failed' ? 'failed' : s.moment === 'spark' ? 'approve' : 'answer',
        colour: s.stampColour ?? (s.phase === 'failed' ? D.bad : D.codex),
        moment: s.moment,
        facts,
        summary: s.sub,
        codexSprite: s.codexSprite,
        claudeMood: s.claudeMood,
        banter: s.banter,
        controls: 0,
        severities: sev && sev.high + sev.medium + sev.low ? sev : undefined,
        findings,
        ago: s.ref,
      },
      W,
    )
  }
  return duetHeroSvg(
    {
      tag,
      title: s.ref ?? '',
      doing: s.sub ?? s.headline,
      thought: s.subItalic,
      phase: s.phase === 'reading' ? 'reading' : s.phase === 'sending' ? 'sending' : 'thinking',
      time: s.time,
      elapsed: s.seconds ?? 0,
      clock: s.clock,
      strip: s.strip,
      you: s.you,
      codexSprite: s.codexSprite,
      claudeMood: s.claudeMood,
      family: s.family,
      turn: s.asking ? 'claude' : 'codex',
      plan: s.plan,
      steer: s.steer,
      asking: s.asking,
      permit: s.permit,
      kind: s.kind === 'image' ? 'image' : s.kind === 'task' ? 'task' : 'review',
      headline: s.headline,
      files: [],
      counts: { files: s.files, searches: s.searches, edits: s.edits },
      codexModel: s.codexModel,
      claudeModel: s.claudeModel,
      growing: s.growing,
      controls: 0,
    },
    W,
  )
}

// ---------------------------------------------------------------------------
// Motion: one policy for every scene

/** A clock's digit column (see liveClock): it must keep counting, whatever the motion policy. */
function isClock(attrs: string) {
  return /calcMode="discrete"/.test(attrs) && /attributeName="transform"/.test(attrs) && /dur="(10|60|600|6000)s"/.test(attrs)
}

/** How much a scene moves: all of it, a burst on each change then still (the default), or nothing but clocks. */
export type Motion = 'full' | 'calm' | 'still'

/**
 * A scene's loops under the motion policy. "calm" lets them run a few seconds
 * after each change (every new step, note or verdict draws the scene again,
 * so motion follows real events) and then rest; "still" stops them at once.
 * Clocks (discrete digit columns) are never stopped, a clock that stops lies;
 * nor are the mascots' own frames in "calm" (a sprite frozen mid-frame looks broken).
 */
export function moving(svg: string, motion: Motion = 'calm', seconds = 6) {
  if (motion === 'full') return svg
  if (motion === 'still') {
    return svg.replace(/<(animate|animateTransform|animateMotion|set)\b([^>]*?)(\/?)>/g, (all, tag: string, attrs: string, close: string) => {
      if (isClock(attrs)) return all
      const rest = attrs.replace(/\s(begin|repeatCount|repeatDur|fill)="[^"]*"/g, '')
      // Landed just short of its end (as continueAnimations does): an image that only ever saw an ended
      // animation never shows its frozen end state in Chromium, and the words it reveals stay invisible.
      const dur = Number(attrs.match(/\sdur="(\d*\.?\d+)s"/)?.[1] ?? Number.NaN)
      const begin = Number.isFinite(dur) && dur > 0 ? -Math.max(0, dur - 0.02) : 0
      return `<${tag}${rest} begin="${begin.toFixed(2)}s" repeatCount="1" fill="freeze"${close}>`
    })
  }
  return svg.replace(/<(animate|animateTransform|animateMotion)\b([^>]*?)\srepeatCount="indefinite"([^>]*?)(\/?)>/g, (all, tag: string, a: string, b: string, close: string) => {
    const attrs = a + b
    if (isClock(attrs)) return all
    // A mascot's own frames keep going: one frozen mid-step looks broken.
    if (/calcMode="discrete"/.test(attrs)) return all
    const dur = Number(attrs.match(/\sdur="(\d*\.?\d+)s"/)?.[1] ?? Number.NaN)
    if (!Number.isFinite(dur) || dur <= 0) return all
    const begin = Math.max(0, Number(attrs.match(/\sbegin="(-?\d*\.?\d+)s"/)?.[1] ?? 0))
    const count = Math.max(1, Math.ceil((seconds - begin) / dur))
    return `<${tag}${a} repeatCount="${count}"${/\sfill="/.test(attrs) ? '' : ' fill="freeze"'}${b}${close}>`
  })
}

// ---------------------------------------------------------------------------
// Status chips for list rows: tinted, ringed, the glyph in the status colour

export type RowChip = 'live' | 'approve' | 'approve_with_nits' | 'changes_needed' | 'rethink' | 'answer' | 'failed' | 'applied' | 'picture' | 'task' | 'task_live' | 'task_applied' | 'task_failed'

export function rowChipSvg(kind: RowChip, size = 22) {
  const c =
    kind === 'live'
      ? D.codex
      : kind === 'task' || kind === 'task_live'
        ? '#2dd4bf'
        : kind === 'failed' || kind === 'task_failed' || kind === 'rethink'
          ? D.bad
          : kind === 'applied' || kind === 'task_applied' || kind === 'approve' || kind === 'approve_with_nits'
            ? D.good
            : kind === 'picture'
              ? D.claude
              : kind === 'changes_needed'
                ? D.warn
                : D.codex
  const spin = `<circle cx="11" cy="11" r="6" fill="none" stroke="${c}" stroke-width="1.8" stroke-dasharray="9 29" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 11 11" to="360 11 11" dur="1.2s" repeatCount="indefinite"/></circle>`
  const tick = `<path d="M7 11.4l2.8 2.8 5.4-5.8" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
  const cross = `<path d="M8 8l6 6M14 8l-6 6" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`
  const glyph: Record<RowChip, string> = {
    live: spin,
    task_live: spin,
    approve: tick,
    approve_with_nits: tick,
    applied: tick,
    task_applied: tick,
    changes_needed: `<path d="M11 6.6v5.6" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/><circle cx="11" cy="15.4" r="1.3" fill="${c}"/>`,
    rethink: `<path d="M15 9.4a4.4 4.4 0 1 0 .4 3.8" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/><path d="M15.4 6.2v3.4H12" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
    answer: `<path d="M8.8 9a2.3 2.3 0 1 1 3.2 2.1c-.6.3-.9.7-.9 1.3v.5" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/><circle cx="11" cy="15.6" r="1.2" fill="${c}"/>`,
    failed: cross,
    task_failed: cross,
    task: `<path d="M8.8 7.8L6 11l2.8 3.2M13.2 7.8L16 11l-2.8 3.2" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
    picture: `<rect x="6" y="7" width="10" height="8" rx="1.6" fill="none" stroke="${c}" stroke-width="1.5"/><path d="M6.6 14.2l2.8-2.8 1.8 1.6 1.5-1.3 2.5 2.3" fill="none" stroke="${c}" stroke-width="1.4" stroke-linejoin="round"/>`,
  }
  const ground = kind.startsWith('task')
    ? `<rect x="1" y="1" width="20" height="20" rx="6.5" fill="${c}" fill-opacity=".16" stroke="${c}" stroke-opacity=".55"/>`
    : `<circle cx="11" cy="11" r="10" fill="${c}" fill-opacity=".16" stroke="${c}" stroke-opacity=".55"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 22 22">${ground}${glyph[kind]}</svg>`
}

// ---------------------------------------------------------------------------
// A conversation's journey: who moved, round by round, on two lanes

export type JourneyStep = { who: 'codex' | 'claude' | 'you' | 'done'; text: string }

export const JOURNEY_HEIGHT = 112

/**
 * Claude (and the person) on the upper lane, Codex on the lower: each move a
 * dot on its lane, joined in order, so the back-and-forth reads at a glance.
 * The newest moves get their words; older ones are dots.
 */
export function journeySvg(steps: JourneyStep[], width_: number) {
  const W = Math.max(280, Math.round(width_))
  const H = JOURNEY_HEIGHT
  const shown = steps.slice(-Math.max(3, Math.min(10, Math.floor((W - 40) / 40))))
  const earlier = steps.length - shown.length
  const x0 = earlier ? 44 : 20
  const x1 = W - 20
  const up = 42
  const down = 74
  const gap = shown.length > 1 ? (x1 - x0) / (shown.length - 1) : 0
  const colour = (w: JourneyStep['who']) => (w === 'codex' ? D.codex : w === 'you' ? D.you : w === 'done' ? D.good : D.claude)
  const yOf = (w: JourneyStep['who']) => (w === 'codex' ? down : w === 'done' ? (up + down) / 2 : up)
  const pts = shown.map((s, i) => ({ x: x0 + i * gap, y: yOf(s.who), s }))
  let out = `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="14" fill="${D.ground}" stroke="#fff" stroke-opacity=".08"/>`
  out += `<path d="M${x0 - 10} ${up}H${x1 + 10}" stroke="${D.claude}" stroke-opacity=".22" stroke-dasharray="2 4"/><path d="M${x0 - 10} ${down}H${x1 + 10}" stroke="${D.codex}" stroke-opacity=".22" stroke-dasharray="2 4"/>`
  if (earlier) out += `<text x="12" y="${(up + down) / 2 + 4}" font-size="10" font-weight="700" fill="#fff" fill-opacity=".45">+${earlier}</text>`
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as (typeof pts)[number]
    const b = pts[i] as (typeof pts)[number]
    out += `<path d="M${n1(a.x)} ${a.y}C${n1(a.x + gap / 2)} ${a.y} ${n1(b.x - gap / 2)} ${b.y} ${n1(b.x)} ${b.y}" fill="none" stroke="${colour(b.s.who)}" stroke-opacity=".6" stroke-width="1.6"/>`
  }
  // Words on two levels a lane, newest first, each only where it does not touch a neighbour's.
  const taken: Record<string, [number, number][]> = {}
  const order = pts.map((p, i) => ({ p, i })).reverse()
  const words: string[] = []
  for (const { p, i } of order) {
    const c = colour(p.s.who)
    const last = i === pts.length - 1
    const label = fit(p.s.text, 22)
    const w = label.length * 5.7 + 6
    const anchor = i === 0 ? 'start' : last ? 'end' : 'middle'
    const left = anchor === 'start' ? p.x : anchor === 'end' ? p.x - w : p.x - w / 2
    const above = p.s.who !== 'codex'
    for (const level of [0, 1]) {
      const key = `${above ? 'u' : 'd'}${level}`
      const spans = (taken[key] ??= [])
      if (spans.some(([a, b]) => left < b + 6 && left + w > a - 6)) continue
      spans.push([left, left + w])
      const ty = above ? p.y - 11 - level * 13 : p.y + 19 + level * 13
      words.push(`<text x="${n1(p.x)}" y="${ty}" text-anchor="${anchor}" font-size="10" font-weight="${last ? 700 : 500}" fill="${c}" fill-opacity="${last ? 1 : 0.85 - level * 0.15}">${escape(label)}</text>`)
      break
    }
  }
  pts.forEach((p, i) => {
    const c = colour(p.s.who)
    const last = i === pts.length - 1
    out += `<circle cx="${n1(p.x)}" cy="${p.y}" r="${last ? 5.5 : 4}" fill="${D.ground}" stroke="${c}" stroke-width="2"/>`
    if (last) out += `<circle cx="${n1(p.x)}" cy="${p.y}" r="2.4" fill="${c}"/>`
  })
  out += words.join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${SANS}">${out}</svg>`
}

// ---------------------------------------------------------------------------
// A job worked on together: its parts as chips on the stage's floor

export type JobStrip = {
  title: string
  time: string
  clock?: number
  parts: { state: 'queued' | 'codex' | 'claude' | 'done' | 'dropped' }[]
  codexSprite?: Sprite
  claudeMood?: ClawdMood
}

export const JOB_STRIP_HEIGHT = 124

export function jobStripSvg(j: JobStrip & { controls?: number }, width_: number) {
  const W = Math.round(Math.max(j.controls === 0 ? 280 : 480, width_))
  const H = JOB_STRIP_HEIGHT
  const controls = j.controls ?? BAND_CONTROLS
  const DW = W - controls
  const n = (s: JobStrip['parts'][number]['state']) => j.parts.filter(p => p.state === s).length
  const withCodex = n('codex')
  const withClaude = n('claude')
  const actor: Actor = withCodex && withClaude ? 'both' : withClaude ? 'claude' : 'codex'
  const colour = actorColour(actor)
  const id = idOf('job', W, j.title)
  const g = ground(id, W, H, colour, { controls, from: actor === 'codex' ? 'right' : 'left' })
  const x = 24
  const right = DW - 22
  const live = withCodex + withClaude > 0
  const line1 = kicker(x, 30, fitKicker(`Together · ${n('done')} of ${j.parts.length} done`, right - x - 130), colour) + clockCorner(right, 30, { clock: j.clock, time: j.time, live, id })
  const line2 = headline(x, 58, right - x, j.title, { size: 17 })
  const line3 = facts(x, 80, right - x, [
    withCodex ? [`${withCodex} with Codex`, D.codex] : '',
    withClaude ? [`${withClaude} with Claude`, D.claude] : '',
    n('queued') ? `${n('queued')} waiting` : '',
    n('dropped') ? [`${n('dropped')} dropped`, D.bad] : '',
  ])
  const floor = H - 14
  const beads: Bead[] = j.parts.map((p, i) =>
    p.state === 'done' ? { kind: 'answer', label: `${i + 1}` } : p.state === 'claude' ? { kind: 'claude', label: `part ${i + 1}` } : p.state === 'dropped' ? { kind: 'finding', label: `${i + 1}`, severity: 'high' } : { kind: 'Edit', label: `part ${i + 1}` },
  )
  const scene = stage({ actor, codexSprite: j.codexSprite, claudeMood: j.claudeMood ?? (withClaude ? 'busy' : 'watch'), beads, live }, 14, DW - 14, floor, id)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${SANS}">
<defs>${g.defs}</defs>
${g.body}
<g clip-path="url(#${id}-card)">${scene}</g>
${line1}
${line2}
${line3}
</svg>`
}

// ---------------------------------------------------------------------------
// The band at rest: the two of them, small, on a floor

export const MINI_STAGE = { width: 92, height: 34 }

export function miniStageSvg(o: { state: 'idle' | 'you' | 'working' | 'sleep'; codexSprite?: Sprite }) {
  const { width: W, height: H } = MINI_STAGE
  const floor = H - 4
  const colour = o.state === 'you' ? D.you : o.state === 'working' ? D.codex : D.violet
  const spot = o.state === 'you' ? 22 : o.state === 'working' ? 70 : -100
  const zz =
    o.state === 'sleep'
      ? `<text x="34" y="12" font-size="8" font-weight="800" fill="#fff" fill-opacity=".6">z<animate attributeName="y" values="14;6" dur="2.4s" repeatCount="3" fill="freeze"/><animate attributeName="opacity" values="0;1;0" dur="2.4s" repeatCount="3" fill="freeze"/></text>`
      : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><radialGradient id="mini-pool"><stop offset="0" stop-color="${colour}" stop-opacity=".55"/><stop offset="1" stop-color="${colour}" stop-opacity="0"/></radialGradient></defs>
<ellipse cx="${spot}" cy="${floor}" rx="20" ry="4" fill="url(#mini-pool)"/>
<path d="M4 ${floor}H${W - 4}" stroke="#fff" stroke-opacity=".14"/>
${clawd(22, floor - 9, 1.6, o.state === 'sleep' ? 'sleep' : o.state === 'working' ? 'watch' : 'idle')}
${o.codexSprite ? codexSprite(o.codexSprite, 70, floor - 15, 30) : codexAvatar(70, floor - 12, 10)}
${zz}
</svg>`
}

// ---------------------------------------------------------------------------
// Usage: one meter a window, as a card

export type UsageWindow = { name: string; percent: number; resets?: string }

export function usageCardSvg(o: { windows: UsageWindow[]; plan?: string; today?: string; reading?: string }, width_: number) {
  const W = Math.max(280, Math.round(width_))
  const row = 34
  const head = 34
  const H = head + Math.max(1, o.windows.length) * row + (o.today ? 22 : 10)
  const id = idOf('usage', W, o.windows.map(w => w.percent).join(','))
  const x0 = 18
  const x1 = W - 18
  let out = `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="14" fill="${D.ground}" stroke="#fff" stroke-opacity=".08"/>`
  out += kicker(x0, 24, `Codex usage${o.plan ? ` · ${o.plan}` : ''}`, D.violet)
  if (o.reading) out += `<text x="${x1}" y="24" text-anchor="end" font-size="10.5" fill="#fff" fill-opacity=".45">${escape(o.reading)}</text>`
  if (!o.windows.length) out += `<text x="${x0}" y="${head + 16}" font-size="12" fill="#fff" fill-opacity=".55">No reading yet: it comes with the next Codex run.</text>`
  o.windows.forEach((w, i) => {
    const y = head + i * row
    const p = Math.max(0, Math.min(100, w.percent))
    const c = p >= 90 ? D.bad : p >= 75 ? D.warn : D.good
    const barX = x0 + 74
    const barW = Math.max(60, x1 - barX - 56)
    const pct = p < 10 ? p.toFixed(1).replace(/\.0$/, '') : String(Math.round(p))
    out += `<text x="${x0}" y="${y + 12}" font-size="11" font-weight="700" fill="#fff" fill-opacity=".8">${escape(w.name)}</text>`
    if (w.resets) out += `<text x="${x0}" y="${y + 25}" font-size="9.5" fill="#fff" fill-opacity=".42">${escape(w.resets)}</text>`
    out += `<rect x="${barX}" y="${y + 5}" width="${barW}" height="8" rx="4" fill="#fff" fill-opacity=".08"/>`
    out += `<linearGradient id="${id}-g${i}" x1="0" x2="1"><stop offset="0" stop-color="${c}" stop-opacity=".55"/><stop offset="1" stop-color="${c}"/></linearGradient>`
    out += `<rect x="${barX}" y="${y + 5}" width="${n1(Math.max(4, (barW * p) / 100))}" height="8" rx="4" fill="url(#${id}-g${i})"><animate attributeName="width" from="0" to="${n1(Math.max(4, (barW * p) / 100))}" dur=".8s" fill="freeze" ${EASE}/></rect>`
    out += `<text x="${x1}" y="${y + 13}" text-anchor="end" font-size="13" font-weight="750" fill="${c}">${pct}%</text>`
  })
  if (o.today) out += `<text x="${x0}" y="${H - 8}" font-size="10.5" fill="#fff" fill-opacity=".5">${escape(o.today)}</text>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${SANS}">${out}</svg>`
}
