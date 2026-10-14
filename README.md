# SHADOW PROTOCOL

**An original first-person tactical stealth game that runs entirely in the browser.**

Four night operations against Greyline Station — a remote signals facility. Reconnaissance,
shadow routes, camera networks, keycards, searchlights, lockdowns, and extraction under
threat. No downloads. No installs. No copyrighted content: the world, characters, missions,
dialogue, visuals (procedural textures/geometry) and audio (WebAudio synthesis) are all
original creations, inspired by the *design principles* of classic tactical infiltration games.

> **Design promise:** You are not browsing a game. You are entering a mission.

---

## Quick start

```bash
npm install
npm run dev        # development (http://localhost:3000)
npm run build      # production build (webpack; see note)
npm start          # serve production build
npm test           # 75 unit + integration tests (vitest)
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

> **Build note:** `npm run build` runs `next build --webpack`. The sandbox/CI machine this
> project was verified on has ~1 GB RAM, which the default Turbopack builder exceeds
> (`Killed`). On a normal machine `npm run build:turbopack` also works. Output is identical.

**Controls (desktop, primary target):** WASD move · mouse look (pointer lock) · Shift sprint ·
Ctrl/C crouch · E interact · F takedown from behind · G signal jammer · Esc menu.
**Touch devices:** automatic simplified tactical mode — floating move stick, drag-look,
oversized USE/T.K./JAM/CROUCH/RUN buttons, compact HUD.

---

## Architecture

Hard separation: **React owns UI/shell; a framework-agnostic TypeScript engine owns gameplay.**
The render loop never touches React state; React never re-renders per frame.

```
app/                      Next.js App Router
  page.tsx                semantic, SEO-visible landing (server component)
  globals.css             tactical design tokens + HUD/animation CSS
components/game/          React shell (client components)
  GameExperience.tsx      flow orchestrator: menu → select → briefing → game → report
  GameCanvas.tsx          thin engine mount (WebGL container + minimap canvas)
  GameHUD.tsx             accessible HTML HUD (objectives/alert/radio/prompt/vitals)
  MissionBriefing.tsx     skippable typed briefing (instant under reduced motion)
  MissionReport.tsx       after-action grade: GHOST / SHADOW / OPERATIVE / COMPROMISED
  MissionSelect.tsx       campaign browser with progression (locks + best grades)
  PauseMenu.tsx           keyboard-accessible pause (duplicates objectives + controls)
  SettingsPanel.tsx       sensitivity / audio / quality / accessibility (persisted)
  TouchControls.tsx       touch-first controls (pointer events → InputManager methods)
engine/                   pure TypeScript game engine (no React imports)
  Game.ts                 orchestrator: loop, phases, snapshots, bus wiring
  core/                   GameLoop (fixed 60Hz timestep) · EventBus · math · types · fastLane
  input/InputManager.ts   keyboard/mouse/pointer-lock/touch sampling
  world/                  Level (tile grid + lightmap + entities) · LOS (DDA) · Pathfinding (A*)
  player/                 PlayerController (move/stamina/crouch/noise) · CameraController
  ai/                     Perception (pure detection math) · Guard FSM · EnemyManager
  stealth/StealthSystem   facility alert model · cameras/searchlights · radio · jammer
  interaction/            proximity+facing selection · prompts · hold-progress · consequences
  mission/MissionManager  data-driven objectives · triggers · lockdown · grading
  audio/AudioManager      100% procedural WebAudio (positional, occlusion lowpass)
  render/                 SceneBuilder (Three.js, merged geometry) · RenderManager · Minimap
  perf/PerformanceManager adaptive resolution/quality presets
data/                     CONTENT — levels.ts (4 tile-grid maps) · missions.ts (4 operations)
lib/storage.ts            localStorage: settings + campaign progress
tests/                    levels validation · systems · AI behavior · playthroughs · lifecycle
```

### Data flow

```
INPUT → PLAYER → WORLD → AI (10 Hz staggered think, per-frame steering)
      → STEALTH (15–20 Hz) → MISSION (event-driven) → CAMERA → RENDER (rAF)

