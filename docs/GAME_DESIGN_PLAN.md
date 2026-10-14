# SHADOW PROTOCOL — Tactical Infiltration Game
## Design Proposal & Implementation Plan (Phase 1–3)

> Working title: **"SHADOW PROTOCOL"** (original universe; all names, missions, characters,
> dialogue, visuals, and audio are original creations — no copyrighted content reproduced).

---

## PHASE 1 — ANALYSIS OF EXISTING PROJECT

| Item | Finding |
|---|---|
| Workspace state | **Empty** (`/home/user` contains no files) |
| Existing architecture | None — greenfield build |
| Existing components / Canvas / animations | None |
| Dependencies | None |
| Routing / rendering strategy | To be established |
| Constraints | None inherited; we define the baseline |

**Conclusion:** There is no existing architecture to preserve or extend. The entire
structure below is **PROPOSED (new)**. The project will be scaffolded with
`create-next-app` (latest stable Next.js, App Router, TypeScript, Tailwind CSS) and
**zero runtime game dependencies** — native Canvas 2D + WebAudio.

---

## PHASE 2 — DESIGN PROPOSAL

### 1. Game Architecture (overview)

Strict separation: **React owns UI/shell, a framework-agnostic TypeScript engine owns gameplay.**
React never runs inside the render loop; the engine never touches React state directly.

```
┌────────────────────────── NEXT.JS / REACT SHELL ──────────────────────────┐
│  Landing page (semantic HTML, SEO)                                        │
│  MissionBriefing / MissionReport / Settings / Pause  (React components)   │
│  GameHUD  (React, event-driven updates — NOT per-frame)                   │
│  GameCanvas (thin React wrapper: mounts engine, forwards lifecycle)       │
└───────────────▲───────────────────────────────┬───────────────────────────┘
                │ UIEventBus (throttled,         │ commands
                │ state-driven snapshots)        ▼ (start/pause/settings)
┌───────────────┴───────────────────────────────────────────────────────────┐
│                        GAME ENGINE (pure TypeScript)                      │
│                                                                           │
│  GameState (single source of truth: mission/player/world/ai/alert)        │
│                                                                           │
│  GameLoop (fixed-timestep sim 60 Hz ── decoupled render)                  │
│    INPUT → PLAYER → WORLD → AI(tick-limited) → STEALTH → MISSION          │
│    → INTERACTION → CAMERA → RENDER                                        │
│                                                                           │
│  Subsystems: InputManager · PlayerController · Camera · World/LevelStore  │
│  InteractionManager · MissionManager · ObjectiveSystem · EnemyManager     │
│  AI finite-state machines · StealthSystem · AudioManager (WebAudio,       │
│  procedural) · AnimationManager (tween/easing) · PerformanceManager       │
│                                                                           │
│  Renderer (Canvas 2D software raycaster: DDA walls, sprites, fog,         │
│  lightmap shading, procedural textures, minimap)                          │
└───────────────────────────────────────────────────────────────────────────┘
                ▲ data-driven content
┌───────────────┴───────────────────────────────────────────────────────────┐
│  data/  missions.ts · levels.ts (tile grids + entity placements)          │
│         enemies.ts · dialogue.ts (radio chatter) · textures.ts            │
└───────────────────────────────────────────────────────────────────────────┘
```

Key rule: **mission logic lives in data + MissionManager, never in the renderer.**
The renderer only reads GameState.

### 2. Canvas Architecture — why a software raycaster

**Decision: custom Canvas 2D raycasting engine (Wolfenstein-style DDA), no WebGL, no Three.js.**

Justification against the "add a library?" checklist:

1. *Why needed / what it provides:* Three.js would give polygonal 3D, but the target
   aesthetic (dark, grid-based military facility, controlled lighting) is perfectly
   served by a raycaster, which is also the classic technique for this genre.
2. *Why native Canvas is sufficient:* DDA grid traversal gives us **wall rendering,
   enemy line-of-sight, interaction raycasts, and camera-visibility checks from one
   shared algorithm** — a rare architectural win. Tile-grid levels make collision
   trivial and deterministic.
3. *Performance:* Column-cast rendering at capped internal resolution is cheap,
   runs at 60 FPS on modest hardware, and degrades gracefully on mobile.
4. *Maintenance:* ~1.5k lines of self-owned engine code, fully testable, no
   dependency churn, no bundle weight.

