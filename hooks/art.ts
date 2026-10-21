// The pictures of the Codex mod, drawn as SVG so they look the same on every
// theme: a small dark stage where Claude (or you) and Codex work together,
// one scene per kind of request (a review, a task, a picture), plus status
// chips, usage gauges and the Claude-and-Codex mark. Each is drawn at the size
// it is shown, never scaled down. The stage is interactive so its SMIL
// animation runs; the rest are plain images.

export const CLAUDE = '#D97757'
export const CODEX = '#8B93F8'
export const GOOD = '#3fb950'
export const WARN = '#d4a72c'
/** Tasks: Codex writing code in its own copy of the repo, apart from Codex talking (its blue). */
export const BUILD = '#2FB7A6'

/** What a job is: a conversation (Codex reads and answers) or a task (Codex writes code). */
export type Family = 'talk' | 'build'

/** A family's colour: Codex's blue for a conversation, the build teal for a task. */
export function familyColour(family: Family | undefined) {
  return family === 'build' ? BUILD : CODEX
}

/**
 * A task's ground: faint blueprint squares and a build-coloured edge along
 * the top, so a job where Codex writes code never looks like a conversation.
 */
function buildGround(id: string, W: number, H: number) {
  return `<pattern id="${id}-grid" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M14 0H0V14" fill="none" stroke="${BUILD}" stroke-opacity="0.12"/></pattern><rect width="${W}" height="${H}" fill="url(#${id}-grid)"/><rect width="${W}" height="2.5" fill="${BUILD}" opacity="0.9"/>`
}

/** The part of the day, by the local hour: it tints the top of every card. */
export type Sky = 'dawn' | 'day' | 'dusk' | 'night'

export function skyOf(hour = new Date().getHours()): Sky {
  if (hour >= 5 && hour < 8) return 'dawn'
  if (hour >= 8 && hour < 17) return 'day'
  if (hour >= 17 && hour < 21) return 'dusk'
  return 'night'
}

const SKY_TINT: Record<Sky, [string, number]> = { dawn: ['#7a4658', 0.42], day: ['#24507a', 0.36], dusk: ['#683a66', 0.44], night: ['#2a3478', 0.5] }

/** A night sky's stars: the same scatter for the same size of card, a few of them twinkling. */
function stars(W: number, H: number) {
  let seed = ((W * 31 + H * 17) % 9973) + 1
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const count = Math.round(W / 42)
  let out = ''
  for (let i = 0; i < count; i++) {
    const x = (W * (0.04 + rand() * 0.92)).toFixed(1)
    const y = (3 + rand() * H * 0.36).toFixed(1)
    const r = (0.45 + rand() * 0.65).toFixed(2)
    const o = (0.25 + rand() * 0.4).toFixed(2)
    const twinkle = i % 4 === 1 ? `<animate attributeName="opacity" values="${o};0.08;${o}" dur="${(2.4 + rand() * 2).toFixed(1)}s" begin="${(rand() * 2).toFixed(1)}s" repeatCount="indefinite"/>` : ''
    out += `<circle cx="${x}" cy="${y}" r="${r}" fill="#e8ecff" opacity="${o}">${twinkle}</circle>`
  }
  return out
}

/**
 * The ground a card stands on, inside its rounded clip: a deep gradient, the
 * sky of the hour across the top (stars at night), a vignette, and a soft
 * light that sweeps across once as the card arrives. `defs` go in the SVG's
 * defs; `ground` is drawn first, inside the card's clip.
 */
function cardGround(id: string, W: number, H: number, o: { sheen?: boolean; sky?: Sky } = {}) {
  const sky = o.sky ?? skyOf()
  const [tint, strength] = SKY_TINT[sky]
  const defs =
    `<linearGradient id="${id}-base" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1f27"/><stop offset="1" stop-color="#111317"/></linearGradient>` +
    `<linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tint}" stop-opacity="${strength}"/><stop offset="0.6" stop-color="${tint}" stop-opacity="0"/></linearGradient>` +
    `<radialGradient id="${id}-vig" cx="0.5" cy="0.42" r="0.78"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.34"/></radialGradient>` +
    `<linearGradient id="${id}-sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.075"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="${id}-rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3c414e"/><stop offset="1" stop-color="#22252c"/></linearGradient>`
  const sweep = o.sheen === false ? '' : `<rect x="${-W * 0.5}" y="-10" width="${(W * 0.32).toFixed(0)}" height="${H + 20}" fill="url(#${id}-sheen)" transform="skewX(-18)"><animate attributeName="x" from="${(-W * 0.5).toFixed(0)}" to="${(W * 1.35).toFixed(0)}" begin="0.15s" dur="1.5s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.2 1"/></rect>`
  const ground = `<rect width="${W}" height="${H}" fill="url(#${id}-base)"/><rect width="${W}" height="${H}" fill="url(#${id}-sky)"/>${sky === 'night' ? stars(W, H) : ''}<rect width="${W}" height="${H}" fill="url(#${id}-vig)"/>`
  return { defs, ground, sweep, rim: `url(#${id}-rim)` }
}

/**
 * The tag naming what runs, at (x, y): round with a speech bubble for a
 * conversation; square with a code mark for a task. Its width comes back with it.
 */
function tagPill(x: number, y: number, text: string, colour: string, family: Family | undefined, h = 17) {
  const build = family === 'build'
  const label = text.toUpperCase()
  const mark = 13
  const w = label.length * 6.4 + 14 + mark
  const cy = y + h / 2
  const glyph = build
    ? `<path d="M${x + 9} ${cy - 3}l-2.6 3 2.6 3M${x + 13} ${cy - 3}l2.6 3-2.6 3" fill="none" stroke="${colour}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="M${x + 7.6} ${cy - 3.6}h6a1.6 1.6 0 0 1 1.6 1.6v2.6a1.6 1.6 0 0 1-1.6 1.6h-3.4l-2.2 2v-2h-0.4a1.6 1.6 0 0 1-1.6-1.6v-2.6a1.6 1.6 0 0 1 1.6-1.6z" fill="${colour}"/>`
  const svg =
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${build ? 3.5 : h / 2}" fill="${colour}" fill-opacity="0.16" stroke="${colour}" stroke-opacity="${build ? 0.7 : 0.45}"/>` +
    glyph +
    `<text x="${x + mark + (w - mark) / 2}" y="${y + h / 2 + 3.4}" text-anchor="middle" font-size="9.5" font-weight="750" letter-spacing="0.6" fill="${colour}">${escape(label)}</text>`
  return { w, svg }
}

export const BAD = '#e5534b'

const STAGE = '#16181d'
const EDGE = '#2b2f37'
const INK = '#ecebe8'
const MUTED = '#9aa0a8'
const FAINT = '#5d636d'
const FONT = 'Inter, Segoe UI, system-ui, sans-serif'

const VERDICT_COLOURS: Record<string, string> = {
  approve: GOOD,
  approve_with_nits: '#7fbf5a',
  changes_needed: WARN,
  rethink: BAD,
  answer: CODEX,
}

export function verdictColour(verdict: string | undefined) {
  return (verdict && VERDICT_COLOURS[verdict]) || CODEX
}

export function escape(text: string) {
  return text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

export function fit(text: string, max: number) {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, Math.max(1, max - 1)).trimEnd()}…` : t
}

// ---------------------------------------------------------------------------
// Avatars and icons

export function claudeAvatar(cx: number, cy: number, r: number) {
  const ray = r * 0.42
  const d = ray * Math.SQRT1_2
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${CLAUDE}"/><g stroke="#fff" stroke-width="${(r / 8.5).toFixed(2)}" stroke-linecap="round"><path d="M${cx} ${cy - ray}V${cy + ray}M${cx - ray} ${cy}H${cx + ray}M${cx - d} ${cy - d}L${cx + d} ${cy + d}M${cx + d} ${cy - d}L${cx - d} ${cy + d}"/></g>`
}

export function personAvatar(cx: number, cy: number, r: number) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${CLAUDE}" fill-opacity="0.85"/><circle cx="${cx}" cy="${cy - r * 0.25}" r="${r * 0.3}" fill="#fff"/><path d="M${cx - r * 0.5} ${cy + r * 0.58}a${r * 0.5} ${r * 0.42} 0 0 1 ${r} 0" fill="#fff"/>`
}

function hexagon(cx: number, cy: number, r: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`
  }).join(' ')
}

export function codexAvatar(cx: number, cy: number, r: number) {
  const s = r * 0.3
  return `<polygon points="${hexagon(cx, cy, r * 1.04)}" fill="${CODEX}" stroke="${CODEX}" stroke-width="${(r / 5).toFixed(1)}" stroke-linejoin="round"/><g fill="none" stroke="#fff" stroke-width="${(r / 9).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"><path d="M${cx - s * 0.9} ${cy - s}l${-s} ${s} ${s} ${s}M${cx + s * 0.9} ${cy - s}l${s} ${s} ${-s} ${s}M${cx + s * 0.35} ${cy - s * 1.25}l${-s * 0.7} ${s * 2.5}"/></g>`
}

const ICONS = {
  file: `<path d="M1.5 0.5h5.5l3 3v7.5a0.5 0.5 0 0 1-0.5 0.5h-8a0.5 0.5 0 0 1-0.5-0.5v-10a0.5 0.5 0 0 1 0.5-0.5z" stroke-linejoin="round"/><path d="M4 6h4M4 8.5h4" stroke-linecap="round"/>`,
  search: `<circle cx="4.8" cy="4.8" r="3.8"/><path d="M7.7 7.7l3 3" stroke-linecap="round"/>`,
  clock: `<circle cx="5.5" cy="5.5" r="4.8"/><path d="M5.5 2.8v2.9l1.9 1.2" stroke-linecap="round"/>`,
  coin: `<ellipse cx="5.5" cy="3.2" rx="4.6" ry="2"/><path d="M0.9 3.2v4.4c0 1.1 2 2 4.6 2s4.6-0.9 4.6-2V3.2"/>`,
  edit: `<path d="M1.2 9.8l0.6-2.6 6-6a1 1 0 0 1 1.4 0l0.6 0.6a1 1 0 0 1 0 1.4l-6 6z" stroke-linejoin="round"/>`,
  picture: `<rect x="0.6" y="1.2" width="10" height="8.6" rx="1.4"/><circle cx="3.6" cy="4.2" r="1"/><path d="M1 8.6l3-2.6 2 1.6 1.6-1.2 2.6 2.2" stroke-linejoin="round"/>`,
}

type Icon = keyof typeof ICONS

function icon(name: Icon, x: number, y: number) {
  return `<g transform="translate(${x} ${y - 9.5})" fill="none" stroke="${MUTED}" stroke-width="1.3">${ICONS[name]}</g>`
}

/** Icon-and-text items laid out around a centre, measured roughly. */
/**
 * Elapsed time that counts up by itself, as m:ss: each digit a column of
 * numerals stepping on its own beat, starting from `seconds` (the time at the
 * picture's start). A picture is only drawn again when something changes, so
 * a clock written as text would stand still between.
 */
export function liveClock(seconds: number, x: number, y: number, o: { size: number; colour: string; weight?: number; anchor?: 'start' | 'middle' | 'end'; id: string }) {
  const t = Math.max(0, seconds)
  const adv = o.size * 0.62
  const colon = o.size * 0.34
  const width = adv * 3 + colon
  // Set from the left, a clock past ten minutes makes room for its tens of minutes.
  const left = o.anchor === 'end' ? x - width : o.anchor === 'start' ? x + (t >= 600 ? adv : 0) : x - width / 2
  const line = o.size * 1.4
  const top = y - o.size * 1.02
  const column = (cx: number, digits: string[], step: number) => {
    const period = step * digits.length
    const values = digits.map((_, i) => `0 ${(-i * line).toFixed(2)}`).join(';')
    const numerals = digits.map((d, i) => `<text x="${cx.toFixed(1)}" y="${(y + i * line).toFixed(2)}" text-anchor="middle">${d}</text>`).join('')
    return `<g><animateTransform attributeName="transform" type="translate" values="${values}" calcMode="discrete" dur="${period}s" begin="${(-(t % period)).toFixed(2)}s" repeatCount="indefinite"/>${numerals}</g>`
  }
  const ten = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  return (
    `<clipPath id="${o.id}"><rect x="${(left - adv - 2).toFixed(1)}" y="${top.toFixed(1)}" width="${(width + adv + 4).toFixed(1)}" height="${line.toFixed(1)}"/></clipPath>` +
    `<g clip-path="url(#${o.id})" font-size="${o.size}" font-weight="${o.weight ?? 600}" fill="${o.colour}">` +
    // Tens of minutes appear left of the clock once it passes ten minutes.
    column(left - adv / 2, ['', ...ten.slice(1)], 600) +
    column(left + adv / 2, ten, 60) +
    `<text x="${(left + adv + colon / 2).toFixed(1)}" y="${y}" text-anchor="middle">:</text>` +
    column(left + adv + colon + adv / 2, ten.slice(0, 6), 10) +
    column(left + adv * 2 + colon + adv / 2, ten, 1) +
    '</g>'
  )
}

/** A row of facts with their icons; a [icon, text, seconds] item is a clock that counts up by itself. */
function statRow(items: [Icon, string, number?][], cx: number, y: number) {
  const widths = items.map(([, t]) => 16 + t.length * 6.3 + 16)
  const total = widths.reduce((a, b) => a + b, 0) - 16
  let x = cx - total / 2
  return items
    .map(([name, text, live], i) => {
      const label =
        live !== undefined
          ? liveClock(live, x + 16, y, { size: 11.5, colour: MUTED, weight: 400, anchor: 'start', id: `clock-${Math.round(cx)}-${Math.round(y)}` })
          : `<text x="${x + 16}" y="${y}" font-size="11.5" fill="${MUTED}">${escape(text)}</text>`
      const out = `${icon(name, x, y)}${label}`
      x += widths[i] as number
      return out
    })
    .join('')
}

function statWidth(items: [Icon, string, number?][]) {
  return items.reduce((sum, [, t]) => sum + 16 + t.length * 6.3 + 16, -16)
}

// ---------------------------------------------------------------------------
// The stage

export type StagePhase = 'sending' | 'reading' | 'thinking' | 'done' | 'failed'

export type Stage = {
  kind: 'review' | 'task' | 'image'
  phase: StagePhase
  claudeModel: string
  codexModel: string
  effort: string
  headline: string
  sub?: string
  subItalic?: boolean
  /** The stamp's word(s) and colour when done (a verdict, READY TO APPLY …). */
  stamp?: string
  stampColour?: string
  files: number
  searches: number
  edits?: number
  time: string
  tokens?: string
  /** Done reviews: findings by severity, and Claude's view of them. */
  severities?: { high: number; medium: number; low: number }
  /** The round's findings as they are (their own ids, in order): the card's beads. */
  findings?: { id: string; severity: 'high' | 'medium' | 'low' }[]
  consensus?: { agree: number; disagree: number; unsure: number; total: number }
  /** Done tasks: what the diff holds. */
  diff?: { files: number; added: number; removed: number }
  /** Done pictures: the image itself (a JPEG data URI) and its shape. */
  picture?: { href: string; ratio: number }
  /** The left seat: Claude, or the person asking from the pane. */
  you?: boolean
  /** The steps of this kind of run, the one under way lit. */
  strip?: { labels: string[]; current: number; done: boolean; failed?: boolean }
  /** While it runs: the seconds it has run so far, and what its clock shows at the picture's start (it counts on by itself). */
  seconds?: number
  clock?: number
  /** Codex's latest lines, typed out in turn while it works. */
  notes?: string[]
  /** How the stamp lands: sparks, a wobble, a slide. */
  moment?: 'spark' | 'wobble' | 'slide'
  /** The mascots: the Codex companion's animation, and Clawd's mood. */
  codexSprite?: Sprite
  claudeMood?: ClawdMood
  /** Once it lands: what Codex says, and Claude's answer. */
  banter?: Banter
  /** What runs, named in its family's tag in the corner; a task's stage has its own ground. */
  tag?: string
  family?: Family
  /** While it runs: Codex's own plan, a note just handed to it, and a task's diff so far. */
  plan?: PlanView
  steer?: SteerView
  growing?: Growing
  /** Codex has asked Claude something and waits for the answer. */
  asking?: boolean
  /** One of Codex's tools waits on the person's permission. */
  permit?: boolean
  /** Drawn to be held still (a chat card while the band plays the same run): nothing that only shows between the beats of a loop. */
  still?: boolean
  /** What passed between them while Codex worked. */
  mail?: Mail
  /** The sky over the stage; the local hour's when not given. */
  sky?: Sky
  /** Its id in the corner (K7Q2, or K7Q2 · 2 for a later round), to refer to it by. */
  ref?: string
}

/** Notes Codex got (from Claude or the person), and what Codex told or asked Claude, in order. */
export type Mail = { toCodex: ('claude' | 'you')[]; toClaude: ('tell' | 'ask')[] }

/** Codex's own plan while it works: each step done, under way or still to come, and the words of the one under way. */
export type PlanView = { steps: ('done' | 'now' | 'next')[]; now?: string }
/** A note just passed between them while Codex works: to Codex from the person or Claude, or from Codex to Claude. */
export type SteerView = {
  id: string
  from: 'you' | 'claude' | 'codex'
  text: string
  /** Seconds since it was sent, as of the picture's start: a picture drawn again later picks its moment up there, not from the top. */
  age?: number
}
/** A task's diff while Codex works on it. */
export type Growing = { files: number; added: number; removed: number }

/** The person's colour, as the pane's timeline has it. */
const YOU_COLOUR = '#E5B94E'
/** How long a note's moment lasts: it flies over, its line shows, then the usual line comes back. */
const STEER_MOMENT = 7

/**
 * Codex's plan as one line: a dot a step (ticked when done, pulsing for the
 * one under way), how far it has got, and what it is doing now. Centred on x,
 * or starting there.
 */
function planLine(plan: PlanView, x: number, y: number, room: number, centre: boolean, accent = CODEX) {
  const steps = plan.steps.slice(0, 12)
  const gap = 13
  const done = plan.steps.filter(s => s === 'done').length
  const count = `${done}/${plan.steps.length}`
  const dotsW = (steps.length - 1) * gap + 8
  const textRoom = room - dotsW - 12 - count.length * 6.4 - 10
  const words = plan.now ? fit(plan.now, Math.max(0, Math.floor(textRoom / 6.3))) : done === plan.steps.length ? 'every step done' : ''
  const width = dotsW + 12 + count.length * 6.4 + (words ? 10 + words.length * 6.3 : 0)
  let at = centre ? x - width / 2 : x
  const cy = y - 3.6
  let out = ''
  steps.forEach((state, i) => {
    const cx = at + 4 + i * gap
    const colour = state === 'done' ? GOOD : state === 'now' ? accent : FAINT
    out +=
      state === 'now'
        ? `<circle cx="${cx}" cy="${cy}" r="3.6" fill="${colour}"/><circle cx="${cx}" cy="${cy}" r="3.6" fill="none" stroke="${colour}" stroke-width="1.3"><animate attributeName="r" values="3.6;8.5" dur="1.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.9;0" dur="1.4s" repeatCount="indefinite"/></circle>`
        : state === 'done'
          ? `<circle cx="${cx}" cy="${cy}" r="3.8" fill="${colour}"/><path d="M${cx - 1.8} ${cy}l1.4 1.4 2.4-2.6" fill="none" stroke="${STAGE}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`
          : `<circle cx="${cx}" cy="${cy}" r="3" fill="none" stroke="${colour}" stroke-width="1.3"/>`
    if (i < steps.length - 1) out += `<path d="M${cx + 5} ${cy}h${gap - 10}" stroke="${state === 'done' ? GOOD : EDGE}" stroke-width="1.4" stroke-linecap="round"/>`
  })
  at += dotsW + 12
  out += `<text x="${at.toFixed(1)}" y="${y}" font-size="10.5" font-weight="700" fill="${MUTED}">${count}</text>`
  at += count.length * 6.4 + 10
  if (words) out += `<text x="${at.toFixed(1)}" y="${y}" font-size="10.5" font-weight="650" fill="${INK}">${escape(words)}</text>`
  return out
}

/** The usual line under the headline, held back while a note's moment plays, then faded in. */
function afterSteer(inner: string, steer?: SteerView) {
  const left = STEER_MOMENT - (steer?.age ?? 0)
  if (!steer || left <= 0) return inner
  return `<g opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${left.toFixed(2)}s" dur="0.4s" fill="freeze"/>${inner}</g>`
}

/** A note's moment as of its age: picked up where it is, not played again from the top; gone once over. */
function aged(fragment: string, steer: SteerView) {
  const age = steer.age ?? 0
  return age >= STEER_MOMENT ? '' : continueAnimations(fragment, age)
}