Engine ──(GameSnapshot ≤10 Hz + events)──▶ React HUD (discrete state)
Engine ──(FrameValues, direct DOM writes)──▶ HUD bars/compass (no re-renders)
```

### Key design decisions

- **Three.js WebGL renderer** (user-selected over a Canvas 2D raycaster): true first-person
  pitch, polygonal facility geometry, real-time point lights. Static level geometry is merged
  into a handful of draw calls; the **lightmap is baked into vertex colors** so the same light
  values that drive stealth detection also drive what the player sees.
- **One grid, two consumers:** tile-grid levels feed collision, AI pathfinding, DDA
  line-of-sight, camera cones and audio occlusion — while Three.js only *renders* the result.
- **Information-limited AI:** guards know only perceived positions (`lastKnown`), escalate
  gradually (suspicion meter), investigate noises at the noise, share intel by radio
  (jammable), search stale positions, and stand down. Verified by tests, including
  "no omniscient chase" and body-discovery cases.
- **Readable stealth:** facility state `UNDETECTED → SUSPICIOUS → ALERT → SEARCHING →
  COMBAT → LOCKDOWN` with a plain-language reason on the HUD; detection vignette + heartbeat
  audio scale with suspicion. Combat is deliberately suboptimal; missions are graded.
- **Data-driven content:** missions/objectives/levels/guards/triggers live in `data/`; the
  engine is generic. Hidden objectives reveal on discovery (curiosity → reward). Mission 04
  reacts to your prior grades (carry-over consequences).
- **Zero runtime dependencies beyond three**; zero assets — textures and audio are
  synthesized procedurally at load time.

## Testing

```bash
npm test
```

- `tests/levels.test.ts` — grid integrity, marker/override consistency, objective & patrol
  reachability (with elevator-portal expansion) for all 4 maps.
- `tests/systems.test.ts` — LOS, A*, perception math (light/crouch/distance/FOV), hearing,
  collision, lightmap switches, player movement/stamina/noise, mission-objective event flow,
  extraction gating, grading, failure.
- `tests/ai.test.ts` — FSM escalation, non-omniscience, noise investigation, radio
  propagation + jamming, body discovery, combat damage, stand-down, alert aggregation.
- `tests/playthrough.test.ts` — **scripted headless completion of all four missions** through
  the real systems (terminals → camera disable → keycards → elevator teleport → lockdown →
  decoy → extraction), asserting GHOST grades for clean runs.
- `tests/game.integration.test.ts` — full Game lifecycle in jsdom (mount → insertion →
  playing → snapshots → pause/resume → restart → abort → dispose) with stubbed WebGL.

## Accessibility

- All mission-critical information duplicated as semantic HTML (objectives, alert state with
  text + symbol + color, radio log with subtitles on by default, prompts, pause-menu controls).
- Reduced motion (honors `prefers-reduced-motion` as default): no head-bob/shake/FOV punch,
  calmed UI animation, instant briefing text.
- Keyboard-navigable menus with visible focus; high-contrast HUD option; colorblind-safe
  alert palette; settings persisted locally.

## Performance

- Fixed-timestep simulation decoupled from rendering; AI think at 10 Hz staggered; stealth
  sensors at 15–20 Hz; objectives/UI event-driven; minimap at 8–12 Hz.
- DPR capped (1.5 desktop / 1.25 mobile) with adaptive render-scale (`PerformanceManager`)
  that reacts to rolling FPS; ResizeObserver-based canvas sizing; merged static geometry;
  object-free hot loops where practical; Visibility-API suspension; full teardown on unmount.

## Originality

SHADOW PROTOCOL reproduces no characters, maps, missions, dialogue, logos, UI, music, sound
effects, textures, or story from any existing commercial game. Everything is generated
in-code or written for this project.
