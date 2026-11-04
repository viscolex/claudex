// The council's look: a bench, not a stage. Claude and Codex each hold up a
// score paddle, face down while their score is sealed; when both are in, the
// paddles flip together and the round's two scores join the climb between
// them, a line for each seat rising toward the person's bar. Rounds still to
// sit wait as faint columns, so how far there is to go shows at a glance.
// When every seat clears the bar, it turns green and both of them hop.
import { clawd, codexAvatar, codexSprite, confetti, escape, fit, type ClawdMood, type Sprite } from './art'
import { D, EASE, MONO, SANS, actorColour, arrive, clockCorner, facts, fitKicker, ground, idOf, kicker, kickerWidth, type Actor } from './duet'

export const COUNCIL_HEIGHT = 220

/** What a seat's paddle shows: nothing yet, work under way, a sealed score, the score, or no score (its round failed). */
export type SeatFace = 'waiting' | 'working' | 'sealed' | 'shown' | 'none'
export type CouncilSeatView = { face: SeatFace; score?: number }
export type CouncilMarkView = { round: number; claude?: number; codex?: number; revealed: boolean }
export type CouncilPhaseView = 'scoring' | 'seat' | 'failed' | 'fixing' | 'limit' | 'stalled' | 'passed' | 'ended'

export type CouncilBoard = {
  title: string
  target: number
  /** The rounds it may sit, and the one it is on. */
  max: number
  n: number
  marks: CouncilMarkView[]
  phase: CouncilPhaseView
  claude: CouncilSeatView
  codex: CouncilSeatView
  headline: string
  facts: (string | [string, string])[]
  /** Work goes on: the paddles' dots run, the current column breathes. */
  live: boolean
  clock?: number
  time: string
  codexSprite?: Sprite
  /** The band's buttons sit over the right end. */
  controls?: number
}

const n1 = (v: number) => v.toFixed(1)

/** A score in its colour against the bar: through it, one short, or further off. */
export function scoreColour(score: number, target: number) {
  return score >= target ? D.good : score >= target - 1 ? D.warn : D.bad
}

/** Who has the move, by where the council stands: what the light and the kicker say. */
function actorOf(b: CouncilBoard): Actor | 'none' {
  switch (b.phase) {
    case 'scoring':
      return b.claude.face === 'sealed' ? 'codex' : 'both'
    case 'seat':
    case 'fixing':
      return 'claude'
    case 'limit':
    case 'stalled':
      return 'you'
    case 'passed':
      return 'both'
    default:
      return 'none'
  }
}

/** The kicker: what the council is doing first (it is what stays when the room is short), then the round. */
function kickerOf(b: CouncilBoard) {
  const round = `Round ${b.n} of ${b.max}`
  const doing =
    b.phase === 'passed'
      ? 'passed'
      : b.phase === 'ended'
        ? 'ended'
        : b.phase === 'failed'
          ? 'no score'
          : b.phase === 'limit' || b.phase === 'stalled'
            ? 'your call'
            : b.phase === 'seat'
              ? "Claude's seat"
              : b.phase === 'fixing'
                ? 'Claude fixing'
                : b.claude.face === 'sealed'
                  ? 'Codex scoring'
                  : 'both scoring'
  return `Council: ${doing} · ${round}`
}

/** The bar as a pill in the corner: gold until every seat clears it, then green with a tick. */
function barPill(right: number, y: number, target: number, passed: boolean) {
  const text = passed ? `BAR ${target} ✓` : `BAR ${target}`
  const w = text.length * 7.4 + 16
  const colour = passed ? D.good : D.you
  return `<rect x="${n1(right - w)}" y="${y - 13}" width="${n1(w)}" height="19" rx="9.5" fill="${colour}" fill-opacity=".14" stroke="${colour}" stroke-opacity=".55"/><text x="${n1(right - w / 2)}" y="${y}" text-anchor="middle" font-size="10.5" font-weight="800" letter-spacing="1.2" fill="${colour}">${escape(text)}</text>`
}

/**
 * A score paddle on its stick. Face down (sealed): a hatched back with a wax
 * seal, rocking a little. Shown: it flips over at `flip` seconds, the number
 * in its colour against the bar, a tick on it once it clears the bar.
 */
