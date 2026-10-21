// ---------------------------------------------------------------------------
// Conversations and tasks: one round of talking to Codex each

export type CodexKind = 'review' | 'plan' | 'question' | 'debug' | 'joint' | 'compare' | 'visual' | 'reply' | 'recheck' | 'task'

export type CodexStatus = 'queued' | 'sending' | 'thinking' | 'reading' | 'done' | 'failed' | 'stopped'

export type CodexVerdict = 'approve' | 'approve_with_nits' | 'changes_needed' | 'rethink' | 'answer'

export type CodexVerb = 'Read' | 'Search' | 'Git' | 'List' | 'Run' | 'Edit' | 'Note' | 'Think' | 'Plan'

export type CodexLens = 'general' | 'correctness' | 'security' | 'performance' | 'tests' | 'simplicity' | 'ux'

/** One thing Codex did or said while it worked. */
export type CodexStep = {
  /** The Codex item it came from, so a finished command updates its row. */
  item: string
  verb: CodexVerb
  text: string
  at: number
  done: boolean
  ms?: number
}

export type CodexStance = 'agree' | 'disagree' | 'unsure'

export type CodexFinding = {
  /** F1, F2, ... numbered across the whole thread. */
  id: string
  severity: 'high' | 'medium' | 'low'
  title: string
  file?: string
  line?: number
  detail: string
  suggestion?: string
  stance?: CodexStance
  note?: string
  state: 'open' | 'fixed' | 'dismissed'
  /** When a fix for it was applied (by the person, whole): it stays open until checked, since a fix may leave a finding it disputed unchanged. */
  applied?: number
  replies?: { round: number; position: 'concede' | 'hold' | 'refine'; text: string }[]
  /** On Claude's own findings in a joint review: what Codex made of it when it compared notes. */
  match?: { position: 'agree' | 'disagree' | 'refine'; same?: string; text: string }
}

export type CodexResponse = { finding: string; position: 'concede' | 'hold' | 'refine'; text: string }

/** What a task changed, in its own git worktree. */
export type CodexTaskWork = {
  worktree: string
  /** The commit the worktree started from: HEAD plus the user's uncommitted changes. */
  base: string
  /** `revised`: sent back with notes; a later round of the same task holds the current version. `undone`: applied, then taken out again. */
  state: 'working' | 'ready' | 'empty' | 'applied' | 'discarded' | 'conflict' | 'revised' | 'undone'
  patch?: string
  /** Each changed file, with the start of its own diff while there is room for it. */
  files?: { path: string; added: number; removed: number; diff?: string }[]
  /** Files left out when a version was applied in part. */
  skip?: string[]
  /** Files already taken into the working tree from an earlier version (a part applied, the rest sent back). */
  applied?: string[]
  /** The exact patch this round put into the working tree, so it can be taken out again. */
  appliedPatch?: string
  /** Dependency folders linked in from the main checkout (node_modules), so Codex can run the project's checks. */
  linked?: string[]
  /** The checks this project defines (package.json scripts, cargo, go, pytest), handed to Codex as context. */
  checks?: string[]
  /** Who applied it: Claude (its job) or the person, stepping in. */
  appliedBy?: 'claude' | 'user'
  added?: number
  removed?: number
  /** The start of the diff, for the card and the pane. */
  preview?: string
  changes?: { file: string; what: string }[]
  tests?: string
  notes?: string
  /** Why applying failed, when it did. */
  problem?: string
  /** The worktree was cleaned up; the patch file stays and can still be applied. */
  gone?: boolean
}

/** A finding a task fixes. */
export type CodexFix = { thread: string; finding: string; title: string }

/** A "work on it together" job: Claude leads, and each part it hands Codex (or has Codex review) is a thread of the job. */
export type CodexJob = { id: string; title: string }

/**
 * A note handed to Codex while it works (Codex's app server steers the running
 * turn with it). `queued`: written down before Codex had started, handed over
 * once it has. `sending`: in Codex's inbox. `sent`: Codex has it. `failed`:
 * Codex finished, or refused it, first.
 */
export type CodexSteer = {
  id: string
  from: 'user' | 'claude'
  /** As the person or Claude wrote it; Codex gets it with a line saying who it is from. */
  text: string
  at: number
  state: 'queued' | 'sending' | 'sent' | 'failed'
  error?: string
}

