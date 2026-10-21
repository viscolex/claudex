// Screenshots pages for a visual review: each at a desktop and a phone size,
// with the project's own Playwright driving an installed browser (Edge, then Chrome) on the real
// GPU (WebGL pages render). Prints one JSON line.
//
//   node capture.mjs <project dir> <out dir> <label>=<url> [<label>=<url> ...]
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const [project, out, ...targets] = process.argv.slice(2)
const SIZES = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false },
  { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true },
]

function loadPlaywright() {
  for (const from of [project, process.cwd()].filter(Boolean)) {
    try {
      return createRequire(join(from, 'package.json'))('playwright')
    } catch {}
  }
  throw new Error('A visual review needs Playwright in this project (npm install -D playwright)')
}

try {
  if (!project || !out || !targets.length) throw new Error('usage: node capture.mjs <project dir> <out dir> <label>=<url> ...')
  mkdirSync(out, { recursive: true })
  const { chromium } = loadPlaywright()
  // An installed browser on the real GPU (WebGL pages render): Edge, then
  // Chrome, then Playwright's own if it was downloaded.
  const gpu = process.platform === 'win32' ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] : ['--enable-gpu', '--ignore-gpu-blocklist']
  let browser
  for (const channel of ['msedge', 'chrome', undefined]) {
    try {
      browser = await chromium.launch({ ...(channel ? { channel } : {}), headless: true, args: gpu })
      break
    } catch {}
  }
  if (!browser) throw new Error('No browser for the screenshots: install Edge or Chrome, or run npx playwright install chromium')
  const shots = []
  const problems = []
  try {
    for (const target of targets) {
      const at = target.indexOf('=')
      const label = target.slice(0, at)
      const url = target.slice(at + 1)
      for (const size of SIZES) {
        const context = await browser.newContext({ viewport: size.viewport, deviceScaleFactor: size.deviceScaleFactor, isMobile: size.isMobile, hasTouch: size.isMobile })
        const page = await context.newPage()
        try {
          const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 }).catch(() => page.waitForLoadState('load').then(() => null))
          // Entrances, fonts and lazy pictures settle.
          await page.waitForTimeout(2200)
          const path = join(out, `${label}-${size.name}.png`)
          await page.screenshot({ path })
          const landed = page.url()
          shots.push({ label: `${label} · ${size.name}`, path, url: landed })
          if (response && response.status() >= 400) problems.push(`${label} ${size.name}: HTTP ${response.status()}`)
          if (/\/login\b/.test(landed) && !/\/login\b/.test(url)) problems.push(`${label} ${size.name}: redirected to the login page (a signed-in page)`)
        } catch (err) {
          problems.push(`${label} ${size.name}: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`)
        } finally {
          await context.close()
        }
      }
    }
  } finally {
    await browser.close()
  }
  if (!shots.length) throw new Error(problems.join('; ') || 'No screenshots were taken')
  console.log(JSON.stringify({ ok: true, shots, problems }))
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }))
}
