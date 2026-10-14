# SHADOW PROTOCOL — Implementation Report (Phase 7)

Date: 2026-10-02 · Stack: Next.js 16.3.8 (App Router) · React 19.2.8 · TypeScript 5 ·
Tailwind CSS v4 · Three.js 0.186 · vitest 4 · Node 20

## 1. What changed

The workspace was **empty** at the start (Phase 1 finding). A complete, original tactical
stealth game was built from scratch per the approved plan, with the user-approved decisions:

- **Renderer: Three.js WebGL** (approved over the recommended Canvas 2D raycaster)
- **Scope: full 4-mission campaign** in one delivery
- **Combat: stealth-only** (takedowns + detection consequences; no player weapon)
- **vitest** as the single dev-dependency addition (plus `jsdom` for the DOM lifecycle test)

## 2. Files created (all new)

```
app/page.tsx                     semantic SEO landing + game entry island
app/layout.tsx                   metadata (title/description/OG/theme)
app/globals.css                  design tokens, HUD atoms, reduced-motion rules
engine/Game.ts                   orchestrator (loop, phases, snapshots, bus wiring)
engine/core/{types,math,EventBus,GameLoop,fastLane}.ts
engine/input/InputManager.ts     keyboard/mouse/pointer-lock/touch
engine/world/{Level,LOS,Pathfinding}.ts   tile grid+lightmap · DDA LOS · A*
engine/player/{PlayerController,CameraController}.ts
engine/ai/{Perception,Guard}.ts  pure detection math · FSM agents + manager
engine/stealth/StealthSystem.ts  facility alert · cameras/searchlight · radio · jammer
engine/interaction/InteractionManager.ts
engine/mission/MissionManager.ts objectives · triggers · lockdown · grading
engine/audio/AudioManager.ts     100% procedural WebAudio (positional + occlusion)
engine/render/{SceneBuilder,RenderManager,MinimapRenderer,textures}.ts
engine/perf/PerformanceManager.ts
data/levels.ts                   4 original tile-grid maps (entities/guards/triggers)
data/missions.ts                 4 original operations with data-driven objectives
lib/storage.ts                   settings + campaign progress persistence
components/game/*.tsx            GameExperience, GameCanvas, GameHUD, TouchControls,
                                 MissionBriefing, MissionReport, MissionSelect,
                                 PauseMenu, SettingsPanel
tests/                           levels · systems · ai · playthrough · integration (75 tests)
README.md · docs/GAME_DESIGN_PLAN.md · docs/IMPLEMENTATION_REPORT.md
```

## 3. Architecture decisions (and why)

| Decision | Rationale |
|---|---|
| React/engine hard split | Render loop never touches React; UI updates ≤10 Hz snapshots + events; continuous values (compass/bars/vignette/hold ring) written directly to DOM via `FastHandles` — **zero per-frame re-renders** |
| One tile grid, two consumers | Collision, A*, DDA LOS, camera cones, audio occlusion all read the same grid; Three.js only renders it — deterministic, testable simulation |
| Vertex-color baked lightmap | The same light values driving stealth detection drive visuals; light switches rewrite floor/ceiling vertex colors + toggle point lights (consequence you can *see*) |
| Merged static geometry | ~5 draw calls for walls/floors/ceilings/crates/fences per level |
| Information-limited AI | Guards act only on perceived data (`lastKnown`), 10 Hz staggered think, radio propagation (jammable), 2 s visual memory then stale-path drop (bug found & fixed by tests) |
| Fixed timestep (60 Hz) + decoupled render | Clock-skew-safe accumulator (hardened after jsdom exposed epoch mixing) |
| Procedural everything | Zero assets → zero copyright surface, tiny bundle, deterministic (seeded RNG) |

## 4. Gameplay systems created

- **Movement:** accel/friction, sprint+stamina, crouch (hold Ctrl / toggle C), noise tiers
  (crouch 3u < walk 7u < sprint 13u radius), head-bob (reduced-motion aware), eye-height spring.
- **Stealth:** suspicion accumulation = distance × FOV × lightmap × posture × movement ×
  alertness; thresholds 25/55/100 → suspicious/investigate/combat; facility alert
  `UNDETECTED → SUSPICIOUS → ALERT → SEARCHING → COMBAT → LOCKDOWN` with human-readable
  reasons on the HUD; detection vignette + procedural heartbeat scale with suspicion.
- **Sensors:** sweeping cameras (disable-able via terminals) and a rotating searchlight (M03,
  power-cuttable); cones are rendered exactly where the math detects.
