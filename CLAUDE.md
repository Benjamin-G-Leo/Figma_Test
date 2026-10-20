# CLAUDE.md

Volt Runner — a neon arcade browser game on HTML5 canvas, written in TypeScript with Vite and no framework or runtime dependencies. The player collects energy orbs for combo-multiplied points while dodging obstacles that speed up over time. Works with keyboard (WASD/arrows, Space to pause) and touch.

## Commands

```bash
npm install
npm run dev       # Vite dev server on http://localhost:3000 (opens the browser)
npm run build     # production build → dist/
npm run preview   # serve the built dist/
```

No tests and no linter. There is **no `tsconfig.json` or `typescript` dependency** — Vite strips the types without checking them, so type errors won't fail the build. Run `npx -p typescript tsc --noEmit --strict --target es2020 --lib es2020,dom src/*.ts` to type-check, or add a tsconfig.

## Structure

`vite.config.js` sets `root: 'src'`, so `src/index.html` is the entry and output goes to `../dist`.

- `main.ts` — `NeonRush` class (the game's old name): bootstraps the app, screen navigation (menu / game / game over), pause/resume, menu background animation, sound toggle.
- `Game.ts` — main loop, game state, scoring, combos, the score-goal system, difficulty ramp, collisions, HUD updates.
- `Player.ts`, `Orb.ts`, `Obstacle.ts` — entities, each owning its movement and rendering.
- `ParticleSystem.ts`, `BackgroundRenderer.ts`, `AudioManager.ts` (Web Audio sounds generated in code, no audio files).
- `types.ts` — shared types. `styles/style.css` — all UI styling and animations.

## Things to preserve

- **Loop generation counter:** `Game.loop(generation)` exits if `generation !== this.loopGeneration`. This prevents duplicate `requestAnimationFrame` loops after pause/restart. Bump `loopGeneration` whenever a loop must stop; don't start a second loop.
- **Pause freezes everything** — gameplay, particles, obstacles and background. Pause/resume state lives in `main.ts`.
- **Performance:** entity and particle counts are deliberately capped with short lifetimes (recent commits tuned this for mobile). Keep caps when adding effects.
- **Responsive canvas** matches the viewport and resizes on rotate; entity sizes scale on mobile. Honour `prefers-reduced-motion`.
- localStorage keys: `voltRunnerHighScore` (falls back to legacy `neonRushHighScore`) and `voltRunnerAudio`. Don't rename them, or players lose saved data.

## Git hygiene

Never commit `node_modules/` or `dist/` (both gitignored; `node_modules` was accidentally tracked once and removed from the index in Oct 2026).