Renderer pipeline per frame: ceiling/floor gradient + distance fog → DDA wall
columns (procedurally generated textures cached in offscreen canvases) →
depth-sorted billboard sprites (enemies with 4-direction facing + walk cycle
frames, terminals, crates, doors, cameras, lights) → lightmap modulation
(per-tile brightness drives both visuals AND stealth) → screen-space effects
(detection vignette, damage flash, subtle head-bob composite) → minimap
(fog-of-war, discovered areas only — supports the curiosity principle).

### 3. Player System

```ts
interface PlayerState {
  pos: Vec2;          // world units (tile space)
  dir: number;        // yaw radians
  pitchOffset: number;// limited vertical look (parallax shifting)
  eyeHeight: number;  // animated stand ↔ crouch
  health: number;     // 0–100
  stamina: number;    // sprint budget, regenerates
  crouching: boolean; sprinting: boolean;
  noiseLevel: number; // computed: crouch-walk < walk < sprint (stealth input)
  lightExposure: number; // from world lightmap at player tile (stealth input)
  equipment: EquipmentId[];
  detected: DetectionState; // mirrored from StealthSystem for HUD
}
```

Movement: acceleration/friction model (not instant velocity) for weight;
wall-sliding collision via axis-separated tile checks; sprint drains stamina;
crouch lowers eye height, halves noise, slows speed. Head-bob is a state-driven
sinusoid gated by speed and **disabled under reduced-motion**.

### 4. Camera System

First-person camera = yaw (mouse X), bounded pitch (mouse Y, rendered as wall
parallax offset — raycasters have no true pitch, this is the standard, readable
approximation), eye-height spring (crouch transitions), sprint FOV widening
(column-scaling), subtle bob, and a **reduced-motion mode** that removes bob/shake
and softens FOV changes. Pointer Lock API on desktop with graceful
click-to-reacquire; Esc releases lock and opens pause menu.

### 5. Mission System (data-driven, reusable engine)

```ts
interface Mission {
  id: string; codeName: string; index: number;
  briefing: { location: string; threatLevel: string; insertion: string; text: string[] };
  levelId: string;                 // references data/levels.ts
  objectives: Objective[];         // ordered + optional flags
  extractionPointId: string;
  difficulty: 1|2|3|4;
  newMechanic: string;             // what this mission teaches
  successCriteria / failCriteria;
}
```

MissionManager loads a mission → instantiates level → activates objectives in
sequence/parallel per data → listens to world events (player entered trigger
volume, terminal used, item picked up) → resolves objectives → emits UI events →
on all-complete enables extraction → grades the run (see §9).

### 6. Objective System

```ts
type ObjectiveType = 'reach'|'inspect'|'interact'|'retrieve'|'disable'|'escape';
interface Objective {
  id: string; type: ObjectiveType; title: string; description: string;
  status: 'locked'|'active'|'completed'|'failed';
  revealCondition?: EventPredicate; // progressive disclosure — some objectives
                                    // only appear AFTER discovery (curiosity)
  target?: { triggerId?: string; entityId?: string; region?: Rect };
}
```

Objectives update **event-driven**, not polled per frame. Hidden objectives
(e.g., optional "Locate the maintenance route intel") surface only when the
player finds the trigger — the objective list itself is a discovery reward.

### 7. Enemy AI (modular FSM, tick-limited, non-omniscient)

Per-guard state machine: `IDLE → PATROL → SUSPICIOUS → INVESTIGATE → ALERT → SEARCH → COMBAT → RETURN`.

Sensing model (all information-limited — guards know only what they perceived):
- **Vision:** distance × FOV cone × per-tile light exposure × player crouch ×
  movement speed, accumulated into a `suspicion` meter (gradual detection —
  the player can break LOS in time; no instant unfair detection). LOS uses the
  same DDA routine as the renderer.
- **Hearing:** noise events (footstep noise level, sprint, gunfire, door forcing,
  disabled-camera sparks) propagate with radius; guards receive a *position*,
  not the player.
- **Radio:** an alerted guard broadcasts; nearby guards escalate to SEARCH of
  the *last known position*, with cone-search patterns and diminishing
  suspicion over time. Guards return to patrol if evidence expires.
- **Cameras:** sweeping security cameras with visible cones; seeing the player
  raises facility alert and dispatches guards to the camera's zone — unless the
  camera network was disabled at a terminal (consequence chain per spec).

Update budget: FSM decisions at **10 Hz**, LOS raycasts staggered (one guard per
tick, round-robin), pathfinding = grid A* recomputed only on destination change,
patrol following = waypoint steering. No per-frame AI work.

