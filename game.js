'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - azul pálido
  '#ffb74d', // L - orange
  '#b0bec5', // N - tuerca (gris metálico)
  '#fff176', // ⚡ rayo
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca (hueco central)
  [[9]],                                       // ⚡ rayo
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const RAYO = 9;        // tipo de la pieza especial; debe ser el último de PIECES
const RAYO_EVERY = 1;  // aparece cada N líneas

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const themeLabel = document.getElementById('theme-label');

let gridColor;
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, rayoPending;
let combo, maxCombo; // ---- Récords ---- (bloqueos seguidos que limpian líneas)

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  // el rayo (último tipo) nunca sale por sorteo
  return createPiece(Math.floor(Math.random() * (RAYO - 1)) + 1);
}

function createPiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    if (Math.floor(lines / RAYO_EVERY) > Math.floor((lines - cleared) / RAYO_EVERY)) rayoPending = true;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  updateCombo(cleared);
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function clearColumn(x) {
  for (let r = 0; r < ROWS; r++) board[r][x] = 0;
}

function lockPiece() {
  if (current.type === RAYO) clearColumn(current.x);
  else { merge(); clearLines(); }
  spawn();
}

function spawn() {
  current = next;
  next = rayoPending ? createPiece(RAYO) : randomPiece();
  rayoPending = false;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  if (colorIndex === RAYO) {
    context.font = `${size * 0.7}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('⚡', x * size + size / 2, y * size + size / 2);
  }
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

// El tema es preferencia de UI: no se reinicia en init()
function applyTheme(theme) {
  const isLight = theme === 'light';
  document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  themeToggle.setAttribute('aria-checked', String(isLight));
  themeLabel.textContent = isLight ? 'Modo oscuro' : 'Modo claro';
  themeToggle.setAttribute('aria-label', themeLabel.textContent);
  if (board) { draw(); drawNext(); }
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  onGameOverRecords();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return; // endGame() no puede cancelar el frame en curso
  animId = requestAnimationFrame(loop);
}

function init() {
  finishRecords();
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  rayoPending = false;
  combo = 0;
  maxCombo = 0;
  hideRecordsUI();
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ---- Récords ----
// localStorage 'records': top 5 [{name, score, lines, combo, date}] ordenado por score desc.
// localStorage 'bests':   {combo, lines} máximos históricos de TODAS las partidas
//                          (entren o no al top 5).
const RECORDS_KEY = 'records';
const BESTS_KEY = 'bests';
const MAX_RECORDS = 5;
const NAME_MAX = 12;
const DEFAULT_NAME = 'Jugador';
const recordForm = document.getElementById('record-form');
const recordName = document.getElementById('record-name');
const recordSaveBtn = document.getElementById('record-save-btn');
const recordsBody = document.getElementById('records-body');
const recordsBests = document.getElementById('records-bests');
const playBtn = document.getElementById('play-btn');
const recordsResetBtn = document.getElementById('records-reset-btn');

let recordSaved = false;  // la partida terminada ya se guardó
let highlightIndex = -1;  // fila resaltada (récord recién guardado)

function updateCombo(cleared) {
  combo = cleared ? combo + 1 : 0;
  if (combo > maxCombo) maxCombo = combo;
}

function toCount(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
}

function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

function loadRecords() {
  const list = readJSON(RECORDS_KEY);
  if (!Array.isArray(list)) return [];
  return list
    .filter(r => r && typeof r === 'object')
    .map(r => ({
      name: String(r.name ?? DEFAULT_NAME).slice(0, NAME_MAX),
      score: toCount(r.score),
      lines: toCount(r.lines),
      combo: toCount(r.combo),
      date: String(r.date ?? ''),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECORDS);
}

function loadBests() {
  const b = readJSON(BESTS_KEY);
  return { combo: toCount(b && b.combo), lines: toCount(b && b.lines) };
}

function updateBests() {
  const b = loadBests();
  writeJSON(BESTS_KEY, { combo: Math.max(b.combo, maxCombo), lines: Math.max(b.lines, lines) });
}

function qualifies(s) {
  if (s <= 0) return false;
  const list = loadRecords();
  return list.length < MAX_RECORDS || s > list[list.length - 1].score;
}

// Inserta la partida actual y devuelve su posición en el top (o -1)
function addRecord(name) {
  const entry = {
    name: String(name).trim().slice(0, NAME_MAX) || DEFAULT_NAME,
    score, lines, combo: maxCombo,
    date: new Date().toISOString(),
  };
  const list = loadRecords();
  list.push(entry);
  list.sort((a, b) => b.score - a.score); // estable: en empate el nuevo queda debajo
  const top = list.slice(0, MAX_RECORDS);
  writeJSON(RECORDS_KEY, top);
  return top.indexOf(entry);
}

function renderRecords() {
  recordsBody.replaceChildren();
  const list = loadRecords();
  if (!list.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'records-empty';
    td.textContent = 'Sin récords todavía';
    tr.appendChild(td);
    recordsBody.appendChild(tr);
  }
  list.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (i === highlightIndex) tr.classList.add('record-highlight');
    for (const v of [i + 1, r.name, r.score.toLocaleString(), r.lines, r.combo]) {
      const td = document.createElement('td');
      td.textContent = String(v); // textContent: el nombre nunca se interpreta como HTML
      tr.appendChild(td);
    }
    recordsBody.appendChild(tr);
  });
  const b = loadBests();
  recordsBests.textContent = `Mejor combo: ${b.combo} · Líneas máx.: ${b.lines}`;
}

function showStartScreen() {
  highlightIndex = -1;
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = '';
  recordForm.hidden = true;
  overlay.classList.add('show-records', 'start-screen');
  overlay.classList.remove('hidden');
  renderRecords();
}

function onGameOverRecords() {
  updateBests();
  recordSaved = false;
  highlightIndex = -1;
  overlayScore.textContent += ` · Líneas: ${lines} · Combo máx.: ${maxCombo}`;
  overlay.classList.add('show-records');
  const isRecord = qualifies(score);
  recordForm.hidden = !isRecord;
  // Sin auto-focus: una tecla mantenida (p. ej. Space) se escribiría en el nombre
  renderRecords();
}

// Al empezar otra partida (init): guarda el récord pendiente con el nombre
// escrito, o, si la partida se abandonó (Reiniciar en pausa), cuenta sus bests.
function finishRecords() {
  if (!board) return;
  if (!gameOver) updateBests();
  else if (!recordSaved && qualifies(score)) {
    recordSaved = true;
    addRecord(recordName.value);
  }
}

function saveCurrentRecord() {
  if (gameOver && !recordSaved && qualifies(score)) {
    recordSaved = true;
    highlightIndex = addRecord(recordName.value);
  }
  recordForm.hidden = true;
  recordName.blur();
  renderRecords();
}

function resetRecords() {
  if (!confirm('¿Borrar todos los récords?')) return;
  try {
    localStorage.removeItem(RECORDS_KEY);
    localStorage.removeItem(BESTS_KEY);
  } catch (e) {}
  highlightIndex = -1;
  if (gameOver && !recordSaved) recordForm.hidden = !qualifies(score);
  renderRecords();
}

function hideRecordsUI() {
  overlay.classList.remove('show-records', 'start-screen');
  recordForm.hidden = true;
  recordSaved = false;
  highlightIndex = -1;
}

function isTypingTarget(t) {
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable === true);
}

playBtn.addEventListener('click', () => { playBtn.blur(); init(); });
recordSaveBtn.addEventListener('click', saveCurrentRecord);
recordName.addEventListener('keydown', e => { if (e.key === 'Enter') saveCurrentRecord(); });
recordsResetBtn.addEventListener('click', () => { recordsResetBtn.blur(); resetRecords(); });
restartBtn.addEventListener('click', () => restartBtn.blur()); // Space no debe reactivarlo
// ---- /Récords ----

document.addEventListener('keydown', e => {
  if (!board || isTypingTarget(e.target)) return; // pantalla de inicio o escribiendo el nombre
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeToggle.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(theme);
  try { localStorage.setItem('theme', theme); } catch (e) {}
  themeToggle.blur(); // evita que Space (caída) active el botón
});

let savedTheme = null;
try { savedTheme = localStorage.getItem('theme'); } catch (e) {}
applyTheme(savedTheme === 'light' ? 'light' : 'dark');

showStartScreen(); // la partida empieza con el botón "Jugar" (init)