/** A note's colour and its line's lead: who sent it to whom. */
function steerWords(steer: SteerView) {
  if (steer.from === 'codex') return { colour: CODEX, lead: 'Codex → Claude: ' }
  return steer.from === 'claude' ? { colour: CLAUDE, lead: 'Claude → Codex: ' } : { colour: YOU_COLOUR, lead: 'You → Codex: ' }
}

/**
 * A note passed mid-run: it flies from the sender's seat to the other, who
 * catches it ("!"), and the line under the headline says what it was and who
 * sent it, for a few seconds.
 */
function steerMoment(g: Geo, steer: SteerView, y: number, id: string) {
  const { colour, lead } = steerWords(steer)
  const toClaude = steer.from === 'codex'
  const room = g.W - 2 * (g.LX + g.R + 18)
  const words = fit(steer.text, Math.max(8, Math.floor((room - 34) / 6.3) - lead.length - 2))
  const w = Math.min(room, (lead.length + words.length + 2) * 6.3 + 34)
  const x = g.W / 2 - w / 2
  const line =
    `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.06;0.9;1" dur="${STEER_MOMENT}s" fill="freeze"/>` +
    `<rect x="${x.toFixed(1)}" y="${y - 13}" width="${w.toFixed(1)}" height="20" rx="10" fill="${BUBBLE}" stroke="${colour}" stroke-opacity="0.55" stroke-width="1.1"/>` +
    `<g transform="translate(${(x + 15).toFixed(1)} ${y - 3})"><rect x="-6" y="-4" width="12" height="8" rx="1.5" fill="${colour}"/><path d="M-6 -4L0 0.6L6 -4" fill="none" stroke="${STAGE}" stroke-width="1.1" stroke-linejoin="round"/></g>` +
    `<clipPath id="${id}"><rect x="${(x + 26).toFixed(1)}" y="${y - 14}" width="0" height="22"><animate attributeName="width" from="0" to="${(w - 30).toFixed(1)}" begin="0.2s" dur="0.9s" fill="freeze"/></rect></clipPath>` +
    `<text x="${(x + 26).toFixed(1)}" y="${y + 1}" font-size="11.5" clip-path="url(#${id})"><tspan font-weight="700" fill="${colour}">${escape(lead)}</tspan><tspan fill="${INK}">“${escape(words)}”</tspan></text></g>`
  // The other catches it (kept inside a short strip's top edge): Codex in its colour, or Clawd in Codex's.
  const cx = toClaude ? g.LX + g.R * 0.55 : g.RX + g.R * 0.55
  const cy = Math.max(12, g.AY - g.R - 10)
  const caught = `<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)})"><g opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.8;1" begin="1.05s" dur="2.2s" fill="freeze"/><animateTransform attributeName="transform" type="scale" values="0.3;1.2;1;1" keyTimes="0;0.1;0.18;1" begin="1.05s" dur="2.2s" fill="freeze"/><rect x="-9.5" y="-9" width="19" height="16" rx="8" fill="${CODEX}"/><path d="M-3 7l-2 5 6-5z" fill="${CODEX}"/><text y="3.5" text-anchor="middle" font-size="11.5" font-weight="800" fill="${STAGE}">!</text></g></g>`
  return aged(flight(g, toClaude ? 'right' : 'left', colour, { launch: 0.15, travel: 0.9, once: true }) + caught + line, steer)
}

const STRIP = 24
/** The stage's extra height for the pair's two lines when a round lands. */
const BANTER_ROOM = 36

type Geo = { W: number; H: number; AY: number; R: number; LX: number; RX: number; narrow: boolean }

function geometry(width: number, s: Stage): Geo {
  const W = Math.round(Math.max(300, Math.min(560, width)))
  const narrow = W < 460
  const R = narrow ? 21 : 25
  const LX = narrow ? 42 : 58
  if (s.kind === 'image' && s.phase === 'done' && s.picture) {
    // Room for the picture itself between the two seats.
    const room = W - 2 * (LX + R + 22)
    const tall = Math.min(narrow ? 190 : 250, Math.round(room / Math.max(0.6, s.picture.ratio)))
    const H = Math.max(narrow ? 170 : 180, tall + 96) + STRIP
    return { W, H, AY: 44 + (H - 44 - 40 - STRIP) / 2, R, LX, RX: W - LX, narrow }
  }
  const talk = (s.phase === 'done' || s.phase === 'failed') && s.banter ? BANTER_ROOM : 0
  return { W, H: (narrow ? 164 : 174) + STRIP + talk, AY: narrow ? 72 : 74, R, LX, RX: W - LX, narrow }
}

function wire(g: Geo, phase: StagePhase, hidden = false) {
  if (hidden) return ''
  const a = g.LX + g.R + 11
  const b = g.RX - g.R - 11
  const path = `M${a} ${g.AY}H${b}`
  if (phase === 'done') return `<path d="${path}" stroke="url(#wireDone-${g.W})" stroke-width="2" stroke-linecap="round" opacity="0.85"/>`
  if (phase === 'failed') {
    const m = g.W / 2
    return `<path d="M${a} ${g.AY}H${m - 16}M${m + 16} ${g.AY}H${b}" stroke="${BAD}" stroke-width="2" stroke-dasharray="5 6" stroke-linecap="round" opacity="0.7"/><path d="M${m - 6} ${g.AY - 11}l5 8-6 3 8 10" fill="none" stroke="${BAD}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
  }
  const flow = phase === 'sending' ? '-20' : '20'
  return `<path d="${path}" stroke="${FAINT}" stroke-width="2" stroke-dasharray="2 8" stroke-linecap="round"><animate attributeName="stroke-dashoffset" from="0" to="${flow}" dur="0.9s" repeatCount="indefinite"/></path>`
}

/** The send cycle: Clawd winds up and throws, the note arcs over, Codex catches it. */
const SEND = { period: 2.4, launch: 0.95, travel: 0.95 }

/** A note flying between the seats on a low arc, with a short trail, and a pop where it lands. */
function flight(g: Geo, from: 'left' | 'right', colour: string, timing: { period?: number; launch: number; travel: number; once?: boolean }) {
  const a = from === 'left' ? g.LX + g.R * 0.9 : g.RX - g.R * 0.9
  const b = from === 'left' ? g.RX - g.R * 0.95 : g.LX + g.R * 0.95
  const y = g.AY - 4
  const path = `M${a.toFixed(1)} ${y}Q${(g.W / 2).toFixed(1)} ${g.AY - 26} ${b.toFixed(1)} ${y}`
  const note = `<rect x="-8" y="-5.5" width="16" height="11" rx="2" fill="${INK}"/><path d="M-8 -5.5L0 1.5L8 -5.5" fill="none" stroke="${STAGE}" stroke-width="1.3" stroke-linejoin="round"/><circle cx="5" cy="3" r="2" fill="${colour}"/>`
  const piece = (body: string, delay: number, scale: number, fade: number) => {
    if (timing.once) {
      const begin = (timing.launch + delay).toFixed(2)
      return `<g opacity="0"><animate attributeName="opacity" values="0;${fade};${fade};0" keyTimes="0;0.08;0.85;1" begin="${begin}s" dur="${timing.travel}s" fill="freeze"/><animateMotion path="${path}" begin="${begin}s" dur="${timing.travel}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.35 0 0.25 1"/><g transform="scale(${scale})">${body}</g></g>`
    }
    const p = timing.period as number
    const t0 = ((timing.launch + delay) / p).toFixed(3)
    const t1 = ((timing.launch + delay + timing.travel) / p).toFixed(3)
    const t0b = (Number(t0) + 0.01).toFixed(3)
    const t1a = (Number(t1) - 0.01).toFixed(3)
    return `<g opacity="0"><animate attributeName="opacity" values="0;0;${fade};${fade};0;0" keyTimes="0;${t0};${t0b};${t1a};${t1};1" dur="${p}s" repeatCount="indefinite"/><animateMotion path="${path}" keyPoints="0;0;1;1" keyTimes="0;${t0};${t1};1" calcMode="linear" dur="${p}s" repeatCount="indefinite"/><g transform="scale(${scale})">${body}</g></g>`
  }
  const spin = `<g><animateTransform attributeName="transform" type="rotate" values="-14;12;-14" dur="0.6s" repeatCount="indefinite"/>${note}</g>`
  const trail = [0.07, 0.14, 0.21].map((d, i) => piece(`<circle r="${2.6 - i * 0.6}" fill="${colour}"/>`, d, 1, 0.75 - i * 0.2)).join('')
  // Where it lands: a ring opens.
  const landAt = timing.launch + timing.travel
  const ring = timing.once
    ? `<circle cx="${b.toFixed(1)}" cy="${y}" r="4" fill="none" stroke="${colour}" stroke-width="2" opacity="0"><animate attributeName="opacity" values="0.9;0" begin="${landAt.toFixed(2)}s" dur="0.5s" fill="freeze"/><animate attributeName="r" values="4;20" begin="${landAt.toFixed(2)}s" dur="0.5s" fill="freeze"/></circle>`
    : (() => {
        const p = timing.period as number
        const k = (landAt / p).toFixed(3)
        const k2 = Math.min(0.999, (landAt + 0.5) / p).toFixed(3)
        return `<circle cx="${b.toFixed(1)}" cy="${y}" r="4" fill="none" stroke="${colour}" stroke-width="2" opacity="0"><animate attributeName="opacity" values="0;0;0.9;0;0" keyTimes="0;${k};${(Number(k) + 0.001).toFixed(3)};${k2};1" dur="${p}s" repeatCount="indefinite"/><animate attributeName="r" values="4;4;4;20;20" keyTimes="0;${k};${(Number(k) + 0.001).toFixed(3)};${k2};1" dur="${p}s" repeatCount="indefinite"/></circle>`
      })()
  return trail + piece(spin, 0, 1, 1) + ring
}

function plane(g: Geo) {
  return flight(g, 'left', CLAUDE, SEND)
}

function pages(g: Geo, count: number) {
  const shown = Math.max(1, Math.min(3, count || 1))
  const start = g.W / 2 + (g.narrow ? 0 : 24)
  return Array.from({ length: shown }, (_, i) => {
    const begin = (i * 0.55).toFixed(2)
    return `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.2;0.72;1" dur="1.65s" begin="${begin}s" repeatCount="indefinite"/><animateMotion path="M${start} ${g.AY + 20}Q${g.RX - g.R - 60} ${g.AY - 22} ${g.RX - g.R - 9} ${g.AY - 4}" dur="1.65s" begin="${begin}s" repeatCount="indefinite" rotate="auto"/><g transform="translate(-6 -8)"><rect width="12" height="15" rx="2" fill="${INK}"/><path d="M3 5h6M3 8h6M3 11h4" stroke="${STAGE}" stroke-width="1.2" stroke-linecap="round"/></g></g>`
  }).join('')
}

function halo(g: Geo) {
  return [0, 0.9]
    .map(
      begin =>
        `<g transform="translate(${g.RX} ${g.AY})"><polygon points="${hexagon(0, 0, g.R + 2)}" fill="none" stroke="${CODEX}" stroke-width="1.6" stroke-linejoin="round" opacity="0"><animate attributeName="opacity" values="0.75;0" dur="1.8s" begin="${begin}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="scale" values="1;1.6" dur="1.8s" begin="${begin}s" repeatCount="indefinite"/></polygon></g>`,
    )
    .join('')
}

/** A thought cloud over Codex, its glyph changing as it thinks. */
function thought(g: Geo) {
  const bx = g.RX - g.R * 0.2
  const by = g.AY - g.R - 22
  const glyphs = ['?', '…', '{ }', '!']
  const cycle = 4.8
  const words = glyphs
    .map((glyph, i) => {
      const a = (i / glyphs.length).toFixed(3)
      const b = ((i + 1) / glyphs.length).toFixed(3)
      const a2 = (Number(a) + 0.02).toFixed(3)
      const b2 = (Number(b) - 0.02).toFixed(3)
      const values = i === 0 ? '1;1;0;0' : `0;0;1;1;0;0`
      const keys = i === 0 ? `0;${b2};${b};1` : `0;${a};${a2};${b2};${b};1`
      return `<text x="${bx}" y="${by + 4.5}" text-anchor="middle" font-size="12" font-weight="800" fill="${STAGE}" opacity="${i === 0 ? 1 : 0}"><animate attributeName="opacity" values="${values}" keyTimes="${keys}" dur="${cycle}s" repeatCount="indefinite"/>${escape(glyph)}</text>`
    })
    .join('')
  return `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur="2.4s" repeatCount="indefinite"/><ellipse cx="${bx}" cy="${by}" rx="17" ry="12" fill="${INK}"/><circle cx="${bx - 9}" cy="${by + 15}" r="3.6" fill="${INK}"/><circle cx="${bx - 13}" cy="${by + 22}" r="2.2" fill="${INK}"/>${words}</g>`
}

/** A small editor between the seats, its lines typing themselves. */
function editor(g: Geo, busy: boolean) {
  const w = g.narrow ? 108 : 146
  const h = g.narrow ? 50 : 56
  const x = g.W / 2 - w / 2
  const y = g.AY - h / 2 + 7
  const lines = [0.78, 0.52, 0.66, 0.38]
  const colours = [CODEX, MUTED, '#6cb6ff', GOOD]
  const rows = lines
    .map((share, i) => {
      const full = (w - 30) * share
      const ly = y + 16 + i * 9
      const anim = busy
        ? `<animate attributeName="width" values="0;${full.toFixed(1)};${full.toFixed(1)};0" keyTimes="0;0.45;0.9;1" dur="2.6s" begin="${(i * 0.35).toFixed(2)}s" repeatCount="indefinite"/>`
        : ''
      return `<rect x="${x + 22}" y="${ly - 2.5}" width="${busy ? 0 : full.toFixed(1)}" height="5" rx="2.5" fill="${colours[i]}" fill-opacity="0.85">${anim}</rect><text x="${x + 8}" y="${ly + 2.5}" font-size="7" fill="${FAINT}">${i + 1}</text>`
    })
    .join('')
  const caret = busy
    ? `<rect x="${x + 22}" y="${y + h - 12}" width="1.6" height="8" fill="${INK}"><animate attributeName="opacity" values="1;0;1" dur="0.9s" repeatCount="indefinite"/></rect>`
    : ''
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="#0f1115" stroke="${EDGE}"/><circle cx="${x + 9}" cy="${y + 7}" r="2" fill="${BAD}" fill-opacity="0.8"/><circle cx="${x + 16}" cy="${y + 7}" r="2" fill="${WARN}" fill-opacity="0.8"/><circle cx="${x + 23}" cy="${y + 7}" r="2" fill="${GOOD}" fill-opacity="0.8"/>${rows}${caret}</g>`
}

/** A canvas between the seats, a brush painting colour onto it. */
function easel(g: Geo) {
  const w = g.narrow ? 100 : 124
  const h = g.narrow ? 56 : 66
  const x = g.W / 2 - w / 2
  const y = g.AY - h / 2 + 10
  const stroke = (d: string, colour: string, begin: number, width = 7) =>
    `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="320" stroke-dashoffset="320" opacity="0.92"><animate attributeName="stroke-dashoffset" values="320;0;0;320" keyTimes="0;0.4;0.85;1" dur="3.4s" begin="${begin}s" repeatCount="indefinite"/></path>`
  const pad = 12
  const strokes = [
    stroke(`M${x + pad} ${y + h - 18}C${x + w * 0.3} ${y + h * 0.35} ${x + w * 0.55} ${y + h - 12} ${x + w - pad} ${y + h * 0.4}`, CLAUDE, 0, 8),
    stroke(`M${x + pad} ${y + 22}C${x + w * 0.35} ${y + 10} ${x + w * 0.6} ${y + 34} ${x + w - pad - 8} ${y + 18}`, CODEX, 0.5),
    stroke(`M${x + w * 0.25} ${y + h * 0.55}Q${x + w * 0.5} ${y + h * 0.25} ${x + w * 0.72} ${y + h * 0.62}`, WARN, 1, 5),
  ].join('')
  // The brush rides the first stroke.
  const brush = `<g><animateMotion path="M${x + pad} ${y + h - 18}C${x + w * 0.3} ${y + h * 0.35} ${x + w * 0.55} ${y + h - 12} ${x + w - pad} ${y + h * 0.4}" dur="3.4s" keyPoints="0;1;1;0" keyTimes="0;0.4;0.85;1" calcMode="linear" repeatCount="indefinite"/><g transform="rotate(-35)"><rect x="-2.5" y="-24" width="5" height="16" rx="2" fill="#c8a27a"/><rect x="-3.5" y="-9" width="7" height="5" rx="1" fill="${MUTED}"/><path d="M-3.5 -4h7l-1.5 6a2 2 0 0 1-4 0z" fill="${CLAUDE}"/></g></g>`
  return `<g><path d="M${x + w * 0.2} ${y + h}l-8 16M${x + w * 0.8} ${y + h}l8 16M${g.W / 2} ${y + h}v14" stroke="#6b5a48" stroke-width="3" stroke-linecap="round"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#f6f1e7"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="none" stroke="#c9bba5" stroke-width="2"/>${strokes}${brush}</g>`
}

function canvasPicture(g: Geo, picture: { href: string; ratio: number }) {
  const room = g.W - 2 * (g.LX + g.R + 22)
  const maxH = g.H - 44 - 50
  let w = room
  let h = w / picture.ratio
  if (h > maxH) {
    h = maxH
    w = h * picture.ratio
  }
  const x = g.W / 2 - w / 2
  const y = 44 + (g.H - 44 - 40 - h) / 2
  return `<g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.6s" begin="0.15s" fill="freeze"/><animateTransform attributeName="transform" type="translate" from="0 8" to="0 0" dur="0.6s" begin="0.15s" fill="freeze"/><rect x="${x - 4}" y="${y - 4}" width="${w + 8}" height="${h + 8}" rx="12" fill="#0d0e11" stroke="${EDGE}"/><clipPath id="pic-${g.W}-${g.H}"><rect x="${x}" y="${y}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="9"/></clipPath><image href="${picture.href}" x="${x}" y="${y}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#pic-${g.W}-${g.H})"/></g>`
}

/** Codex's answer flies back to Claude, once, before the stamp lands. */
function replyPackets(g: Geo, colour: string) {
  return flight(g, 'right', colour, { launch: 0.15, travel: 0.85, once: true })
}

function sparks(w: number, h: number, colour: string) {
  // A ring of short rays that flares once the stamp has landed.
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 12
    const rx = w / 2 + 8
    const ry = h / 2 + 8
    const x1 = Math.cos(a) * rx
    const y1 = Math.sin(a) * ry
    const x2 = Math.cos(a) * (rx + 12)
    const y2 = Math.sin(a) * (ry + 10)
    return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${i % 3 ? colour : INK}" stroke-width="2" stroke-linecap="round"/>`
  }).join('')
  return `<g opacity="0"><animate attributeName="opacity" values="0;1;0" keyTimes="0;0.25;1" begin="1.47s" dur="0.75s" fill="freeze"/><animateTransform attributeName="transform" type="scale" values="0.7;1.3" begin="1.47s" dur="0.75s" fill="freeze"/>${rays}</g>`
}

function stampMark(g: Geo, label: string, colour: string, moment?: Stage['moment']) {
  const size = g.narrow ? 13 : 15.5
  const w = Math.max(g.narrow ? 100 : 124, label.length * size * 0.62 + 36)
  const h = g.narrow ? 32 : 38
  const arrive =
    moment === 'slide'
      ? `<animate attributeName="opacity" from="0" to="1" begin="1.05s" dur="0.2s" fill="freeze"/><animateTransform attributeName="transform" type="translate" values="80 0;-6 0;0 0" keyTimes="0;0.75;1" begin="1.05s" dur="0.5s" fill="freeze"/>`
      : `<animate attributeName="opacity" from="0" to="1" begin="1.05s" dur="0.15s" fill="freeze"/><animateTransform attributeName="transform" type="scale" values="1.8;0.93;1" keyTimes="0;0.7;1" begin="1.05s" dur="0.42s" fill="freeze"/>`
  const wobble = moment === 'wobble' ? `<animateTransform attributeName="transform" type="rotate" values="-5;-12;2;-9;-5" begin="1.5s" dur="0.65s" fill="freeze"/>` : ''
  return `<g transform="translate(${g.W / 2} ${g.AY})">${moment === 'spark' ? sparks(w, h, colour) : ''}<g opacity="0">${arrive}<g transform="rotate(-5)">${wobble}<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="9" fill="${STAGE}"/><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="9" fill="${colour}" fill-opacity="0.15" stroke="${colour}" stroke-width="2.2"/><rect x="${-w / 2 + 4}" y="${-h / 2 + 4}" width="${w - 8}" height="${h - 8}" rx="6.5" fill="none" stroke="${colour}" stroke-opacity="0.45" stroke-dasharray="3 3"/><text y="${size * 0.37}" text-anchor="middle" font-size="${size}" font-weight="800" letter-spacing="0.8" fill="${colour}">${escape(label.toUpperCase())}</text></g></g></g>`
}

