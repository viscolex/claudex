# Claudex 2.6

Claude and Codex, working together from Claude Code. Claudex brings Codex
(OpenAI's coding agent, on your own ChatGPT plan) into Claude Code:

- reviews and second opinions, and joint reviews where Claude and Codex compare notes
- tasks Codex builds in its own copy of the repo, which Claude checks and applies (whole or file by file), with one-click undo
- build loops where they review each other's work, and bigger jobs Claude splits between them, on one board
- a two-way line while Codex works: you or Claude send it notes; Codex tells Claude what it finds, and asks when it needs an answer, either waiting for it or carrying on while Claude thinks
- notes for Codex's next round, queued while it works, that start the next round by themselves when it finishes
- Codex can use its own browser (the Codex app's Browser use): when it wants a site, you get Allow once / Always allow / Deny
- open findings fixed in one go, and pictures

It has live cards in the chat, a band above the prompt where Claude and Codex
work on a little stage (what Codex does lands on the floor between them, step
by step), and the Claudex pane (`/claudex`). It works on macOS and Windows.

## What you need

- **Claude Code**, the desktop app or the terminal.
- **Codex, signed in with your ChatGPT account.** The Codex desktop app is best (Claudex uses its CLI). The Codex CLI alone also works (`npm i -g @openai/codex`, then `codex login`).
- **Node.js 20 or newer** (`brew install node` on a Mac).
- **git.**

## Install (new)

1. Unzip so this folder ends up at `~/.claude/mods/claudex`: the folder holding `hooks/`, `scripts/` and `.claude-plugin/`.
2. Tell Claude Code to load it. In `~/.claude/settings.json`, add the `env` entry below (merge it into an `env` block you already have):

   ```json
   {
     "env": {
       "CLAUDE_CODE_PLUGIN_DIRS": "/Users/YOUR-NAME/.claude/mods/claudex"
     }
   }
   ```

   On Windows the path is `C:\\Users\\YOUR-NAME\\.claude\\mods\\claudex`.
3. Restart Claude Code and start a new chat. The Claudex line appears above the prompt after your first message, and `/claudex` opens the pane.

Codex only runs when you ask for it: from the pane (every start has a confirm step), or by asking Claude to use Codex.

## Upgrading

From Claudex 2.5: replace the `~/.claude/mods/claudex` folder with this one and restart Claude Code.

### From the Codex mod (1.x, 2.0 or 2.1)

Claudex replaces the Codex mod. Your history, model picks and every chat's conversations come over by themselves the first time Claudex starts; nothing of the old mod is changed or deleted.

1. Let any Codex run finish (or stop it).
2. Unzip Claudex to `~/.claude/mods/claudex`, beside the old `~/.claude/mods/codex`.
3. In `~/.claude/settings.json`, change `CLAUDE_CODE_PLUGIN_DIRS` from the old folder to the new one: `/Users/YOUR-NAME/.claude/mods/codex` becomes `/Users/YOUR-NAME/.claude/mods/claudex`. If the value lists several folders, change only that one (they are separated by `:` on a Mac and `;` on Windows). Do not load both: they are the same mod under two names.
4. Restart Claude Code. Your conversations show in `/claudex` (pick "All chats" to see every chat's), and its tools are now `mcp__claudex__…` instead of `mcp__codex__…`.
5. Run `node scripts/smoke.mjs` from `~/.claude/mods/claudex` to check it reaches your Codex.
6. Once you are happy, you can delete `~/.claude/mods/codex`. Leave `~/.claude/codex-mod` until any old tasks you still want are applied: Claudex can still apply and clean up tasks whose worktrees are there.

You can also just hand Claude the zip and say: "Install this Claudex mod in place of my Codex mod, following its INSTALL.md".

## Check it works

After installing, and whenever the Codex app updates, run the smoke test from this folder:

```
node scripts/smoke.mjs
```

It checks, against your real Codex, that it starts, that you are signed in, which models it offers, and that it still accepts everything Claudex sends. No model runs, so it costs nothing. `node scripts/smoke.mjs --turn` also runs one tiny turn (a few thousand tokens of your plan). Each line says PASS or FAIL.

## What's new in 2.6

- **Your own Now and Next**: in a conversation, send Codex a note now, or queue it for its next round (you see the queue, and can take things back out); and answer the questions Codex asked without waiting, right where they show.
- **Fixes you apply are checked, not assumed**: applying a fix leaves its findings open, marked "fix applied", until Claude or a Codex recheck confirms them (one tap if you checked yourself).
- **Codex's own words on the band**: while it writes, its latest sentence is the headline.
- **Claude at work too**: while Codex works, Claude's own steps (edits, commands, reads) show on Claude's side of the stage, and Clawd types along.
- **The stage everywhere**: a drawn timeline of each conversation, the job board, the band at rest, usage meters, new status chips, and starters when a tab is empty. Boop Clawd or Codex right on the hero.
- **Motion you choose**: Calm (the default: a burst of motion when something happens, then still), Full, or Still, in Usage & settings. Calm costs about a tenth of Full.
- **Never stuck in the queue**: runs start in order, two at a time, and a third that has to wait never hangs.

## What's new in 2.5

- **Claudex**: the Codex mod, renamed. Claude and Codex are still Claude and Codex.
- **The stage**: the band, the cards and the pane share one new look. Whoever has the move stands in the spotlight; each step Codex takes (a file read, a search, a command, an edit) lands on the floor as a chip; a result drops its findings on the floor in their colours, and they trade a line about it. The pane's sections are tiles you can click or step through with the arrow keys.
- **Questions that don't block**: Codex can ask Claude something and carry on with what does not depend on the answer. The band shows the open question; Claude's answer reaches Codex at its next step, or starts its next round if Codex has finished.
- **Now or next**: a note to Codex either steers what it is doing now, or waits for its next round, which then starts by itself as soon as the current one ends. A stopped round drops what was queued for it.
- **The Codex mascot ships with Claudex**, so it shows even where the Codex app's own art cannot be read.
- **Truer counts**: "needs you" counts what the list shows (this chat's, or all chats').

## Optional, per project

- **Visual reviews** (screenshots of a page) need Playwright in the project (`npm i -D playwright`), plus Chrome or Edge.
- **WebP copies of pictures** need `sharp` in the project. Most web projects have it already. Cut-outs need nothing extra: Codex paints them transparent, or the mod keys out the magenta itself.

## Where things live

- `~/.claude/claudex`: history shared between chats, task worktrees and patches, screenshots, the mascot art cache.
- `~/.claude/codex-mod`: the old Codex mod's (read once when Claudex first starts, never changed).
- `~/.codex`: Codex's own sign-in, sessions and usage.

## If something's off

- **"Node.js is needed"**: install Node. On a Mac, Node installed through `nvm` may not be visible to apps; Homebrew's is.
- **"The Codex app was not found"**: install the Codex app, or the CLI on PATH, and sign in.
- **"Codex could not be reached (start): …"**: the Codex binary would not start. On a Mac, open the Codex app once so macOS lets its CLI run; then run `node scripts/smoke.mjs` to see what fails.
- **Two Codex lines above the prompt**: both the old mod and Claudex are loaded; point `CLAUDE_CODE_PLUGIN_DIRS` at `claudex` only.
- **Anything else after a Codex update**: run `node scripts/smoke.mjs` and send the FAIL lines.
- **To remove it**: delete the `env` entry and the folder.