Enemies per mission are defined in `data/enemies.ts` (type, patrol route,
equipment, alertness multiplier). Mission variety comes from **new mechanics**
(patrol density patterns, camera networks, searchlights, roaming officers,
lockdown doors), not mere headcount.

### 8. Stealth System (global awareness model)

Facility-level state machine mirroring guard states:
`UNDETECTED → SUSPICIOUS → ALERT → SEARCHING → COMBAT → LOCKDOWN`.
Driven by max guard suspicion, camera detections, alarm triggers, bodies seen,
radio calls. Exposed to HUD as a single readable indicator + last-cause hint
("Camera spotted you — Sector B"), so the player always understands *why*.
Player tools: crouch, shadow routes (lightmap), noise discipline, camera
disable, door locks, timed distractions (thrown objects / radio jammer in
later missions), stealth takedown from behind while undetected.

### 9. Light Combat & Mission Grading

Combat is deliberately suboptimal: firing an unsilenced shot instantly escalates
the facility to ALERT/COMBAT, guards converge, and the end-of-mission grade drops.
Grading in the Mission Report: **GHOST** (never detected) / **SHADOW** (spotted,
no kills) / **OPERATIVE** (completed with friction) / **COMPROMISED** (kills or
lockdown). Grade + objectives + time shown; no coins, no arcade score. Grades
persist in `localStorage` — progress-style micro-rewards only.

### 10. Level Architecture & Design

Tile-grid levels (`data/levels.ts`): wall tiles, floor types, per-tile light
values, entity placements (doors keyed/locked, terminals, cameras, crates,
switches, elevators, alarms, intel pickups, extraction trigger), guard spawns +
routes, player spawn, ambient audio zones, and **trigger volumes** for objectives
and narrative radio chatter.

Facility: an original remote research-signals installation, "Greyline Station",
across 4 missions with multi-route maps:

- **M01 — OPERATION NIGHTFALL** (perimeter → warehouse → comms room → extraction).
  Teaches: movement, crouch/noise, LOS, one terminal, one patrol route.
  Routes: front gate (lit, guarded) vs. fence breach (dark, longer).
- **M02 — DEEP ENTRY** (checkpoint → underground corridors → control room).
  Teaches: camera network + disable chain, locked doors/keycards, elevators.
  Routes: service tunnel vs. catwalk vs. bluffing through checkpoint timing gaps.
- **M03 — BLACK SIGNAL** (restricted lab wing, roaming officer + searchlight
  yard, radio jammer equipment). Teaches: distractions, timed patrols,
  optional-objective discovery (hidden lab intel).
- **M04 — EXTRACTION** (full-facility escape under rising lockdown; alarms
  progressively seal routes). Teaches: adaptation — earlier choices
  (cameras disabled? guards alerted?) reshape this finale via save state.

Each map is non-linear with ≥2 viable approaches and risk/reward tradeoffs
(dark route = slow, safe; lit route = fast, exposed).

### 11. Interaction System

Center-screen interaction ray (short-range DDA + entity proximity) → nearest
valid target → minimal prompt `[E] ACCESS TERMINAL`. Some interactions are
hold-to-progress (terminal hack = 3 s with cancelable progress arc, noise
emitted while working — tension). Interaction registry is data-driven per
entity type: doors (locked/keycard/forced-noisy), terminals (camera disable,
door unlock, intel), switches (lights!), crates (cover/hide intel), alarms,
takedowns (context: `[F] NEUTRALIZE`), extraction console.
Every interaction emits a world event → objectives/AI/audio react.

### 12. Responsive Strategy

- **Desktop (primary):** keyboard+mouse, pointer lock, full HUD, full effects.
- **Tablet:** touch-look + on-screen move pad, larger prompts, medium presets.
- **Mobile:** touch-first simplified tactical mode — virtual stick (left),
  drag-look (right), oversized interaction button, condensed HUD (alert state +
  current objective only), reduced internal resolution & render distance,
  sprites/particles budgeted. Same missions, tuned detection parameters
  (slightly wider guard patience) so touch play is fair, not crippled.
- Layout: HUD is HTML/CSS overlay (crisp text, accessible) — Canvas renders only
  the 3D world + minimap + prompts anchored in-world.

### 13. Accessibility Strategy

- All mission-critical info duplicated in HTML: objectives panel (toggleable,
  keyboard accessible), alert state as text + color + icon (not color alone),
  interaction log ("Terminal accessed — cameras offline in Sector B").
