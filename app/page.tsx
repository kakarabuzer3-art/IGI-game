import GameExperience from '@/components/game/GameExperience'

export default function Home() {
  return (
    <main className="relative min-h-screen">
      {/* backdrop */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(1200px 600px at 70% -10%, rgba(38,58,84,0.25), transparent 60%),' +
            'radial-gradient(900px 500px at 10% 110%, rgba(20,44,36,0.18), transparent 55%),' +
            'linear-gradient(#07090d, #07090d)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(140,165,190,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(140,165,190,0.6) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative mx-auto w-full max-w-5xl px-5 pb-24 pt-16 md:pt-24">
        {/* ============ HERO ============ */}
        <header>
          <p className="sp-label">Original tactical infiltration — runs entirely in your browser</p>
          <h1 className="mt-3 text-4xl leading-tight tracking-[0.28em] text-[var(--sp-text)] md:text-6xl">
            SHADOW<span className="text-[var(--sp-amber)]"> PROTOCOL</span>
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-[var(--sp-text-dim)] md:text-[15px]">
            Four nights. One remote signals facility. You are the operative nobody logged at the
            gate — crossing floodlit yards, cutting camera networks, lifting encrypted cores and
            walking back out before Greyline Station ever learns your name. First-person tactical
            stealth: reconnaissance, patience, and the discipline to stay in the dark.
          </p>

          <div className="mt-8">
            <GameExperience />
          </div>

          <dl className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              ['4', 'Night operations'],
              ['2', 'Approach routes per site'],
              ['0', 'Downloads — pure browser'],
              ['∞', 'Ways to stay unseen'],
            ].map(([v, k]) => (
              <div key={k} className="sp-panel px-4 py-3">
                <dt className="sp-label">{k}</dt>
                <dd className="mt-1 text-2xl tracking-widest text-[var(--sp-amber)]">{v}</dd>
              </div>
            ))}
          </dl>
        </header>

        {/* ============ WHAT THIS IS ============ */}
        <section aria-labelledby="about-h" className="mt-20">
          <h2 id="about-h" className="text-lg tracking-[0.3em] text-[var(--sp-text)]">THE EXPERIENCE</h2>
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            <div className="sp-panel p-5">
              <h3 className="text-[13px] tracking-[0.18em] text-[var(--sp-amber)]">STEALTH IS THE GAME</h3>
              <p className="mt-2 text-[12px] leading-5 text-[var(--sp-text-dim)]">
                Sentries see by light and cone, hear by footfall. Sprint in a floodlight pool and
                the whole valley learns you exist. Crouch in shadow and you are a rumor. Detection
                is gradual, readable, and always explainable — no omniscient AI, no unfair deaths.
              </p>
            </div>
            <div className="sp-panel p-5">
              <h3 className="text-[13px] tracking-[0.18em] text-[var(--sp-amber)]">EVERY SWITCH MATTERS</h3>
              <p className="mt-2 text-[12px] leading-5 text-[var(--sp-text-dim)]">
                Terminals kill camera networks and pop maglocks. Light switches redraw the shadows
                you move through. A jammer makes their radios useless for fifteen precious seconds.
                The facility reacts to what you do — and remembers it into the next operation.
              </p>
            </div>
            <div className="sp-panel p-5">
              <h3 className="text-[13px] tracking-[0.18em] text-[var(--sp-amber)]">GRADED, NOT SCORED</h3>
              <p className="mt-2 text-[12px] leading-5 text-[var(--sp-text-dim)]">
                No coins, no combo meters. Each night ends in an after-action report: GHOST,
                SHADOW, OPERATIVE or COMPROMISED. Objectives evolve as you discover the site —
                some orders only reach you after you have earned them.
              </p>
            </div>
          </div>
        </section>

        {/* ============ CONTROLS ============ */}
        <section aria-labelledby="controls-h" className="mt-20">
          <h2 id="controls-h" className="text-lg tracking-[0.3em] text-[var(--sp-text)]">CONTROLS</h2>
          <div className="sp-panel mt-5 grid gap-x-10 gap-y-2 p-6 md:grid-cols-2">
            {[
              ['W A S D', 'Move'],
              ['Mouse', 'Look around (pointer lock)'],
              ['Shift', 'Sprint — fast, loud, drains stamina'],
              ['Ctrl (hold) / C', 'Crouch — quiet, smaller silhouette'],
              ['E', 'Interact: doors, terminals, pickups, extraction'],
              ['F', 'Neutralize a sentry from behind'],
              ['G', 'Activate signal jammer'],
              ['Esc', 'Pause and menu'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center gap-3 border-b border-[var(--sp-line)] py-2 last:border-0">
                <span className="sp-key w-28 justify-center">{k}</span>
                <span className="text-[12px] text-[var(--sp-text-dim)]">{v}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-5 text-[var(--sp-text-dim)]">
            On touch devices the game switches to a simplified tactical mode: floating move stick,
            drag-to-look, and oversized action buttons. All mission-critical information is always
            available as text — never canvas-only.
          </p>
        </section>

        {/* ============ MISSIONS ============ */}
        <section aria-labelledby="missions-h" className="mt-20">
          <h2 id="missions-h" className="text-lg tracking-[0.3em] text-[var(--sp-text)]">THE CAMPAIGN — GREYLINE STATION</h2>
          <ol className="mt-5 space-y-3">
            {[
              ['01', 'NIGHTFALL', 'Cross the fence line, kill the camera network from the warehouse comms room, and walk out with the encrypted burst-traffic log.', 'Basics: movement, noise, light and shadow, line of sight.'],
              ['02', 'DEEP ENTRY', 'The checkpoint holds a master keycard; the freight elevator holds the sublevel. Disable the surveillance hub before you touch the control-room mainframe.', 'Keycards, camera networks, elevators, disable-chains.'],
              ['03', 'BLACK SIGNAL', 'A military sweep light guards the research wing. Cut its power, find Dr. Voss\u2019s badge, and recover the signal core — and, if you are thorough, her private notes.', 'Searchlights, signal jammer, hidden optional objectives.'],
              ['04', 'EXTRACTION', 'Full-facility escape under progressive lockdown. Broadcast a decoy, send their QRF chasing a ghost, and hold the helipad until the rotors arrive.', 'Lockdown events, route sealing, reinforcements — and consequences of everything you did before.'],
            ].map(([n, code, desc, mech]) => (
              <li key={code} className="sp-panel flex flex-col gap-2 p-5 md:flex-row md:items-start md:gap-6">
                <span className="text-2xl tracking-widest text-[var(--sp-text-dim)]">{n}</span>
                <div>
                  <h3 className="text-[13px] tracking-[0.24em] text-[var(--sp-amber)]">OPERATION: {code}</h3>
                  <p className="mt-1.5 max-w-2xl text-[12px] leading-5 text-[var(--sp-text)]">{desc}</p>
                  <p className="mt-1 text-[11px] text-[var(--sp-text-dim)]">Introduces: {mech}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[10px] leading-5 text-[var(--sp-text-dim)]">
            SHADOW PROTOCOL is an original work. Its world, characters, missions, dialogue, visuals
            and audio are original creations; it is inspired by the design principles of classic
            tactical infiltration games and reproduces no content from any existing title.
          </p>
        </section>

        {/* ============ ACCESSIBILITY + REQUIREMENTS ============ */}
        <section aria-labelledby="access-h" className="mt-20 grid gap-5 md:grid-cols-2">
          <div className="sp-panel p-6">
            <h2 id="access-h" className="text-[13px] tracking-[0.24em] text-[var(--sp-text)]">ACCESSIBILITY</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[12px] leading-5 text-[var(--sp-text-dim)]">
              <li>Objectives, alerts, radio traffic and prompts exist as semantic HTML text, not only in the 3D view.</li>
              <li>Reduced-motion mode (honors your OS preference by default): no head-bob, no shake, calmed transitions.</li>
              <li>Alert state is conveyed by text, symbol and color — never color alone. Colorblind-safe palette.</li>
              <li>Fully keyboard-navigable menus with visible focus states; high-contrast HUD option.</li>
              <li>Radio subtitles on by default: audio always has a text equivalent.</li>
            </ul>
          </div>
          <div className="sp-panel p-6">
            <h2 className="text-[13px] tracking-[0.24em] text-[var(--sp-text)]">SYSTEM REQUIREMENTS</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[12px] leading-5 text-[var(--sp-text-dim)]">
              <li>Any modern desktop browser with WebGL (Chrome, Edge, Firefox, Safari).</li>
              <li>Keyboard + mouse strongly recommended for the full tactical experience.</li>
              <li>Tablets and phones supported via simplified touch mode.</li>
              <li>No plugins, no downloads, no account. Progress is stored locally on your device.</li>
            </ul>
          </div>
        </section>

        <footer className="mt-20 border-t border-[var(--sp-line)] pt-6 text-[10px] leading-5 text-[var(--sp-text-dim)]">
          <p>
            SHADOW PROTOCOL — an original browser-based tactical stealth experience.
            Rendered with WebGL; synthesized audio; zero third-party game assets.
          </p>
        </footer>
      </div>
    </main>
  )
}