function paddle(cx: number, cy: number, seat: CouncilSeatView, colour: string, target: number, side: 'left' | 'right', id: string, flip: number, live: boolean) {
  const w = 42
  const h = 46
  const x = -w / 2
  const y = -h / 2
  const lean = side === 'left' ? -1 : 1
  const stick = `<path d="M0 ${h / 2 - 1}L${lean * 7} ${h / 2 + 17}" stroke="#d9c8ad" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>`
  const back = (rock: boolean) =>
    `<g>${rock ? `<animateTransform attributeName="transform" type="rotate" values="-2.5 0 ${h / 2};2.5 0 ${h / 2};-2.5 0 ${h / 2}" dur="2.8s" repeatCount="indefinite"/>` : ''}` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${colour}" fill-opacity=".16" stroke="${colour}" stroke-opacity=".85" stroke-width="1.4"/>` +
    `<g clip-path="url(#${id}-${side}-clip)" stroke="${colour}" stroke-opacity=".22" stroke-width="1.2">${Array.from({ length: 9 }, (_, i) => `<path d="M${x - 20 + i * 9} ${y + h}L${x + 4 + i * 9} ${y}"/>`).join('')}</g>` +
    `<circle r="9" fill="${D.violet}"/><circle r="9" fill="none" stroke="#fff" stroke-opacity=".25"/>` +
    `<rect x="-3.6" y="-1" width="7.2" height="5.6" rx="1" fill="${D.ground}"/><path d="M-2.2 -1v-2a2.2 2.2 0 0 1 4.4 0v2" fill="none" stroke="${D.ground}" stroke-width="1.4"/></g>`
  const clip = `<clipPath id="${id}-${side}-clip"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/></clipPath>`
  let face = ''
  if (seat.face === 'waiting' || seat.face === 'none') {
    face = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#1d1d27" stroke="#fff" stroke-opacity=".14" stroke-dasharray="3 4"/><text y="8" text-anchor="middle" font-size="20" font-weight="800" fill="#fff" fill-opacity=".22">${seat.face === 'none' ? '–' : '?'}</text>`
  } else if (seat.face === 'working') {
    const dots = [0, 1, 2]
      .map(i => `<circle cx="${-8 + i * 8}" cy="0" r="2.6" fill="${colour}"${live ? `><animate attributeName="opacity" values=".25;1;.25" dur="1.1s" begin="${(i * 0.18).toFixed(2)}s" repeatCount="indefinite"/></circle>` : ' fill-opacity=".6"/>'}`)
      .join('')
    face = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#1d1d27" stroke="${colour}" stroke-opacity=".45"/>${dots}`
  } else if (seat.face === 'sealed') {
    face = back(live)
  } else {
    const score = seat.score ?? 0
    const sc = scoreColour(score, target)
    const front =
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#1b1b26" stroke="${sc}" stroke-width="1.8"/>` +
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${sc}" fill-opacity=".1"/>` +
      `<text y="9.5" text-anchor="middle" font-size="27" font-weight="850" letter-spacing="-.5" fill="${sc}">${score}</text>` +
      (score >= target ? `<g transform="translate(${w / 2 - 2} ${y + 2})"><circle r="7" fill="${D.good}"/><path d="M-3.2 .2l2.1 2.1 4-4.2" fill="none" stroke="${D.ground}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>` : '')
    // The flip: the back narrows to an edge, the front opens out of it and lands with a bounce.
    face =
      `<g><animateTransform attributeName="transform" type="scale" values="1 1;0 1" begin="${flip.toFixed(2)}s" dur=".2s" fill="freeze" ${EASE}/>` +
      `<g opacity="1"><animate attributeName="opacity" values="1;0" begin="${(flip + 0.19).toFixed(2)}s" dur=".01s" fill="freeze"/>${back(false)}</g></g>` +
      `<g transform="scale(0 1)"><animateTransform attributeName="transform" type="scale" values="0 1;1 1" begin="${(flip + 0.2).toFixed(2)}s" dur=".22s" fill="freeze" ${EASE}/>` +
      `<g><animateTransform attributeName="transform" type="scale" values="1;1.16;1" keyTimes="0;.45;1" begin="${(flip + 0.42).toFixed(2)}s" dur=".34s" fill="freeze"/>${front}</g></g>`
  }
  return `<g transform="translate(${n1(cx)} ${n1(cy)})">${clip}${stick}${face}</g>`
}

