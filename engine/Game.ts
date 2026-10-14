/**
 * Game — the orchestrator. Owns the loop and every subsystem; exposes a
 * small command API (start/pause/resume/restart/abort/settings) and two
 * output channels:
 *   1. discrete GameSnapshot (<= 10 Hz + on events) → React state
 *   2. mutable FrameValues written every frame → imperative HUD updates
 * React never re-renders per frame; the render loop never touches React.
 */

import { EventBus } from '@/engine/core/EventBus'
import { GameLoop } from '@/engine/core/GameLoop'
import { clamp, makeRng } from '@/engine/core/math'
import type {
  FrameValues,
  GamePhase,
  GameSettings,
  GameSnapshot,
  MissionReportData,
  RadioLine,
  Vec2,
} from '@/engine/core/types'
import { DEFAULT_SETTINGS } from '@/engine/core/types'
import { InputManager } from '@/engine/input/InputManager'
import { TILE, Level } from '@/engine/world/Level'
import { hasLos } from '@/engine/world/LOS'
import {
  createPlayer,
  resetPlayerSystems,
  updatePlayer,
  damagePlayer,
  type PlayerState,
} from '@/engine/player/PlayerController'
import { CameraController } from '@/engine/player/CameraController'
import { EnemyManager, type Guard } from '@/engine/ai/Guard'
import { StealthSystem } from '@/engine/stealth/StealthSystem'
import { InteractionManager } from '@/engine/interaction/InteractionManager'
import { MissionManager } from '@/engine/mission/MissionManager'
import { AudioManager } from '@/engine/audio/AudioManager'
import { SceneBuilder } from '@/engine/render/SceneBuilder'
import { RenderManager } from '@/engine/render/RenderManager'
import { MinimapRenderer, type MinimapMarker } from '@/engine/render/MinimapRenderer'
import { PerformanceManager } from '@/engine/perf/PerformanceManager'
import type { FastHandles } from '@/engine/core/fastLane'
import { LEVELS } from '@/data/levels'
import { getMission } from '@/data/missions'

export interface GameCallbacks {
  onSnapshot: (s: GameSnapshot) => void
  onFrame?: (f: FrameValues) => void
  onPhase?: (p: GamePhase) => void
  onPauseRequest?: () => void
  onLockChange?: (locked: boolean) => void
  onReport?: (r: MissionReportData, success: boolean) => void
}

export interface StartOptions {
  alertnessBonus?: number
  startTense?: boolean // carry-over: guards begin on edge
}

export class Game {
  readonly bus = new EventBus()
  readonly input = new InputManager()
  readonly audio = new AudioManager()
  readonly perf: PerformanceManager

  phase: GamePhase = 'idle'
  settings: GameSettings
  /** imperative HUD element handles, published by the React HUD */
  fast: FastHandles = {}
  frame: FrameValues = {
    yaw: 0, stamina: 100, health: 100, suspicion: 0,
    holdProgress: 0, fps: 60, bobPhase: 0,
  }

  private loop: GameLoop
  private container: HTMLElement | null = null
  private minimapCanvas: HTMLCanvasElement | null = null
  private renderManager: RenderManager | null = null
  private sceneBuilder: SceneBuilder | null = null
  private minimap: MinimapRenderer | null = null
  private camera: CameraController | null = null

  private level: Level | null = null
  private player: PlayerState | null = null
  private enemies: EnemyManager | null = null
  private stealth: StealthSystem | null = null
  private mission: MissionManager | null = null
  private interaction: InteractionManager | null = null

  private visited = new Uint8Array(0)
  private radioLog: RadioLine[] = []
  private rng = makeRng(12345)
  private t = 0
  private snapshotAcc = 0
  private stealthAcc = 0
  private minimapAcc = 0
  private perfAcc = 0
  private insertionT = 0
  private startOpts: StartOptions = {}
  private missionId = ''
  private cb: GameCallbacks

