# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Game

Open `index.html` directly in any modern browser — no build step, no server required.

```bash
open index.html   # macOS
```

There are no dependencies, tests, or package manager files.

## Architecture

Everything lives in two files:

- **`index.html`** — canvas setup, Google Font (`Press Start 2P`) import, loads `game.js`
- **`game.js`** — all game logic and rendering (~765 lines, no modules)

`game.js` is organized into clearly marked sections via banner comments (`// ─── SECTION ───`):

| Section | Purpose |
|---|---|
| GAME STATES / GLOBALS | `STATE` enum, all mutable game state as module-level `let` vars |
| INPUT | Keyboard (`keys` object) and mouse (`mouse` object) event listeners |
| ENEMY TYPES | `ET` enum — `GRUNT`, `RUNNER`, `TANK` |
| FACTORY FUNCTIONS | `makePlayer`, `makeBullet`, `makeEnemy`, `makeParticle` |
| LEVEL WAVE DEFINITIONS | `buildLevelWaves(lvl)` — returns array-of-arrays of `ET` strings |
| GAME FLOW | `startGame`, `startLevel`, `startWave`, `screenShake`, `screenFlash` |
| UPDATE | One `update*` function per entity type, called each frame from `updatePlaying` |
| DRAW HELPERS | One `draw*` function per entity/effect, called each frame from `gameLoop` |
| MENU | Menu-specific update/draw logic |
| MAIN LOOP | `gameLoop(timestamp)` — delta-time loop via `requestAnimationFrame` |

## Key Design Patterns

**State machine**: `state` is a single string matching `STATE.*`. The main loop's `switch(state)` routes to the right update+draw pair each frame.

**Entity structure**: All entities are plain objects with `{ x, y, w, h, alive }`. Collision is AABB via `aabb(a, b)`. Dead entities (`alive = false`) are spliced out on the next frame — always iterate arrays in reverse when splicing mid-loop.

**Delta-time**: Every movement/timer uses `dt` (seconds since last frame, capped at 50ms). `dt` flows from `gameLoop` → `updatePlaying` → individual `update*` functions.

**Wave system**: `buildLevelWaves(lvl)` defines the full enemy composition for a level as an array of waves. Each wave is a shuffled array of `ET` strings. `enemiesToSpawn` is popped one-at-a-time on a `spawnTimer` interval. A wave is "cleared" when both `enemiesToSpawn` and `enemies` are empty.

**Screen shake**: Applied as a `ctx.translate(shakeX, shakeY)` inside a `ctx.save/restore` in the `PLAYING` branch. `shakeIntensity` decays multiplicatively each frame.

**Drawing order** (PLAYING state): background → particles → bullets → muzzle flash → enemies → player → screen flash → HUD. HUD is always drawn last, unaffected by shake.

## Adding a New Enemy Type

1. Add a key to `ET`
2. Add a `case` in `makeEnemy` with stats (`w`, `h`, `hp`, `speed`, `color`, `scoreVal`)
3. Add a draw branch in `drawEnemyShape`
4. Add movement logic in `updateEnemies` (or reuse the default straight-line path)
5. Add the new type to `buildLevelWaves` compositions as needed