/**
 * A question Codex put to Claude mid-run (its ask_claude tool), waiting for
 * the answer: Claude's, or the person's from a card or the pane. Codex waits
 * a while, then carries on with its own judgement (`timeout`). `closed`: the
 * run ended (stopped, failed) while it was still open.
 */
/**
 * Something for Codex's next round, queued while it works ("next" rather
 * than "now"), or Claude's answer to a question Codex did not wait on that
 * arrived after its turn ended. When the round ends, the queued ones start
 * the next round together.
 */
export type CodexFollowUp = {
  id: string
  from: 'claude' | 'user'
  text: string
  at: number
  state: 'queued' | 'started' | 'dropped' | 'failed'
  /** The question it answers, when it is an answer. */
  question?: string
  /** The round it started. */
  round?: string
  error?: string
  /** The ticket (question id) whose answer this carries: one follow-up a ticket, however its answer got here. */
  ticket?: string
}

export type CodexAsk = {
  id: string
  question: string
  at: number
  state: 'waiting' | 'answered' | 'timeout' | 'closed'
  answer?: string
  by?: 'user' | 'claude'
  answeredAt?: number
  /** Asked without waiting (a ticket): Codex carried on, and the answer reaches it as a note or in its next round. */
  later?: boolean
}

/**
 * A permission one of Codex's own tools asked the person for mid-run (its
 * browser wanting to open a site, say). Only the person answers it, on the
 * card, the band or the pane; unanswered, it is declined after a while.
 * `refused`: the bridge turned it down by itself (a device check only the
 * Codex app can do, or writing outside what the run may write). `closed`: the
 * run ended while it was still open.
 */
export type CodexPermit = {
  id: string
  kind: 'form' | 'link' | 'access' | 'verify'
  /** The tool asking (Browser use) and the site it is about. */
  tool?: string
  origin?: string
  title: string
  message?: string
  url?: string
  /** A form's own choices, when it has any. */
  options?: string[]
  /** How long an allow may be kept: for this conversation, or from now on. */
  persist?: ('session' | 'always')[]
  at: number
  state: 'waiting' | 'sending' | 'allowed' | 'denied' | 'timeout' | 'refused' | 'closed'
  /** Why the bridge turned it down by itself. */
  refused?: string
  /** What the person chose. */
  kept?: 'session' | 'always'
  choice?: string
  settledAt?: number
}

/** Something Codex told Claude mid-run without waiting (its tell_claude tool): news Claude should have now, not in the final answer. */
export type CodexHeard = {
  id: string
  text: string
  at: number
}

/** A build loop the person started: one builds, the other reviews, until both agree the work is done. */
export type CodexLoop = {
  /** Codex builds in its worktree and Claude reviews each version, or Claude builds in the working tree and Codex reviews it. */
  builder: 'codex' | 'claude'
}