  constructor(settings: GameSettings, cb: GameCallbacks) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings }
    this.cb = cb
    this.perf = new PerformanceManager(this.settings.quality)
    this.perf.onPresetChange = (p) => this.renderManager?.applyPreset(p)
    this.loop = new GameLoop({
      update: (dt) => this.simUpdate(dt),
      render: () => this.renderFrame(),
    })
    this.input.onLockChange = (locked) => {
      this.cb.onLockChange?.(locked)
      if (!locked && this.phase === 'playing' && !this.input.touchMode) this.pause()
    }
    this.input.onPauseRequest = () => {
      // Esc: pause when playing; when already paused (e.g. browser released the
      // pointer lock first) do nothing — the menu owns resume.
      if (this.phase === 'playing') {
        this.cb.onPauseRequest?.()
        this.pause()
      }
    }
    this.wireBus()
  }

  /* ---------------- lifecycle ---------------- */

  mount(container: HTMLElement, minimapCanvas: HTMLCanvasElement): void {
    this.container = container
    this.minimapCanvas = minimapCanvas
    this.renderManager = new RenderManager(container, this.perf.preset)
    this.minimap = new MinimapRenderer(minimapCanvas)
    this.camera = new CameraController(container.clientWidth / Math.max(1, container.clientHeight))
    this.input.attach(this.renderManager.renderer.domElement)
    this.input.touchMode =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches
    this.loop.start()
  }

  dispose(): void {
    this.loop.dispose()
    this.input.dispose()
    this.audio.dispose()
    this.sceneBuilder?.dispose()
    this.renderManager?.dispose()
    this.mission?.dispose()
    this.bus.clear()
    this.sceneBuilder = null
    this.renderManager = null
    this.level = null
    this.player = null
    this.enemies = null
    this.stealth = null
    this.mission = null
    this.interaction = null
  }

  /* ---------------- mission flow ---------------- */

  startMission(id: string, opts: StartOptions = {}): void {
    const mission = getMission(id)
    const levelDef = mission ? LEVELS[mission.levelId] : null
    if (!mission || !levelDef || !this.container || !this.renderManager || !this.camera) return

    // tear down previous mission
    this.mission?.dispose()
    this.sceneBuilder?.dispose()
    this.bus.emit('interaction:prompt', null)

    this.missionId = id
    this.startOpts = opts
    this.rng = makeRng((Date.now() ^ (id.length * 2654435761)) >>> 0)
    this.t = 0
    this.radioLog = []
    this.snapshotAcc = 0
    this.stealthAcc = 0
    this.minimapAcc = 0

    const level = new Level(levelDef)
    this.level = level
    this.visited = new Uint8Array(level.w * level.h)

    const player = createPlayer(level.spawnTile)
    player.yaw = Math.PI / 2 // face north (into the map) by default
    this.player = player
    resetPlayerSystems()

    const sceneBuilder = new SceneBuilder(levelDef.ambient)
    sceneBuilder.build(level)
    this.sceneBuilder = sceneBuilder

    this.audio.init()
    this.audio.setAmbient(levelDef.ambient)

    const playerLight = (): number =>
      level.lightAtTile(Math.floor(player.pos.x), Math.floor(player.pos.y))

    const enemies = new EnemyManager(
      levelDef.guards.filter((g) => !g.wave),
      {
        level,
        bus: this.bus,
        rng: this.rng,
        player,
        playerLight,
        broadcast: (from, kind, pos) => stealth.broadcast(from, kind, pos),
        alertnessBonus: opts.alertnessBonus ?? 0,
      },
    )
    this.enemies = enemies

    const stealth = new StealthSystem({
      level,
      bus: this.bus,
      player,
      playerLight,
      rng: this.rng,
      getGuards: () => enemies.guards,
    })
    this.stealth = stealth

    const missionMgr = new MissionManager(mission, {
      level,
      bus: this.bus,
      stealth,
      enemies,
      allGuardDefs: levelDef.guards,
      playerPos: () => player.pos,
      playerHealth: () => player.health,
    })
    this.mission = missionMgr

    this.interaction = new InteractionManager({
      level,
      bus: this.bus,
      player,
      stealth,
      enemies,
      extractionArmed: () => missionMgr.extractionArmed,
    })

    // carry-over tension: guards start on edge
    if (opts.startTense) {
      for (const g of enemies.guards) g.suspicion = 30
      stealth.reason = 'Heightened security — they remember last time'
      this.bus.emit('alert:change', { level: 'suspicious', reason: stealth.reason })
    }

    this.markVisited()
    this.setPhase('insertion')
    this.insertionT = 1.5
    this.renderManager.setFade(1, true)
    this.loop.setPaused(false)

    // insertion radio, slightly delayed
    window.setTimeout(() => {
      if (this.missionId !== id) return
      for (const line of mission.insertionRadio) stealth.pushRadio(line.speaker, line.text)
    }, 700)

    this.publishSnapshot(true)
  }

  private setPhase(p: GamePhase): void {
    this.phase = p
    this.cb.onPhase?.(p)
    this.bus.emit('phase:change', p)
    this.publishSnapshot(true)
  }

  /** detach rendering (React view unmount) but keep the instance reusable */
  unmount(): void {
    this.input.releaseLock()
    this.input.dispose()
    this.sceneBuilder?.dispose()
    this.sceneBuilder = null
    this.renderManager?.dispose()
    this.renderManager = null
    this.container = null
    this.minimapCanvas = null
    this.minimap = null
    this.audio.setAmbient('off')
  }

  pause(): void {
    if (this.phase !== 'playing') return
    this.setPhase('paused')
    this.input.releaseLock()
  }

  resume(): void {
    if (this.phase !== 'paused') return
    this.setPhase('playing')
    this.input.requestLock()
  }

  togglePause(): void {
    if (this.phase === 'playing') this.pause()
    else if (this.phase === 'paused') this.resume()
  }

  restart(): void {
    if (!this.missionId) return
    this.startMission(this.missionId, this.startOpts)
  }

  abort(): void {
    this.mission?.dispose()
    this.setPhase('idle')
    this.input.releaseLock()
    this.audio.setAmbient('off')
    if (this.renderManager) this.renderManager.setFade(0)
  }

  requestLock(): void {
    this.input.requestLock()
  }

  get currentMissionId(): string {
    return this.missionId
  }

  setFastHandles(h: FastHandles): void {
    this.fast = h
  }

  setSettings(s: GameSettings): void {
    this.settings = { ...s }
    this.audio.applySettings(s)
    this.perf.setMode(s.quality)
    this.bus.emit('settings:change', this.settings)
  }

  /* ---------------- bus wiring ---------------- */

  private wireBus(): void {
    this.bus.on('sfx', ({ name, x, y, gain }) => {
      const p = this.player
      if (!p || !this.level) {
        this.audio.play(name, { gain })
        return
      }
      let occluded = false
      if (x !== undefined && y !== undefined) {
        occluded = !hasLos(this.level, p.pos.x, p.pos.y, x / TILE, y / TILE)
      }
      this.audio.play(name, {
        x, y, gain,
        playerX: p.pos.x * TILE,
        playerY: p.pos.y * TILE,
        playerYaw: p.yaw,
        occluded,
      })
    })

    this.bus.on('player:damage', (amount) => {
      if (!this.player || this.phase !== 'playing') return
      damagePlayer(this.player, amount)
      this.camera?.addShake(clamp(amount * 0.02, 0.02, 0.3))
      this.publishSnapshot(true)
    })

    this.bus.on('world:teleport', ({ x, y }) => {
      if (!this.player) return
      this.player.pos = { x, y }
      this.player.vel.x = 0
      this.player.vel.y = 0
      this.renderManager?.setFade(1, true)
      window.setTimeout(() => this.renderManager?.setFade(0), 60)
      this.markVisited()
    })

    this.bus.on('world:noise', ({ pos, radius }) => {
      if (this.enemies && this.level) this.enemies.noiseEvent(pos, radius, this.level)
    })

    this.bus.on('world:event', (name) => {
      if (name.startsWith('light:')) this.sceneBuilder?.updateLightmap()
    })

    this.bus.on('radio', (line) => {
      this.radioLog.push({ ...line, t: this.t })
      if (this.radioLog.length > 5) this.radioLog.shift()
      this.publishSnapshot(true)
    })

    let prevAlert = 'undetected'
    this.bus.on('alert:change', ({ level }) => {
      if (level === 'combat' && prevAlert !== 'combat') this.audio.play('spotted')
      prevAlert = level
      this.publishSnapshot(true)
    })

    this.bus.on('objective:update', () => this.publishSnapshot(true))
    this.bus.on('objective:reveal', () => this.publishSnapshot(true))
    this.bus.on('interaction:prompt', () => this.publishSnapshot(true))

    this.bus.on('mission:complete', (report) => {
      this.setPhase('complete')
      this.input.releaseLock()
      this.cb.onReport?.(report, true)
      this.publishSnapshot(true)
    })
    this.bus.on('mission:failed', (report) => {
      this.setPhase('failed')
      this.input.releaseLock()
      this.cb.onReport?.(report, false)
      this.publishSnapshot(true)
    })
  }

  /* ---------------- simulation ---------------- */

  private simUpdate(dt: number): void {
    if (this.phase === 'insertion') {
      this.insertionT -= dt
      const f = clamp(this.insertionT / 1.5, 0, 1)
      this.renderManager?.setFade(f)
      if (this.insertionT <= 0) {
        this.setPhase('playing')
        this.input.requestLock()
      }
      return
    }
    if (this.phase !== 'playing') {
      this.input.endFrame()
      return
    }
    const level = this.level
    const player = this.player
    const enemies = this.enemies
    const stealth = this.stealth
    const mission = this.mission
    const interaction = this.interaction
    if (!level || !player || !enemies || !stealth || !mission || !interaction || !this.camera) return

    this.t += dt

    // look
    const look = this.input.consumeLook()
    if (this.input.pointerLocked || this.input.touchMode) {
      this.camera.look(player, look.dx, look.dy, this.settings)
    }

    // movement + noise
    const pf = updatePlayer(player, this.input, level, dt, this.settings.reducedMotion)
    if (pf.footsteps > 0) {
      const metal = level.lightAtTile(Math.floor(player.pos.x), Math.floor(player.pos.y)) > 0.5
      this.audio.play(metal ? 'stepMetal' : 'step', {
        gain: player.crouching ? 0.25 : player.sprinting ? 0.7 : 0.45,
      })
    }
    for (const n of pf.noises) enemies.noiseEvent(n.pos, n.radius, level)

    // interaction
    interaction.update()
    interaction.tickHold(dt, this.input.interactHeld())
    if (this.input.interactPressed()) interaction.press()
    if (this.input.takedownPressed()) interaction.takedownPress()
    if (this.input.jammerPressed()) stealth.useJammer()

    // AI + stealth + mission
    enemies.update(dt)
    this.stealthAcc += dt
    const stealthStep = 1 / this.perf.preset.stealthHz
    while (this.stealthAcc >= stealthStep) {
      stealth.update(stealthStep)
      this.stealthAcc -= stealthStep
    }
    mission.update(dt)

    this.markVisited()

    // audio tension loop
    this.audio.update(dt, stealth.detectionLevel())

    // frame values (imperative HUD lane)
    this.frame.yaw = player.yaw
    this.frame.stamina = player.stamina
    this.frame.health = player.health
    this.frame.suspicion = stealth.suspicion01()
    this.frame.holdProgress =
      interaction.target && interaction.target.hold > 0
        ? clamp(interaction.holdT / interaction.target.hold, 0, 1)
        : 0
    this.frame.fps = this.loop.fps
    this.frame.bobPhase = player.bobPhase
    this.cb.onFrame?.(this.frame)

    // discrete snapshot at <= 10 Hz
    this.snapshotAcc += dt
    if (this.snapshotAcc >= 0.1) {
      this.snapshotAcc = 0
      this.publishSnapshot()
    }

    // perf sampling once per second
    this.perfAcc += dt
    if (this.perfAcc >= 1) {
      this.perfAcc = 0
      this.perf.sample(this.loop.fps)
    }

    this.input.endFrame()
  }

  private markVisited(): void {
    const level = this.level
    const player = this.player
    if (!level || !player) return
    const px = Math.floor(player.pos.x)
    const py = Math.floor(player.pos.y)
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = px + dx
        const y = py + dy
        if (!level.inBounds(x, y)) continue
        if (dx * dx + dy * dy > 20) continue
        this.visited[level.idx(x, y)] = 1
      }
    }
  }

  /* ---------------- rendering ---------------- */

  private renderFrame(): void {
    const rm = this.renderManager
    const sb = this.sceneBuilder
    if (!rm || !sb || !this.camera || !this.level || !this.player || !this.enemies || !this.stealth) {
      return
    }
    const dt = 1 / 60
    this.camera.update(this.player, this.phase === 'playing' || this.phase === 'insertion' ? dt : 0, this.settings)
    sb.update(
      {
        level: this.level,
        guards: this.enemies.guards as Guard[],
        cameras: this.stealth.cameras,
        extractionArmed: this.mission?.extractionArmed ?? false,
        lockdown: this.stealth.lockdown,
        playerPos: this.player.pos,
      },
      dt,
      this.t,
    )
    rm.render(sb.scene, this.camera.camera)

    // minimap at reduced rate
    this.minimapAcc += dt
    const mmInterval = 1 / this.perf.preset.minimapHz
    if (this.minimap && this.mission && this.minimapAcc >= mmInterval && this.phase !== 'idle') {
      this.minimapAcc = 0
      this.minimap.draw(
        {
          level: this.level,
          visited: this.visited,
          playerPos: this.player.pos,
          playerYaw: this.player.yaw,
          guards: this.enemies.guards,
          markers: this.buildMarkers(),
          extractionArmed: this.mission.extractionArmed,
          reducedMotion: this.settings.reducedMotion,
        },
        this.t,
      )
    }
  }

  private buildMarkers(): MinimapMarker[] {
    const mission = this.mission
    const level = this.level
    if (!mission || !level) return []
    const out: MinimapMarker[] = []
    for (const o of mission.objectives) {
      if (o.status !== 'active') continue
      let tile: Vec2 | null = null
      if (o.entityId) {
        const e = level.getEntity(o.entityId)
        if (e && !e.taken) tile = e.tile
      } else if (o.triggerId) {
        const trg = level.triggers.find((t) => t.id === o.triggerId)
        if (trg) tile = { x: trg.x + trg.w / 2, y: trg.y + trg.h / 2 }
      } else if (o.type === 'escape') {
        const ex = level.entities.find((e) => e.kind === 'extract')
        if (ex && mission.extractionArmed) tile = ex.tile
      }
      if (tile) out.push({ x: tile.x, y: tile.y, kind: o.optional ? 'optional' : o.type === 'escape' ? 'extract' : 'objective' })
    }
    return out
  }

  /* ---------------- snapshot ---------------- */

  publishSnapshot(force = false): void {
    void force
    const player = this.player
    const stealth = this.stealth
    const mission = this.mission
    if (!player || !stealth || !mission) return
    const snap: GameSnapshot = {
      phase: this.phase,
      missionId: this.missionId,
      codeName: mission.mission.codeName,
      objectives: mission.objectives
        .filter((o) => o.status !== 'locked')
        .map((o) => ({ ...o })),
      alert: { level: stealth.alert, reason: stealth.reason },
      detection: stealth.detectionLevel(),
      health: Math.round(player.health),
      stamina: Math.round(player.stamina),
      crouching: player.crouching,
      sprinting: player.sprinting,
      equipment: player.equipment as GameSnapshot['equipment'],
      jammerCharges: stealth.jammerCharges,
      jammerActive: stealth.jammerActive,
      radioLog: this.settings.radioSubtitles ? [...this.radioLog] : [],
      prompt: this.interaction?.target
        ? { label: this.interaction.target.label, kind: this.interaction.target.kind }
        : null,
      timeSeconds: mission.timeSeconds,
      stats: {
        timesSpotted: stealth.timesSpotted,
        neutralizations: mission.neutralizations,
        maxAlert: stealth.maxAlert,
        intelFound: mission.intelFound,
        detectedReasons: [...stealth.detectedReasons],
      },
      holdProgress: this.frame.holdProgress,
      extractionArmed: mission.extractionArmed,
    }
    this.cb.onSnapshot(snap)
  }
}