- **AI:** patrol/idle/suspicious/investigate/search/combat/returning/downed FSM; A* with LOS
  shortcutting; noise investigation at noise position; body discovery; attention-snap
  telegraph; QRF reinforcement waves; decoy broadcasts pull everyone to a ghost position.
- **Interaction:** proximity+facing selection, minimal `[E]` prompts, hold-progress ring
  (terminals/extraction/elevators emit noise while working), keycard chains, elevator
  teleports with fade, stealth takedowns `[F]` from behind.
- **Missions:** 4 operations, each teaching a mechanic (basics → keycards/cameras/elevator →
  searchlight/jammer/hidden objectives → lockdown/decoy/carry-over consequences); hidden
  optional objective revealed on discovery; grading GHOST/SHADOW/OPERATIVE/COMPROMISED;
  progress + best grades persisted locally; extraction gated on objectives.

## 5. Tests performed (75 passing)

1. **Level data (32):** grid widths, legal characters, spawn/extraction presence, override↔
   marker consistency, guard spawn/route walkability, trigger bounds, and full reachability
   of every terminal/pickup/elevator/trigger from spawn (with elevator-portal expansion).
   Caught 9 real authoring bugs during development (sealed rooms, doors facing walls,
   off-by-one rows).
2. **Systems (28):** LOS through doors/fences/crates, A*, perception (light/crouch/distance/
   FOV), hearing with occlusion, collision, lightmap switches, movement/stamina/noise radii,
   objective lifecycle (hidden→revealed→completed), extraction gating, grading, mission fail.
3. **AI behavior (10):** escalation chain, **non-omniscience** (wall = zero detection),
   darkness×crouch reduction, noise-position investigation, radio propagation + jammer
   blocking, body discovery → search, combat damage, stand-down after losing contact,
   facility-alert aggregation.
4. **Playthroughs (4):** every mission scripted to completion through real systems —
   terminals disable cameras, keycards unlock, elevator teleports, lockdown seals doors and
   spawns QRF, decoy diverts guards, extraction gated — clean runs grade **GHOST**.
5. **Integration (1):** full Game lifecycle in jsdom with stubbed WebGL — mount → insertion →
   playing, snapshot shape/rate, pause halts sim, restart, abort, dispose without errors.
6. **Static:** `tsc --noEmit` clean · `eslint` clean (incl. React-Compiler-era hooks rules —
   engine-boundary mutations refactored to methods/commit-phase writes) · `next build` clean.
7. **Runtime smoke:** production server serves the landing page (HTTP 200) with all semantic
   sections present and every JS/CSS chunk fetchable.

## 6. Performance checks

- Fixed 60 Hz sim; AI 10 Hz staggered; stealth 15–20 Hz; minimap 8–12 Hz; snapshots ≤10 Hz.
- Adaptive resolution: FPS sampled per second; render scale steps 0.6–1.0 (auto preset).
- DPR caps 1.5/1.25; merged geometry; pre-baked procedural textures; no per-frame React
  renders; Visibility-API suspension; full teardown (listeners, rAF, WebGL, audio nodes).
- jsdom lifecycle test verifies pause halts simulation and dispose leaves no throwing frames.

## 7. Accessibility checks

- Objectives/alert/radio/prompts/controls exist as semantic HTML (screen-reader reachable;
  alert state = text + symbol + color; radio log `aria-live` with subtitles default-on).
- `prefers-reduced-motion` seeds the setting; reduced mode disables bob/shake/FOV punch,
  calms CSS animation, and shows briefing text instantly.
- Keyboard-navigable menus, visible focus rings, high-contrast HUD option, settings persisted.
- Landing page: semantic headings, controls guide, mission overview, requirements, originality
  statement — all server-rendered for SEO; canvas only enhances.

## 8. Known limitations / remaining issues

1. **No real-browser pixel verification in this sandbox** (no GPU/browser available):
   rendering correctness rests on type-safe code, math review, and stubbed-WebGL lifecycle
   tests. First human playtest should sanity-check lighting levels/exposure and cone visuals.
2. `next build` uses the webpack builder here because Turbopack exceeds the sandbox's ~1 GB
   RAM (`Killed`). On typical hardware both builders work; scripts provide both.
3. Mobile shows a compact HUD + small minimap; tablet uses the desktop layout (≥md).
4. Guard-vs-guard pathing through doors assumes guards hold keys (by design); doors they
   open stay open — information for the player, intentional.

## 9. Suggested future improvements

- Web Worker for AI/pathfinding if guard counts grow beyond ~16.
- Dynamic shadow-casting lights for premium visuals on high-end presets.
- Save-scum-free "mission restart from last checkpoint" for long operations.
- More optional-objective variety (evidence boards, ghost-protocol bonuses per room).
- Gamepad support via the existing InputManager abstraction.
