// Opens a file at a line in the person's editor: Cursor, then VS Code, then
// whatever the system opens the file with. Prints one JSON line.
import { existsSync } from 'node:fs'
import { flags, mac, openWithSystem, print, run, which, windows } from './lib.mjs'

const { path, line } = flags()
try {
  if (!path || !existsSync(path)) throw new Error(`No such file: ${path}`)
  const at = `${path}:${Math.max(1, Number(line) || 1)}`
  // The editors' own command-line tools; on a Mac also inside the apps, which
  // may not have put them on PATH.
  const editors = [
    ['cursor', mac ? '/Applications/Cursor.app/Contents/Resources/app/bin/cursor' : ''],
    ['code', mac ? '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code' : ''],
  ]
  for (const [name, bundled] of editors) {
    const tool = (bundled && existsSync(bundled) ? bundled : undefined) ?? which(name)
    if (!tool) continue
    // On Windows the editors' tools are .cmd scripts, which only a shell runs.
    const ran = windows ? run('cmd.exe', ['/c', tool, '-g', at]) : run(tool, ['-g', at])
    if (ran.code === 0) {
      print({ ok: true, with: name })
      process.exit(0)
    }
  }
  openWithSystem(path)
  print({ ok: true, with: 'default' })
} catch (err) {
  print({ ok: false, error: err instanceof Error ? err.message : String(err) })
}
