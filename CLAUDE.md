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

- **All game state is module-level `let` globals** (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `dropAccum`, `animId`, `rayoPending`, `combo`, `maxCombo`, …). `init()` resets every one of them and is also the restart handler — any new state variable must be reset there.
- **Cell values double as piece type and color index.** `PIECES[type]` matrices contain their own type number (1–9; 8 is the "tuerca", a 3×3 ring with an empty center; 9 is `RAYO`, see below), `merge()` copies those values into `board`, and `drawBlock` looks them up in `COLORS`. Adding a piece means adding matching entries to both `PIECES` and `COLORS`, inserted before `RAYO`, then bumping `RAYO` (`randomPiece` draws from `1..RAYO-1`).
- **Rayo ⚡ (special piece):** a 1×1 piece of type `RAYO` that is never drawn randomly. `clearLines()` sets `rayoPending` each time `lines` crosses a multiple of `RAYO_EVERY`; `spawn()` then uses `createPiece(RAYO)` as `next`. `lockPiece()` routes it to `clearColumn()` instead of `merge()`/`clearLines()`, so it never stays on the board. `drawBlock` overlays a ⚡ glyph for it.
- **`collide(shape, x, y)` is the single source of truth** for movement, rotation (`tryRotate` with kicks `[0,-1,1,-2,2]`), gravity, ghost projection (`ghostY`), and game-over detection in `spawn()`. Cells with `y < 0` are allowed (above the board).
- **Locking pipeline:** `lockPiece()` → `merge()` → `clearLines()` (or `clearColumn()` for `RAYO`) (updates lines/score/level/`dropInterval`) → `spawn()` (promotes `next`, may call `endGame()`, redraws the preview).
- **Loop control:** `loop()` reschedules itself via `requestAnimationFrame` and stores the id in `animId`; pause and game over stop it with `cancelAnimationFrame(animId)`. Unpausing restarts it by calling `loop()` directly after resetting `lastTime`.
- **One overlay for several states:** `#overlay` is reused for the start screen, PAUSA and GAME OVER by rewriting `#overlay-title` / `#overlay-score`. CSS classes on `#overlay` pick extra content: `show-records` shows the `#records` block (start screen + game over) and `start-screen` swaps `#restart-btn` for `#play-btn`. `init()` removes both classes via `hideRecordsUI()`.
- **Start screen:** the script ends with `showStartScreen()`, not `init()`. Nothing runs (no `board`, no loop) until `#play-btn` calls `init()`; the `keydown` handler returns early while `board` is unset and whenever the event target is a text input (so typing a record name never triggers game keys).
- **Records (`// ---- Récords ----` section):** `combo` / `maxCombo` (reset in `init()`) count consecutive locks that clear ≥1 line; `clearLines()` calls `updateCombo(cleared)`, so a lock clearing nothing resets `combo` and the `RAYO` path (which skips `clearLines()`) neither breaks nor extends it. `endGame()` calls `onGameOverRecords()`, which updates bests and shows the name form if `qualifies(score)` (score > 0 and beats the 5th place or the list has < 5). localStorage keys: `records` (top 5 `[{name, score, lines, combo, date}]`, sorted by score desc) and `bests` (`{combo, lines}` maxima over all games, not just the top 5). `init()` first calls `finishRecords()`: on restart after game over it auto-saves a qualifying unsaved score with the typed name; on restart of an unfinished game (e.g. from pause) it still folds that game into `bests`. All access goes through try/catch and `loadRecords()` sanitizes corrupt data; names are rendered with `textContent` only.
- **Rendering** redraws the whole board every frame (`draw()`); the next-piece preview (`drawNext()`) is only redrawn on `spawn()` and assumes a 4×4 grid of 30px cells on the 120×120 `#next-canvas`.

## Coupled values

`COLS`, `ROWS`, `BLOCK` in `game.js` must match the `<canvas id="board">` `width`/`height` in `index.html` (`COLS × BLOCK` by `ROWS × BLOCK`, currently 300×600). The controls list in `index.html` and the README controls table should be kept in sync with the `keydown` handler.

## CI / GitHub Actions

Workflows in `.github/workflows/` use `anthropics/claude-code-action@v1` with the `CLAUDE_CODE_OAUTH_TOKEN` secret: `claude.yml` (`@claude` mentions), `claude-code-review.yml` (PR review), and `claude-issue-triage.yml` (on issue opened/edited: applies existing labels only and posts/updates a Spanish diagnosis comment).