function pill(x: number, y: number, text: string, colour: string, dot = true) {
  const w = text.length * 6.4 + (dot ? 24 : 16)
  return {
    w,
    svg: `<g transform="translate(${x} ${y - 13})"><rect width="${w}" height="19" rx="9.5" fill="${colour}" fill-opacity="0.16"/>${dot ? `<circle cx="10.5" cy="9.5" r="3" fill="${colour}"/>` : ''}<text x="${dot ? 18 : 8}" y="13" font-size="11" font-weight="650" fill="${colour}">${escape(text)}</text></g>`,
  }
}

function pills(sev: { high: number; medium: number; low: number }, x: number, y: number, compact: boolean) {
  const items = (
    [
      ['high', sev.high, BAD],
      [compact ? 'med' : 'medium', sev.medium, WARN],
      ['low', sev.low, MUTED],
    ] as const
  ).filter(([, n]) => n > 0)
  if (!items.length) return pill(x, y, 'no findings', GOOD, false).svg
  let at = x
  return items
    .map(([name, n, colour]) => {
      const p = pill(at, y, `${n} ${name}`, colour)
      at += p.w + 5
      return p.svg
    })
    .join('')
}

function consensus(c: { agree: number; disagree: number; unsure: number; total: number }, x: number, y: number, width: number) {
  const seg = (n: number) => (c.total ? (n / c.total) * width : 0)
  let at = x
  const bars = (
    [
      [seg(c.agree), GOOD],
      [seg(c.disagree), BAD],
      [seg(c.unsure), WARN],
    ] as [number, string][]
  )
    .filter(([w]) => w > 0)
    .map(([w, colour]) => {
      const out = `<rect x="${at.toFixed(1)}" y="${y - 8}" width="${Math.max(3, w - 2).toFixed(1)}" height="6" rx="3" fill="${colour}"/>`
      at += w
      return out
    })
    .join('')
  const triaged = c.agree + c.disagree + c.unsure
  const label = triaged ? `Claude agrees ${c.agree}/${c.total}` : 'Claude is checking…'
  return `${claudeAvatar(x - 12, y - 5, 6)}<rect x="${x}" y="${y - 8}" width="${width}" height="6" rx="3" fill="${EDGE}"/>${bars}<text x="${x + width + 8}" y="${y - 2}" font-size="11" fill="${MUTED}">${label}</text>`
}

function stepStrip(g: Geo, strip: NonNullable<Stage['strip']>) {
  const y = g.H - 36 - 12
  const n = strip.labels.length
  const letters = strip.labels.reduce((sum, l) => sum + l.length, 0)
  let size = g.narrow ? 10 : 10.5
  let gap = g.narrow ? 10 : 18
  // Long labels (a build loop's) on a narrow stage: tighter links and smaller type, so the strip stays inside.
  const room = g.W - 24
  if (letters * size * 0.6 + 16 * n + gap * (n - 1) > room) {
    gap = 6
    size = Math.max(7.5, Math.min(size, (room - 16 * n - gap * (n - 1)) / (letters * 0.6)))
  }
  const widths = strip.labels.map(l => l.length * size * 0.6 + 16)
  const total = widths.reduce((a, b) => a + b, 0) + gap * (n - 1)
  let x = g.W / 2 - total / 2
  return strip.labels
    .map((label, i) => {
      const state = strip.failed && i === strip.current ? 'failed' : strip.done || i < strip.current ? 'done' : i === strip.current ? 'now' : 'next'
      const colour = state === 'done' ? GOOD : state === 'now' ? CODEX : state === 'failed' ? BAD : FAINT
      const cx = x + 5
      const cy = y - 3.5
      const dot =
        state === 'now'
          ? `<circle cx="${cx}" cy="${cy}" r="4" fill="${colour}"/><circle cx="${cx}" cy="${cy}" r="4" fill="none" stroke="${colour}" stroke-width="1.5"><animate attributeName="r" values="4;10" dur="1.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.9;0" dur="1.4s" repeatCount="indefinite"/></circle>`
          : state === 'done'
            ? `<circle cx="${cx}" cy="${cy}" r="4.5" fill="${colour}"/><path d="M${cx - 2.2} ${cy}l1.6 1.6 2.8-3" fill="none" stroke="${STAGE}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`
            : state === 'failed'
              ? `<circle cx="${cx}" cy="${cy}" r="4.5" fill="${colour}"/>`
              : `<circle cx="${cx}" cy="${cy}" r="3.5" fill="none" stroke="${colour}" stroke-width="1.4"/>`
      const text = `<text x="${x + 13}" y="${y}" font-size="${size}" font-weight="${state === 'now' ? 700 : 500}" fill="${state === 'next' ? FAINT : state === 'now' ? INK : MUTED}">${escape(label)}</text>`
      const width = widths[i] as number
      const link =
        i < strip.labels.length - 1
          ? `<path d="M${x + width + 2} ${cy}h${gap - 4}" stroke="${state === 'done' ? GOOD : EDGE}" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.8"/>`
          : ''
      x += width + gap
      return dot + text + link
    })
    .join('')
}

function typewriter(g: Geo, notes: string[], room: number, y = 47) {
  // Codex's latest lines take turns: each types itself out, holds, then
  // gives way to the next.
  const lines = notes.slice(-3).map(n => fit(n, room))
  const slot = 4.5
  const cycle = slot * lines.length
  return lines
    .map((text, i) => {
      const w = Math.min(g.W - 40, text.length * 6.1 + 10)
      const x = g.W / 2 - w / 2
      const id = `tw-${g.W}-${i}`
      const reveal = (1.4 / cycle).toFixed(3)
      const fade = ((slot - 0.35) / cycle).toFixed(3)
      const gone = (slot / cycle).toFixed(3)
      const single = lines.length === 1
      const opacity = single
        ? '<animate attributeName="opacity" from="0" to="1" dur="0.01s" fill="freeze"/>'
        : `<animate attributeName="opacity" values="1;1;0;0" keyTimes="0;${fade};${gone};1" dur="${cycle}s" begin="${i * slot}s" repeatCount="indefinite"/>`
      const width = single
        ? `<animate attributeName="width" from="0" to="${w}" dur="1.4s" fill="freeze"/>`
        : `<animate attributeName="width" values="0;${w};${w}" keyTimes="0;${reveal};1" dur="${cycle}s" begin="${i * slot}s" repeatCount="indefinite"/>`
      return `<clipPath id="${id}"><rect x="${x}" y="${y - 12}" width="0" height="18">${width}</rect></clipPath><g opacity="0" clip-path="url(#${id})">${opacity}<text x="${g.W / 2}" y="${y}" text-anchor="middle" font-size="12" font-style="italic" fill="${MUTED}">${escape(text)}</text></g>`
    })
    .join('')
}

/** Two bubbles sharing a row: the room split by how much each says, neither squeezed below a short line's worth. */
function shareRoom(total: number, first: string, second?: string) {
  if (!second) return [total, 0] as const
  const a = Math.max(100, Math.min(total - 100, Math.round((total * first.length) / (first.length + second.length))))
  return [a, total - a] as const
}

/** The stage's two lines when a round lands, under the pair: Codex first, then Claude. */
function stageBanter(g: Geo, b: Banter, begin: number) {
  const row = g.AY + g.R + 49
  const [says, answers] = shareRoom(g.RX - g.LX - 20, b.codex, b.claude)
  return (
    speech(b.codex, g.RX, { y: row, from: 'right', tint: CODEX, begin, room: says, id: `st-says-${g.W}` }) +
    (b.claude ? speech(b.claude, g.LX, { y: row, from: 'left', tint: CLAUDE, begin: begin + 1.1, room: answers, id: `st-answers-${g.W}` }) : '')
  )
}

export function stageSvg(s: Stage, width = 560) {
  const g = geometry(width, s)
  const { W, H, AY, R, LX, RX, narrow } = g
  const colour = s.stampColour ?? CODEX
  const working = s.phase === 'reading' || s.phase === 'thinking'
  const showPicture = s.kind === 'image' && s.phase === 'done' && s.picture

  let middle = ''
  let around = ''
  if (s.phase === 'sending') middle = plane(g)
  else if (working) {
    around = s.codexSprite ? rings(RX, AY, R, CODEX) : halo(g)
    if (s.kind === 'task') middle = editor(g, true)
    else if (s.kind === 'image') middle = easel(g)
    else middle = s.phase === 'reading' ? pages(g, s.files) : ''
    // Waiting on Claude's answer, or on the person's OK: a mark over Codex in theirs instead of its thinking (held up, on a still card).
    if (s.asking || s.permit) {
      const [glyph, colour] = s.permit ? ['!', YOU_COLOUR] : ['?', CLAUDE]
      around += bubbleSvg(RX + R * 0.55, AY - R - 10, glyph, s.still ? { colour } : { loop: 2.4, show: 1.8, colour })
    } else if (s.phase === 'thinking' && s.kind === 'review') around += thought(g)
  } else if (s.phase === 'done') {
    if (showPicture && s.picture) middle = canvasPicture(g, s.picture)
    else {
      middle = replyPackets(g, colour)
      if (s.stamp) middle += stampMark(g, s.stamp, colour, s.moment)
    }
  }

  const subRoom = Math.floor((W - 2 * (LX + R + 6)) / 6.2)
  // Codex's lines take turns; a still card shows the latest one.
  const usual = working && s.notes?.length
    ? typewriter(g, s.still ? s.notes.slice(-1) : s.notes, subRoom)
    : s.sub
    ? `<text x="${W / 2}" y="47" text-anchor="middle" font-size="12" fill="${MUTED}"${s.subItalic ? ' font-style="italic"' : ''}>${escape(fit(s.sub, subRoom))}</text>`
    : ''
  const steer = working && s.steer ? s.steer : undefined
  const sub = afterSteer(usual, steer) + (steer ? steerMoment(g, steer, 47, `steer-${W}`) : '')
  const base = H - 14
  const time = s.time

  let bottom: string
  if (s.phase === 'done' && s.kind === 'review' && s.severities) {
    const total = s.severities.high + s.severities.medium + s.severities.low
    const right: [Icon, string][] = [['clock', time]]
    if (s.tokens && !narrow) right.push(['coin', s.tokens])
    bottom = pills(s.severities, 16, base, narrow) + statRow(right, W - 16 - statWidth(right) / 2, base)
    if (s.consensus && s.consensus.total && total) {
      const barWidth = narrow ? 60 : 92
      bottom += consensus(s.consensus, W / 2 - (barWidth + 104) / 2 + 12, AY + R + 19, barWidth)
    }
  } else if (s.phase === 'done' && s.kind === 'task' && s.diff) {
    const left = s.diff.files
      ? pill(16, base, `+${s.diff.added}`, GOOD, false).svg + pill(16 + `+${s.diff.added}`.length * 6.4 + 22, base, `−${s.diff.removed}`, BAD, false).svg
      : pill(16, base, 'no changes', MUTED, false).svg
    const right: [Icon, string][] = [['file', `${s.diff.files} file${s.diff.files === 1 ? '' : 's'}`], ['clock', time]]
    if (s.tokens && !narrow) right.push(['coin', s.tokens.split(' ')[0] as string])
    bottom = left + statRow(right, W - 16 - statWidth(right) / 2, base)
  } else {
    const items: [Icon, string, number?][] = []
    if (s.kind === 'image') items.push(['picture', s.phase === 'done' ? 'saved' : 'painting'])
    else if (s.kind === 'task' && working && s.growing) {
      // The diff as it grows.
      items.push(['edit', `${s.growing.files} file${s.growing.files === 1 ? '' : 's'} · +${s.growing.added} −${s.growing.removed}`])
    } else {
      items.push(['file', `${s.files} file${s.files === 1 ? '' : 's'}`])
      if (s.kind === 'task' && s.edits) items.push(['edit', `${s.edits} edit${s.edits === 1 ? '' : 's'}`])
      else if (!narrow) items.push(['search', `${s.searches} search${s.searches === 1 ? '' : 'es'}`])
    }
    items.push(s.clock !== undefined ? ['clock', time, s.clock] : ['clock', time])
    if (s.tokens) items.push(['coin', narrow ? (s.tokens.split(' ')[0] as string) : s.tokens])
    bottom = statRow(items, W / 2, base)
  }

  const leftName = s.you ? 'You' : 'Claude'
  const leftModel = s.you ? 'from the pane' : s.claudeModel
  const rightModel = narrow ? s.codexModel : `${s.codexModel} · ${s.effort}`
  const labelRoom = narrow ? 13 : 22
  // The stage is drawn in a frame of its own: following the page's colour
  // scheme keeps the frame see-through where the stage does not reach (a
  // frame on its own default scheme paints white there). Its light sweeps
  // across as a round lands, not on every step of a run.
  const bg = cardGround(`st${W}-${H}`, W, H, { sheen: s.phase === 'done' || s.phase === 'failed', sky: s.sky })
  const landed = s.phase === 'done' && !showPicture ? `<rect y="${H - 37}" width="${W}" height="1.5" fill="${colour}" opacity="0.5"/>` : ''
  const drawn = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<style>:root{color-scheme:light dark;background:transparent}</style>
<defs>
<linearGradient id="wireDone-${W}" x1="${LX}" x2="${RX}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${CLAUDE}"/><stop offset="1" stop-color="${CODEX}"/></linearGradient>
<clipPath id="card-${W}-${H}"><rect width="${W}" height="${H}" rx="16"/></clipPath>
${bg.defs}
</defs>
<g clip-path="url(#card-${W}-${H})">${bg.ground}${s.family === 'build' ? buildGround(`st${W}-${H}`, W, H - 36) : ''}<rect y="${H - 36}" width="${W}" height="36" fill="#0b0c10" opacity="0.45"/><path d="M0 ${H - 36}H${W}" stroke="${EDGE}"/>${landed}</g>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="15.5" fill="none" stroke="${bg.rim}"/>
${s.codexSprite || s.claudeMood ? motes(g) : ''}
${wire(g, s.phase, Boolean(showPicture))}
${middle}
<g>${leftSeat(s.you, LX, AY, R, s.claudeMood, s.phase === 'done' ? 1.05 : 0)}<title>${escape(leftName)}</title></g>
${around}
<g>${rightSeat(s.codexSprite, RX, AY, R)}<title>${escape(`Codex · ${s.codexModel} · ${s.effort} reasoning`)}</title></g>
${codexReaction(g, s)}
<text x="${LX}" y="${AY + R + 16}" text-anchor="middle" font-size="12.5" font-weight="650" fill="${INK}">${leftName}</text>
<text x="${RX}" y="${AY + R + 16}" text-anchor="middle" font-size="12.5" font-weight="650" fill="${INK}">Codex</text>
<text x="${LX}" y="${AY + R + 29}" text-anchor="middle" font-size="9.5" fill="${MUTED}">${escape(fit(leftModel, labelRoom))}</text>
<text x="${RX}" y="${AY + R + 29}" text-anchor="middle" font-size="9.5" fill="${MUTED}">${escape(fit(rightModel, labelRoom))}</text>
${(s.phase === 'done' || s.phase === 'failed') && s.banter ? stageBanter(g, s.banter, s.phase === 'done' ? 1.8 : 0.7) : ''}
${s.tag && !narrow ? tagPill(12, 10, s.tag, familyColour(s.family), s.family, 16).svg : ''}
${s.ref && !narrow ? `<text x="${W - 14}" y="22" text-anchor="end" font-size="10.5" font-weight="700" letter-spacing="0.9" fill="${FAINT}">${escape(s.ref)}</text>` : ''}
<text x="${W / 2}" y="29" text-anchor="middle" font-size="${narrow ? 14.5 : 15.5}" font-weight="700" fill="${INK}">${escape(fit(s.headline, Math.floor((W - 30) / 9)))}</text>
${sub}
${working && s.plan ? planLine(s.plan, W / 2, H - 48, W - 40, true) : s.strip ? stepStrip(g, s.strip) : ''}
${s.mail ? mailboxes(g, s.mail) : ''}
${bottom}
<g clip-path="url(#card-${W}-${H})">${bg.sweep}</g>
</svg>`
  // Finished: its loops come to rest after the landing (see settle).
  return s.phase === 'done' || s.phase === 'failed' ? settle(drawn) : drawn
}

/**
 * What passed between them while Codex worked, as envelopes by whoever got
 * them: the notes Codex got from Claude (or the person) by Codex, and what
 * Codex told or asked Claude by Clawd. The newest pops in.
 */
function mailboxes(g: Geo, mail: Mail) {
  const y = g.AY + g.R - 3
  const pile = (items: string[], x: number, dir: 1 | -1, key: string) => {
    if (!items.length) return ''
    const shown = items.slice(-4)
    let out = shown
      .map((colour, i) => {
        const cx = x + dir * i * 10.5
        const body =
          colour === ASK_MARK
            ? `<rect x="-6.3" y="-4.6" width="12.6" height="9.2" rx="2.2" fill="${CODEX}"/><text y="3.2" text-anchor="middle" font-size="8.5" font-weight="800" fill="${STAGE}">?</text>`
            : `<rect x="-6.3" y="-4.3" width="12.6" height="8.6" rx="1.6" fill="${colour}"/><path d="M-6.3 -4.3L0 0.8L6.3 -4.3" fill="none" stroke="${STAGE}" stroke-width="1.1"/>`
        const pop = i === shown.length - 1 ? `<animateTransform attributeName="transform" type="scale" values="0.2;1.25;1" dur="0.4s" begin="0.2s" fill="freeze" additive="sum"/>` : ''
        return `<g transform="translate(${cx.toFixed(1)} ${y}) rotate(${((i % 2 ? 1 : -1) * 7).toFixed(0)})"><g>${pop}${body}</g></g>`
      })
      .join('')
    if (items.length > shown.length) out += `<text x="${(x + dir * shown.length * 10.5 + (dir > 0 ? 0 : -2)).toFixed(1)}" y="${y + 3.5}" text-anchor="${dir > 0 ? 'start' : 'end'}" font-size="9.5" font-weight="700" fill="${MUTED}">+${items.length - shown.length}</text>`
    return `<g><title>${escape(key)}</title>${out}</g>`
  }
  const toCodex = mail.toCodex.map(from => (from === 'you' ? YOU_COLOUR : CLAUDE))
  const toClaude = mail.toClaude.map(kind => (kind === 'ask' ? ASK_MARK : CODEX))
  return (
    pile(toCodex, g.RX - g.R - 16, -1, `${mail.toCodex.length} note${mail.toCodex.length === 1 ? '' : 's'} to Codex`) +
    pile(toClaude, g.LX + g.R + 16, 1, `${mail.toClaude.length} message${mail.toClaude.length === 1 ? '' : 's'} from Codex`)
  )
}

/** A question among the envelopes. */
const ASK_MARK = '?'

// ---------------------------------------------------------------------------
// Small pictures for the pane (plain images at their own size)

/** A conversation's chips are round; a task's (task_*) are square, like its tag. */
export type ChipKind =
  | 'live'
  | 'approve'
  | 'approve_with_nits'
  | 'changes_needed'
  | 'rethink'
  | 'answer'
  | 'failed'
  | 'applied'
  | 'picture'
  | 'task'
  | 'task_live'
  | 'task_applied'
  | 'task_failed'

export function chipSvg(kind: ChipKind) {
  const colour =
    kind === 'live'
      ? CODEX
      : kind === 'task' || kind === 'task_live'
        ? BUILD
        : kind === 'failed' || kind === 'task_failed'
          ? BAD
          : kind === 'applied' || kind === 'task_applied'
            ? GOOD
            : kind === 'picture'
              ? CLAUDE
              : verdictColour(kind)
  const tick = `<path d="M6.5 11.3l3 3 6-6.4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
  const glyphs: Record<ChipKind, string> = {
    live: `<circle cx="7" cy="11" r="1.8" fill="#fff"/><circle cx="11" cy="11" r="1.8" fill="#fff"/><circle cx="15" cy="11" r="1.8" fill="#fff"/>`,
    approve: tick,
    approve_with_nits: tick,
    applied: tick,
    changes_needed: `<path d="M11 6v6.2" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="11" cy="15.6" r="1.4" fill="#fff"/>`,
    rethink: `<path d="M15.2 9.2a4.6 4.6 0 1 0 0.4 4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M15.6 5.8v3.6h-3.6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    answer: `<path d="M8.6 8.8a2.5 2.5 0 1 1 3.4 2.3c-0.7 0.3-1 0.8-1 1.5v0.6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="11" cy="16" r="1.3" fill="#fff"/>`,
    failed: `<path d="M7.8 7.8l6.4 6.4M14.2 7.8l-6.4 6.4" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>`,
    task: `<path d="M8.6 7.6L5.4 11l3.2 3.4M13.4 7.6l3.2 3.4-3.2 3.4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    task_live: `<circle cx="7" cy="11" r="1.8" fill="#fff"/><circle cx="11" cy="11" r="1.8" fill="#fff"/><circle cx="15" cy="11" r="1.8" fill="#fff"/>`,
    task_applied: tick,
    task_failed: `<path d="M7.8 7.8l6.4 6.4M14.2 7.8l-6.4 6.4" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>`,
    picture: `<rect x="5.5" y="6.5" width="11" height="9" rx="1.6" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M6.2 14.6l3-3 2 1.8 1.6-1.4 2.6 2.4" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>`,
  }
  const ground = kind.startsWith('task') ? `<rect x="1" y="1" width="20" height="20" rx="5" fill="${colour}"/>` : `<circle cx="11" cy="11" r="10.5" fill="${colour}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">${ground}${glyphs[kind]}</svg>`
}