/**
 * The climb: a column a round, each seat's scores joined into a line that
 * rises toward the bar; the newest stretch draws itself in after the flip.
 */
function climb(b: CouncilBoard, cx0: number, cx1: number, top: number, base: number, id: string, reveal: number) {
  const passed = b.phase === 'passed'
  const max = Math.max(1, b.max, b.n)
  const step = (cx1 - cx0) / max
  const xOf = (r: number) => cx0 + (r - 0.5) * step
  // The scale runs from a little under the lowest score (and well under the bar) to 10: scores live high, and a
  // scale from 0 would press them flat against the top.
  const seen = b.marks.filter(m => m.revealed).flatMap(m => [m.claude, m.codex]).filter((v): v is number => typeof v === 'number')
  const lo = Math.max(0, Math.min(b.target - 4, ...seen.map(v => v - 1)))
  const yOf = (s: number) => base - ((Math.max(lo, s) - lo) / (10 - lo)) * (base - top)
  let out = ''
  // The columns: rounds sat, the one under way, the ones still to come.
  for (let r = 1; r <= max; r++) {
    const x = xOf(r)
    const now = r === b.n
    const sat = b.marks.some(m => m.round === r && m.revealed)
    const pipW = Math.min(18, step - 4)
    out += `<rect x="${n1(x - pipW / 2)}" y="${base + 6}" width="${n1(pipW)}" height="13" rx="6.5" fill="${now ? actorColourOf(b) : '#fff'}" fill-opacity="${now ? 0.22 : sat ? 0.08 : 0.03}"/>`
    out += `<text x="${n1(x)}" y="${base + 16}" text-anchor="middle" font-size="9.5" font-weight="${now ? 800 : 600}" fill="${now ? actorColourOf(b) : '#fff'}" fill-opacity="${now ? 1 : sat ? 0.55 : 0.25}">${r}</text>`
    // The person's call: the round it stopped on rings in their gold.
    if (now && (b.phase === 'limit' || b.phase === 'stalled')) {
      out += `<rect x="${n1(x - pipW / 2 - 3)}" y="${base + 3}" width="${n1(pipW + 6)}" height="19" rx="9.5" fill="none" stroke="${D.you}" stroke-width="1.4"><animate attributeName="stroke-opacity" values=".25;1;.25" dur="1.8s" repeatCount="indefinite"/></rect>`
    }
    if (now && !sat && b.phase !== 'ended') {
      out += `<rect x="${n1(x - step / 2 + 2)}" y="${top - 6}" width="${n1(step - 4)}" height="${n1(base - top + 10)}" rx="7" fill="${actorColourOf(b)}" fill-opacity=".07">${b.live ? '<animate attributeName="fill-opacity" values=".03;.11;.03" dur="2.4s" repeatCount="indefinite"/>' : ''}</rect>`
    }
  }
  // The floor of the chart and the top of the scale, faint; the bar across, dashed gold until it is cleared.
  out += `<path d="M${n1(cx0)} ${n1(base)}H${n1(cx1)}" stroke="#fff" stroke-opacity=".1"/><path d="M${n1(cx0)} ${n1(yOf(10))}H${n1(cx1)}" stroke="#fff" stroke-opacity=".05" stroke-dasharray="1 5"/>`
  // The scale's two ends, small, at the chart's left.
  const by = yOf(b.target)
  // The bar's own value sits on the scale, in its colour, clear of the newest scores (they land at the right).
  if (b.target < 10) out += `<text x="${n1(cx0 - 5)}" y="${n1(yOf(10) + 3)}" text-anchor="end" font-size="8.5" font-weight="700" fill="#fff" fill-opacity=".3">10</text>`
  out += `<text x="${n1(cx0 - 5)}" y="${n1(base + 3)}" text-anchor="end" font-size="8.5" font-weight="700" fill="#fff" fill-opacity=".3">${lo}</text>`
  out += `<text x="${n1(cx0 - 5)}" y="${n1(by + 3.5)}" text-anchor="end" font-size="10" font-weight="850" fill="${passed ? D.good : D.you}">${b.target}</text>`
  if (passed) {
    out += `<path d="M${n1(cx0)} ${n1(by)}H${n1(cx1)}" stroke="${D.good}" stroke-width="5" stroke-opacity=".18" stroke-linecap="round"><animate attributeName="stroke-opacity" values=".08;.3;.08" dur="2.2s" begin="${(reveal + 0.9).toFixed(2)}s" repeatCount="indefinite"/></path>`
    out += `<path d="M${n1(cx0)} ${n1(by)}H${n1(cx1)}" stroke="${D.good}" stroke-width="1.6"/>`
  } else {
    out += `<path d="M${n1(cx0)} ${n1(by)}H${n1(cx1)}" stroke="${D.you}" stroke-width="1.3" stroke-dasharray="5 4" stroke-opacity=".85"/>`
  }

  // Each seat's line. Two equal scores sit side by side rather than one on the other.
  const shown = b.marks.filter(m => m.revealed).sort((a, c) => a.round - c.round)
  const latest = shown[shown.length - 1]
  const fresh = latest && latest.round === b.n
  for (const seat of ['claude', 'codex'] as const) {
    const colour = seat === 'claude' ? D.claude : D.codex
    const pts = shown
      .filter(m => typeof m[seat] === 'number')
      .map(m => {
        const same = m.claude === m.codex
        return { r: m.round, x: xOf(m.round) + (same ? (seat === 'claude' ? -3.5 : 3.5) : 0), y: yOf(m[seat] as number), score: m[seat] as number }
      })
    if (!pts.length) continue
    const settledPts = fresh ? pts.slice(0, -1) : pts
    if (settledPts.length > 1) out += `<polyline points="${settledPts.map(p => `${n1(p.x)},${n1(p.y)}`).join(' ')}" fill="none" stroke="${colour}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" stroke-opacity=".85"/>`
    const last = pts[pts.length - 1] as (typeof pts)[number]
    const prev = pts[pts.length - 2]
    if (fresh && prev) {
      const len = Math.hypot(last.x - prev.x, last.y - prev.y) + 1
      out += `<path d="M${n1(prev.x)} ${n1(prev.y)}L${n1(last.x)} ${n1(last.y)}" fill="none" stroke="${colour}" stroke-width="2" stroke-linecap="round" stroke-dasharray="${n1(len)}" stroke-dashoffset="${n1(len)}"><animate attributeName="stroke-dashoffset" from="${n1(len)}" to="0" begin="${(reveal + 0.15).toFixed(2)}s" dur=".5s" fill="freeze" ${EASE}/></path>`
    }
    // The newest score's label: over the dot for the higher seat, under it for the lower; equal, both over, apart.
    const other = latest ? latest[seat === 'claude' ? 'codex' : 'claude'] : undefined
    const above = typeof other !== 'number' || last.score >= other
    const lx = last.x + (typeof other === 'number' && other === last.score ? (seat === 'claude' ? -5 : 5) : 0)
    const ly = above ? last.y - 8 : last.y + 15
    const anchor = typeof other === 'number' && other === last.score ? (seat === 'claude' ? 'end' : 'start') : 'middle'
    const label = `<text x="${n1(lx)}" y="${n1(ly)}" text-anchor="${anchor}" font-size="10.5" font-weight="800" fill="${colour}">${last.score}</text>`
    for (const p of pts) {
      const newest = p === last
      const dot = `<circle r="${newest ? 4.4 : 3.2}" fill="${newest ? colour : D.ground}" stroke="${colour}" stroke-width="1.6"/>`
      if (newest && fresh) {
        out += `<g transform="translate(${n1(p.x)} ${n1(p.y)})"><g transform="scale(0)"><animateTransform attributeName="transform" type="scale" values="0;1.35;1" keyTimes="0;.6;1" begin="${(reveal + 0.55).toFixed(2)}s" dur=".35s" fill="freeze"/>${dot}</g></g>`
        out += `<g opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${(reveal + 0.7).toFixed(2)}s" dur=".25s" fill="freeze"/>${label}</g>`
      } else {
        out += `<g transform="translate(${n1(p.x)} ${n1(p.y)})">${dot}</g>`
        if (newest) out += label
      }
    }
  }
  if (passed && latest) out += confetti(xOf(latest.round), by - 4, reveal + 1, [D.good, D.claude, D.codex, D.you, D.ink])
  return out
}

