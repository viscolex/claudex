// Turns what Codex runs into words a person reads at a glance: one part per
// statement of a shell command (Read, Search, Git, List, Run), with the files
// it opened. Codex on Windows wraps each batch in `powershell -Command '...'`.

import type { CodexVerb } from '../types'

export type Part = { verb: CodexVerb; text: string; file?: string }

function unquote(text: string) {
  const s = text.trim()
  if (s.length >= 2 && (s[0] === "'" || s[0] === '"') && s[s.length - 1] === s[0]) {
    const inner = s.slice(1, -1)
    return s[0] === "'" ? inner.replace(/''/g, "'") : inner.replace(/\\"/g, '"').replace(/`"/g, '"')
  }
  return s
}

/**
 * One shell word as POSIX quoting spells it: quoted and bare pieces glued
 * together, as in `'a'"'"'b'` for a'b (how Codex quotes its scripts).
 */
function shellWord(text: string) {
  let out = ''
  let i = 0
  const s = text.trim()
  while (i < s.length) {
    const c = s[i] as string
    if (c === "'") {
      const end = s.indexOf("'", i + 1)
      if (end < 0) return out + s.slice(i + 1)
      out += s.slice(i + 1, end)
      i = end + 1
    } else if (c === '"') {
      i++
      while (i < s.length && s[i] !== '"') {
        if (s[i] === '\\' && (s[i + 1] === '"' || s[i + 1] === '\\')) i++
        out += s[i]
        i++
      }
      i++
    } else if (/\s/.test(c)) {
      return out
    } else {
      out += c
      i++
    }
  }
  return out
}

/** The script inside a `powershell -Command` or `bash -lc` wrapper. */
export function unwrap(command: string) {
  let s = command.trim()
  const ps = s.match(/^(?:"[^"]*powershell(?:\.exe)?"|\S*powershell(?:\.exe)?|\S*pwsh(?:\.exe)?)\s+(?:-[A-Za-z]+\s+)*?-Command\s+([\s\S]+)$/i)
  if (ps?.[1]) s = shellWord(ps[1])
  const sh = s.match(/^(?:"[^"]*(?:bash|sh)(?:\.exe)?"|\S*\b(?:bash|sh)(?:\.exe)?)\s+-l?c\s+([\s\S]+)$/i)
  if (sh?.[1]) s = shellWord(sh[1])
  return s
}

/** Splits on separators outside quotes: `;`, newlines, `&&`, `||` (or `|` for pipes). */
function split(script: string, pipes: boolean) {
  const out: string[] = []
  let quote = ''
  let current = ''
  for (let i = 0; i < script.length; i++) {
    const c = script[i] as string
    if (quote) {
      current += c
      if (c === quote) quote = ''
      continue
    }
    if (c === "'" || c === '"') {
      quote = c
      current += c
      continue
    }
    const two = script.slice(i, i + 2)
    const isBreak = pipes
      ? c === '|' && two !== '||'
      : c === ';' || c === '\n' || c === '\r' || two === '&&' || two === '||'
    if (isBreak) {
      if (current.trim()) out.push(current.trim())
      current = ''
      if (two === '&&' || two === '||') i++
      continue
    }
    current += c
  }
  if (current.trim()) out.push(current.trim())
  return out
}

function tokens(segment: string) {
  const out: string[] = []
  const re = /'(?:[^']|'')*'|"(?:[^"\\]|\\.)*"|\S+/g
  for (const m of segment.matchAll(re)) out.push(unquote(m[0]))
  return out
}

const READERS = new Set(['get-content', 'gc', 'cat', 'type', 'sed', 'head', 'tail', 'more', 'less', 'bat', 'nl'])
const LISTERS = new Set(['get-childitem', 'gci', 'ls', 'dir', 'tree', 'fd', 'find', 'resolve-path', 'test-path'])
const SEARCHERS = new Set(['rg', 'grep', 'select-string', 'sls', 'findstr', 'ag'])

/** The first argument that is not a flag (or the value of one of `named`). */
function argument(args: string[], named: string[] = []) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (named.includes(a.toLowerCase())) return args[i + 1]
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (a.startsWith('-')) {
      // Flags that take a value.
      if (/^-(?:m|A|B|C|g|t|e|First|Last|Head|Tail|TotalCount|Encoding|Filter|Include|Exclude|Depth|Context)$/i.test(a)) i++
      continue
    }
    if (/^\d/.test(a) && !/[\\/.]/.test(a)) continue
    return a
  }
  return undefined
}