export const DUO_SIZE = { width: 72, height: 30 }
export function duoSvg(sprite?: Sprite, mood: ClawdMood = 'idle', busy = false) {
  if (sprite) {
    // At work, the arrows between them run in the colours of both.
    const arrows = busy
      ? `<path d="M31 11.5h10l-3-3" fill="none" stroke="${CLAUDE}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite"/></path><path d="M41 18.5H31l3 3" fill="none" stroke="${CODEX}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><animate attributeName="opacity" values="0.3;1;0.3" dur="1.2s" repeatCount="indefinite"/></path>`
      : `<path d="M31 11.5h10l-3-3M41 18.5H31l3 3" fill="none" stroke="${MUTED}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`
    return `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="30" viewBox="0 0 72 30">${clawd(15, 17, 1.45, mood)}${arrows}${codexSprite(sprite, 58, 15, 32)}</svg>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="30" viewBox="0 0 72 30">${claudeAvatar(14, 15, 12)}<path d="M31 11.5h10l-3-3M41 18.5H31l3 3" fill="none" stroke="${MUTED}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>${codexAvatar(58, 15, 12)}</svg>`
}

export const POKE_STAGE = { width: 184, height: 80 }

export type Poke = { who: 'claude' | 'codex'; n: number; lines: [string, string] }

/**
 * Claude and Codex in the pane's header, big enough to poke. The one poked
 * jumps with a "!" and a burst and says its line; its bubble steps aside and
 * the other answers. Every motion of the poke runs once.
 */
export function pokeStageSvg(o: { sprite?: Sprite; mood: ClawdMood; busy: boolean; poke?: Poke }) {
  const { width: W, height: H } = POKE_STAGE
  const LX = 38
  const RX = 146
  const AY = 27
  const p = o.poke
  const id = `poke${p?.n ?? 0}`
  const jump = `<animateTransform attributeName="transform" type="translate" values="0 0;0 -11;0 0;0 -4;0 0" keyTimes="0;0.28;0.55;0.78;1" dur="0.7s" fill="freeze"/>`
  const bang = (x: number, colour: string) =>
    `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.75;1" dur="1.3s" fill="freeze"/><text x="${x + 17}" y="${AY - 12}" text-anchor="middle" font-size="16" font-weight="800" fill="${colour}">!</text></g>`
  const burst = (x: number, colour: string) =>
    [0, 1, 2, 3, 4, 5]
      .map(i => {
        const a = (Math.PI / 3) * i + Math.PI / 6
        const at = (r: number) => `${(x + Math.cos(a) * r).toFixed(1)} ${(AY + Math.sin(a) * r).toFixed(1)}`
        return `<path d="M${at(17)}L${at(25)}" stroke="${colour}" stroke-width="2" stroke-linecap="round" opacity="0"><animate attributeName="opacity" values="0;1;0" dur="0.45s" begin="0.05s" fill="freeze"/></path>`
      })
      .join('')
  const claudePoked = p?.who === 'claude'
  const codexPoked = p?.who === 'codex'
  const left = `<g>${clawd(LX, AY, clawdUnitFor(46), o.mood)}${claudePoked ? jump : ''}</g>`
  const right = `<g>${o.sprite ? codexSprite(o.sprite, RX, AY - 1, 46) : codexAvatar(RX, AY, 15)}${codexPoked ? jump : ''}</g>`
  // The poked one speaks first; its bubble fades as the other answers in its own.
  let talk = ''
  if (p) {
    const first = codexPoked ? RX : LX
    const second = codexPoked ? LX : RX
    const side = (x: number): 'left' | 'right' => (x === LX ? 'left' : 'right')
    const tint = (x: number) => (x === LX ? CLAUDE : CODEX)
    const room = W - 30
    talk =
      `<g><animate attributeName="opacity" values="1;1;0" keyTimes="0;0.86;1" begin="0.3s" dur="1.5s" fill="freeze"/>${speech(p.lines[0], first, { y: 65, from: side(first), tint: tint(first), begin: 0.3, room, id: `${id}-a` })}</g>` +
      speech(p.lines[1], second, { y: 65, from: side(second), tint: tint(second), begin: 1.65, room, id: `${id}-b` })
  }
  // At work, the arrows between them run in the colours of both.
  const mid = (LX + RX) / 2
  const arrows = o.busy
    ? `<path d="M${mid - 14} ${AY - 4}h20l-4-4" fill="none" stroke="${CLAUDE}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite"/></path><path d="M${mid + 6} ${AY + 5}h-20l4 4" fill="none" stroke="${CODEX}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><animate attributeName="opacity" values="0.3;1;0.3" dur="1.2s" repeatCount="indefinite"/></path>`
    : `<path d="M${mid - 14} ${AY - 4}h20l-4-4M${mid + 6} ${AY + 5}h-20l4 4" fill="none" stroke="${MUTED}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  const bg = cardGround(`poke${p?.n ?? 0}`, W, H, { sheen: false })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<defs><clipPath id="${id}-card"><rect width="${W}" height="${H}" rx="13"/></clipPath>${bg.defs}</defs><g clip-path="url(#${id}-card)">${bg.ground}</g><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12.5" fill="none" stroke="${bg.rim}"/>
${arrows}
${claudePoked ? burst(LX, CLAUDE) : ''}${codexPoked ? burst(RX, CODEX) + bang(RX, CODEX) : ''}
${left}
${right}
${talk}
</svg>`
}

export type Gauge = { label: string; percent: number; resets?: string }

function gaugeColour(percent: number) {
  if (percent >= 90) return BAD
  if (percent >= 70) return WARN
  return CODEX
}

export const GAUGE_SIZE = { width: 104, height: 112 }
export function gaugeSvg(g: Gauge) {
  const { width, height } = GAUGE_SIZE
  const cx = width / 2
  const cy = 44
  const r = 27
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(100, g.percent))
  const colour = gaugeColour(p)
  const label = p >= 10 || p === 0 ? `${Math.round(p)}%` : `${p.toFixed(1)}%`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}"><rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="14" fill="${STAGE}" stroke="${EDGE}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${EDGE}" stroke-width="7"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colour}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${((p / 100) * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/><text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="14" font-weight="750" fill="${INK}">${label}</text><text x="${cx}" y="${cy + 46}" text-anchor="middle" font-size="12" font-weight="650" fill="${INK}">${escape(g.label)}</text>${g.resets ? `<text x="${cx}" y="${cy + 61}" text-anchor="middle" font-size="10" fill="${MUTED}">${escape(fit(g.resets, 18))}</text>` : ''}</svg>`
}

// ---------------------------------------------------------------------------
// Picture tiles (cards and gallery): the JPEG inside an SVG, or a shimmer

export function photoSvg(base64: string, w: number, h: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><clipPath id="r"><rect width="${w}" height="${h}" rx="10"/></clipPath></defs><image href="data:image/jpeg;base64,${base64}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#r)"/></svg>`
}

export function shimmerSvg(w: number, h: number, state: 'active' | 'failed' | 'idle') {
  const base = `<rect width="${w}" height="${h}" rx="10" fill="#8a8f98" fill-opacity="0.12"/>`
  if (state === 'failed') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${base}<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="9" fill="none" stroke="#d9534f" stroke-opacity="0.55" stroke-dasharray="6 5"/></svg>`
  }
  if (state === 'idle') return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${base}</svg>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="0.35"><stop offset="0.3" stop-color="#8a8f98" stop-opacity="0"/><stop offset="0.5" stop-color="#8a8f98" stop-opacity="0.22"/><stop offset="0.7" stop-color="#8a8f98" stop-opacity="0"/><animateTransform attributeName="gradientTransform" type="translate" from="-1 0" to="1 0" dur="1.8s" repeatCount="indefinite"/></linearGradient></defs>${base}<rect width="${w}" height="${h}" rx="10" fill="url(#s)"/></svg>`
}

// ---------------------------------------------------------------------------
// The band above the prompt: a live strip per running job, a slim line at rest

/** Room on a strip's right end for the Buttons the band draws over it. */
export const BAND_CONTROLS = 192
export const BAND_ROW_HEIGHT = 78

export type BandRow = {
  /** What runs: a review, a joint review, a task, pictures. */
  tag: string
  title: string
  /** What Codex is doing right now; `thought` when it is one of its own lines. */
  doing: string
  thought?: boolean
  phase: 'sending' | 'reading' | 'thinking'
  stalled?: boolean
  queued?: boolean
  time: string
  /** Seconds so far; and, to count on by itself, what the clock shows at the picture's start. */
  elapsed: number
  clock?: number
  strip?: { labels: string[]; current: number }
  /** The left seat: the person, when they started it from the pane. */
  you?: boolean
  /** The mascots: the Codex companion's animation, and Clawd's mood. */
  codexSprite?: Sprite
  claudeMood?: ClawdMood
  /** A conversation or a task: each has its own look. */
  family?: Family
  /** Whose move it is (Codex at work, Claude's turn, or both at once), and which way a note is travelling. */
  turn?: Turn
  toward?: 'codex' | 'claude' | 'both'
  /** Codex's own plan, and a note just handed to it. */
  plan?: PlanView
  steer?: SteerView
  /** Codex has asked Claude something and waits for the answer. */
  asking?: boolean
  /** One of Codex's tools waits on the person's permission (what it wants is `doing`). */
  permit?: boolean
  /** Questions Codex asked without waiting, still open; and what is queued for its next round. */
  tickets?: number
  nextUp?: number
}

export type Turn = 'codex' | 'claude' | 'both'

/** Both at work: Claude's colour and Codex's, mixed. */
const BOTH = '#B285A7'

/** The colour of whoever has the move. */
export function turnColour(turn: Turn | undefined) {
  return turn === 'claude' ? CLAUDE : turn === 'both' ? BOTH : CODEX
}

/** Whose move it is, in two words. */
export function turnWords(turn: Turn | undefined) {
  return turn === 'claude' ? "Claude's turn" : turn === 'both' ? 'Both at work' : "Codex's turn"
}

/** The strip's ground: the card under the sky of the hour, the dashboard's panel, and the beam in the mover's colour. */
function bandFrame(W: number, H: number, id: string, turn: Turn = 'codex', family?: Family, controls = BAND_CONTROLS) {
  const mover = turn === 'codex' ? familyColour(family) : turnColour(turn)
  const beam = turn === 'both' ? [CLAUDE, CODEX] : [mover, mover]
  const bg = cardGround(id, W - controls, H)
  return `<defs>
<linearGradient id="${id}-beam" x1="0" x2="1"><stop offset="0" stop-color="${beam[0]}" stop-opacity="${turn === 'both' ? 1 : 0.55}"/><stop offset="1" stop-color="${beam[1]}"/></linearGradient>
<linearGradient id="${id}-shine" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="${id}-panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e2129"/><stop offset="1" stop-color="#16181d"/></linearGradient>
<clipPath id="${id}-card"><rect width="${W}" height="${H}" rx="14"/></clipPath>
${bg.defs}
</defs>
<g clip-path="url(#${id}-card)">${bg.ground}${family === 'build' ? buildGround(id, W - controls, H) : ''}<rect x="${W - controls}" width="${controls}" height="${H}" fill="url(#${id}-panel)"/><path d="M${W - controls + 0.5} 0V${H}" stroke="${EDGE}"/></g>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="13.5" fill="none" stroke="${bg.rim}"/>`
}

/** The light sweeping once across a strip as its news lands (over everything, inside the card). */
function bandSweep(W: number, H: number, id: string) {
  return `<g clip-path="url(#${id}-card)"><rect x="${(-W * 0.5).toFixed(0)}" y="-10" width="${(W * 0.3).toFixed(0)}" height="${H + 20}" fill="url(#${id}-sheen)" transform="skewX(-18)"><animate attributeName="x" from="${(-W * 0.5).toFixed(0)}" to="${(W * 1.35).toFixed(0)}" begin="0.2s" dur="1.6s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.2 1"/></rect></g>`
}

function miniStrip(strip: { labels: string[]; current: number }, x: number, y: number, maxRight: number, now = CODEX) {
  const size = 10.5
  let at = x
  let out = ''
  strip.labels.forEach((label, i) => {
    const width = label.length * size * 0.62 + 18
    if (at + width > maxRight) return
    const state = i < strip.current ? 'done' : i === strip.current ? 'now' : 'next'
    const colour = state === 'done' ? GOOD : state === 'now' ? now : FAINT
    const cy = y - 3.6
    out +=
      state === 'now'
        ? `<circle cx="${at + 4}" cy="${cy}" r="3.4" fill="${colour}"/><circle cx="${at + 4}" cy="${cy}" r="3.4" fill="none" stroke="${colour}" stroke-width="1.3"><animate attributeName="r" values="3.4;8" dur="1.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.9;0" dur="1.4s" repeatCount="indefinite"/></circle>`
        : state === 'done'
          ? `<circle cx="${at + 4}" cy="${cy}" r="3.8" fill="${colour}"/><path d="M${at + 2.2} ${cy}l1.4 1.4 2.4-2.6" fill="none" stroke="${STAGE}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`
          : `<circle cx="${at + 4}" cy="${cy}" r="3" fill="none" stroke="${colour}" stroke-width="1.3"/>`
    out += `<text x="${at + 11}" y="${y}" font-size="${size}" font-weight="${state === 'now' ? 700 : 500}" fill="${state === 'next' ? FAINT : state === 'now' ? INK : MUTED}">${escape(label)}</text>`
    if (i < strip.labels.length - 1) out += `<path d="M${at + width - 4} ${cy}h7" stroke="${state === 'done' ? GOOD : EDGE}" stroke-width="1.4" stroke-linecap="round"/>`
    at += width + 7
  })
  return out
}

/** A note on its way along the strip's foot, from one of them to the other. */
function courier(from: number, to: number, y: number, colour: string, begin = 0) {
  return `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.12;0.86;1" dur="2.1s" begin="${begin}s" repeatCount="indefinite"/><animateMotion path="M${from.toFixed(1)} ${y}H${to.toFixed(1)}" dur="2.1s" begin="${begin}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.45 0 0.25 1"/><g><animateTransform attributeName="transform" type="rotate" values="-8;8;-8" dur="0.7s" repeatCount="indefinite"/><rect x="-6.5" y="-4.2" width="13" height="8.4" rx="1.6" fill="${INK}"/><path d="M-6.5 -4.2L0 0.8L6.5 -4.2" fill="none" stroke="${STAGE}" stroke-width="1.1" stroke-linejoin="round"/><circle cx="4.2" cy="2.2" r="1.7" fill="${colour}"/></g></g>`
}

/** The couriers for a strip: toward Codex, toward Claude, or both ways at once. */
function couriers(toward: BandRow['toward'], lx: number, rx: number, y: number) {
  if (toward === 'codex') return courier(lx, rx, y, CLAUDE)
  if (toward === 'claude') return courier(rx, lx, y, CODEX)
  if (toward === 'both') return courier(lx, rx, y - 3, CLAUDE) + courier(rx, lx, y + 3, CODEX, 1.05)
  return ''
}

/** One running job: Claude and Codex at either end, what Codex does between them, its time counting. */
export function bandRowSvg(r: BandRow, width: number) {
  const W = Math.round(Math.max(420, width))
  const H = BAND_ROW_HEIGHT
  const R = 15
  const LX = 30
  const RX = W - BAND_CONTROLS - 32
  const AY = 31
  const MX = LX + R + 20
  // Room before Codex for its thought bubble.
  const ME = RX - R - 46
  const id = `b${W}`
  const room = Math.max(10, Math.floor((ME - MX) / 6.6))
  const working = !r.queued
  const turn = r.turn ?? 'codex'
  const accent = r.stalled ? WARN : turn === 'codex' ? familyColour(r.family) : turnColour(turn)
  // The tag (its family's), the title, and the time so far.
  const pill = tagPill(MX, 11, r.tag, familyColour(r.family), r.family)
  const tagW = pill.w
  const time = r.time
  const timeW = Math.max(4, time.length) * 6.6
  const titleRoom = Math.max(6, Math.floor((ME - MX - tagW - 10 - timeW - 12) / 7.2))
  const head =
    pill.svg +
    `<text x="${MX + tagW + 9}" y="24" font-size="13.5" font-weight="650" fill="${r.queued ? MUTED : INK}">${escape(fit(r.title, titleRoom))}</text>` +
    (r.clock !== undefined
      ? liveClock(r.clock, ME, 24, { size: 12, colour: MUTED, weight: 400, anchor: 'end', id: `${id}-clock` })
      : `<text x="${ME}" y="24" text-anchor="end" font-size="12" fill="${MUTED}">${escape(time)}</text>`)
  // What Codex is doing, typed out.
  const doingText = r.thought ? `“${fit(r.doing, room - 2)}”` : fit(r.doing, room)
  const doingW = Math.min(ME - MX, doingText.length * 6.7 + 12)
  const typed =
    `<clipPath id="${id}-type"><rect x="${MX}" y="34" width="0" height="18"><animate attributeName="width" from="0" to="${doingW.toFixed(0)}" dur="1.1s" fill="freeze"/></rect></clipPath>` +
    `<text x="${MX}" y="47" font-size="12.5"${r.thought ? ' font-style="italic"' : ''} fill="${r.stalled ? WARN : r.permit ? YOU_COLOUR : r.thought ? '#c9c6ff' : '#d2d5db'}" clip-path="url(#${id}-type)">${escape(doingText)}</text>`
  const steer = working ? r.steer : undefined
  const doing = afterSteer(typed, steer) + (steer ? steerMoment({ W: W - BAND_CONTROLS, H, AY, R, LX, RX, narrow: false }, steer, 47, `${id}-steer`) : '')
  // The person's OK waiting: the line under it stays clear for its answers, which the band draws there.
  const strip = r.permit ? '' : working && r.plan ? planLine(r.plan, MX, 68, ME - MX, false, accent) : r.strip ? miniStrip(r.strip, MX, 68, ME, accent) : ''
  // The beam along the foot, in the mover's colour, with a shine running along it while it works.
  const bx = 14
  const bw = W - BAND_CONTROLS - 28
  let beam = `<rect x="${bx}" y="${H - 4}" width="${bw}" height="2" rx="1" fill="${EDGE}"/>`
  if (working) beam += `<rect x="${bx}" y="${H - 4}" width="${bw}" height="2" rx="1" fill="url(#${id}-beam)" opacity="0.55"/>`
  if (working) {
    beam += `<rect x="${bx - 80}" y="${H - 5}" width="80" height="4" rx="2" fill="url(#${id}-shine)"><animate attributeName="x" from="${bx - 80}" to="${bx + bw}" dur="2.2s" repeatCount="indefinite"/></rect>`
  }
  // Codex at work: a halo, and thought dots while it thinks.
  const halo = working && r.codexSprite
    ? rings(RX, AY, R, accent)
    : working
    ? [0, 0.9]
        .map(
          b =>
            `<g transform="translate(${RX} ${AY})"><polygon points="${hexagon(0, 0, R + 2)}" fill="none" stroke="${accent}" stroke-width="1.4" stroke-linejoin="round" opacity="0"><animate attributeName="opacity" values="0.7;0" dur="1.8s" begin="${b}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="scale" values="1;1.7" dur="1.8s" begin="${b}s" repeatCount="indefinite"/></polygon></g>`,
        )
        .join('')
    : ''
  const dots = working && (r.permit || r.asking)
    ? bubbleSvg(RX - R - 14, AY - R + 2, r.permit ? '!' : '?', { loop: 2.4, show: 1.8, colour: r.permit ? YOU_COLOUR : CLAUDE })
    : working && r.phase === 'thinking' && !r.stalled
      ? `<rect x="${RX - R - 30}" y="${AY - R - 4}" width="30" height="14" rx="7" fill="${EDGE}"/>` +
        [0, 1, 2]
          .map(
            i =>
              `<circle cx="${RX - R - 22 + i * 7}" cy="${AY - R + 3}" r="1.9" fill="${INK}"><animate attributeName="cy" values="${AY - R + 3};${AY - R};${AY - R + 3}" dur="1s" begin="${(i * 0.18).toFixed(2)}s" repeatCount="indefinite"/></circle>`,
          )
          .join('')
      : ''
  const sending =
    working && r.phase === 'sending'
      ? `<g transform="translate(${LX} ${AY})"><circle r="${R + 2}" fill="none" stroke="${CLAUDE}" stroke-width="1.4" opacity="0"><animate attributeName="opacity" values="0.7;0" dur="1.6s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="scale" values="1;1.7" dur="1.6s" repeatCount="indefinite"/></circle></g>`
      : ''
  // The side with the move is lit and named in its colour; the other waits, a little dimmer.
  const claudeOn = turn !== 'codex'
  const codexOn = turn !== 'claude'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<style>:root{color-scheme:light dark;background:transparent}</style>
${bandFrame(W, H, id, turn, r.family)}
${sending}<g opacity="${claudeOn ? 1 : 0.78}">${leftSeat(r.you, LX, AY, R, r.claudeMood)}</g>
${turn === 'claude' && working ? claudeHalo({ W, H, AY, R, LX, RX, narrow: false }) : ''}
${halo}<g opacity="${r.queued ? 0.5 : codexOn ? 1 : 0.78}">${rightSeat(r.codexSprite, RX, AY, R)}</g>${dots}
<text x="${LX}" y="${AY + R + 15}" text-anchor="middle" font-size="10.5" font-weight="${claudeOn ? 750 : 600}" fill="${claudeOn && turn !== 'both' ? CLAUDE : claudeOn ? INK : MUTED}">${r.you ? 'You' : 'Claude'}</text>
<text x="${RX}" y="${AY + R + 15}" text-anchor="middle" font-size="10.5" font-weight="${codexOn ? 750 : 600}" fill="${codexOn && turn !== 'both' ? CODEX : codexOn ? INK : MUTED}">Codex</text>
${head}
${doing}
${strip}
${beam}
${working && !r.permit ? couriers(r.toward, LX + R + 8, RX - R - 8, H - 4) : ''}
</svg>`
}

/** A note just handed to Codex, as a pill at (x, y), up to `room` wide, fading out after its moment. */
function steerPill(steer: SteerView, x: number, y: number, room: number, id: string) {
  const { colour, lead } = steerWords(steer)
  const words = fit(steer.text, Math.max(6, Math.floor((room - 30) / 6.1) - lead.length - 2))
  const w = Math.min(room, (lead.length + words.length + 2) * 6.1 + 30)
  return aged(
    `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.06;0.9;1" dur="${STEER_MOMENT}s" fill="freeze"/>` +
      `<rect x="${x.toFixed(1)}" y="${y - 12.5}" width="${w.toFixed(1)}" height="18" rx="9" fill="${BUBBLE}" stroke="${colour}" stroke-opacity="0.55" stroke-width="1.1"/>` +
      `<g transform="translate(${(x + 13).toFixed(1)} ${y - 3.5})"><rect x="-5.5" y="-3.6" width="11" height="7.2" rx="1.4" fill="${colour}"/><path d="M-5.5 -3.6L0 0.6L5.5 -3.6" fill="none" stroke="${STAGE}" stroke-width="1"/></g>` +
      `<clipPath id="${id}"><rect x="${(x + 23).toFixed(1)}" y="${y - 13}" width="0" height="20"><animate attributeName="width" from="0" to="${(w - 26).toFixed(1)}" begin="0.15s" dur="0.8s" fill="freeze"/></rect></clipPath>` +
      `<text x="${(x + 23).toFixed(1)}" y="${y + 0.5}" font-size="11" clip-path="url(#${id})"><tspan font-weight="700" fill="${colour}">${escape(lead)}</tspan><tspan fill="${INK}">“${escape(words)}”</tspan></text></g>`,
    steer,
  )
}