/** The colour of whoever has the move (violet when both do; dim when no one does). */
function actorColourOf(b: CouncilBoard) {
  const a = actorOf(b)
  if (b.phase === 'passed') return D.good
  if (b.phase === 'failed') return D.bad
  return a === 'none' ? D.dim : actorColour(a)
}

/**
 * The council's board: who is doing what and how long (the kicker, the bar
 * and the clock), what it comes to (the headline) and the facts, over the
 * bench, where the two of them hold up their scores either side of the climb.
 */
export function councilBoardSvg(b: CouncilBoard, width_: number) {
  const W = Math.round(Math.max(480, width_))
  const H = COUNCIL_HEIGHT
  const controls = b.controls ?? 0
  const DW = W - controls
  const actor = actorOf(b)
  const colour = actorColourOf(b)
  const id = idOf('council', W, b.title, b.n, b.phase, b.claude.face, b.codex.face)
  const g = ground(id, W, H, colour, { controls, from: actor === 'codex' ? 'right' : 'left' })

  const x = 24
  const right = DW - 22
  const textW = right - x
  const corner = 168
  const k = fitKicker(kickerOf(b), textW - corner)
  const kw = kickerWidth(k) + 10
  const titleRoom = textW - kw - corner
  const room = (px: number, size: number) => Math.max(4, Math.floor(px / (size * 0.52)))
  const pillW = (b.phase === 'passed' ? `BAR ${b.target} ✓` : `BAR ${b.target}`).length * 7.4 + 16
  const line1 =
    kicker(x, 30, k, colour) +
    (titleRoom > 50 ? `<text x="${n1(x + kw)}" y="30" font-size="12" font-weight="560" fill="#fff" fill-opacity=".55">${escape(fit(b.title, room(titleRoom, 12)))}</text>` : '') +
    barPill(right, 30, b.target, b.phase === 'passed') +
    clockCorner(right - pillW - 10, 30, { clock: b.clock, time: b.time, live: b.live, id })
  const line2 = arrive(`<text x="${x}" y="61" font-size="19" font-weight="720" letter-spacing="-.25" fill="${b.phase === 'failed' ? D.bad : D.ink}">${escape(fit(b.headline, room(textW, 19)))}</text>`)
  const line3 = facts(x, 85, textW, b.facts)

  // The bench.
  const floor = H - 14
  const x0 = 14
  const x1 = DW - 14
  const lx = x0 + 34
  const rx = x1 - 38
  const reveal = 0.25
  const spot = (sx: number, tint: string) =>
    `<path d="M${n1(sx - 10)} 96L${n1(sx + 10)} 96L${n1(sx + 52)} ${floor}L${n1(sx - 52)} ${floor}Z" fill="url(#${id}-cone-${tint.slice(1)})"${b.live ? '><animate attributeName="opacity" values=".75;1;.75" dur="3s" repeatCount="indefinite"/></path>' : '/>'}<ellipse cx="${n1(sx)}" cy="${floor}" rx="52" ry="7" fill="url(#${id}-pool-${tint.slice(1)})"/>`
  const tints = [...new Set([D.claude, D.codex, D.you, D.good])]
  let defs = tints
    .map(t => `<linearGradient id="${id}-cone-${t.slice(1)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t}" stop-opacity="0"/><stop offset="1" stop-color="${t}" stop-opacity=".18"/></linearGradient><radialGradient id="${id}-pool-${t.slice(1)}"><stop offset="0" stop-color="${t}" stop-opacity=".45"/><stop offset="1" stop-color="${t}" stop-opacity="0"/></radialGradient>`)
    .join('')
  defs += `<linearGradient id="${id}-floor" x1="${lx}" x2="${rx}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${D.claude}" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="${D.codex}" stop-opacity=".55"/></linearGradient>`
  let bench = ''
  if (actor === 'claude' || actor === 'both') bench += spot(lx, b.phase === 'passed' ? D.good : D.claude)
  if (actor === 'codex' || actor === 'both') bench += spot(rx, b.phase === 'passed' ? D.good : D.codex)
  bench += `<path d="M${x0} ${floor}H${x1}" stroke="url(#${id}-floor)" stroke-width="1.5"/>`
  bench += `<ellipse cx="${lx}" cy="${floor + 1}" rx="24" ry="3" fill="#000" opacity=".5"/><ellipse cx="${rx}" cy="${floor + 1}" rx="22" ry="3" fill="#000" opacity=".5"/>`

  // The two of them: Clawd at the left, Codex at the right; both hop when the council passes.
  const u = 3.1
  const mood: ClawdMood =
    b.phase === 'passed' ? 'happy' : b.phase === 'failed' ? 'sad' : b.phase === 'limit' || b.phase === 'stalled' ? 'think' : b.phase === 'ended' ? 'idle' : b.claude.face === 'sealed' ? 'wait' : 'busy'
  const hop = (begin: number) => `<animateTransform attributeName="transform" type="translate" values="0 0;0 -13;0 0" keyTimes="0;.45;1" begin="${begin}s" dur="0.5s" repeatCount="2" fill="freeze" calcMode="spline" keySplines=".2 .7 .4 1;.5 0 .8 .4"/>`
  const bob = `<animateTransform attributeName="transform" type="translate" values="0 0;0 -2.5;0 0" dur="1.3s" repeatCount="indefinite" calcMode="spline" keyTimes="0;.5;1" keySplines=".4 0 .6 1;.4 0 .6 1"/>`
  const party = b.phase === 'passed'
  const codexSize = 62
  const codexFig = b.codexSprite ? codexSprite(b.codexSprite, rx, floor - codexSize * 0.46, codexSize) : codexAvatar(rx, floor - 17, 15)
  const claudeBack = actor === 'codex' || actor === 'you' || actor === 'none'
  const codexBack = actor === 'claude' || actor === 'you' || actor === 'none'
  bench += `<g opacity="${claudeBack ? 0.7 : 1}"><g>${party ? hop(reveal + 1.05) : ''}${clawd(lx, floor - 5 * u - 1, u, mood)}</g></g>`
  bench += `<g opacity="${codexBack ? 0.7 : 1}"><g>${party ? hop(reveal + 1.2) : b.live && b.codex.face === 'working' ? bob : ''}${codexFig}</g></g>`

  // Their paddles, held up toward the middle; the climb between them.
  const py = floor - 58
  const pl = lx + 50
  const pr = rx - 54
  bench += paddle(pl, py, b.claude, D.claude, b.target, 'left', id, reveal, b.live)
  // Both flip at once: neither score is seen before the other.
  bench += paddle(pr, py, b.codex, D.codex, b.target, 'right', id, reveal, b.live)
  const cx0 = pl + 40
  const cx1 = pr - 40
  if (cx1 - cx0 >= 70) bench += climb(b, cx0, cx1, 112, floor - 28, id, reveal + 0.75)


  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${SANS}">
<defs>${g.defs}${defs}</defs>
${g.body}
<g clip-path="url(#${id}-card)">${party ? `<rect width="${DW}" height="3" fill="${D.good}" opacity=".9"/>` : ''}${bench}</g>
${line1}
${line2}
${line3}
</svg>`
}

/** A council in one small mark, for list rows: the two latest scores over the bar. */
export function councilChipSvg(o: { claude?: number; codex?: number; target: number; passed: boolean }, size = 22) {
  const W = Math.round(size * 2.2)
  const H = size
  const half = (score: number | undefined, x: number, colour: string) => {
    const sc = typeof score === 'number' ? scoreColour(score, o.target) : '#8b8b98'
    return `<rect x="${x}" y="1" width="${n1(W / 2 - 2)}" height="${H - 2}" rx="${n1((H - 2) / 2.6)}" fill="${colour}" fill-opacity=".14" stroke="${colour}" stroke-opacity=".6"/><text x="${n1(x + (W / 2 - 2) / 2)}" y="${n1(H / 2 + size * 0.2)}" text-anchor="middle" font-size="${n1(size * 0.55)}" font-weight="850" fill="${sc}" font-family="${MONO}">${typeof score === 'number' ? score : '·'}</text>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${SANS}">${half(o.claude, 0.5, D.claude)}${half(o.codex, W / 2 + 1.5, D.codex)}${o.passed ? `<circle cx="${W - 3}" cy="3.5" r="3.5" fill="${D.good}"/>` : ''}</svg>`
}
