# Volt Runner

Volt Runner is a fast-paced futuristic arcade game built for modern desktop and mobile browsers. Control a glowing runner, collect energy orbs, avoid neon obstacles, and survive as the arena becomes faster and more difficult.

## Features

- Responsive neon cyberpunk interface
- Animated gradient, grid, particles, rings, and glow effects
- Smooth player movement with:
  - WASD
  - Arrow keys
  - Touch pointer controls on mobile
- Energy orb collection with:
  - Combo multipliers
  - Floating score animations
  - Particle effects
  - Generated Web Audio sound effects
- Progressive difficulty:
  - Increasing speed
  - More frequent obstacle spawns
  - Visible speed multiplier
- Bounded moving-object populations with short lifetimes to maintain performance
- Collision effects with:
  - Particle bursts
  - Screen shake
  - Game-over transition
- Pause and resume support
- Pausing freezes gameplay, particles, obstacles, and background motion
- Play Again and Main Menu actions
- Persistent high score using `localStorage`
- Sound toggle with persisted preference
- Responsive canvas sizing for phones, tablets, and desktop browsers
- Reduced-motion support through `prefers-reduced-motion`
- Optional accounts (Supabase), a public leaderboard, and guest mode
- Works offline once loaded, and can be installed to a phone home screen
- On-screen joystick on phones and tablets (the finger never covers the runner); the stick appears wherever the thumb lands
- Privacy policy and terms of service pages, a sign-up consent checkbox, and a self-service "Delete my account"

## Controls

| Input | Action |
| --- | --- |
| `W`, `A`, `S`, `D` | Move the player |
| Arrow keys | Move the player |
| `Space` | Pause or resume |
| Touch (phones, tablets) | Joystick: touch anywhere and drag in the direction to move |
| Mouse drag | Move toward the pointer (desktop) |

## Gameplay

Collect energy orbs to increase your score. Each consecutive orb increases the combo multiplier, allowing later collections to award more points. Avoid the moving obstacles: a collision ends the run.

The game tracks:

- Current score
- High score
- Combo
- Maximum combo
- Speed multiplier
- Survival time

## Project Structure

```text
src/
├── AudioManager.ts       # Generated Web Audio effects and sound preferences
├── BackgroundRenderer.ts # Animated background canvas
├── Game.ts               # Main game loop, state, scoring, collisions, and UI updates
├── Obstacle.ts            # Obstacle movement and rendering
├── Orb.ts                 # Collectible orb movement and rendering
├── ParticleSystem.ts      # Collection and collision particles
├── Player.ts              # Player movement, bounds, trail, and rendering
├── Joystick.ts            # On-screen joystick for touch devices
├── privacy.html           # Privacy policy page (update it if data handling changes)
├── terms.html             # Terms of service page
├── auth.ts                # Supabase sign up / log in, cloud score, offline score queue, account deletion
├── ScoreStore.ts          # Guest high score (localStorage)
├── types.ts               # Shared TypeScript types
├── index.html             # Application markup (all screens)
├── main.ts                # Application bootstrap, screens, accounts, leaderboard, offline badge
├── fonts/                 # Bundled fonts (so the game works offline)
├── public/                # Web app manifest and icons, copied as-is
└── styles/
    └── style.css          # Responsive visual design and animations
supabase/schema.sql         # Database setup (tables, rules, score-checking functions)
service-worker.template.js  # Becomes dist/sw.js at build time (offline support)
vercel.json                 # Security headers for the hosted site
.github/workflows/          # Keeps the free Supabase project from pausing
```

## Accounts and leaderboard (optional)

Accounts need a Supabase project: copy `.env.example` to `.env.local`, fill in the project URL and publishable key, and run `supabase/schema.sql` once in the Supabase SQL editor. Without these the game still works as guest-only. Scores are checked on the server (see `CLAUDE.md` for the details).

## Offline play

After one visit the game works with no internet and can be installed to a home screen. Guests keep their score on the device. Logged-in players can also play offline: a new best score waits on the device and is sent when the connection returns (the server checks it against the time since it last heard from the player). Offline mode is only active in the built site, not under `npm run dev`.

## Requirements

- Node.js 18 or newer recommended
- npm
- A modern browser with Canvas and Web Audio API support

## Installation

Install the project dependencies:

```bash
npm install
```

## Development

Start the Vite development server:

```bash
npm run dev
```

The development server runs on port `3000` by default.

Open:

```text
http://localhost:3000
```

## Production Build

Create an optimized production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Browser Support

Volt Runner is designed to run in modern versions of:

- Chrome
- Edge
- Firefox
- Safari
- Mobile Chrome
- Mobile Safari

The game canvas automatically matches the current viewport dimensions and updates when the browser is resized or rotated. The UI is tested against desktop, tablet, and phone-sized layouts without page overflow.

## Persistence

The game stores the following preferences locally in the browser:

- `voltRunnerHighScore` (guest best score)
- `voltRunnerAudio`
- `voltRunnerPending:<userId>` and `voltRunnerCloudBest:<userId>` (logged-in players: a score waiting to be sent, and the last best the server reported)

Existing high scores saved under the previous game name are read as a fallback for compatibility.

## Validation

The project has been validated with:

```bash
npm run build
```

The main browser flows have also been tested:

- Main menu
- Starting a game
- Keyboard movement
- Touch input
- Pause and resume
- Orb collection and scoring
- Collision and game over
- Play Again
- Main Menu
- Sound toggle
- High-score persistence
- Responsive canvas sizing