export const LIVE_CARD_HEIGHT = 66

/**
 * One running job in the pane's list, drawn at the pane's own width: the Codex
 * companion at work, the title and its clock, what Codex is doing (or the
 * question it waits on, or a note just sent), and its plan as it goes.
 */
export function liveCardSvg(r: BandRow, width: number) {
  const W = Math.round(Math.max(280, width))
  const H = LIVE_CARD_HEIGHT
  const id = `lc${W}`
  const turn = r.turn ?? 'codex'
  const accent = r.stalled ? WARN : turn === 'codex' ? familyColour(r.family) : turnColour(turn)
  const working = !r.queued
  const CX = 31
  const CY = 33
  const x0 = 64
  const right = W - 12
  const time = r.time
  const timeW = Math.max(4, time.length) * 6.6
  const titleRoom = Math.max(8, Math.floor((right - x0 - timeW - 10) / 7.1))
  const head =
    `<text x="${x0}" y="21" font-size="13" font-weight="680" fill="${r.queued ? MUTED : INK}">${escape(fit(r.title, titleRoom))}</text>` +
    (r.clock !== undefined
      ? liveClock(r.clock, right, 21, { size: 12, colour: MUTED, weight: 400, anchor: 'end', id: `${id}-clock` })
      : `<text x="${right}" y="21" text-anchor="end" font-size="12" fill="${MUTED}">${escape(time)}</text>`)
  const room = Math.max(10, Math.floor((right - x0) / 6.4))
  const doingText = r.thought ? `“${fit(r.doing, room - 2)}”` : fit(r.doing, room)
  const doingColour = r.stalled ? WARN : r.permit ? YOU_COLOUR : r.asking ? CLAUDE : r.thought ? '#c9c6ff' : '#d2d5db'
  const typed =
    `<clipPath id="${id}-type"><rect x="${x0}" y="27" width="0" height="17"><animate attributeName="width" from="0" to="${(right - x0).toFixed(0)}" dur="1s" fill="freeze"/></rect></clipPath>` +
    `<text x="${x0}" y="39.5" font-size="12"${r.thought ? ' font-style="italic"' : ''} fill="${doingColour}" clip-path="url(#${id}-type)">${escape(doingText)}</text>`
  const steer = working ? r.steer : undefined
  const doing = afterSteer(typed, steer) + (steer ? steerPill(steer, x0 - 2, 39, right - x0 + 2, `${id}-steer`) : '')
  const plan = working && r.plan ? planLine(r.plan, x0, 58, right - x0, false, accent) : r.strip ? miniStrip(r.strip, x0, 58, right, accent) : ''
  // Codex at work: rings, and its question or its thinking over it.
  const seat = r.codexSprite ? codexSprite(r.codexSprite, CX, CY - 1, 46) : codexAvatar(CX, CY, 15)
  const around = working ? rings(CX, CY, 17, accent) : ''
  const over = r.permit || r.asking
    ? bubbleSvg(CX + 13, CY - 22, r.permit ? '!' : '?', { loop: 2.4, show: 1.8, colour: r.permit ? YOU_COLOUR : CLAUDE })
    : working && r.phase === 'thinking' && !r.stalled
      ? `<rect x="${CX + 4}" y="${CY - 27}" width="24" height="12" rx="6" fill="${EDGE}"/>` +
        [0, 1, 2]
          .map(i => `<circle cx="${CX + 10 + i * 6}" cy="${CY - 21}" r="1.6" fill="${INK}"><animate attributeName="cy" values="${CY - 21};${CY - 23.5};${CY - 21}" dur="1s" begin="${(i * 0.18).toFixed(2)}s" repeatCount="indefinite"/></circle>`)
          .join('')
      : ''
  // A slim beam along the foot, its shine running while Codex works.
  const beam = working
    ? `<rect x="12" y="${H - 3}" width="${W - 24}" height="1.5" rx="0.75" fill="${accent}" opacity="0.35"/><rect x="-60" y="${H - 3.5}" width="60" height="2.5" rx="1.2" fill="url(#${id}-shine)"><animate attributeName="x" from="-60" to="${W}" dur="2.4s" repeatCount="indefinite"/></rect>`
    : ''
  const bg = cardGround(id, W, H)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<style>:root{color-scheme:light dark;background:transparent}</style>
<defs><clipPath id="${id}-card"><rect width="${W}" height="${H}" rx="12"/></clipPath><linearGradient id="${id}-shine" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>${bg.defs}</defs>
<g clip-path="url(#${id}-card)">${bg.ground}${r.family === 'build' ? buildGround(id, W, H) : ''}${beam}</g>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="11.5" fill="none" stroke="${bg.rim}"/>
${around}<g opacity="${r.queued ? 0.5 : 1}">${seat}</g>${over}
${head}
${doing}
${plan}
</svg>`
}

/** Where one part of a job stands. */
export type JobPartState = 'queued' | 'codex' | 'claude' | 'done' | 'dropped'

export type BandJob = {
  title: string
  /** One tile per part, in the order they were started: a task's or a review's. */
  parts: { state: JobPartState; family?: Family }[]
  time: string
  clock?: number
  codexSprite?: Sprite
  claudeMood?: ClawdMood
}

/** A part's colour on the board: its state, and for Codex at work, whether it builds or reviews. */
export function partColour(state: JobPartState, family?: Family) {
  return state === 'codex' ? familyColour(family) : state === 'claude' ? CLAUDE : state === 'done' ? GOOD : state === 'dropped' ? BAD : FAINT
}

/** One part as a small tile: lit and pulsing while someone works on it, ticked once done. */
function partTile(x: number, y: number, size: number, state: JobPartState, family: Family | undefined, i: number) {
  const colour = partColour(state, family)
  const r = family === 'build' ? 2.5 : size / 2
  if (state === 'queued') return `<rect x="${x + 0.75}" y="${y + 0.75}" width="${size - 1.5}" height="${size - 1.5}" rx="${r}" fill="none" stroke="${colour}" stroke-width="1.3" stroke-dasharray="2.5 2"/>`
  if (state === 'done') {
    return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}" fill="${colour}"/><path d="M${x + size * 0.28} ${y + size * 0.52}l${size * 0.16} ${size * 0.16} ${size * 0.3}-${size * 0.34}" fill="none" stroke="${STAGE}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
  }
  if (state === 'dropped') {
    return `<rect x="${x + 0.75}" y="${y + 0.75}" width="${size - 1.5}" height="${size - 1.5}" rx="${r}" fill="${colour}" fill-opacity="0.15" stroke="${colour}" stroke-opacity="0.6"/><path d="M${x + size * 0.33} ${y + size * 0.33}l${size * 0.34} ${size * 0.34}M${x + size * 0.67} ${y + size * 0.33}l-${size * 0.34} ${size * 0.34}" stroke="${colour}" stroke-width="1.3" stroke-linecap="round"/>`
  }
  // At work: lit, breathing, each a little out of step with the next.
  const dur = state === 'codex' ? 1.3 : 1.9
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}" fill="${colour}"><animate attributeName="opacity" values="1;0.45;1" dur="${dur}s" begin="${((i % 5) * 0.17).toFixed(2)}s" repeatCount="indefinite"/></rect>`
}

/** How many of each, for the counts under the tiles. */
export function jobCounts(parts: BandJob['parts']) {
  const n = (state: JobPartState) => parts.filter(p => p.state === state).length
  return { done: n('done'), codex: n('codex'), claude: n('claude'), queued: n('queued'), dropped: n('dropped') }
}

/**
 * A "work together" job on one strip: Claude and Codex at either end, a tile
 * for each part between them (lit for whoever has it now), and the tally.
 */
export function bandJobSvg(r: BandJob, width: number) {
  const W = Math.round(Math.max(420, width))
  const H = BAND_ROW_HEIGHT
  const R = 15
  const LX = 30
  const RX = W - BAND_CONTROLS - 32
  const AY = 31
  const MX = LX + R + 20
  const ME = RX - R - 24
  const id = `j${W}`
  const c = jobCounts(r.parts)
  const codexAt = c.codex > 0
  const claudeAt = c.claude > 0
  const turn: Turn = codexAt && claudeAt ? 'both' : claudeAt ? 'claude' : 'codex'
  const working = codexAt || claudeAt
  // The tag, the title, and the time so far.
  const pill = tagPill(MX, 11, 'Together', BUILD, 'build')
  const timeW = Math.max(4, r.time.length) * 6.6
  const titleRoom = Math.max(6, Math.floor((ME - MX - pill.w - 10 - timeW - 12) / 7.2))
  const head =
    pill.svg +
    `<text x="${MX + pill.w + 9}" y="24" font-size="13.5" font-weight="650" fill="${INK}">${escape(fit(r.title, titleRoom))}</text>` +
    (r.clock !== undefined
      ? liveClock(r.clock, ME, 24, { size: 12, colour: MUTED, weight: 400, anchor: 'end', id: `${id}-clock` })
      : `<text x="${ME}" y="24" text-anchor="end" font-size="12" fill="${MUTED}">${escape(r.time)}</text>`)
  // A tile per part; the ones that do not fit say how many more.
  const size = 13
  const step = size + 4
  const fits = Math.max(1, Math.floor((ME - MX + 4) / step))
  const shown = r.parts.length > fits ? r.parts.slice(0, fits - 1) : r.parts
  let tiles = shown.map((p, i) => partTile(MX + i * step, 34, size, p.state, p.family, i)).join('')
  if (shown.length < r.parts.length) {
    tiles += `<text x="${MX + shown.length * step + 2}" y="${34 + size - 2.5}" font-size="10.5" font-weight="700" fill="${MUTED}">+${r.parts.length - shown.length}</text>`
  }
  // The tally: done of all, and who has what.
  const tally: [string, string][] = [[`${c.done} of ${r.parts.length} done`, GOOD]]
  if (c.codex) tally.push([`${c.codex} with Codex`, BUILD])
  if (c.claude) tally.push([`${c.claude} with Claude`, CLAUDE])
  if (c.queued) tally.push([`${c.queued} queued`, FAINT])
  if (c.dropped) tally.push([`${c.dropped} dropped`, BAD])
  let tx = MX
  let counts = ''
  for (const [text, colour] of tally) {
    const w = text.length * 6.2 + 20
    if (tx + w > ME) break
    counts += `<circle cx="${tx + 4}" cy="64.4" r="3.4" fill="${colour}"/><text x="${tx + 11}" y="68" font-size="10.5" font-weight="600" fill="${MUTED}">${escape(text)}</text>`
    tx += w
  }
  // The beam, in both colours while both are at it.
  const bx = 14
  const bw = W - BAND_CONTROLS - 28
  let beam = `<rect x="${bx}" y="${H - 4}" width="${bw}" height="2" rx="1" fill="${EDGE}"/>`
  const done = r.parts.length ? (c.done / r.parts.length) * bw : 0
  if (done > 0) beam += `<rect x="${bx}" y="${H - 4}" width="${done.toFixed(1)}" height="2" rx="1" fill="${GOOD}" opacity="0.8"/>`
  if (working) {
    beam += `<rect x="${bx - 80}" y="${H - 5}" width="80" height="4" rx="2" fill="url(#${id}-shine)"><animate attributeName="x" from="${bx - 80}" to="${bx + bw}" dur="2.2s" repeatCount="indefinite"/></rect>`
  }
  const halo = codexAt && r.codexSprite ? rings(RX, AY, R, BUILD) : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<style>:root{color-scheme:light dark;background:transparent}</style>
${bandFrame(W, H, id, turn, 'build')}
<g opacity="${claudeAt ? 1 : 0.78}">${leftSeat(false, LX, AY, R, r.claudeMood)}</g>
${claudeAt ? claudeHalo({ W, H, AY, R, LX, RX, narrow: false }) : ''}
${halo}<g opacity="${codexAt ? 1 : 0.78}">${rightSeat(r.codexSprite, RX, AY, R)}</g>
<text x="${LX}" y="${AY + R + 15}" text-anchor="middle" font-size="10.5" font-weight="${claudeAt ? 750 : 600}" fill="${claudeAt ? CLAUDE : MUTED}">Claude</text>
<text x="${RX}" y="${AY + R + 15}" text-anchor="middle" font-size="10.5" font-weight="${codexAt ? 750 : 600}" fill="${codexAt ? CODEX : MUTED}">Codex</text>
${head}
${tiles}
${counts}
${beam}
${codexAt && claudeAt ? couriers('both', LX + R + 8, RX - R - 8, H - 4) : ''}
</svg>`
}

/** The size an SVG declares on its root, so its frame can be drawn at exactly that size. */
export function svgSize(svg: string) {
  const m = svg.match(/<svg[^>]*?\swidth="(\d+(?:\.\d+)?)"[^>]*?\sheight="(\d+(?:\.\d+)?)"/)
  return m ? { width: Number(m[1]), height: Number(m[2]) } : undefined
}

// ---------------------------------------------------------------------------
// The band's big moments: one job live as a small stage, and the result as it lands

export const BAND_HERO_HEIGHT = 172
export const BAND_RESULT_HEIGHT = 112

export type BandHero = BandRow & {
  kind: 'review' | 'task' | 'image' | 'joint'
  /** What the stage says Codex is at ("Reading the code", "Thinking", "Comparing notes"). */
  headline: string
  /** Codex's latest lines, typed out in turn while it thinks. */
  notes?: string[]
  /** The files Codex opened last, oldest first. */
  files: string[]
  counts: { files: number; searches: number; edits?: number }
  codexModel: string
  claudeModel: string
  /** What the run covers ("Uncommitted changes · 3 files"). */
  scope?: string
  /** Joint reviews: Claude still on its own review; Codex's notes sealed; notes going both ways. */
  claudeBusy?: boolean
  sealed?: boolean
  exchange?: boolean
  /** Codex has finished its part (it waits on Claude): no halo, no thinking. */
  codexDone?: boolean
  /** What the dashboard says under the time, instead of "elapsed". */
  timeLabel?: string
  /** A task's diff so far. */
  growing?: Growing
  /** What passed between them so far. */
  mail?: Mail
}

export type BandResult = {
  tag: string
  title: string
  /** The verdict, as the badge and the stamp word say it. */
  stamp: string
  kind: ChipKind
  colour: string
  moment?: 'spark' | 'wobble' | 'slide' | 'thud'
  /** A conversation or a task: each has its own look. */
  family?: Family
  facts: string[]
  summary?: string
  /** The pair as it lands: Codex's animation and Clawd's mood, and what they say. */
  codexSprite?: Sprite
  claudeMood?: ClawdMood
  banter?: Banter
  /** Room on the right for the band's Buttons, when it draws more than two. */
  controls?: number
}

function miniStripWidth(labels: string[]) {
  return labels.reduce((sum, l) => sum + l.length * 10.5 * 0.62 + 18, 0) + 7 * (labels.length - 1)
}

/** A line that rises into place as the band redraws: the news of the moment. */
function arrive(inner: string, delay = 0) {
  return `<g opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${delay}s" dur="0.35s" fill="freeze"/><animateTransform attributeName="transform" type="translate" from="0 5" to="0 0" begin="${delay}s" dur="0.35s" fill="freeze"/>${inner}</g>`
}

/** The files Codex just opened, as chips; the newest slides in. */
function fileTrail(files: string[], cx: number, y: number, room: number) {
  // The folder too: two route.ts files are otherwise the same chip.
  const names = files.slice(-3).map(f => fit(f.replace(/\\/g, '/').split('/').filter(Boolean).slice(-2).join('/'), 28))
  const widths = names.map(n => n.length * 6.2 + 26)
  let total = widths.reduce((a, b) => a + b, 0) + 6 * (names.length - 1)
  while (names.length > 1 && total > room) {
    names.shift()
    total -= (widths.shift() as number) + 6
  }
  let x = cx - total / 2
  return names
    .map((n, i) => {
      const w = widths[i] as number
      const newest = i === names.length - 1
      const chip = `<rect x="${x}" y="${y - 10}" width="${w}" height="20" rx="10" fill="${newest ? '#232740' : '#1f2228'}" stroke="${newest ? CODEX : EDGE}" stroke-opacity="${newest ? 0.6 : 1}"/><g transform="translate(${x + 8} ${y - 5}) scale(0.82)" fill="none" stroke="${newest ? CODEX : MUTED}" stroke-width="1.3">${ICONS.file}</g><text x="${x + 20}" y="${y + 4}" font-size="10.5" fill="${newest ? INK : MUTED}">${escape(n)}</text>`
      x += w + 6
      return newest ? `<g><animateTransform attributeName="transform" type="translate" from="-14 0" to="0 0" dur="0.4s" fill="freeze"/><animate attributeName="opacity" from="0" to="1" dur="0.4s" fill="freeze"/>${chip}</g>` : chip
    })
    .join('')
}

