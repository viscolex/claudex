import { expect, test } from 'claude-code/testing'
import { continueAnimations, liveClock, settle, stageSvg } from '../hooks/art'
import { moving } from '../hooks/duet'
import type { ClawdMood } from '../hooks/art'

test('a picture drawn again moves its animations on: loops keep their phase, finished entrances land at their end', async () => {
  const svg = '<svg><g opacity=\"0\"><animate attributeName=\"opacity\" from=\"0\" to=\"1\" begin=\"0.2s\" dur=\"0.35s\" fill=\"freeze\"/></g><circle><animate attributeName=\"r\" values=\"1;2\" dur=\"1.4s\" repeatCount=\"indefinite\"/></circle></svg>'
  const later = continueAnimations(svg, 12)
  // Chromium images never freeze a one-off that ended before they began: it lands at its end instead.
  expect(later).toContain('begin=\"-0.33s\"')
  expect(later).toContain('begin=\"-12.00s\"')
  expect(continueAnimations(svg, 0.01)).toBe(svg)
  expect(continueAnimations(svg, 0.1)).toContain('begin=\"0.10s\"')
})

test('Clawd shows every mood differently, and Codex catches what is thrown', async () => {
  const base = { kind: 'review' as const, claudeModel: 'Opus', codexModel: 'GPT', effort: 'high', files: 1, searches: 0, time: '0:10', headline: 'Codex answered' }
  const sprite = { href: 'data:image/webp;base64,AA', frames: 4, fps: 8, w: 96, h: 104 }
  const moods: ClawdMood[] = ['idle', 'busy', 'send', 'watch', 'wait', 'happy', 'nod', 'worried', 'shock', 'sad']
  const drawn = moods.map(claudeMood => stageSvg({ ...base, phase: 'done', claudeMood }, 560))
  expect(new Set(drawn).size).toBe(moods.length)
  const sending = stageSvg({ ...base, phase: 'sending', headline: 'Sending', codexSprite: sprite, claudeMood: 'send' }, 560)
  expect(sending).toContain('>!</text>')
  expect(stageSvg({ ...base, phase: 'sending', headline: 'Sending' }, 560)).not.toContain('>!</text>')
})

test('a finished picture comes to rest: its loops run a few cycles, end where they began, and a later drawing lands on that end', async () => {
  const loop = '<svg><circle><animate attributeName="r" values="1;2;1" dur="2s" repeatCount="indefinite"/></circle></svg>'
  const rested = settle(loop, 8)
  expect(rested).toContain('repeatCount="4" fill="freeze"')
  expect(rested).not.toContain('indefinite')
  // Drawn again a minute on, it is already at rest.
  expect(continueAnimations(rested, 60)).toContain('begin="-7.98s"')
})

test('motion: still rests every animation at its end at once, but clocks keep counting; calm bounds loops', () => {
  const clock = liveClock(95, 50, 20, { size: 13, colour: '#fff', id: 'c' })
  const svg = `<svg>${clock}<g opacity="0"><animate attributeName="opacity" from="0" to="1" begin="0.3s" dur="0.4s" fill="freeze"/></g><circle><animate attributeName="r" values="1;2;1" dur="2s" repeatCount="indefinite"/></circle><g><animate attributeName="opacity" values="0;1" dur="1s" repeatCount="4"/></g></svg>`
  const still = moving(svg, 'still')
  // Every non-clock animation now ends at once, frozen at its end.
  // Each lands just short of its end (Chromium keeps a state it saw): the entrance at -0.38 s of 0.4 s, the loops likewise.
  expect(still).toContain('dur="0.4s" begin="-0.38s" repeatCount="1" fill="freeze"')
  expect((still.match(/repeatCount="1" fill="freeze"/g) ?? []).length).toBe(3)
  expect(still).not.toContain('repeatCount="4"')
  // The clock's digit columns are untouched.
  expect(still).toContain(clock)
  const calm = moving(svg, 'calm')
  expect(calm).not.toMatch(/attributeName="r"[^>]*repeatCount="indefinite"/)
  expect(calm).toContain(clock)
})