export type CodexConsult = {
  /** The thread's id for its first round (K7Q2), then K7Q2-2 ... */
  id: string
  thread: string
  round: number
  kind: CodexKind
  from: 'claude' | 'user'
  toolUseId?: string
  title: string
  request: string
  context?: string
  plan?: string
  lens?: CodexLens
  scope?: string
  diffstat?: string
  model: string
  effort: string
  codexThread?: string
  status: CodexStatus
  background: boolean
  createdAt: number
  startedAt?: number
  finishedAt?: number
  steps: CodexStep[]
  files: string[]
  note?: string
  /** Codex's own plan for the turn, as it keeps it: each step done, under way (`now`) or still to come. */
  plan_items?: { text: string; done: boolean; now?: boolean }[]
  /** Notes handed to Codex while it worked, from the person or Claude. */
  steers?: CodexSteer[]
  /** Questions Codex asked Claude while it worked. */
  asks?: CodexAsk[]
  /** For the next round: queued while this one runs, started when it ends. */
  followups?: CodexFollowUp[]
  /** What Codex told Claude while it worked. */
  heard?: CodexHeard[]
  /** Permissions Codex's tools asked the person for while it worked. */
  permits?: CodexPermit[]
  /** A task: files it changed that Claude has changed in this chat too (they clash when it is applied). */
  clashes?: string[]
  /** A task's diff while Codex works on it: each file, with lines added and removed so far. */
  liveDiff?: { path: string; added: number; removed: number }[]
  /** What Codex is writing to Claude right now (its commentary), as it writes it. */
  live?: { text: string; at: number }
  /** How much of its final answer Codex has written so far (an answer under a schema is not shown half-made). */
  writing?: number
  /** The command Codex is running (or last ran), and the last lines it printed. */
  output?: { command: string; tail: string; exit?: number | null; at: number }
  /** Warnings Codex raised during the run: config and deprecation notices, guardian warnings. */
  notices?: { kind: string; text: string; at: number }[]
  /** Codex moved the turn to another model. */
  rerouted?: { from: string; to: string; reason: string; at: number }
  /** What the run actually ran with: model, service tier, and the instruction files Codex loaded. */
  ran?: { model?: string; tier?: string; instructions?: string[] }
  tokens?: { input: number; cached: number; output: number; reasoning: number }
  verdict?: CodexVerdict
  summary?: string
  answer?: string
  findings: CodexFinding[]
  responses: CodexResponse[]
  take?: string
  task?: CodexTaskWork
  /** Where the reviewed plan lives, when it is a file. */
  planFile?: string
  /** The whole text sent to Codex: what a retry or a queued start sends. */
  sent?: string
  /** A joint review: Claude's own findings (C1…), made without seeing Codex's. */
  mine?: CodexFinding[]
  /** A joint review: the solution Claude proposed on its own. */
  myTake?: string
  /** A joint review: Codex's findings stay hidden from Claude until Claude's are in. */
  sealed?: boolean
  /** A joint review: the solution Claude and Codex agreed on. */
  agreed?: string
  /** Kept at the top of the list, and never trimmed from the history. */
  pinned?: boolean
  /** A task that fixes findings of other conversations (one object in data saved before batches). */
  fixes?: CodexFix[]
  /** A "work on it together" job this thread is part of. */
  job?: CodexJob
  /** On a thread's first round: the build loop it is part of. */
  loop?: CodexLoop
  /** The chat (Claude Code session) this round was started in; absent on rounds from before chats were told apart. */
  chat?: string
  /** The project (working directory) it ran in: its tasks apply there and nowhere else. */
  cwd?: string
  /** Its result on its way to Claude (`pending`) or delivered; absent on rounds from before handoffs were tracked. */
  handoff?: 'pending' | 'done'
  /** When this version of the round was made, so the newest of two chats' versions wins. */
  at?: number
  /** Visual reviews: the pages to look at, and the screenshots taken of them (with small previews). */
  targets?: { label: string; url: string }[]
  shots?: { label: string; path: string; thumb?: string }[]
  /** Screenshots and other pictures Codex looks at. */
  images?: string[]
  /** Output that shows the problem (a failing command, a stack trace). */
  evidence?: string
  /** When Codex last did or said anything, and whether it has gone quiet without answering a check-in. */
  lastEventAt?: number
  stalled?: boolean
  /** Stopped, but its run (a worktree still being made, a process still ending) has not let go yet: no retry anywhere, and its own chat's results stand. */
  draining?: boolean
  /** The last check-in on a quiet run: when, and whether Codex was still at work. */
  checkIn?: { at: number; alive: boolean; found: boolean }
  error?: string
}

// ---------------------------------------------------------------------------
// Images

export type CodexAspect = 'square' | 'landscape' | 'portrait' | 'wide' | 'panorama'

export type CodexPreset = 'none' | 'cutout' | 'plate'

export type CodexImageStatus = 'queued' | 'starting' | 'thinking' | 'rendering' | 'saving' | 'done' | 'failed' | 'interrupted'

export type CodexThumb = { path: string; width: number; height: number }

export type CodexImage = {
  id: string
  batch: string
  toolUseId?: string
  name: string
  dir: string
  path: string
  prompt: string
  sent: string
  references: string[]
  aspect: CodexAspect
  style?: string
  preset: CodexPreset
  status: CodexImageStatus
  wait: boolean
  origin: 'claude' | 'gallery'
  parent?: string
  createdAt: number
  startedAt?: number
  finishedAt?: number
  error?: string
  width?: number
  height?: number
  bytes?: number
  tokens?: number
  sm?: CodexThumb
  lg?: CodexThumb
  xl?: CodexThumb
  /** The person chose this one. */
  picked?: boolean
  /** Key out the magenta once Codex has painted it (a cut-out on its way). */
  keyAfter?: boolean
  /** A transparent cut-out made from another picture. */
  cutout?: boolean
  /** A WebP copy for the site. */
  webp?: string
  /** The chat it was painted for; absent on pictures from before chats were told apart. */
  chat?: string
  /** The prompt Codex's image tool actually used, as Codex reported it. */
  revisedPrompt?: string
  /** Codex reported the picture's background as transparent. */
  transparent?: boolean
}