/** Joint reviews: a lock between them while Codex's notes are sealed. */
function sealMark(g: Geo) {
  const cx = g.W / 2
  const cy = g.AY
  return `<g><rect x="${cx - 15}" y="${cy - 9}" width="30" height="22" rx="5" fill="#262a33" stroke="${MUTED}" stroke-width="1.4"/><path d="M${cx - 8} ${cy - 9}v-5a8 8 0 0 1 16 0v5" fill="none" stroke="${MUTED}" stroke-width="2"/><circle cx="${cx}" cy="${cy + 2}" r="2.6" fill="${MUTED}"/><text x="${cx}" y="${cy + 27}" text-anchor="middle" font-size="10" fill="${MUTED}">sealed</text></g>`
}

/** Joint reviews comparing notes: notes going both ways. */
function exchange(g: Geo) {
  const a = g.LX + g.R + 12
  const b = g.RX - g.R - 12
  const note = (colour: string, from: number, to: number, dy: number, begin: number) =>
    `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur="1.9s" begin="${begin}s" repeatCount="indefinite"/><animateMotion path="M${from} ${g.AY + dy}H${to}" dur="1.9s" begin="${begin}s" repeatCount="indefinite"/><rect x="-7" y="-5" width="14" height="10" rx="2" fill="${colour}"/><path d="M-4 -1.5h8M-4 1.5h5" stroke="${STAGE}" stroke-width="1.1" stroke-linecap="round"/></g>`
  return note(CLAUDE, a, b, -7, 0) + note(CODEX, b, a, 7, 0.95)
}

/** Claude at work too: its own halo. */
function claudeHalo(g: Geo) {
  return [0, 0.8]
    .map(
      b =>
        `<g transform="translate(${g.LX} ${g.AY})"><circle r="${g.R + 2}" fill="none" stroke="${CLAUDE}" stroke-width="1.5" opacity="0"><animate attributeName="opacity" values="0.7;0" dur="1.6s" begin="${b}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="scale" values="1;1.6" dur="1.6s" begin="${b}s" repeatCount="indefinite"/></circle></g>`,
    )
    .join('')
}

/** One job, live: the stage in small, with a dashboard of time and counts beside its Buttons. */
export function bandHeroSvg(r: BandHero, width: number) {
  const W = Math.round(Math.max(560, width))
  const H = BAND_HERO_HEIGHT
  const DW = W - BAND_CONTROLS
  const R = 19
  const AY = 104
  const g: Geo = { W: DW, H, AY, R, LX: 56, RX: DW - 56, narrow: DW < 460 }
  const id = `h${W}`
  const turn = r.turn ?? 'codex'
  const accent = r.stalled ? WARN : turn === 'codex' ? familyColour(r.family) : turnColour(turn)
  const working = !r.queued
  const phase: StagePhase = r.phase === 'sending' ? 'sending' : r.phase === 'reading' ? 'reading' : 'thinking'

  // The header: what runs (in its family's tag), and what it covers.
  const pill = tagPill(16, 11, r.tag, familyColour(r.family), r.family, 18)
  const tagW = pill.w
  const scopeW = r.scope ? Math.min(DW * 0.4, r.scope.length * 6.4) : 0
  const titleRoom = Math.max(8, Math.floor((DW - 32 - tagW - 10 - scopeW - 16) / 7.4))
  const header =
    pill.svg +
    `<text x="${16 + tagW + 10}" y="24.5" font-size="14" font-weight="680" fill="${INK}">${escape(fit(r.title, titleRoom))}</text>` +
    (r.scope ? `<text x="${DW - 16}" y="24.5" text-anchor="end" font-size="11.5" fill="${MUTED}">${escape(fit(r.scope, Math.floor(scopeW / 6.4)))}</text>` : '') +
    `<path d="M14 37H${DW - 14}" stroke="${EDGE}" stroke-opacity="0.8"/>`

  // The headline and the line under it.
  const room = Math.max(12, Math.floor((DW - 2 * (g.LX + R + 46)) / 6.4))
  const headline = arrive(`<text x="${DW / 2}" y="60" text-anchor="middle" font-size="15.5" font-weight="720" fill="${r.stalled ? WARN : INK}">${escape(fit(r.headline, room))}</text>`)
  const usual =
    phase === 'thinking' && r.notes?.length && !r.stalled
      ? typewriter(g, r.notes, room, 79)
      : `<clipPath id="${id}-sub"><rect x="${g.LX + R + 30}" y="66" width="0" height="18"><animate attributeName="width" from="0" to="${DW - 2 * (g.LX + R + 30)}" dur="1s" fill="freeze"/></rect></clipPath><text x="${DW / 2}" y="79" text-anchor="middle" font-size="12.5"${r.thought ? ' font-style="italic"' : ''} fill="${r.stalled ? WARN : r.thought ? '#c9c6ff' : '#d2d5db'}" clip-path="url(#${id}-sub)">${escape(r.thought ? `“${fit(r.doing, room - 2)}”` : fit(r.doing, room))}</text>`
  const steer = working ? r.steer : undefined
  const sub = afterSteer(usual, steer) + (steer ? steerMoment(g, steer, 79, `${id}-steer`) : '')

  // The scene between them.
  let middle = ''
  let around = ''
  if (working) {
    if (!r.codexDone) around += r.codexSprite ? rings(g.RX, AY, R, accent) : halo(g)
    if (r.claudeBusy) around += claudeHalo(g)
    // Waiting on the person's OK, the middle stays still: its answers are drawn there.
    if (r.permit) middle = ''
    else if (r.kind === 'joint' && r.sealed) middle = sealMark(g)
    else if (r.kind === 'joint' && r.exchange) middle = exchange(g)
    else if (phase === 'sending') middle = plane(g)
    else if (r.kind === 'task') middle = editor(g, true)
    else if (r.kind === 'image') middle = easel(g)
    else if (phase === 'reading') middle = pages(g, r.counts.files)
    if (r.permit || r.asking) around += bubbleSvg(g.RX + R * 0.55, AY - R - 10, r.permit ? '!' : '?', { loop: 2.4, show: 1.8, colour: r.permit ? YOU_COLOUR : CLAUDE })
    else if (phase === 'thinking' && !r.stalled && !r.codexDone && r.kind !== 'task' && r.kind !== 'image') around += thought(g)
  }
  // The person's OK waiting: the lower middle stays clear for its answers, which the band draws there.
  const trail = r.kind !== 'task' && r.kind !== 'image' && r.files.length && !r.permit ? fileTrail(r.files, DW / 2, 136, DW - 2 * (g.LX + R + 60)) : ''
  const strip = r.permit
    ? ''
    : working && r.plan && r.kind !== 'image'
      ? planLine(r.plan, DW / 2, 160, DW - 40, true, accent)
      : r.strip && r.kind !== 'image'
        ? miniStrip(r.strip, DW / 2 - miniStripWidth(r.strip.labels) / 2, 160, DW - 20, accent)
        : ''

  // The dashboard over which the band draws Watch and Stop.
  const zx = DW + BAND_CONTROLS / 2
  const under = r.timeLabel ?? (working ? 'elapsed' : 'waiting')
  const growing = working && r.kind === 'task' ? r.growing : undefined
  const counts = growing
    ? [`${growing.files} file${growing.files === 1 ? '' : 's'} changed`, `+${growing.added} −${growing.removed}`]
    : [`${r.counts.files} file${r.counts.files === 1 ? '' : 's'} read`, r.counts.edits ? `${r.counts.edits} edit${r.counts.edits === 1 ? '' : 's'}` : `${r.counts.searches} search${r.counts.searches === 1 ? '' : 'es'}`]
  // Whose move it is, over the clock: a dot and two words in the mover's colour (the person's, while their OK waits).
  const words = r.permit ? 'Your turn' : turnWords(turn)
  const wordsW = words.length * 5.9 + 14
  const mover = r.permit ? YOU_COLOUR : accent
  const dash =
    `<circle cx="${zx - wordsW / 2 + 4}" cy="18.5" r="3.4" fill="${mover}"><animate attributeName="opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite"/></circle>` +
    `<text x="${zx - wordsW / 2 + 12}" y="22" font-size="10.5" font-weight="700" fill="${mover}">${escape(words)}</text>` +
    (r.clock !== undefined
      ? liveClock(r.clock, zx, 48, { size: 24, colour: INK, weight: 760, id: `${id}-clock` })
      : `<text x="${zx}" y="48" text-anchor="middle" font-size="24" font-weight="760" fill="${INK}" letter-spacing="0.5">${escape(r.time)}</text>`) +
    `<text x="${zx}" y="63" text-anchor="middle" font-size="11" fill="${MUTED}">${escape(under)}</text>` +
    `<text x="${zx}" y="132" text-anchor="middle" font-size="11" fill="${MUTED}">${escape(counts[0] as string)}</text>` +
    `<text x="${zx}" y="148" text-anchor="middle" font-size="11" fill="${MUTED}">${escape(counts[1] as string)}</text>`

  // The beam along the foot.
  const bx = 14
  const bw = DW - 28
  let beam = `<rect x="${bx}" y="${H - 4}" width="${bw}" height="2" rx="1" fill="${EDGE}"/>`
  if (working) beam += `<rect x="${bx}" y="${H - 4}" width="${bw}" height="2" rx="1" fill="url(#${id}-beam)" opacity="0.55"/>`
  if (working) beam += `<rect x="${bx - 90}" y="${H - 5}" width="90" height="4" rx="2" fill="url(#${id}-shine)"><animate attributeName="x" from="${bx - 90}" to="${bx + bw}" dur="2.2s" repeatCount="indefinite"/></rect>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<style>:root{color-scheme:light dark;background:transparent}</style>
${bandFrame(W, H, id, turn, r.family)}
<defs><linearGradient id="wireDone-${DW}" x1="${g.LX}" x2="${g.RX}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${CLAUDE}"/><stop offset="1" stop-color="${CODEX}"/></linearGradient></defs>
${header}
${wire(g, working ? phase : 'thinking')}
${middle}
<g opacity="${turn === 'codex' ? 0.8 : 1}">${leftSeat(r.you, g.LX, AY, R, r.claudeMood)}</g>
${around}
<g opacity="${r.queued ? 0.5 : turn === 'claude' ? 0.8 : 1}">${rightSeat(r.codexSprite, g.RX, AY, R)}</g>
${working && !r.codexDone ? codexReaction(g, { phase, codexSprite: r.codexSprite }) : ''}
${working && phase !== 'sending' && !r.permit ? couriers(r.toward, g.LX, g.RX, H - 4) : ''}
${r.mail ? mailboxes(g, r.mail) : ''}
<text x="${g.LX}" y="${AY + R + 16}" text-anchor="middle" font-size="12" font-weight="${turn === 'codex' ? 600 : 750}" fill="${turn === 'claude' ? CLAUDE : turn === 'codex' ? MUTED : INK}">${r.you ? 'You' : 'Claude'}</text>
<text x="${g.RX}" y="${AY + R + 16}" text-anchor="middle" font-size="12" font-weight="${turn === 'claude' ? 600 : 750}" fill="${turn === 'codex' ? CODEX : turn === 'claude' ? MUTED : INK}">Codex</text>
<text x="${g.LX}" y="${AY + R + 29}" text-anchor="middle" font-size="9.5" fill="${MUTED}">${escape(fit(r.you ? 'from the pane' : r.claudeModel, 16))}</text>
<text x="${g.RX}" y="${AY + R + 29}" text-anchor="middle" font-size="9.5" fill="${MUTED}">${escape(fit(r.codexModel, 18))}</text>
${headline}
${sub}
${trail}
${strip}
${dash}
${beam}
</svg>`
}

/** What they say when a round lands: Codex's line, then Claude's answer (none when the person sits in Claude's seat). */
export type Banter = { codex: string; claude?: string }

/** A bubble's fill: a little lighter than the stage, so the words sit on something. */
const BUBBLE = '#272b35'

/**
 * A speech bubble: three typing dots, then the words typing themselves in.
 * It sits under whoever speaks (at `x`), a short tail pointing up at them,
 * and opens away from them, centred on row `y`, at most `room` wide.
 */
function speech(text: string, x: number, o: { y: number; from: 'left' | 'right'; tint: string; begin: number; room: number; id: string }) {
  // A long line sets a little smaller before it is cut short.
  const said = text.replace(/\s+/g, ' ').trim()
  let size = 11.5
  while (size > 9.5 && said.length * size * 0.557 > o.room - 22) size -= 0.5
  const advance = size * 0.557
  const words = fit(said, Math.max(6, Math.floor((o.room - 22) / advance)))
  const w = Math.round(Math.max(46, words.length * advance + 22))
  const h = 22
  const top = o.y - h / 2
  const bx = o.from === 'left' ? x - 14 : x + 14 - w
  const corner = o.from === 'left' ? bx + 18 : bx + w - 18
  const tipX = o.from === 'left' ? corner - 4 : corner + 4
  const tipY = top - 7
  const tail = `M${corner - 6} ${top + 2}L${tipX} ${tipY}L${corner + 6} ${top + 2}Z`
  const b = o.begin
  const dots = [0, 1, 2]
    .map(
      i =>
        `<circle cx="${(bx + w / 2 - 7 + i * 7).toFixed(1)}" cy="${o.y}" r="2" fill="${MUTED}"><animate attributeName="cy" values="${o.y};${o.y - 2.5};${o.y}" dur="0.6s" begin="${(i * 0.12).toFixed(2)}s" repeatCount="indefinite"/></circle>`,
    )
    .join('')
  const body =
    `<path d="${tail}" fill="${BUBBLE}" stroke="${o.tint}" stroke-opacity="0.6" stroke-width="1.2" stroke-linejoin="round"/>` +
    `<rect x="${bx}" y="${top}" width="${w}" height="${h}" rx="11" fill="${BUBBLE}" stroke="${o.tint}" stroke-opacity="0.6" stroke-width="1.2"/>` +
    `<path d="M${corner - 5} ${top + 2.5}h10" stroke="${BUBBLE}" stroke-width="2.4"/>` +
    // The dots while they "type", then the words.
    `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.8;1" begin="${b.toFixed(2)}s" dur="0.65s" fill="freeze"/>${dots}</g>` +
    `<clipPath id="${o.id}"><rect x="${bx + 8}" y="${top}" width="0" height="${h}"><animate attributeName="width" from="0" to="${w - 14}" begin="${(b + 0.6).toFixed(2)}s" dur="${Math.min(0.9, 0.25 + words.length * 0.025).toFixed(2)}s" fill="freeze"/></rect></clipPath>` +
    `<text x="${bx + 11}" y="${o.y + 4}" font-size="${size}" font-weight="620" fill="${INK}" clip-path="url(#${o.id})">${escape(words)}</text>`
  return `<g transform="translate(${tipX} ${tipY})"><g opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${b.toFixed(2)}s" dur="0.12s" fill="freeze"/><animateTransform attributeName="transform" type="scale" values="0.4;1.08;1" keyTimes="0;0.6;1" begin="${b.toFixed(2)}s" dur="0.32s" fill="freeze"/><g transform="translate(${-tipX} ${-tipY})">${body}</g></g></g>`
}

/** A burst of confetti from a point, once: it arcs up, tumbles and falls away. */
export function confetti(cx: number, cy: number, begin: number, colours: string[]) {
  return Array.from({ length: 20 }, (_, i) => {
    const a = -Math.PI / 2 + (i / 19 - 0.5) * Math.PI * 1.25
    const v = 30 + ((i * 37) % 28)
    const dx = Math.cos(a) * v * 1.6
    const up = Math.sin(a) * v
    const fall = 34 + ((i * 13) % 22)
    const dur = 1.25 + (i % 5) * 0.09
    const start = (begin + (i % 4) * 0.03).toFixed(2)
    const colour = colours[i % colours.length]
    const piece = i % 3 === 0 ? `<circle r="2.2" fill="${colour}"/>` : `<rect x="-2" y="-3.5" width="4" height="7" rx="1" fill="${colour}"/>`
    return `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.7;1" begin="${start}s" dur="${dur.toFixed(2)}s" fill="freeze"/><animateMotion path="M${cx} ${cy}Q${(cx + dx * 0.55).toFixed(1)} ${(cy + up * 1.5).toFixed(1)} ${(cx + dx).toFixed(1)} ${(cy + fall).toFixed(1)}" begin="${start}s" dur="${dur.toFixed(2)}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.2 0.6 0.4 1"/><g><animateTransform attributeName="transform" type="rotate" values="0;${i % 2 ? 360 : -360}" dur="${(0.6 + (i % 3) * 0.2).toFixed(2)}s" repeatCount="indefinite"/>${piece}</g></g>`
  }).join('')
}

/** An idea: a bulb lighting up over Codex. */
function bulb(cx: number, cy: number, begin: number) {
  return `<g opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${begin}s" dur="0.2s" fill="freeze"/><animateTransform attributeName="transform" type="translate" values="0 6;0 -2;0 0" begin="${begin}s" dur="0.45s" fill="freeze"/><circle cx="${cx}" cy="${cy}" r="11" fill="#ffd54a" opacity="0.18"><animate attributeName="r" values="9;13;9" dur="1.6s" repeatCount="indefinite"/></circle><path d="M${cx - 4.5} ${cy + 1}a5.5 5.5 0 1 1 9 0c-1.2 1.2-1.6 2-1.6 3.4h-5.8c0-1.4-0.4-2.2-1.6-3.4z" fill="#ffd54a"/><path d="M${cx - 2.6} ${cy + 6.2}h5.2M${cx - 2} ${cy + 8.2}h4" stroke="#c9a52e" stroke-width="1.3" stroke-linecap="round"/></g>`
}

/**
 * The result as it lands: Codex and Clawd either side, reacting; the verdict
 * stamp slamming in (sparks and confetti, a wobble, a slide or a thud); then
 * Codex says its piece and Claude answers.
 */
