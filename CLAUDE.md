# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JavaScript Tetris on HTML5 Canvas. No dependencies, no `package.json`, no build step, no test suite, no linter. User-facing text (UI labels, overlay messages, README) is in Spanish — keep new strings in Spanish.

## Running

Open `index.html` directly, or serve the directory statically (preferred):

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

Verification is manual in the browser.

## Architecture

Three files: `index.html` (DOM + two canvases + overlay), `style.css` (dark theme), and `game.js` (all logic, loaded as a classic `'use strict'` script at the end of `<body>`, so DOM lookups at top level are safe).

Key points in `game.js` that span multiple functions:

- **All game state is module-level `let` globals** (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `dropAccum`, `animId`, `rayoPending`, …). `init()` resets every one of them and is also the restart handler — any new state variable must be reset there.
- **Cell values double as piece type and color index.** `PIECES[type]` matrices contain their own type number (1–9; 8 is the "tuerca", a 3×3 ring with an empty center; 9 is `RAYO`, see below), `merge()` copies those values into `board`, and `drawBlock` looks them up in the active skin's `colors` palette (`COLORS` is the retro one). Adding a piece means adding matching entries to `PIECES` and to the `colors` palette of **every** skin in `SKINS`, inserted before `RAYO`, then bumping `RAYO` (`randomPiece` draws from `1..RAYO-1`).
- **Rayo ⚡ (special piece):** a 1×1 piece of type `RAYO` that is never drawn randomly. `clearLines()` sets `rayoPending` each time `lines` crosses a multiple of `RAYO_EVERY`; `spawn()` then uses `createPiece(RAYO)` as `next`. `lockPiece()` routes it to `clearColumn()` instead of `merge()`/`clearLines()`, so it never stays on the board. `drawBlock` overlays a ⚡ glyph for it.
- **`collide(shape, x, y)` is the single source of truth** for movement, rotation (`tryRotate` with kicks `[0,-1,1,-2,2]`), gravity, ghost projection (`ghostY`), and game-over detection in `spawn()`. Cells with `y < 0` are allowed (above the board).
- **Locking pipeline:** `lockPiece()` → `merge()` → `clearLines()` (or `clearColumn()` for `RAYO`) (updates lines/score/level/`dropInterval`) → `spawn()` (promotes `next`, may call `endGame()`, redraws the preview).
- **Loop control:** `loop()` reschedules itself via `requestAnimationFrame` and stores the id in `animId`; pause and game over stop it with `cancelAnimationFrame(animId)`. Unpausing restarts it by calling `loop()` directly after resetting `lastTime`.
- **One overlay for two states:** `#overlay` is reused for both PAUSA and GAME OVER by rewriting `#overlay-title` / `#overlay-score`.
- **Skins:** `drawBlock()` delegates to `SKINS[currentSkin]` (`colors` palette + `drawCell(context, px, py, size, color)`), then draws the ⚡ glyph for `RAYO` and resets `globalAlpha`; every board/ghost/current/preview cell goes through it. `applySkin()` sets `document.documentElement.dataset.skin` (CSS `:root[data-skin="neon"]` overrides `--board-bg`/`--grid`), re-reads `gridColor` and redraws. Skin drawers that set `shadowBlur` must reset it to 0. Like the theme, the skin is a UI preference persisted in `localStorage` (`'skin'`) and is not reset by `init()`.
- **Rendering** redraws the whole board every frame (`draw()`); the next-piece preview (`drawNext()`) is only redrawn on `spawn()` and assumes a 4×4 grid of 30px cells on the 120×120 `#next-canvas`.

## Coupled values

`COLS`, `ROWS`, `BLOCK` in `game.js` must match the `<canvas id="board">` `width`/`height` in `index.html` (`COLS × BLOCK` by `ROWS × BLOCK`, currently 300×600). The controls list in `index.html` and the README controls table should be kept in sync with the `keydown` handler.

## CI / GitHub Actions

Workflows in `.github/workflows/` use `anthropics/claude-code-action@v1` with the `CLAUDE_CODE_OAUTH_TOKEN` secret: `claude.yml` (`@claude` mentions), `claude-code-review.yml` (PR review), and `claude-issue-triage.yml` (on issue opened/edited: applies existing labels only and posts/updates a Spanish diagnosis comment).
