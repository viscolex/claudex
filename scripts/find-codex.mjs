// Prints the path of the Codex CLI bundled with the Codex app (it moves with
// every app update), or of a codex on PATH, as one JSON line.
import { findCodex, print } from './lib.mjs'

print({ codex: findCodex() ?? null })