export function bandResultSvg(r: BandResult, width: number) {
  const W = Math.round(Math.max(480, width))
  const H = BAND_RESULT_HEIGHT
  const controls = r.controls ?? BAND_CONTROLS
  const DW = W - controls
  const id = `r${W}`
  const R = 19
  const LX = 46
  const RX = DW - 48
  const cy = 52
  const x0 = LX + R + 28
  const xEnd = RX - R - 26
  const g: Geo = { W: DW, H, AY: cy, R, LX, RX, narrow: false }
  const failed = r.kind === 'failed' || r.kind === 'task_failed'

  // The header: what it was, in its family's tag (the verdict has the stamp's colour).
  const pill = tagPill(x0, 12, r.tag, familyColour(r.family), r.family)
  const tagW = pill.w
  const titleRoom = Math.max(8, Math.floor((xEnd - x0 - tagW - 10) / 7.3))
  const header = arrive(
    `${pill.svg}<text x="${x0 + tagW + 9}" y="25" font-size="13.5" font-weight="680" fill="${INK}">${escape(fit(r.title, titleRoom))}</text>`,
    0.05,
  )

  // The stamp: slammed in at 0.3 s, then its moment.
  const stampW = Math.round(r.stamp.length * 7.7 + 24)
  const scx = x0 + stampW / 2
  const scy = 50
  const after =
    r.moment === 'wobble'
      ? `<animateTransform attributeName="transform" type="rotate" values="0;-9;7;-4;0" begin="0.62s" dur="0.6s" fill="freeze" additive="sum"/>`
      : r.moment === 'thud'
        ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 2;0 0" begin="0.62s" dur="0.18s" fill="freeze" additive="sum"/>`
        : ''
  const entry =
    r.moment === 'slide'
      ? `<animateTransform attributeName="transform" type="translate" values="60 0;-4 0;0 0" keyTimes="0;0.75;1" begin="0.3s" dur="0.45s" fill="freeze"/>`
      : `<animateTransform attributeName="transform" type="scale" values="2.3;0.92;1" keyTimes="0;0.7;1" begin="0.3s" dur="0.36s" fill="freeze"/>`
  const stamp = `<g transform="translate(${scx} ${scy})"><g opacity="0"><animate attributeName="opacity" from="0" to="1" begin="0.3s" dur="0.1s" fill="freeze"/>${entry}<g>${after}<g transform="rotate(-3)"><rect x="${-stampW / 2}" y="-12.5" width="${stampW}" height="25" rx="7" fill="${r.colour}" fill-opacity="0.14" stroke="${r.colour}" stroke-width="1.8"/><rect x="${-stampW / 2 + 3}" y="-9.5" width="${stampW - 6}" height="19" rx="5" fill="none" stroke="${r.colour}" stroke-opacity="0.5" stroke-dasharray="3 3"/><text y="5" text-anchor="middle" font-size="13" font-weight="800" letter-spacing="0.5" fill="${r.colour}">${escape(r.stamp.toUpperCase())}</text></g></g></g></g>`
  const rays =
    r.moment === 'spark'
      ? `<g transform="translate(${scx} ${scy})" opacity="0"><animate attributeName="opacity" values="0;1;0" keyTimes="0;0.25;1" begin="0.55s" dur="0.7s" fill="freeze"/><animateTransform attributeName="transform" type="scale" values="0.7;1.3" begin="0.55s" dur="0.7s" fill="freeze" additive="sum"/>${Array.from({ length: 12 }, (_, i) => {
          const a = (Math.PI * 2 * i) / 12
          const rx = stampW / 2 + 8
          return `<path d="M${(Math.cos(a) * rx).toFixed(1)} ${(Math.sin(a) * 18).toFixed(1)}L${(Math.cos(a) * (rx + 9)).toFixed(1)} ${(Math.sin(a) * 26).toFixed(1)}" stroke="${i % 3 ? r.colour : INK}" stroke-width="2" stroke-linecap="round"/>`
        }).join('')}</g>`
      : ''
  const party = r.moment === 'spark' ? confetti(scx, scy, 0.55, [r.colour, CLAUDE, CODEX, '#ffd54a', INK]) : ''
  const factsText = r.facts.join(' · ')
  const factsRoom = Math.max(6, Math.floor((xEnd - x0 - stampW - 14) / 6.5))
  const facts = factsText ? arrive(`<text x="${x0 + stampW + 12}" y="55" font-size="12" fill="${MUTED}">${escape(fit(factsText, factsRoom))}</text>`, 0.5) : ''
  const summary = r.summary ? arrive(`<text x="${x0}" y="78" font-size="12" font-style="italic" fill="#c3c6cc">${escape(fit(r.summary, Math.floor((xEnd - x0) / 6.3)))}</text>`, 0.65) : ''

  // The pair, reacting as the stamp lands; then what they say.
  const claude = leftSeat(false, LX, cy, R, r.claudeMood ?? (failed ? 'sad' : r.moment === 'spark' ? 'happy' : 'nod'), 0.6)
  const codex = rightSeat(r.codexSprite, RX, cy, R)
  const react = codexReaction(g, { phase: failed ? 'failed' : 'done', moment: r.moment === 'thud' ? undefined : r.moment, codexSprite: r.codexSprite })
  const idea = r.kind === 'answer' ? bulb(RX + R * 0.75, cy - R - 6, 0.7) : ''
  const row = 95
  const [says, answers] = r.banter ? shareRoom(RX - LX - 52, r.banter.codex, r.banter.claude) : [0, 0]
  const said = r.banter
    ? speech(r.banter.codex, RX, { y: row, from: 'right', tint: CODEX, begin: 0.95, room: says, id: `${id}-says` }) +
      (r.banter.claude ? speech(r.banter.claude, LX, { y: row, from: 'left', tint: CLAUDE, begin: 2.05, room: answers, id: `${id}-answers` }) : '')
    : ''

  const drawn = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<style>:root{color-scheme:light dark;background:transparent}</style>
<defs><radialGradient id="${id}-gv"><stop offset="0" stop-color="${r.colour}" stop-opacity="0.26"/><stop offset="1" stop-color="${r.colour}" stop-opacity="0"/></radialGradient></defs>
${bandFrame(W, H, id, 'both', r.family, controls)}
<g clip-path="url(#${id}-card)"><ellipse cx="${scx}" cy="${scy}" rx="${stampW}" ry="60" fill="url(#${id}-gv)" opacity="0"><animate attributeName="opacity" from="0" to="1" begin="0.35s" dur="0.4s" fill="freeze"/></ellipse><rect width="${DW}" height="3" fill="${r.colour}" opacity="0.85"/></g>
${header}
${rays}
${stamp}
${facts}
${summary}
<g>${claude}</g>
<g>${codex}</g>
${react}
${idea}
${said}
<g clip-path="url(#${id}-card)">${party}</g>
${bandSweep(W, H, id)}
</svg>`
  // Finished: its loops come to rest after the landing (see settle).
  return settle(drawn)
}

/** The Codex mark alone, for a native row. */
export function codexMarkSvg(size = 18, sprite?: Sprite) {
  if (sprite) return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${codexSprite(sprite, size / 2, size / 2, size)}</svg>`
  const r = size / 2 - 1
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${codexAvatar(size / 2, size / 2, r)}</svg>`
}

/** The plan's use as a small ring that fills as it draws, its colour by how near the limit it is. */
export function ringSvg(percent: number, size = 36) {
  const p = Math.max(0, Math.min(100, percent))
  const c0 = size / 2
  const r = size / 2 - 3.5
  const len = 2 * Math.PI * r
  const used = Math.max(p > 0 ? 2 : 0, (p / 100) * len)
  const label = p >= 10 || p === 0 ? `${Math.round(p)}%` : `${p.toFixed(1).replace(/\.0$/, '')}%`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" font-family="${FONT}"><circle cx="${c0}" cy="${c0}" r="${r.toFixed(1)}" fill="none" stroke="${EDGE}" stroke-width="3.5"/><circle cx="${c0}" cy="${c0}" r="${r.toFixed(1)}" fill="none" stroke="${gaugeColour(p)}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${used.toFixed(1)} ${len.toFixed(1)}" transform="rotate(-90 ${c0} ${c0})"><animate attributeName="stroke-dasharray" from="0 ${len.toFixed(1)}" to="${used.toFixed(1)} ${len.toFixed(1)}" dur="0.9s" calcMode="spline" keyTimes="0;1" keySplines="0.2 0.7 0.3 1" fill="freeze"/></circle><text x="${c0}" y="${(c0 + size * 0.1).toFixed(1)}" text-anchor="middle" font-size="${(size * 0.27).toFixed(1)}" font-weight="750" fill="${INK}">${label}</text></svg>`
}

/** What the pair in the pane's header is up to. */
export type PairState = 'idle' | 'working' | 'asking' | 'you' | 'happy' | 'sleep'

export const PAIR_SIZE = { width: 116, height: 48 }

/** Clawd's pixel size beside a Codex companion drawn `size` tall: the stage's proportion, so the two read as a pair of equals. */
function clawdUnitFor(size: number) {
  return (3.1 * size) / 2.9 / 18
}

/**
 * The pair at the top of the pane, small: Clawd and the Codex companion with
 * what they are up to between them. Idle, they toss a note back and forth now
 * and then; at work, notes run both ways; Codex asking shows its question
 * mark, the person's turn a call over Clawd. Idle and happy scenes come to
 * rest (see settle); working ones play while the work lasts.
 */
export function pairSvg(o: { state: PairState; sprite?: Sprite; mood?: ClawdMood; ground?: boolean }) {
  const { width: W, height: H } = PAIR_SIZE
  const LX = 26
  const RX = 93
  const AY = 28
  const SIZE = 40
  const U = clawdUnitFor(SIZE)
  // Clawd's head and its right edge, for what goes over and beside it.
  const head = AY + 1 - 5 * U
  const edge = LX + 9 * U
  const env = (colour: string) =>
    `<rect x="-5.5" y="-3.8" width="11" height="7.6" rx="1.5" fill="${INK}"/><path d="M-5.5 -3.8L0 0.8L5.5 -3.8" fill="none" stroke="${STAGE}" stroke-width="1"/><circle cx="3.4" cy="2" r="1.5" fill="${colour}"/>`
  // A note on its way between them: along a low arc, over `dur`, starting at `begin`.
  const toss = (from: number, to: number, colour: string, begin: number, dur: number, period: number) => {
    const k0 = (begin / period).toFixed(3)
    const k1 = ((begin + dur) / period).toFixed(3)
    return `<g opacity="0"><animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;${k0};${(Number(k0) + 0.01).toFixed(3)};${(Number(k1) - 0.01).toFixed(3)};${k1};1" dur="${period}s" repeatCount="indefinite"/><animateMotion path="M${from} ${AY - 2}Q${W / 2} ${AY - 20} ${to} ${AY - 2}" keyPoints="0;0;1;1" keyTimes="0;${k0};${k1};1" calcMode="linear" dur="${period}s" repeatCount="indefinite"/><g><animateTransform attributeName="transform" type="rotate" values="-12;12;-12" dur="0.5s" repeatCount="indefinite"/>${env(colour)}</g></g>`
  }
  let middle = ''
  let mood: ClawdMood = o.mood ?? 'idle'
  let codexBubble = ''
  let clawdBubble = ''
  const from = edge - 4
  const to = RX - 14
  const line = `<path d="M${(edge + 2).toFixed(1)} ${AY}H${RX - 17}" stroke="${FAINT}" stroke-width="1.5" stroke-dasharray="2 4" stroke-linecap="round"/>`
  if (o.state === 'working') {
    middle = toss(from, to, CLAUDE, 0, 0.9, 1.8) + toss(to, from, CODEX, 0.9, 0.9, 1.8)
    mood = o.mood ?? 'watch'
  } else if (o.state === 'asking') {
    middle = line
    codexBubble = bubbleSvg(RX + 9, AY - 19, '?', { loop: 2.4, show: 1.8, colour: CLAUDE })
    mood = 'think'
  } else if (o.state === 'sleep') {
    // Nothing for hours: Clawd dozes.
    mood = 'sleep'
  } else if (o.state === 'you') {
    middle = line
    clawdBubble = bubbleSvg(edge - 3, head - 7, '!', { loop: 3, show: 2, colour: YOU_COLOUR })
  } else if (o.state === 'happy') {
    middle = [0, 0.5, 1]
      .map(
        (d, i) =>
          `<path d="M${W / 2 + (i - 1) * 9} ${AY - 2}c-2-3-6-1-4 2l4 4 4-4c2-3-2-5-4-2z" fill="${i === 1 ? CLAUDE : CODEX}" opacity="0"><animate attributeName="opacity" values="0;1;0" dur="1.6s" begin="${d}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 4;0 -8" dur="1.6s" begin="${d}s" repeatCount="indefinite"/></path>`,
      )
      .join('')
    mood = 'happy'
  } else {
    // Idle: now and then they toss a note back and forth.
    middle = toss(from, to, CLAUDE, 1.2, 1, 6) + toss(to, from, CODEX, 3.4, 1, 6)
  }
  const codex = o.sprite ? codexSprite(o.sprite, RX, AY - 3, SIZE) : codexAvatar(RX, AY, 13)
  // On their own little patch of sky (the hour's), when asked for.
  const bg = o.ground ? cardGround('pair', W, H, { sheen: false }) : undefined
  const ground = bg ? `<defs><clipPath id="pair-card"><rect width="${W}" height="${H}" rx="11"/></clipPath>${bg.defs}</defs><g clip-path="url(#pair-card)">${bg.ground}</g><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10.5" fill="none" stroke="${bg.rim}"/>` : ''
  const drawn = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${ground}${middle}${seasonal(edge + 5, AY + 11)}${clawd(LX, AY + 1, U, mood)}${codex}${codexBubble}${clawdBubble}</svg>`
  return o.state === 'idle' || o.state === 'happy' || o.state === 'sleep' ? settle(drawn, 12) : drawn
}

/** A touch of the season by the pair's feet: a snowflake in December. */
function seasonal(x: number, y: number) {
  if (new Date().getMonth() === 11) {
    return `<g transform="translate(${x} ${y - 2})" stroke="#cfe8ff" stroke-width="1.1" stroke-linecap="round"><path d="M0 -4.5V4.5M-3.9 -2.25L3.9 2.25M-3.9 2.25L3.9 -2.25"/><animateTransform attributeName="transform" type="rotate" values="0;60" dur="6s" additive="sum" repeatCount="indefinite"/></g>`
  }
  return ''
}

/** A slim usage meter. */
export function meterSvg(percent: number, width = 64, height = 6) {
  const p = Math.max(0, Math.min(100, percent))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" rx="${height / 2}" fill="#8a8f98" fill-opacity="0.25"/><rect width="${Math.max(height, (width * p) / 100).toFixed(1)}" height="${height}" rx="${height / 2}" fill="${gaugeColour(p)}"/></svg>`
}

/**
 * Moves every animation in an SVG back by `offset` seconds. The app rebuilds
 * a drawing on each redraw (scrolling a pane redraws it at every step), and a
 * rebuilt picture starts its animations over; started this far back, it
 * carries on where the last one was instead: entrances stay landed, loops
 * keep their phase.
 */