function valueOf(args: string[], name: string) {
  const at = args.findIndex(a => a.toLowerCase() === name)
  return at >= 0 ? args[at + 1] : undefined
}

export function tidyPath(path: string, cwd: string) {
  let p = path.replace(/\\/g, '/').replace(/^\.\//, '')
  const root = cwd.replace(/\\/g, '/').replace(/\/$/, '')
  if (root && p.toLowerCase().startsWith(root.toLowerCase() + '/')) p = p.slice(root.length + 1)
  return p
}

function short(text: string, max = 70) {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

function classify(statement: string, cwd: string): Part | undefined {
  const s = statement.replace(/^\$[\w:]+\s*=\s*/, '').trim()
  if (!s || /^\$[\w:]+(\[[^\]]*\])?$/.test(s)) return undefined
  const segments = split(s, true)
  let listPath: string | undefined

  for (const segment of segments) {
    const t = tokens(segment)
    const cmd = (t[0] ?? '').toLowerCase().replace(/\.exe$/, '')
    const args = t.slice(1)
    if (cmd === 'git' && (args[0] ?? '').toLowerCase() === 'grep') {
      const pattern = argument(args.slice(1), ['-e'])
      return { verb: 'Search', text: pattern ? `“${short(pattern, 48)}”` : 'with git grep' }
    }
    if (SEARCHERS.has(cmd)) {
      if (cmd === 'rg' && args.includes('--files')) {
        const where = argument(args.filter(a => a !== '--files'))
        return { verb: 'List', text: where ? tidyPath(where, cwd) : 'the files' }
      }
      const pattern = argument(args, ['-pattern', '-e', '--regexp'])
      const rest = pattern ? args.slice(args.indexOf(pattern) + 1) : args
      const named = valueOf(args, '-path')
      const where = cmd === 'select-string' || cmd === 'sls' ? (named ?? listPath) : argument(rest, ['-path'])
      const what = pattern ? `“${short(pattern, 48)}”` : 'the code'
      return { verb: 'Search', text: where ? `${what} in ${short(tidyPath(where, cwd), 44)}` : what }
    }
    if (LISTERS.has(cmd)) listPath = argument(args, ['-path', '-literalpath']) ?? '.'
    if (READERS.has(cmd)) listPath = argument(args, ['-path', '-literalpath'])
  }

  const t = tokens(segments[0] ?? '')
  const cmd = (t[0] ?? '').toLowerCase().replace(/\.exe$/, '')
  const args = t.slice(1)
  if (READERS.has(cmd)) {
    const file = cmd === 'sed' ? args.filter(a => !a.startsWith('-') && !/^\d/.test(a) && !/[pd]$/.test(a)).pop() : argument(args, ['-path', '-literalpath'])
    if (!file) return { verb: 'Read', text: 'a file' }
    const tidy = tidyPath(file, cwd)
    return { verb: 'Read', text: tidy, file: tidy }
  }
  if (cmd === 'git') {
    const sub = args.filter(a => !/^-C$/.test(a))
    return { verb: 'Git', text: short(sub.join(' '), 60) || 'status' }
  }
  if (LISTERS.has(cmd)) return { verb: 'List', text: tidyPath(listPath ?? '.', cwd) }
  if (/^(select-object|sort-object|measure-object|foreach-object|where-object|format-\w+|out-\w+|write-\w+|echo)$/.test(cmd)) return undefined
  return { verb: 'Run', text: short(segments[0] ?? s, 60) }
}

/** Every part of a command Codex ran, in order. */
export function describe(command: string, cwd: string): Part[] {
  const script = unwrap(command)
  const parts: Part[] = []
  for (const statement of split(script, false)) {
    const part = classify(statement, cwd)
    if (part) parts.push(part)
  }
  return parts.length ? parts : [{ verb: 'Run', text: short(script, 60) }]
}

/** The first line of Codex's commentary, as one sentence. */
export function headline(text: string) {
  const line = text.replace(/\*\*/g, '').trim().split(/\r?\n/).find(l => l.trim()) ?? ''
  return line.trim()
}
