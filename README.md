# Claudex

**Claude and Codex, working together from Claude Code.**

Claudex is a mod for [Claude Code](https://claude.com/claude-code) that brings in
[Codex](https://openai.com/codex), OpenAI's coding agent, running on your own ChatGPT plan.
You talk to Claude as usual. When you want a second pair of eyes, or a second pair of
hands, ask Claude to bring in Codex. The two work together, and you can watch them live in
the chat.

> Claudex is an unofficial community mod. It isn't made by, endorsed by, or affiliated
> with Anthropic or OpenAI. "Claude" and "Clawd" belong to Anthropic; "Codex" and "ChatGPT"
> belong to OpenAI.

---

## What it does

| | |
|---|---|
| **Reviews and second opinions** | Codex reviews your uncommitted changes, a branch, a commit or specific files, with a focus on correctness, security, performance, tests, simplicity or UX. Claude checks each finding and marks whether it agrees, and you see both views side by side. |
| **Joint reviews** | Claude and Codex each review on their own without seeing the other's findings, then compare notes and agree on one fix. |
| **Plan checks** | Codex reads a plan before anything is built and points out its weak spots. |
| **Bug hunts** | Hand over a failing command or a stack trace and Codex digs in. |
| **Visual reviews** | Codex looks at desktop and phone screenshots of a page, and can compare it with the live version. |
| **Tasks in their own worktree** | Codex builds in its own copy of the repo, so nothing touches your files until Claude has reviewed the diff and applies it, in whole or file by file. Every apply can be undone in one click. |
| **Build loops** | Claude builds, Codex reviews, Claude fixes, Codex rechecks, until Codex approves. |
| **Shared jobs** | For bigger jobs, Claude splits the work between the two of them and tracks the parts on one board. |
| **A two-way line** | While Codex works, you or Claude can send it notes. Codex can also tell Claude what it finds, or ask a question and either wait for the answer or carry on. |
| **Pictures** | Codex's image model paints pictures and saves them as PNG files. It can make cut-outs and backgrounds, in up to four variations at once. |

All of this shows up as live cards in the chat. There is also a band above the prompt
where Claude and Codex work on a little stage, and a **Claudex pane** (`/claudex`) with
every conversation, task, picture and your Codex usage.

Codex only runs when you ask for it. Claude never calls it on its own initiative.

---

## Examples

You don't call any commands. You just tell Claude what you want, in your own words.

**A second opinion before you commit**

> Ask Codex to review my uncommitted changes, especially for security.

Codex reviews the diff and returns findings (F1, F2, …). Claude checks each one against
the code and marks it *agree*, *disagree* or *unsure* with a note. Then it fixes what's
real, and Codex rechecks.

**Let them argue it out**

> Do a joint review of this branch against main with Codex.

Claude writes its own findings while Codex writes its own. Neither sees the other's until
both are done. Then they compare, debate the points they disagree on, and agree on one
solution.

**Check a plan before building it**

> Before you start, have Codex look over the plan.

Codex reviews the latest plan. Claude weighs each point and gives you the revised plan
with a short "Codex review" section.

**Hand off a piece of work**

> Have Codex add pagination to the orders API. Done means the tests pass and the
> page size is configurable.

Codex works in its own git worktree, so your files stay untouched. When it finishes,
Claude reviews the patch like a colleague's. It then applies the patch, applies only some
files, sends it back with notes, or throws it away.

**Build until it's approved**

> Build the settings page, and loop with Codex reviewing until it approves.

**Find a bug**

> Codex, why does `npm test` fail on CI but pass locally? Here's the log: …

**Check how a page looks**

> Have Codex do a visual review of http://localhost:3000/pricing compared with the
> live site.

**Steer it mid-run**

> Tell Codex the API moved to `src/api/v2`, and that it should use that.

> When it's done, queue up a note for Codex to also add tests.

**Paint a picture**

> Ask Codex for three variations of a cosy pixel-art kitchen, wide format.

**Stop everything**

> Stop Codex.

---

## Requirements

- **Claude Code**, either the desktop app or the terminal
- **Codex, signed in with your ChatGPT account.** The Codex desktop app works best, because Claudex uses its CLI. The Codex CLI on its own also works: `npm i -g @openai/codex`, then `codex login`.
- **Node.js 20** or newer
- **git**

Optional, per project:

- Visual reviews need Playwright (`npm i -D playwright`) and Chrome or Edge.
- Picture cut-outs and WebP copies need `sharp`.

It works on macOS and Windows.

---

## Install

1. Clone the repo into your Claude Code mods folder:

   ```bash
   git clone https://github.com/viscolex/claudex.git ~/.claude/mods/claudex
   ```

2. Tell Claude Code to load it. Add this to `~/.claude/settings.json`, merging it into any `env` block you already have:

   ```json
   {
     "env": {
       "CLAUDE_CODE_PLUGIN_DIRS": "/Users/YOUR-NAME/.claude/mods/claudex"
     }
   }
   ```

   On Windows, use `C:\\Users\\YOUR-NAME\\.claude\\mods\\claudex`.

3. Restart Claude Code and start a new chat. The Claudex band appears above the prompt after your first message, and `/claudex` opens the pane.

4. Check that it can reach your Codex:

   ```bash
   node ~/.claude/mods/claudex/scripts/smoke.mjs
   ```

   Each check prints PASS or FAIL. No model runs, so it costs nothing. Add `--turn` to also run one tiny real turn.

To update later, run `git pull` in `~/.claude/mods/claudex` and restart Claude Code.

[INSTALL.md](INSTALL.md) has more: upgrading from the older Codex mod, where Claudex keeps
its files, troubleshooting, and the release notes.

---

## Settings

Open **Usage & settings** in the Claudex pane, or the mod's settings in Claude Code:

- **Codex model**: the model Codex uses by default
- **Reasoning effort**: `low`, `medium`, `high` (the default), `xhigh`, `max` or `ultra`
- **Motion**: Calm (the default), Full or Still

Codex runs use your own Codex quota. Claudex shows your usage, and warns you before
starting work once you're above 90%.

---

## The Codex mascot

The animated Codex companion on the stage is cut out of the Codex desktop app's own
artwork on your computer, so it always matches your installed version. This repo doesn't
include OpenAI's artwork. If you only have the Codex CLI, everything still works; the
stage just shows Claude's side without the mascot.

---

## Layout

```
.claude-plugin/plugin.json   mod manifest and settings
hooks/register.tsx           the mod: tools, cards, band, pane
hooks/art.ts, duet.ts        the stage and its drawings
scripts/                     Node helpers: Codex app server, tasks, worktrees, images, smoke test
schemas/                     JSON schemas for Codex's structured replies
types/index.d.ts             the mod API types
tests/                       tests (run with Claude Code's mod test runner)
```

---

## License

[MIT](LICENSE) © Andrej Safranovic
