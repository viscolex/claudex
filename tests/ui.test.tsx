import { expect, mock, test } from 'claude-code/testing'

const T0 = 1_760_000_000_000

const review = {
  id: 'M3D8',
  thread: 'M3D8',
  round: 1,
  kind: 'review',
  from: 'claude',
  toolUseId: 'tu-review',
  title: 'Review the pricing packs',
  request: 'Review the pricing packs change.',
  lens: 'correctness',
  scope: 'Uncommitted changes',
  diffstat: '3 files · +40 −2',
  model: 'gpt-6.1-sol',
  effort: 'high',
  codexThread: 'thread-1',
  status: 'done',
  background: true,
  createdAt: T0,
  startedAt: T0,
  finishedAt: T0 + 161_000,
  steps: [{ item: 'i1:0', verb: 'Read', text: 'src/app/pricing/Packs.tsx', at: T0, done: true, ms: 400 }],
  files: ['src/app/pricing/Packs.tsx'],
  tokens: { input: 348_264, cached: 274_688, output: 2076, reasoning: 1125 },
  verdict: 'changes_needed',
  summary: 'The starter pack is not preselected on a slow load.',
  findings: [
    { id: 'F1', severity: 'high', title: 'Starter pack not preselected', file: 'src/app/pricing/Packs.tsx', line: 42, detail: 'The default is set before the packs arrive.', suggestion: 'Select it once the list resolves.', stance: 'agree', note: 'Reproduced; fixed.', state: 'fixed' },
    { id: 'F2', severity: 'low', title: 'Price label rounds euros', detail: 'Rounds 4.99 to 5.', state: 'open', stance: 'disagree', note: 'Rounding is intended.', replies: [{ round: 2, position: 'concede', text: 'Fine if intended.' }] },
  ],
  responses: [],
  take: 'One real bug, fixed; the rounding is deliberate.',
}

const question = {
  ...review,
  id: 'Q9QQ',
  thread: 'Q9QQ',
  toolUseId: 'tu-question',
  kind: 'question',
  lens: undefined,
  title: 'Where should rate limits live?',
  verdict: 'answer',
  summary: 'In the Rust service, next to the turn routes.',
  answer: '## Short answer\n\nKeep them in **Rust**.',
  findings: [],
}

const task = {
  ...review,
  id: 'T4SK',
  thread: 'T4SK',
  toolUseId: 'tu-task',
  kind: 'task',
  lens: undefined,
  title: 'Add a reduced-motion path',
  request: 'Add a reduced-motion path to the pinned scenes.',
  scope: undefined,
  verdict: undefined,
  findings: [],
  summary: 'Pinned scenes now skip their motion when reduced motion is on.',
  steps: [{ item: 'f1:0', verb: 'Edit', text: 'src/components/Home/PinnedScene.tsx', at: T0, done: true }],
  task: {
    worktree: 'C:\\wt\\T4SK',
    base: 'abc',
    state: 'ready',
    patch: 'C:\\wt\\T4SK.patch',
    files: [{ path: 'src/components/Home/PinnedScene.tsx', added: 24, removed: 3 }],
    added: 24,
    removed: 3,
    preview: 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n',
    changes: [{ file: 'src/components/Home/PinnedScene.tsx', what: 'Checks prefers-reduced-motion before pinning.' }],
    tests: 'tsc: passed',
  },
}

const picture = {
  id: 'img1',
  batch: 'b1',
  toolUseId: 'tu-image',
  name: 'horse-on-tricycle',
  dir: 'C:\\repo\\.tmp\\codex-images',
  path: 'C:\\repo\\.tmp\\codex-images\\horse-on-tricycle.png',
  prompt: 'A horse on a tricycle',
  sent: 'Use your image generation tool…',
  references: [],
  aspect: 'square',
  preset: 'none',
  status: 'done',
  wait: false,
  origin: 'claude',
  createdAt: T0,
  startedAt: T0,
  finishedAt: T0 + 59_000,
  width: 1254,
  height: 1254,
  bytes: 2_400_000,
  tokens: 68_000,
  sm: { path: 'C:\\t\\sm.jpg', width: 240, height: 240 },
  lg: { path: 'C:\\t\\lg.jpg', width: 560, height: 560 },
}

/** Files in memory: the chats' shared files (and anything else the mod writes), never the real disk. */
function memoryFs(on: any) {
  const files = new Map<string, { text: string; mtimeMs: number }>()
  let tick = 1
  on('fs.exists', (_: unknown, e: { path: string }) => ({ value: files.has(e.path) }))
  on('fs.read', (_: unknown, e: { path: string }) => (files.has(e.path) ? { value: files.get(e.path)?.text } : { deny: 'no such file' }))
  on('fs.write', (_: unknown, e: { path: string; text: string }) => {
    files.set(e.path, { text: e.text, mtimeMs: tick++ })
    return { value: undefined }
  })
  on('fs.list', (_: unknown, e: { path?: string }) => ({
    value: [...files]
      .filter(([p]) => p.startsWith(`${e.path}\\`))
      .map(([p, f]) => ({ name: p.slice(String(e.path).length + 1), kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false })),
  }))
  return files
}

