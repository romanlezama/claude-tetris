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
- **Cell values double as piece type and color index.** `PIECES[type]` matrices contain their own type number (1–9; 8 is the "tuerca", a 3×3 ring with an empty center; 9 is `RAYO`, see below), `merge()` copies those values into `board`, and `drawBlock` looks them up in `COLORS`. Adding a piece means adding matching entries to both `PIECES` and `COLORS`, inserted before `RAYO`, then bumping `RAYO` (`randomPiece` draws from `1..RAYO-1`).
- **Rayo ⚡ (special piece):** a 1×1 piece of type `RAYO` that is never drawn randomly. `clearLines()` sets `rayoPending` each time `lines` crosses a multiple of `RAYO_EVERY`; `spawn()` then uses `createPiece(RAYO)` as `next`. `lockPiece()` routes it to `clearColumn()` instead of `merge()`/`clearLines()`, so it never stays on the board. `drawBlock` overlays a ⚡ glyph for it.
- **`collide(shape, x, y)` is the single source of truth** for movement, rotation (`tryRotate` with kicks `[0,-1,1,-2,2]`), gravity, ghost projection (`ghostY`), and game-over detection in `spawn()`. Cells with `y < 0` are allowed (above the board).
- **Locking pipeline:** `lockPiece()` → `merge()` → `clearLines()` (or `clearColumn()` for `RAYO`) (updates lines/score/level/`dropInterval`) → `spawn()` (promotes `next`, may call `endGame()`, redraws the preview).
- **Loop control:** `loop()` reschedules itself via `requestAnimationFrame` and stores the id in `animId`; pause and game over stop it with `cancelAnimationFrame(animId)`. Unpausing restarts it by calling `loop()` directly after resetting `lastTime`.
- **One overlay for three modes:** `#overlay` is reused for the start screen, PAUSA and GAME OVER via `showOverlay(mode, title, text)`, which sets `data-mode` and shows/hides the records section. On load the game shows the start screen instead of calling `init()`; until then `board` is undefined and the `keydown` handler bails out.
- **Records (`localStorage` key `records`):** `{ top, bestCombo, maxLines }`, kept in the module-level `records` (not reset by `init()`, like the theme). `combo`/`maxCombo` are tracked in `clearLines()` (consecutive line-clearing locks; the rayo doesn't break a combo). `endGame()` → `registerGame()` inserts the entry immediately with the last used name (`playerName` key); the name input then edits that `newRecord` object in place, which `renderRecords()` also uses to highlight the row.
- **Rendering** redraws the whole board every frame (`draw()`); the next-piece preview (`drawNext()`) is only redrawn on `spawn()` and assumes a 4×4 grid of 30px cells on the 120×120 `#next-canvas`.

## Coupled values

`COLS`, `ROWS`, `BLOCK` in `game.js` must match the `<canvas id="board">` `width`/`height` in `index.html` (`COLS × BLOCK` by `ROWS × BLOCK`, currently 300×600). The controls list in `index.html` and the README controls table should be kept in sync with the `keydown` handler.

## CI / GitHub Actions

Workflows in `.github/workflows/` use `anthropics/claude-code-action@v1` with the `CLAUDE_CODE_OAUTH_TOKEN` secret: `claude.yml` (`@claude` mentions), `claude-code-review.yml` (PR review), and `claude-issue-triage.yml` (on issue opened/edited: applies existing labels only and posts/updates a Spanish diagnosis comment).