- Settings (persisted): reduced motion (kills bob/shake/FOV punch, softens
  transitions), master/SFX/ambient volumes, sensitivity, HUD scale,
  high-contrast HUD, subtitle-style radio chatter log, colorblind-safe alert
  palette.
- Menus fully keyboard-navigable with visible focus states; briefing/report are
  semantic HTML (also serves SEO on the landing page); `prefers-reduced-motion`
  respected as the default for the setting.
- Pause menu (Esc) always available; detection is impossible while paused.

### 14. Performance Strategy

- Fixed-timestep simulation (60 Hz accumulator) decoupled from render; input
  sampled per frame; AI at 10 Hz staggered; objectives/UI strictly event-driven.
- `devicePixelRatio` capped (≤1.5 desktop, ≤1.25 mobile); internal render
  resolution scaled independently of canvas CSS size; ResizeObserver-driven
  canvas resize (no layout thrash).
- Procedural textures generated once into offscreen canvases; sprite sheets
  pre-baked; no per-frame allocations in hot loops (object pooling for events,
  particles, projectiles).
- UI bridge publishes snapshots at ≤10 Hz + on events; React re-renders only
  changed HUD subtrees (memoized selectors).
- Single `requestAnimationFrame` loop owned by engine; fully torn down on
  unmount (listeners, pointer lock, audio nodes) — no leaks, no zombie loops.
- Visibility API pauses the sim when the tab is hidden.

### 15. Audio Design (100% procedural WebAudio — zero assets, zero copyright risk)

Synthesized at runtime: footsteps (filtered noise bursts, surface-tinted),
facility hum (layered oscillators per zone), radio static + garbled chatter
cues (formant-ish noise — information, not dialogue), terminal beeps, door
servos, heartbeat under high alert, alert stings, objective-confirm chime,
muffled gunfire. Distance/obstruction attenuation reuses the DDA LOS check.
Master gain gated behind a user gesture (autoplay policy); full mute supported.

### 16. Cinematic & Narrative Flow

Landing (semantic HTML, SEO) → select mission → **Briefing** (typed original
text, fade) → insertion fade-in with one-line radio (original) → gameplay →
extraction hold-progress → fade → **Mission Report** (grade, objectives,
time, intel found) → next mission. All transitions skippable, ≤ a few seconds.

---

## PROPOSED PROJECT STRUCTURE

```
/ (Next.js app root)
├── app/
│   ├── page.tsx                  # semantic landing + mission select
│   ├── layout.tsx                # metadata, fonts (system stack)
│   └── globals.css               # Tailwind + tactical design tokens
├── components/
│   ├── game/GameCanvas.tsx       # engine mount (client, thin)
│   ├── game/GameHUD.tsx          # objectives/alert/stamina/compass/prompts log
│   ├── game/MissionBriefing.tsx
│   ├── game/MissionReport.tsx
│   ├── game/PauseMenu.tsx
│   ├── game/SettingsPanel.tsx
│   ├── game/TouchControls.tsx    # mobile stick + look + interact
│   └── landing/*                 # hero, controls guide, mission overview
├── engine/                       # framework-agnostic, no React imports
│   ├── core/  GameLoop.ts GameState.ts EventBus.ts math.ts types.ts
│   ├── renderer/ RaycastRenderer.ts Textures.ts Sprites.ts Minimap.ts Effects.ts
│   ├── world/  Level.ts Collision.ts Lightmap.ts Triggers.ts Entities.ts
│   ├── player/ PlayerController.ts CameraController.ts
│   ├── ai/     Guard.ts FSM.ts Pathfinding.ts Perception.ts PatrolRoutes.ts
│   ├── stealth/ StealthSystem.ts Cameras.ts AlertNetwork.ts
│   ├── mission/ MissionManager.ts ObjectiveSystem.ts Grading.ts
│   ├── interaction/ InteractionManager.ts Interactables.ts
│   ├── input/  InputManager.ts PointerLock.ts TouchInput.ts
│   ├── audio/  AudioManager.ts  (procedural WebAudio synths)
│   └── perf/   PerformanceManager.ts  (dpr, resolution, budgets, pooling)
├── data/
│   ├── missions.ts objectives embedded per mission
│   ├── levels.ts enemies.ts textures.ts radio.ts
├── lib/  storage.ts (progress/settings persistence), constants.ts
└── tests/ (vitest — pure systems: perception math, objectives FSM, collision)
```