async function seeded($: any, on: any) {
  mock.clock(on, { now: T0 + 3_600_000 })
  memoryFs(on)
  mock.store(on, {
    consults: [review, question, task],
    images: [picture],
    migrated: true,
    usage: { at: '2026-10-03T14:58:43Z', plan: 'pro', windows: [{ minutes: 10080, percent: 3, resetsAt: 1_791_596_681 }], credits: '62,500' },
  })
  mock.env(on, { USERPROFILE: 'C:\\Users\\tester' })
  on('session.start', () => ({ cwd: 'C:\\repo' }))
  on('command.register', () => ({ value: undefined }))
  on('tool.register', (_: unknown, e: { name: string }) => ({ value: { tool: `mcp__claudex__${e.name}` } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '{}', stderr: '' } }))
  await $.session.start({ cwd: 'C:\\repo', surface: 'desktop', isInteractive: true })
}

const card = (id: string, tool: string) => ({
  component: 'ToolUse' as const,
  requestId: id,
  props: { tool_use_id: id, tool, input: {}, isRunning: false, isErrored: false, isInterrupted: false },
  viewport: { columns: 100, rows: 40 },
})

const pane = (columns: number) => ({
  component: 'Pane' as const,
  requestId: 'claudex',
  props: { title: 'Claudex', isFocused: false, bodyColumns: columns, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} },
})

for (const surface of ['desktop', 'terminal'] as const) {
  test(`cards draw from history on ${surface}`, async ($, on) => {
    await seeded($, on)
    // Every finding answered: the card folds to one line and opens on request.
    const r = await $.ui.mount({ plugin: 'claudex', surface, ...card('tu-review', 'mcp__claudex__ask') })
    expect(await r.find({ type: 'Text', text: 'Changes needed' })).toBeDefined()
    expect(await r.find({ type: 'Text', text: /2 findings/ })).toBeDefined()
    await r.press({ key: 'expand-M3D8' })
    // The open one shows; the fixed one waits behind "1 fixed".
    expect(await r.find({ type: 'Text', text: /Codex concedes/ })).toBeDefined()
    expect(await r.find({ type: 'Text', text: /Claude agrees/ })).toBeUndefined()
    await r.press({ key: 'card-closed-toggle-M3D8' })
    expect(await r.find({ type: 'Text', text: /Claude agrees/ })).toBeDefined()
    expect(await r.find({ type: 'Text', text: /default is set before the packs arrive/ })).toBeUndefined()
    await r.press({ key: 'fold-M3D8:F1' })
    expect(await r.find({ type: 'Text', text: /default is set before the packs arrive/ })).toBeDefined()
    expect(await r.find({ key: 'file-M3D8:F1' })).toBeDefined()
    await r.unmount()
    // An old tool name draws the same card.
    const old = await $.ui.mount({ plugin: 'claudex', surface, ...card('tu-review', 'mcp__codex-review__ask') })
    expect(await old.find({ type: 'Text', text: /Changes needed/ })).toBeDefined()
    await old.unmount()
    const q = await $.ui.mount({ plugin: 'claudex', surface, ...card('tu-question', 'mcp__claudex__ask') })
    expect(await q.find({ type: 'Markdown' })).toBeDefined()
    await q.unmount()
    const t = await $.ui.mount({ plugin: 'claudex', surface, ...card('tu-task', 'mcp__claudex__task') })
    // A finished version is Claude's to check and apply: the card says so.
    expect(await t.find({ type: 'Text', text: /Claude checks this version/ })).toBeDefined()
    await t.press({ key: 'diff-toggle-T4SK' })
    expect(await t.find({ type: 'Code' })).toBeDefined()
    await t.unmount()
    const i = await $.ui.mount({ plugin: 'claudex', surface, ...card('tu-image', 'mcp__claudex__image') })
    expect(await i.find({ key: 'card-view-img1' })).toBeDefined()
    await i.unmount()
    const triage = await $.ui.mount({
      plugin: 'claudex',
      surface,
      component: 'ToolUse',
      requestId: 'tu-triage',
      props: { tool_use_id: 'tu-triage', tool: 'mcp__claudex__triage', input: { consult: 'M3D8', verdicts: [{ finding: 'F1', stance: 'agree', note: 'Fixed.', state: 'fixed' }] }, isRunning: false, isErrored: false, isInterrupted: false },
    })
    expect(await triage.find({ type: 'Text', text: /agrees/ })).toBeDefined()
    await triage.unmount()
  })

  test(`the pane's tabs draw at a narrow width on ${surface}`, async ($, on) => {
    await seeded($, on)
    const ui = await $.ui.mount({ plugin: 'claudex', surface, ...pane(44) })
    expect(((await ui.findAll({ type: 'Svg' })).some(x => String(x.props?.alt).startsWith('Claudex')) || Boolean(await ui.find({ type: 'Text', text: /Claudex/ })))).toBe(true)
    expect(await ui.find({ key: 'thread-open-M3D8' })).toBeDefined()
    expect(await ui.find({ key: 'thread-open-T4SK' })).toBeUndefined()
    await ui.press({ key: 'thread-open-M3D8' })
    expect(await ui.find({ key: 'recheck' })).toBeDefined()
    await ui.press({ key: 'back' })
    await ui.post({ tab: 'tasks' })
    await ui.press({ key: 'thread-open-T4SK' })
    expect(await ui.find({ key: 'apply-T4SK' })).toBeDefined()
    await ui.press({ key: 'back' })
    await ui.post({ tab: 'images' })
    await ui.press({ key: 'tile-open-img1' })
    expect(await ui.find({ key: 'regenerate' })).toBeDefined()
    await ui.press({ key: 'view-large' })
    expect(await ui.find({ key: 'view-open' })).toBeDefined()
    await ui.unmount()
  })
}

