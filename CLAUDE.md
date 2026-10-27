# CLAUDE.md

Volt Runner — a neon arcade browser game on HTML5 canvas, written in TypeScript with Vite and no framework. Its one runtime dependency is `@supabase/supabase-js`, used only for optional accounts. The player collects energy orbs for combo-multiplied points while dodging obstacles that speed up over time. Works with keyboard (WASD/arrows, Space to pause) and touch.

## Commands

```bash
npm install
npm run dev       # Vite dev server on http://localhost:3000 (opens the browser)
npm run build     # production build → dist/
npm run preview   # serve the built dist/
```

No tests and no linter. There is **no `tsconfig.json` or `typescript` dependency** — Vite strips the types without checking them, so type errors won't fail the build. Run `npx -p typescript tsc --noEmit --strict --target es2020 --lib es2020,dom --module esnext --moduleResolution bundler --skipLibCheck src/*.ts` to type-check, or add a tsconfig.

## Accounts (Supabase)

Login is optional: players can always play as guest. Config comes from `.env.local` (gitignored; template in `.env.example`) as `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Only the publishable key ever goes in the frontend, never the secret / service_role key. Without the env vars the game runs guest-only. For deploys (Vercel), set the same two vars in the host's settings. Login is email + password; the username is a unique display name (case-insensitive, 3-16 letters/numbers/_, claimed at sign up).

All database setup lives in `supabase/schema.sql`: paste it into the Supabase SQL editor (safe to re-run; also upgrades older versions). **Players never write to the tables directly.** `Game` calls `ScoreStore.startRun()` at start/restart (RPC `start_run`) and `save()` on a new best (RPC `submit_score`). The server times the run itself and rejects scores above `max_plausible_score(seconds)` (the formula and the hard cap are in the SQL; retune them if you change scoring or orb spawn rates). Cloud calls are queued so a new run never overtakes the previous submit. The leaderboard reads `scores` (public, top 10); render usernames with `textContent` only. Usernames also pass a swear filter in the database (`contains_blocked_word`, fed by the private `blocked_words` table: add or remove words in Supabase Table Editor, no deploy needed; `whole_word = true` for short words that sit inside innocent names). It is a best-effort filter, not a guarantee, and it never renames existing accounts. `vercel.json` sets security headers including a strict Content-Security-Policy (scripts from `'self'` only, no inline scripts, `connect-src` limited to this app and the Supabase project URL, fonts bundled in `src/fonts`, no outside hosts except Supabase). If you change the Supabase project, add an external script/font/API host, or add inline scripts, update the CSP or the deployed site will block them; check the browser console for "violates the following Content Security Policy". Never use `innerHTML` with player-supplied text. Remaining limits: a cheater can still wait out the clock to reach a higher plausible score, and the free Supabase plan pauses after 7 idle days (`.github/workflows/keep-supabase-awake.yml` pings it every 3 days; GitHub disables scheduled jobs after 60 days without repo activity).

## Offline play (PWA)

The built site works offline and can be installed to a phone home screen. `vite.config.js` has a small plugin that writes `dist/sw.js` from `service-worker.template.js` at build time, with the exact list of built files and a version hash (so every build gets a fresh cache and old ones are deleted). Pages are network-first (newest version online, saved copy offline); fingerprinted files are cache-first; anything cross-origin (Supabase) is never touched. The worker is only registered in production builds. `src/public/` holds the manifest and icons (copied as-is; keep `PUBLIC_FILES` in `vite.config.js` in sync with it). Fonts are bundled in `src/fonts` (OFL) so nothing needs the internet.

**Scores earned while logged in but offline** stay on the device (`voltRunnerPending:<userId>`, plus `voltRunnerCloudBest:<userId>` caching the last server best for the menu) and are sent later through the RPC `submit_offline_score(score, seconds)`. The server never saw those runs, so it checks that the claimed run length fits in the time since it last heard from the player (`player_sync.last_contact`, refreshed by `start_run` / `submit_score` / an accepted offline claim) plus the usual `max_plausible_score`. Accepting a claim uses that time up, so offline claims cost the same real time as a live run. **Always send a waiting score before calling `start_run`**, because starting a run refreshes the contact time (`createCloudScoreStore` does this). A refused claim is dropped. Guests are unaffected (their score is local anyway).

## Structure

`vite.config.js` sets `root: 'src'`, so `src/index.html` is the entry and output goes to `../dist`.

- `main.ts` — `NeonRush` class (the game's old name): bootstraps the app, screen navigation (menu / game / game over), pause/resume, menu background animation, sound toggle.
- `Game.ts` — main loop, game state, scoring, combos, the score-goal system, difficulty ramp, collisions, HUD updates.
- `Player.ts`, `Orb.ts`, `Obstacle.ts` — entities, each owning its movement and rendering.
- `ParticleSystem.ts`, `BackgroundRenderer.ts`, `AudioManager.ts` (Web Audio sounds generated in code, no audio files).
- `auth.ts` — Supabase client, sign up / log in / log out, cloud high score. `ScoreStore.ts` — guest high score in localStorage. `Game` takes a `ScoreStore`, so it doesn't know whether the score is local or cloud.
- `service-worker.template.js` (project root) — source of `dist/sw.js`, see Offline play. `src/public/` — manifest + icons. `src/fonts/` — bundled fonts.
- `types.ts` — shared types. `styles/style.css` — all UI styling and animations.

## Things to preserve

- **Loop generation counter:** `Game.loop(generation)` exits if `generation !== this.loopGeneration`. This prevents duplicate `requestAnimationFrame` loops after pause/restart. Bump `loopGeneration` whenever a loop must stop; don't start a second loop.
- **Pause freezes everything** — gameplay, particles, obstacles and background. Pause/resume state lives in `main.ts`.
- **Performance:** entity and particle counts are deliberately capped with short lifetimes (recent commits tuned this for mobile). Keep caps when adding effects.
- **Responsive canvas** matches the viewport and resizes on rotate; entity sizes scale on mobile. Honour `prefers-reduced-motion`.
- localStorage keys: `voltRunnerHighScore` (falls back to legacy `neonRushHighScore`) and `voltRunnerAudio`. Don't rename them, or players lose saved data. Signed-in players' scores live in Supabase, not in these keys (only the offline-waiting and cached-best keys above).

## Git hygiene

Never commit `node_modules/` or `dist/` (both gitignored; `node_modules` was accidentally tracked once and removed from the index in Oct 2026).