**Dependencies:** Next.js + React + TypeScript + Tailwind (scaffold defaults).
Only addition: `vitest` (devDependency) — justified because stealth perception,
objective resolution, and collision are pure logic worth unit-testing per the
quality gates. No runtime libraries.

---

## PHASE 3 — IMPLEMENTATION PLAN

Each step is independently verifiable before proceeding.

| # | Task | Verification gate |
|---|---|---|
| 1 | Scaffold Next.js (TS, Tailwind, App Router), design tokens, landing page shell | `next build` passes; semantic landing renders |
| 2 | Engine core: GameLoop (fixed timestep), GameState, EventBus, math/utils; GameCanvas mount + teardown | Loop runs/pauses/unmounts cleanly (no leaks); FPS counter stable |
| 3 | Level data format + Level loader + M01 map data; collision (axis-separated tile) | Player collides correctly in headless unit tests + visual debug overlay |
| 4 | Raycast renderer: walls, procedural textures, floor/ceiling, fog, dpr/resolution management | 60 FPS at 1080p; crisp resize; no per-frame GC spikes |
| 5 | Input (keyboard/mouse) + Pointer Lock + first-person camera (yaw/pitch/bob/eye-height/sprint FOV) | Movement feels responsive; reduced-motion flag kills bob |
| 6 | Player controller: accel/friction, sprint/stamina, crouch, noise emission | Speed/noise values match spec table; stamina drains/recovers |
| 7 | Lightmap + world entities + sprites (doors, terminals, crates, cameras, lights) | Entities render depth-sorted; light varies visibly by area |
| 8 | Interaction system: center ray + proximity, prompts, hold-progress, world events, doors/switches/lights | `[E]` prompts appear correctly; light switch visibly changes stealth exposure |
| 9 | Mission + Objective systems (data-driven), trigger volumes, progressive reveal | Objectives advance on events only; hidden objective appears on discovery |
| 10 | Guard AI: FSM, patrol routes, A* on-demand, perception (vision cone + light + noise), staggered LOS | Guards investigate noises/sightings with delay; never omniscient (unit tests) |
| 11 | Stealth system: facility alert states, radio propagation, cameras + disable chain, takedowns | Detection cause shown to player; camera-disable→route-opens chain works |
| 12 | Audio manager: procedural footsteps/hum/radio/stings/objective chimes, attenuation | Audio conveys info; mute + volume settings work; no autoplay errors |
| 13 | HUD (React, event-driven): objectives, alert indicator, stamina, compass, interaction log, minimap fog-of-war | Zero React renders per frame when state unchanged; colorblind-safe |
| 14 | Briefing → insertion → gameplay → extraction → Mission Report + grading + localStorage progress | Full M01 loop playable end-to-end; report reflects ghost/shadow/operative |
| 15 | M02–M04 content: levels, new mechanics (keycards/elevator, jammer/searchlight, lockdown escape), carry-over state | Each mission introduces its mechanic; M04 reacts to prior choices |
| 16 | Touch controls + mobile rendering presets + simplified HUD | Playable on 375×667 viewport; large targets; tuned detection fairness |
| 17 | Accessibility pass: settings panel (reduced motion, contrast, volumes, sensitivity), keyboard nav, focus states, `prefers-reduced-motion` default | All menus keyboard-operable; reduced motion verifiably calms camera |
| 18 | Performance & hardening: pooling, AI budget audit, visibility-API pause, teardown audit, vitest suite green | Build + lint + tests pass; 60 FPS desktop / 30+ mobile; no stale listeners |
| 19 | Senior review vs. quality gates (playability, fairness, maintainability) + final report | Checklist in spec §QUALITY GATES walked one-by-one |

**Build order rationale:** engine spine (2–6) before content (7–9) before
adversaries (10–12) so every system is verified in isolation; content missions
(15) are pure data once systems exist — proving the reusable-architecture goal.

---

## OPEN DECISIONS (for approval)

1. **Renderer:** custom Canvas 2D raycaster (recommended — zero deps, shared DDA
   for LOS/interaction) vs. Three.js WebGL (richer 3D, +~150 KB dep, more code).
2. **Scope of first delivery:** full 4-mission campaign vs. M01 as a polished
   vertical slice first, then expand.
3. **Combat depth:** stealth-only (takedowns + detection consequences) vs. light
   combat (silenced sidearm, penalized by grading).
4. **Vitest** as the single dev-dependency addition — approve/decline.