test('the pane keeps its drawing, and its Buttons their ids, while nothing it shows changes', async ($, on) => {
  await seeded($, on)
  const handleOf = async (ui: any, key: string) => {
    const find = (node: any): any =>
      node && typeof node === 'object'
        ? node.type === 'Button' && node.props?.key === key
          ? node
          : (node.children ?? []).map(find).find(Boolean)
        : undefined
    return find(await ui.drawn())?.press?.handle
  }
  const ui = await $.ui.mount({ plugin: 'claudex', surface: 'desktop', ...pane(60) })
  // Pressing the open tab writes the same view: the pane redraws, nothing changed.
  await ui.post({ tab: 'talk' })
  const before = await handleOf(ui, 'tab-talk')
  await ui.post({ tab: 'talk' })
  expect(await handleOf(ui, 'tab-talk')).toBe(before)
  // New takes the keyboard on a list; on a conversation, its main action does (Back when there is none).
  expect((await ui.find({ key: 'new-New' }))?.props?.autoFocus).toBe(true)
  await ui.press({ key: 'thread-open-M3D8' })
  const focused = (await ui.findAll({})).filter(x => x.props?.autoFocus).map(x => String(x.key))
  expect(focused.length).toBe(1)
  expect(['handle', 'back']).toContain(focused[0])
  await ui.unmount()
})

test('a conversation can be pinned, renamed, deleted and brought back; the board folds to a line', async ($, on) => {
  await seeded($, on)
  const ui = await $.ui.mount({ plugin: 'claudex', surface: 'desktop', ...pane(60) })
  await ui.press({ key: 'row-pin-Q9QQ' })
  expect(await ui.find({ type: 'Text', text: 'PINNED' })).toBeDefined()
  await ui.press({ key: 'row-rename-M3D8' })
  await ui.input({ key: 'rename-M3D8', text: 'Pricing packs, take two' })
  expect(String((await ui.find({ key: 'thread-open-M3D8' }))?.props?.label)).toContain('Pricing packs, take two')
  await ui.press({ key: 'row-delete-M3D8' })
  expect(await ui.find({ key: 'thread-open-M3D8' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Deleted “Pricing packs, take two”/ })).toBeDefined()
  await ui.press({ key: 'undo-delete' })
  expect(await ui.find({ key: 'thread-open-M3D8' })).toBeDefined()
  // The header is one line until its ▾ opens the details (model, usage, the pair to poke).
  expect(await ui.find({ key: 'pref-model' })).toBeUndefined()
  await ui.press({ key: 'board-more' })
  expect(await ui.find({ key: 'pref-model' })).toBeDefined()
  await ui.press({ key: 'board-more' })
  expect(await ui.find({ key: 'pref-model' })).toBeUndefined()
  await ui.unmount()
})

test('the New menu says plainly what each review covers', async ($, on) => {
  await seeded($, on)
  const ui = await $.ui.mount({ plugin: 'claudex', surface: 'desktop', ...pane(60) })
  await ui.press({ key: 'new-New' })
  expect(String((await ui.find({ key: 'start-pick-changes' }))?.props?.label)).toBe('Review my uncommitted changes')
  expect(String((await ui.find({ key: 'start-pick-session' }))?.props?.label)).toBe('Review what Claude changed in this chat')
  expect(String((await ui.find({ key: 'start-pick-branch' }))?.props?.label)).toBe('Review this whole branch against main')
  expect(await ui.find({ type: 'Text', text: 'REVIEW CODE CHANGES' })).toBeDefined()
  await ui.unmount()
})