export function continueAnimations(svg: string, offset: number) {
  if (offset < 0.05) return svg
  return svg.replace(/<(animate|animateTransform|animateMotion|set)\b([^>]*?)(\/?)>/g, (all, tag: string, attrs: string, close: string) => {
    const given = attrs.match(/\sbegin="(-?\d*\.?\d+)s"/)
    if (!given && /\sbegin="/.test(attrs)) return all
    const dur = Number(attrs.match(/\sdur="(\d*\.?\d+)s"/)?.[1] ?? Number.NaN)
    const forever = /\s(repeatCount|repeatDur)="indefinite"/.test(attrs)
    // A loop settled to a few cycles (see settle) runs that many times over.
    const total = dur * Number(attrs.match(/\srepeatCount="(\d+)"/)?.[1] ?? 1)
    let begin = (given ? Number(given[1]) : 0) - offset
    // A one-off that would have ended before this picture began never gets
    // its frozen end state in a Chromium image (the badge and words of a
    // result stayed invisible): it lands on its end at once instead.
    if (!forever && Number.isFinite(total) && begin + total <= 0) begin = -Math.max(0, total - 0.02)
    const value = ` begin="${begin.toFixed(2)}s"`
    return given ? `<${tag}${attrs.replace(given[0], value)}${close}>` : `<${tag}${attrs}${value}${close}>`
  })
}

/**
 * Lets a picture's loops run on for about `seconds`, then rest at the end of
 * a cycle (where most loops are back where they began). An image with any
 * animation in it is drawn again on every frame: a finished card that kept
 * looping cost a tenth of a core for as long as it was on screen.
 */
export function settle(svg: string, seconds = 8) {
  return svg.replace(/<(animate|animateTransform|animateMotion)\b([^>]*?)\srepeatCount="indefinite"([^>]*?)(\/?)>/g, (all, tag: string, a: string, b: string, close: string) => {
    const attrs = a + b
    const dur = Number(attrs.match(/\sdur="(\d*\.?\d+)s"/)?.[1] ?? Number.NaN)
    if (!Number.isFinite(dur) || dur <= 0) return all
    const begin = Math.max(0, Number(attrs.match(/\sbegin="(-?\d*\.?\d+)s"/)?.[1] ?? 0))
    const count = Math.max(1, Math.ceil((seconds - begin) / dur))
    return `<${tag}${a} repeatCount="${count}"${/\sfill="/.test(attrs) ? '' : ' fill="freeze"'}${b}${close}>`
  })
}

/**
 * A picture held still but for its clock. A running job's card in the chat
 * shows the same run the band above the prompt plays, so it stays still
 * rather than cost a second moving picture.
 */
export function calm(svg: string) {
  return svg.replace(/<(animate|animateTransform|animateMotion)\b[^>]*?repeatCount="indefinite"[^>]*?\/>/g, tag => (/calcMode="discrete" dur="(10|60|600|6000)s"/.test(tag) ? tag : ''))
}

/** No open findings: a tick that pops, with a burst of confetti in both their colours. */
export function allClearSvg() {
  const W = 240
  const H = 112
  const cx = W / 2
  const cy = 54
  const colours = [CLAUDE, CODEX, GOOD, WARN]
  const bits = Array.from({ length: 18 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 18 + (i % 2 ? 0.15 : -0.1)
    const d = 46 + (i % 3) * 14
    const x = (Math.cos(a) * d).toFixed(1)
    const y = (Math.sin(a) * d * 0.7).toFixed(1)
    const colour = colours[i % colours.length] as string
    const shape = i % 3 === 0 ? `<circle r="2.6" fill="${colour}"/>` : `<rect x="-3.5" y="-1.6" width="7" height="3.2" rx="1" fill="${colour}" transform="rotate(${(i * 37) % 180})"/>`
    return `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.7;1" begin="0.35s" dur="1.4s" fill="freeze"/><animateTransform attributeName="transform" type="translate" values="0 0;${x} ${y};${x} ${(Number(y) + 14).toFixed(1)}" keyTimes="0;0.6;1" begin="0.35s" dur="1.4s" fill="freeze"/>${shape}</g>`
  }).join('')
  const ring = `<circle r="30" fill="none" stroke="${GOOD}" stroke-width="2" opacity="0"><animate attributeName="opacity" values="0.8;0" begin="0.35s" dur="1s" fill="freeze"/><animateTransform attributeName="transform" type="scale" values="1;1.9" begin="0.35s" dur="1s" fill="freeze"/></circle>`
  const badge = `<g opacity="0"><animate attributeName="opacity" from="0" to="1" dur="0.2s" fill="freeze"/><animateTransform attributeName="transform" type="scale" values="1.7;0.9;1" keyTimes="0;0.7;1" dur="0.45s" fill="freeze"/><circle r="28" fill="${GOOD}"/><path d="M-12 1l8 8 16-17" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>`
  const glow = `<radialGradient id="ac-glow"><stop offset="0" stop-color="${GOOD}" stop-opacity="0.32"/><stop offset="1" stop-color="${GOOD}" stop-opacity="0"/></radialGradient>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${glow}</defs><circle cx="${cx}" cy="${cy}" r="56" fill="url(#ac-glow)"/><g transform="translate(${cx} ${cy})">${bits}${ring}${badge}</g></svg>`
}

// ---------------------------------------------------------------------------
// The mascots: Clawd for Claude, the Codex companion for Codex

/** One of the Codex companion's animations: a strip of frames, read from the installed Codex app. */
export type Sprite = { href: string; frames: number; fps: number; w: number; h: number }

export type ClawdMood = 'idle' | 'busy' | 'send' | 'watch' | 'wait' | 'happy' | 'nod' | 'worried' | 'shock' | 'sad' | 'read' | 'think' | 'sleep'

/**
 * Clawd, Claude Code's mascot, as its welcome screen draws it in block
 * characters: an 18 × 5 grid of pixels each twice as tall as wide. It
 * breathes, looks toward Codex, throws, types, taps its foot, cheers,
 * worries, gasps, sulks, reads Codex's work, ponders an answer and dozes.
 */
export function clawd(cx: number, cy: number, u: number, mood: ClawdMood = 'idle', react = 0) {
  const W = 18 * u
  const H = 10 * u
  const x0 = cx - W / 2
  const y0 = cy - H / 2
  const feet = y0 + H
  const f = (n: number) => n.toFixed(1)
  const X = (x: number) => f(x0 + x * u)
  const Y = (y: number) => f(y0 + y * 2 * u)
  const px = (x: number, y: number, w = 1, h = 1) => `<rect x="${X(x)}" y="${Y(y)}" width="${f(w * u + 0.3)}" height="${f(h * 2 * u + 0.3)}"/>`
  const EYE = '#15171c'
  const forever = (attr: string, values: string, dur: number, extra = '') =>
    `<animate${attr.startsWith('transform:') ? 'Transform attributeName="transform" type="' + attr.slice(10) + '"' : ` attributeName="${attr}"`} values="${values}" dur="${dur}s" begin="${react}s" repeatCount="indefinite"${extra}/>`
  const hopping = mood === 'happy' || mood === 'send' || mood === 'shock'

  // Eyes, by mood.
  const eye = (x: number, dx = 0, dy = 0, w = 1, h = 1) => `<rect x="${f(x0 + (x + dx) * u)}" y="${f(y0 + (1 + dy) * 2 * u)}" width="${f(w * u)}" height="${f(h * 2 * u)}" fill="${EYE}"/>`
  const caret = (x: number) =>
    `<path d="M${f(x0 + (x - 0.15) * u)} ${f(y0 + 3.6 * u)}L${f(x0 + (x + 0.5) * u)} ${f(y0 + 2.3 * u)}L${f(x0 + (x + 1.15) * u)} ${f(y0 + 3.6 * u)}" fill="none" stroke="${EYE}" stroke-width="${f(u * 0.55)}" stroke-linecap="round" stroke-linejoin="round"/>`
  const cross = (x: number) =>
    `<path d="M${f(x0 + (x - 0.1) * u)} ${f(y0 + 2.3 * u)}l${f(1.2 * u)} ${f(1.5 * u)}M${f(x0 + (x + 1.1) * u)} ${f(y0 + 2.3 * u)}l${f(-1.2 * u)} ${f(1.5 * u)}" stroke="${EYE}" stroke-width="${f(u * 0.45)}" stroke-linecap="round"/>`
  let eyes: string
  if (mood === 'happy' || mood === 'nod') eyes = caret(5) + caret(12)
  else if (mood === 'sad') eyes = cross(5) + cross(12)
  else if (mood === 'shock')
    eyes = `${eye(4.75, 0, -0.2, 1.5, 1.35)}${eye(11.75, 0, -0.2, 1.5, 1.35)}<rect x="${X(5.4)}" y="${f(y0 + 1.9 * u)}" width="${f(u * 0.45)}" height="${f(u * 0.6)}" fill="#fff"/><rect x="${X(12.4)}" y="${f(y0 + 1.9 * u)}" width="${f(u * 0.45)}" height="${f(u * 0.6)}" fill="#fff"/>`
  else if (mood === 'busy') eyes = eye(5, 0, 0.45, 1, 0.55) + eye(12, 0, 0.45, 1, 0.55)
  // Reading: eyes down on the page, running along its lines.
  else if (mood === 'read') eyes = `<g>${forever('transform:translate', `0 0;${f(0.7 * u)} 0;${f(0.7 * u)} 0;0 0`, 1.8, ' keyTimes="0;0.7;0.85;1"')}${eye(5, -0.2, 0.45, 0.8, 0.55)}${eye(12, -0.2, 0.45, 0.8, 0.55)}</g>`
  // Pondering: eyes up and aside.
  else if (mood === 'think') eyes = eye(5, 0.5, -0.25, 0.6, 0.7) + eye(12, 0.5, -0.25, 0.6, 0.7)
  // Dozing: eyes shut.
  else if (mood === 'sleep') eyes = eye(4.8, 0, 0.62, 1.4, 0.2) + eye(11.8, 0, 0.62, 1.4, 0.2)
  else if (mood === 'watch' || mood === 'wait' || mood === 'send' || mood === 'worried') eyes = eye(5, 0.4, 0, 0.6) + eye(12, 0.4, 0, 0.6)
  else eyes = eye(5) + eye(12)
  const blinks = mood === 'happy' || mood === 'nod' || mood === 'sad' || mood === 'shock' || mood === 'busy' || mood === 'read' || mood === 'sleep'
  const lids = blinks
    ? ''
    : [5, 12]
        .map(x => `<rect x="${X(x)}" y="${Y(1)}" width="${f(u + 0.3)}" height="${f(2 * u + 0.3)}" opacity="0"><animate attributeName="opacity" values="0;0;1;0" keyTimes="0;0.93;0.965;1" dur="3.4s" repeatCount="indefinite"/></rect>`)
        .join('')

  // Arms and feet.
  const armBox = (x: number) => px(x, 2, 2)
  let armL = armBox(1)
  let armR = armBox(15)
  let legs = px(4, 4) + px(6, 4) + px(11, 4) + px(13, 4)
  if (mood === 'happy') {
    armL = `<g>${forever('transform:translate', `0 0;0 ${f(-3 * u)};0 0`, 0.4)}${armBox(1)}</g>`
    armR = `<g>${forever('transform:translate', `0 ${f(-3 * u)};0 0;0 ${f(-3 * u)}`, 0.4)}${armBox(15)}</g>`
  } else if (mood === 'send') {
    // The throwing arm: back, up, over.
    armR = `<g><animateTransform attributeName="transform" type="translate" values="0 0;${f(-u)} ${f(-u)};0 ${f(-4 * u)};${f(2 * u)} ${f(-2 * u)};0 0;0 0" keyTimes="0;0.18;0.36;0.42;0.6;1" dur="${SEND.period}s" repeatCount="indefinite"/>${armBox(15)}</g>`
    armL = `<g>${forever('transform:translate', `0 0;0 ${f(-u)};0 0`, SEND.period / 2)}${armBox(1)}</g>`
  } else if (mood === 'busy') {
    armL = `<g>${forever('transform:translate', `0 0;0 ${f(1.2 * u)};0 0`, 0.26)}${armBox(1)}</g>`
    armR = `<g><animateTransform attributeName="transform" type="translate" values="0 ${f(1.2 * u)};0 0;0 ${f(1.2 * u)}" dur="0.26s" repeatCount="indefinite"/>${armBox(15)}</g>`
  } else if (mood === 'sad') {
    armL = `<g transform="translate(0 ${f(1.4 * u)})">${armBox(1)}</g>`
    armR = `<g transform="translate(0 ${f(1.4 * u)})">${armBox(15)}</g>`
  } else if (mood === 'shock') {
    armL = `<g transform="translate(0 ${f(-2.2 * u)})">${armBox(1)}</g>`
    armR = `<g transform="translate(0 ${f(-2.2 * u)})">${armBox(15)}</g>`
  } else if (mood === 'think') {
    // A hand to the chin.
    armR = `<g transform="translate(${f(-1.4 * u)} ${f(-1.6 * u)})">${armBox(15)}</g>`
  }
  if (mood === 'wait') legs = px(4, 4) + px(6, 4) + px(11, 4) + `<g>${forever('transform:translate', `0 0;0 ${f(-1.1 * u)};0 0;0 0`, 0.7)}${px(13, 4)}</g>`
  if (mood === 'busy' || mood === 'happy') {
    legs = `<g>${forever('transform:translate', `0 0;0 ${f(-u)};0 0`, mood === 'happy' ? 0.4 : 0.5)}${px(4, 4)}${px(11, 4)}</g><g><animateTransform attributeName="transform" type="translate" values="0 ${f(-u)};0 0;0 ${f(-u)}" dur="${mood === 'happy' ? 0.4 : 0.5}s" repeatCount="indefinite"/>${px(6, 4)}${px(13, 4)}</g>`
  }

  // The whole body: squash and stretch from the feet, and hops.
  const squash =
    mood === 'happy'
      ? forever('transform:scale', '1 1;0.94 1.08;1.06 0.88;1 1', 0.8)
      : mood === 'send'
        ? `<animateTransform attributeName="transform" type="scale" values="1 1;1.05 0.9;0.96 1.08;1 1;1 1" keyTimes="0;0.3;0.42;0.6;1" dur="${SEND.period}s" repeatCount="indefinite"/>`
        : mood === 'nod'
          ? forever('transform:scale', '1 1;1.03 0.9;1 1;1.03 0.9;1 1;1 1', 2.6)
          : mood === 'sad'
            ? '<animateTransform attributeName="transform" type="scale" values="1.03 0.92" dur="0.1s" fill="freeze"/>'
            : mood === 'sleep'
              ? forever('transform:scale', '1 1;1.03 0.93;1 1', 3.6)
              : forever('transform:scale', '1 1;1.02 0.96;1 1', mood === 'busy' ? 0.9 : 2.8)
  const hop =
    mood === 'happy'
      ? forever('transform:translate', `0 0;0 ${f(-5 * u)};0 0`, 0.8, ' keyTimes="0;0.45;1" calcMode="spline" keySplines="0.2 0.7 0.4 1;0.6 0 0.8 0.3"')
      : mood === 'send'
        ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 ${f(-2.5 * u)};0 0;0 0" keyTimes="0;0.34;0.44;0.56;1" dur="${SEND.period}s" repeatCount="indefinite"/>`
        : mood === 'shock'
          ? `<animateTransform attributeName="transform" type="translate" values="0 0;${f(-3 * u)} ${f(-4 * u)};${f(-3 * u)} 0" keyTimes="0;0.4;1" dur="0.45s" begin="${react}s" fill="freeze"/>`
          : mood === 'worried'
            ? forever('transform:translate', `0 0;${f(0.5 * u)} 0;${f(-0.5 * u)} 0;0 0;0 0`, 1.2)
            : ''
  const lean =
    mood === 'send'
      ? `<animateTransform attributeName="transform" type="rotate" values="0;-9;12;0;0" keyTimes="0;0.3;0.42;0.6;1" dur="${SEND.period}s" repeatCount="indefinite" additive="sum"/>`
      : ''

  // Props: a laptop, a page, a sweat drop, a rain cloud, sparkles, a thought, a bubble.
  const laptop =
    mood === 'busy'
      ? `<g><rect x="${X(4)}" y="${f(feet - 2.6 * u)}" width="${f(10 * u)}" height="${f(2.2 * u)}" rx="${f(u * 0.4)}" fill="#2a2e38"/><rect x="${X(5)}" y="${f(feet - 2.2 * u)}" width="${f(8 * u)}" height="${f(1.2 * u)}" fill="${CODEX}" opacity="0.7"><animate attributeName="opacity" values="0.5;0.9;0.6;0.8;0.5" dur="1.1s" repeatCount="indefinite"/></rect></g>`
      : ''
  // Reading Codex's work: a page held up between its arms, a line ticked off now and then.
  const page =
    mood === 'read'
      ? `<g>${forever('transform:translate', `0 0;0 ${f(0.3 * u)};0 0`, 1.8)}<rect x="${X(2.6)}" y="${f(y0 + 4.4 * u)}" width="${f(12.8 * u)}" height="${f(4.6 * u)}" rx="${f(0.5 * u)}" fill="#f4f1ea"/>${[0, 1, 2]
          .map(i => `<rect x="${X(4.2)}" y="${f(y0 + (5.3 + i * 1.15) * u)}" width="${f((i === 2 ? 5.5 : 8.6) * u)}" height="${f(0.45 * u)}" rx="${f(0.2 * u)}" fill="#a9a59c"/>`)
          .join('')}<path d="M${X(13.2)} ${f(y0 + 5.9 * u)}l${f(0.55 * u)} ${f(0.55 * u)} ${f(1 * u)}-${f(1.1 * u)}" fill="none" stroke="${GOOD}" stroke-width="${f(u * 0.45)}" stroke-linecap="round" stroke-linejoin="round" opacity="0">${forever('opacity', '0;0;1;1;0', 3.6, ' keyTimes="0;0.5;0.56;0.9;1"')}</path></g>`
      : ''
  // Pondering an answer: a thought cloud by its head, its dots coming and going.
  const ponder =
    mood === 'think'
      ? `<g fill="${INK}"><circle cx="${f(x0 + W - 0.4 * u)}" cy="${f(y0 + 0.2 * u)}" r="${f(0.5 * u)}"/><circle cx="${f(x0 + W + 0.9 * u)}" cy="${f(y0 - 1 * u)}" r="${f(0.75 * u)}"/><ellipse cx="${f(x0 + W + 3.4 * u)}" cy="${f(y0 - 2.6 * u)}" rx="${f(3.4 * u)}" ry="${f(2.1 * u)}"/>${[0, 1, 2]
          .map(i => `<circle cx="${f(x0 + W + (2 + i * 1.4) * u)}" cy="${f(y0 - 2.6 * u)}" r="${f(0.45 * u)}" fill="${STAGE}"><animate attributeName="opacity" values="1;0.25;1" dur="1.2s" begin="${(react + i * 0.2).toFixed(2)}s" repeatCount="indefinite"/></circle>`)
          .join('')}</g>`
      : ''
  // Dozing: z's drifting up.
  const zs =
    mood === 'sleep'
      ? [0, 1, 2]
          .map(
            i =>
              `<text x="${f(x0 + W - u)}" y="${f(y0 - 0.5 * u)}" font-size="${f((2.4 + i * 0.5) * u)}" font-weight="800" fill="${MUTED}" opacity="0"><animate attributeName="opacity" values="0;0.9;0" dur="3.6s" begin="${(react + i * 1.2).toFixed(2)}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;${f(3 * u)} ${f(-5 * u)}" dur="3.6s" begin="${(react + i * 1.2).toFixed(2)}s" repeatCount="indefinite"/>z</text>`,
          )
          .join('')
      : ''
  const drop =
    mood === 'worried'
      ? `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.75;1" dur="1.6s" begin="${react}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;0 ${f(3 * u)}" dur="1.6s" begin="${react}s" repeatCount="indefinite"/><path d="M${X(15.6)} ${f(y0 - 0.8 * u)}q${f(1.1 * u)} ${f(1.8 * u)} 0 ${f(2.6 * u)}q${f(-1.1 * u)} ${f(-0.8 * u)} 0 ${f(-2.6 * u)}z" fill="#8fd3ff"/></g>`
      : ''
  const cloud =
    mood === 'sad'
      ? `<g><ellipse cx="${f(cx)}" cy="${f(y0 - 4.2 * u)}" rx="${f(4.6 * u)}" ry="${f(1.7 * u)}" fill="#6b7280"/><ellipse cx="${f(cx - 2 * u)}" cy="${f(y0 - 5 * u)}" rx="${f(2.4 * u)}" ry="${f(1.6 * u)}" fill="#6b7280"/>${[-2.4, 0, 2.4]
          .map(
            (dx, i) =>
              `<rect x="${f(cx + dx * u)}" y="${f(y0 - 2.6 * u)}" width="${f(u * 0.35)}" height="${f(u * 1.1)}" fill="#8fd3ff" opacity="0"><animate attributeName="opacity" values="0;1;0" dur="0.9s" begin="${(react + i * 0.3).toFixed(2)}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;0 ${f(2.6 * u)}" dur="0.9s" begin="${(react + i * 0.3).toFixed(2)}s" repeatCount="indefinite"/></rect>`,
          )
          .join('')}</g>`
      : ''
  const sparkle = (sx: number, sy: number, delay: number, colour: string) =>
    `<path d="M${f(sx)} ${f(sy - 4)}l1.2 2.8 2.8 1.2-2.8 1.2-1.2 2.8-1.2-2.8-2.8-1.2 2.8-1.2z" fill="${colour}" opacity="0"><animate attributeName="opacity" values="0;1;0" dur="1.2s" begin="${(react + delay).toFixed(2)}s" repeatCount="indefinite"/></path>`
  const sparkles = mood === 'happy' ? sparkle(x0 - 2, y0 + 2, 0, '#ffd54a') + sparkle(x0 + W + 2, y0 - 2, 0.4, INK) + sparkle(cx, y0 - 8, 0.8, '#ffd54a') : ''
  const say =
    mood === 'wait'
      ? bubbleSvg(x0 + W - 2, y0 - 9, '…', { loop: 3.2, show: 1.6 })
      : mood === 'shock'
        ? bubbleSvg(x0 + W - 2, y0 - 9, '!', { begin: react, show: 99 })
        : mood === 'worried'
          ? bubbleSvg(x0 + W - 2, y0 - 9, '?', { begin: react + 0.3, loop: 2.8, show: 1.4 })
          : ''

  const shadowR = W * 0.42
  const shadow = `<ellipse cx="${f(cx)}" cy="${f(feet + 1.1 * u)}" rx="${f(shadowR)}" ry="${f(0.8 * u)}" fill="#000" opacity="0.35">${
    hopping && mood !== 'shock'
      ? `<animate attributeName="rx" values="${f(shadowR)};${f(shadowR * 0.7)};${f(shadowR)}" dur="${mood === 'happy' ? 0.8 : SEND.period}s" begin="${react}s" repeatCount="indefinite"/>`
      : ''
  }</ellipse>`
  const figure = `<g fill="${CLAUDE}">${px(3, 0, 12, 4)}${armL}${armR}${legs}${eyes}<g fill="${CLAUDE}">${lids}</g></g>`
  return `${shadow}${cloud}<g>${hop}<g transform="translate(${f(cx)} ${f(feet)})"><g>${squash}${lean}<g transform="translate(${f(-cx)} ${f(-feet)})">${figure}${laptop}${page}</g></g></g>${drop}${sparkles}</g>${say}${ponder}${zs}`
}

/** A small speech bubble with one glyph: popping in, held, gone (and again, when looping). */
function bubbleSvg(x: number, y: number, glyph: string, o: { begin?: number; loop?: number; show?: number; colour?: string }) {
  const w = 12 + glyph.length * 7
  const body = `<rect x="${(-w / 2).toFixed(1)}" y="-9" width="${w}" height="16" rx="8" fill="${o.colour ?? INK}"/><path d="M-3 7l-2 5 6-5z" fill="${o.colour ?? INK}"/><text y="3.5" text-anchor="middle" font-size="11.5" font-weight="800" fill="${STAGE}">${escape(glyph)}</text>`
  const begin = (o.begin ?? 0).toFixed(2)
  if (!o.loop) {
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><g opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${begin}s" dur="0.15s" fill="freeze"/><animateTransform attributeName="transform" type="scale" values="0.3;1.2;1" begin="${begin}s" dur="0.35s" fill="freeze"/>${body}</g></g>`
  }
  const on = Math.min(0.95, (o.show ?? 1) / o.loop).toFixed(3)
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><g opacity="0"><animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.04;${on};${(Number(on) + 0.03).toFixed(3)};1" dur="${o.loop}s" begin="${begin}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="scale" values="0.3;1.15;1;1" keyTimes="0;0.04;0.08;1" dur="${o.loop}s" begin="${begin}s" repeatCount="indefinite"/>${body}</g></g>`
}

/** What Codex shows over its head: a catch, notes when it is pleased, stars when it is dizzy. */
function codexReaction(g: Geo, s: { phase: StagePhase; moment?: Stage['moment']; codexSprite?: Sprite }) {
  if (!s.codexSprite) return ''
  const x = g.RX + g.R * 0.55
  const y = g.AY - g.R - 10
  if (s.phase === 'sending') return bubbleSvg(x, y, '!', { begin: SEND.launch + SEND.travel, loop: SEND.period, show: 0.9 })
  if (s.phase === 'done' && (s.moment === 'spark' || s.moment === 'slide')) {
    return [0, 0.7]
      .map(
        d =>
          `<text x="${(g.RX + g.R * 0.7).toFixed(1)}" y="${(g.AY - g.R * 0.4).toFixed(1)}" font-size="15" font-weight="700" fill="#ffd54a" opacity="0"><animate attributeName="opacity" values="0;1;0" dur="1.4s" begin="${(1 + d).toFixed(2)}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;8 -22" dur="1.4s" begin="${(1 + d).toFixed(2)}s" repeatCount="indefinite"/>♪</text>`,
      )
      .join('')
  }
  if (s.phase === 'failed' || s.moment === 'wobble') {
    const ring = `M${(g.RX - 16).toFixed(1)} ${(g.AY - g.R - 2).toFixed(1)}a16 5 0 1 0 32 0a16 5 0 1 0 -32 0`
    return [0, 0.6, 1.2]
      .map(
        d =>
          `<path d="M0 -3.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" fill="#ffd54a"><animateMotion path="${ring}" dur="1.8s" begin="${d}s" repeatCount="indefinite"/></path>`,
      )
      .join('')
  }
  return ''
}

/** Dust in the light behind them, drifting up. */
function motes(g: Geo) {
  return Array.from({ length: 7 }, (_, i) => {
    const x = g.LX + ((g.RX - g.LX) * (i + 0.5)) / 7
    const y = g.AY + 20 - (i % 3) * 8
    const dur = 5 + (i % 4) * 1.3
    const colour = i % 2 ? CODEX : CLAUDE
    return `<circle cx="${x.toFixed(1)}" cy="${y}" r="${(1 + (i % 3) * 0.4).toFixed(1)}" fill="${colour}" opacity="0"><animate attributeName="opacity" values="0;0.35;0" dur="${dur}s" begin="${(i * 0.7).toFixed(1)}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;${i % 2 ? 6 : -6} -34" dur="${dur}s" begin="${(i * 0.7).toFixed(1)}s" repeatCount="indefinite"/></circle>`
  }).join('')
}

/** The Codex companion playing one animation, centred on (cx, cy), `size` px tall. */
export function codexSprite(s: Sprite, cx: number, cy: number, size: number) {
  const w = (s.w * size) / s.h
  const dur = s.frames / s.fps
  const xs = Array.from({ length: s.frames }, (_, i) => (-i * w).toFixed(2)).join(';')
  return `<svg x="${(cx - w / 2).toFixed(1)}" y="${(cy - size / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${size}" viewBox="0 0 ${w.toFixed(2)} ${size}" overflow="hidden"><image href="${s.href}" x="0" y="0" width="${(w * s.frames).toFixed(2)}" height="${size}" preserveAspectRatio="none"><animate attributeName="x" values="${xs}" dur="${dur.toFixed(2)}s" calcMode="discrete" repeatCount="indefinite"/></image></svg>`
}

/** The left seat: the person, Clawd, or Claude's mark when no mood is given. */
function leftSeat(you: boolean | undefined, cx: number, cy: number, r: number, mood?: ClawdMood, react = 0) {
  if (you) return personAvatar(cx, cy, r)
  return mood ? clawd(cx, cy - r * 0.06, (3.1 * r) / 18, mood, react) : claudeAvatar(cx, cy, r)
}

/** The right seat: the Codex companion when its art is at hand, else Codex's mark. */
function rightSeat(sprite: Sprite | undefined, cx: number, cy: number, r: number) {
  return sprite ? codexSprite(sprite, cx, cy - r * 0.05, r * 2.9) : codexAvatar(cx, cy, r)
}

/** Soft rings around a seat while it works (round, for the mascots). */
function rings(cx: number, cy: number, r: number, colour: string) {
  return [0, 0.9]
    .map(
      b =>
        `<g transform="translate(${cx} ${cy})"><circle r="${r + 4}" fill="none" stroke="${colour}" stroke-width="1.4" opacity="0"><animate attributeName="opacity" values="0.6;0" dur="1.8s" begin="${b}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="scale" values="1;1.6" dur="1.8s" begin="${b}s" repeatCount="indefinite"/></circle></g>`,
    )
    .join('')
}
