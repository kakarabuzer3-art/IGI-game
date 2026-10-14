/**
 * Real-browser verification: launches headless Chromium (SwiftShader WebGL),
 * walks the full UI flow (landing → select → briefing → gameplay → pause),
 * collects console/page errors, and captures screenshots for visual review.
 *
 * Run: node scripts/browser-check.mjs   (expects `npm run build` done)
 */
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const PORT = 3123
const BASE = `http://localhost:${PORT}`
const EXE = '/tmp/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'
const OUT = 'docs/screenshots'

mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForServer(url, timeoutMs = 30000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(url)
      if (r.ok) return true
    } catch { /* not up yet */ }
    await sleep(500)
  }
  throw new Error('server did not start')
}

const errors = []
const warnings = []

async function main() {
  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: 'ignore',
  })
  let browser
  try {
    await waitForServer(BASE)
    console.log('[ok] server up')

    browser = await chromium.launch({
      executablePath: EXE,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
      ],
    })
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
    page.on('console', (msg) => {
      const t = msg.type()
      if (t === 'error') errors.push(`console.error: ${msg.text()}`)
      else if (t === 'warning') warnings.push(`console.warn: ${msg.text()}`)
    })
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('requestfailed', (r) => {
      const u = r.url()
      if (!u.includes('sockjs') && !u.includes('hot-update')) errors.push(`requestfailed: ${u}`)
    })

    // 1. landing
    await page.goto(BASE, { waitUntil: 'networkidle' })
    await sleep(500)
    await page.screenshot({ path: `${OUT}/01-landing.png` })
    console.log('[ok] landing screenshot')

    // WebGL availability probe
    const webgl = await page.evaluate(() => {
      const c = document.createElement('canvas')
      const gl = c.getContext('webgl2') || c.getContext('webgl')
      if (!gl) return 'NO WEBGL'
      const dbg = gl.getExtension('WEBGL_debug_renderer_info')
      return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'webgl ok'
    })
    console.log('[info] renderer:', webgl)

    // 2. mission select
    await page.getByRole('button', { name: /Initialize Operation/i }).click()
    await sleep(400)
    await page.screenshot({ path: `${OUT}/02-select.png` })
    console.log('[ok] select screenshot')

    // 3. briefing
    await page.getByRole('button', { name: /Mission 1: Operation Nightfall/i }).click()
    await sleep(300)
    await page.screenshot({ path: `${OUT}/03-briefing-typed.png` })
    // skip the typewriter, then begin
    const skip = page.getByRole('button', { name: /Skip/i })
    if (await skip.isVisible().catch(() => false)) await skip.click()
    await sleep(200)
    await page.screenshot({ path: `${OUT}/04-briefing-full.png` })
    await page.getByRole('button', { name: /Begin Mission/i }).click()
    console.log('[ok] briefing screenshots; mission starting…')

    // 4. insertion fade → gameplay
    await sleep(2600)
    await page.screenshot({ path: `${OUT}/05-gameplay-spawn.png` })
    console.log('[ok] gameplay spawn screenshot')

    // HUD assertions (HTML accessibility surface)
    const hud = await page.evaluate(() => document.body.innerText)
    for (const probe of ['NIGHTFALL', 'Breach the perimeter', 'UNDETECTED', 'Stamina', 'ESC']) {
      console.log(`[hud] "${probe}":`, hud.includes(probe) ? 'OK' : 'MISSING')
    }

    // 5. movement: hold W for 1.6 s
    await page.keyboard.down('KeyW')
    await sleep(1600)
    await page.keyboard.up('KeyW')
    await sleep(300)
    await page.screenshot({ path: `${OUT}/06-gameplay-moved.png` })
    console.log('[ok] moved screenshot')

    // crouch check
    await page.keyboard.down('ControlLeft')
    await sleep(600)
    const posture = await page.evaluate(() => document.body.innerText.includes('CROUCHED'))
    console.log('[hud] CROUCHED after Ctrl:', posture ? 'OK' : 'MISSING')
    await page.screenshot({ path: `${OUT}/07-crouched.png` })
    await page.keyboard.up('ControlLeft')

    // 6. canvas is actually painting (not a black frame)
    const shot = await page.screenshot({ clip: { x: 400, y: 200, width: 480, height: 320 } })
    // crude brightness probe: count non-uniform bytes in the PNG (compressed size heuristic)
    console.log(`[info] gameplay canvas clip bytes: ${shot.length} (black frame would be ~2-5k)`)

    // 7. pause menu via Escape
    await page.keyboard.press('Escape')
    await sleep(500)
    await page.screenshot({ path: `${OUT}/08-pause.png` })
    const paused = await page.evaluate(() => document.body.innerText.includes('Operation paused') || document.body.innerText.includes('Resume'))
    console.log('[hud] pause menu:', paused ? 'OK' : 'MISSING')

    // 8. settings panel
    await page.getByRole('button', { name: /Settings/i }).first().click()
    await sleep(400)
    await page.screenshot({ path: `${OUT}/09-settings.png` })
    const settingsOpen = await page.evaluate(() => document.body.innerText.includes('Reduced motion'))
    console.log('[hud] settings:', settingsOpen ? 'OK' : 'MISSING')
    await page.getByRole('button', { name: /Close/i }).click()
    await sleep(200)

    // 9. resume + abort to select
    await page.getByRole('button', { name: /Resume/i }).click()
    await sleep(800)
    await page.keyboard.press('Escape')
    await sleep(400)
    await page.getByRole('button', { name: /Abort to Debrief/i }).click()
    await sleep(400)
    const backAtSelect = await page.evaluate(() => document.body.innerText.includes('SELECT OPERATION'))
    console.log('[flow] abort → select:', backAtSelect ? 'OK' : 'MISSING')
    await page.screenshot({ path: `${OUT}/10-back-to-select.png` })

    // 10. FPS sample during play (restart mission, measure rAF rate)
    await page.getByRole('button', { name: /Mission 1: Operation Nightfall/i }).click()
    await sleep(300)
    const skip2 = page.getByRole('button', { name: /Skip/i })
    if (await skip2.isVisible().catch(() => false)) await skip2.click()
    await page.getByRole('button', { name: /Begin Mission/i }).click()
    await sleep(2500)
    const fps = await page.evaluate(() => new Promise((resolve) => {
      let n = 0
      const t0 = performance.now()
      const tick = () => {
        n++
        if (performance.now() - t0 < 2000) requestAnimationFrame(tick)
        else resolve(Math.round((n * 1000) / (performance.now() - t0)))
      }
      requestAnimationFrame(tick)
    }))
    console.log(`[perf] rAF fps under SwiftShader software rendering: ${fps}`)

    await page.screenshot({ path: `${OUT}/11-gameplay-2.png` })
  } finally {
    if (browser) await browser.close()
    server.kill('SIGTERM')
  }

  console.log('\n===== ERRORS (' + errors.length + ') =====')
  for (const e of [...new Set(errors)].slice(0, 25)) console.log(' ✗', e)
  console.log('===== WARNINGS (' + warnings.length + ') =====')
  for (const w of [...new Set(warnings)].slice(0, 10)) console.log(' !', w.slice(0, 160))
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