// ---------------------------------------------------------------------------
// The pane and the plan

export type CodexTab = 'talk' | 'tasks' | 'findings' | 'images'

export type CodexImagePanel = 'none' | 'edit' | 'tweak' | 'ask' | 'sent'

export type CodexView = {
  tab: CodexTab
  /** The conversation or task open in the pane; empty for the list. */
  thread: string
  showActivity: string
  showBrief: string
  /** The image open in detail, and the one in the viewer. */
  image: string
  viewing: string
  imagePanel: CodexImagePanel
  pick: { aspect: string; style: string }
  draft: string
  page: number
  /** Findings opened in full (`thread:F2`). */
  open: string[]
  /** Settled cards the person opened again. */
  expanded: string[]
  /** Starting something from the pane: '' (nothing), 'menu' (the choices) or the choice being confirmed, as JSON. */
  start: string
  /** The last result the person opened or dismissed on the band (a round's id); no longer read. */
  seen: string
  /** Results that finished before this are not news on the band; after it, those opened or dismissed (round ids). */
  seenAt: number
  dismissed: string[]
  /** The findings tab's severity filter ('' for all). */
  filter: string
  /** The conversation whose actions are open (the terminal), and the one being renamed. */
  rowMenu: string
  renaming: string
  /** The last deleted conversation, as JSON, while Undo is offered. */
  undo: string
  /** What each start would cover right now, as JSON, while the menu is open. */
  menu: string
  /** Bumped when the mascots' art is ready, so what is drawn picks it up. */
  art: number
  /** The lists show this chat's alone ('', the default) or every chat's ('all'). */
  scope: string
  /** Findings picked in the findings tab (`thread:F2`), to fix together. */
  picked: string[]
  /** The lists' search text, and which of them to show ('' all, attention, running, failed, findings). */
  query: string
  show: string
  /** The running round whose "Tell Codex" field takes the keyboard (opened from the band's Tell). */
  tell?: string
  /** Where the person's note goes: into the running turn (now), or into Codex's next round. */
  tellWhen?: 'now' | 'next'
}

/** The person's picks in the pane: they override the settings' defaults. */
export type CodexPrefs = {
  model: string
  effort: string
  lens: CodexLens
  aspect: CodexAspect
  /** The pane's board folded to one line. */
  compact?: boolean
  /** The band above the chat as one line a job, not pictures. */
  bandSmall?: boolean
  /** The service tier runs ask for ("default" or one the model offers, such as "priority"). */
  tier?: string
  /** How much the scenes move: full, calm (a burst on each change, the default) or still. */
  motion?: 'full' | 'calm' | 'still'
}

/** What Codex says about itself: its version, the account signed in, and the models it offers. */
export type CodexInfo = {
  version: string | null
  account: { type: string; plan?: string } | null
  models: { id: string; name: string; description: string; isDefault: boolean; efforts: string[]; defaultEffort: string | null; tiers: { id: string; name: string }[]; images: boolean }[]
  at: number
}


/** A chat (Claude Code session) using the mod, as the others see it. */
export type CodexChat = {
  id: string
  /** The chat's first prompt, short. */
  title: string
  /** The desktop app's id for it (local_…), to open it with claude://code/continue. */
  link?: string
  cwd?: string
  /** When the chat last wrote its file: a running round whose chat went quiet is gone. */
  beat: number
}

export type CodexUsage = {
  at: string
  plan?: string
  windows: { minutes: number; percent: number; resetsAt?: number }[]
  credits?: string
  reached?: string
}

declare module 'claude-code' {
  interface PluginState {
    claudex: {
      consults: CodexConsult[]
      images: CodexImage[]
      now: number
      view: CodexView
      usage: CodexUsage | null
      prefs: CodexPrefs
      worktrees: { count: number; bytes: number } | null
      chats: Record<string, CodexChat>
      /** The last poke at the mascots: who, and a count that makes each one new. */
      poke: { who: '' | 'claude' | 'codex'; n: number }
      /** The minute, ticking while idle: what changes with time alone (a cheer ending, Clawd dozing off) is drawn again. */
      minute: number
      /** Codex's version, account and models, as its app server reported them. */
      info: CodexInfo | null
    }
  }
}
