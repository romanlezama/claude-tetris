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
const RECORDS_KEY = 'records';
const TOP_N = 5;

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
const newRecordBox = document.getElementById('new-record');
const newRecordMsg = document.getElementById('new-record-msg');
const playerNameInput = document.getElementById('player-name');
const recordsBox = document.getElementById('records');
const recordsBody = document.getElementById('records-body');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const resetRecordsBtn = document.getElementById('reset-records-btn');

let gridColor;
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, rayoPending;
let combo, maxCombo, newRecord = null, newBestCombo = false, newMaxLines = false;
// Los récords persisten entre partidas: no se reinician en init()
let records = loadRecords();

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
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    updateHUD();
  } else {
    combo = 0;
  }
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
  else { ctx.clearRect(0, 0, canvas.width, canvas.height); drawGrid(); }
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (data && Array.isArray(data.top)) {
      return { top: data.top.slice(0, TOP_N), bestCombo: data.bestCombo || 0, maxLines: data.maxLines || 0 };
    }
  } catch (e) {}
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function saveRecords() {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch (e) {}
}

function qualifies(s) {
  return s > 0 && (records.top.length < TOP_N || s > records.top[TOP_N - 1].score);
}

// Registra la partida recién terminada; si entra al top se guarda ya con el
// último nombre usado y el campo de texto solo lo edita.
function registerGame() {
  if (maxCombo > records.bestCombo) { records.bestCombo = maxCombo; newBestCombo = true; }
  if (lines > records.maxLines) { records.maxLines = lines; newMaxLines = true; }
  if (qualifies(score)) {
    let name = '';
    try { name = localStorage.getItem('playerName') || ''; } catch (e) {}
    newRecord = { name: name || 'Anónimo', score, lines, combo: maxCombo };
    records.top.push(newRecord);
    records.top.sort((a, b) => b.score - a.score);
    records.top.length = Math.min(records.top.length, TOP_N);
    playerNameInput.value = name;
  }
  saveRecords();
}

function renderRecords() {
  recordsBody.replaceChildren();
  if (!records.top.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td class="empty" colspan="5">Sin récords todavía</td>';
    recordsBody.append(tr);
  }
  records.top.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (r === newRecord) tr.className = 'highlight';
    for (const v of [i + 1, r.name, r.score.toLocaleString(), r.lines, r.combo]) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.append(td);
    }
    recordsBody.append(tr);
  });
  bestComboEl.textContent = records.bestCombo;
  bestComboEl.classList.toggle('new', newBestCombo);
  maxLinesEl.textContent = records.maxLines;
  maxLinesEl.classList.toggle('new', newMaxLines);

  const pos = records.top.indexOf(newRecord) + 1;
  newRecordBox.hidden = !pos;
  newRecordMsg.textContent = `¡Nuevo récord! Puesto #${pos} del top ${TOP_N}`;
}

// mode: 'start' | 'pause' | 'gameover'
function showOverlay(mode, title, text) {
  overlay.dataset.mode = mode;
  overlayTitle.textContent = title;
  overlayScore.textContent = text;
  restartBtn.textContent = mode === 'start' ? 'Jugar' : 'Reiniciar';
  recordsBox.hidden = mode === 'pause';
  if (mode === 'pause') newRecordBox.hidden = true;
  else renderRecords();
  overlay.classList.remove('hidden');
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  registerGame();
  showOverlay('gameover', 'GAME OVER',
    `Puntuación: ${score.toLocaleString()} · Líneas: ${lines} · Combo: ${maxCombo}`);
  if (newRecord) playerNameInput.focus();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    showOverlay('pause', 'PAUSA', '');
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
  newRecord = null;
  newBestCombo = false;
  newMaxLines = false;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (!board) return; // pantalla de inicio: aún no hay partida
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

restartBtn.addEventListener('click', () => {
  restartBtn.blur(); // evita que Space (caída) vuelva a pulsar el botón
  init();
});

playerNameInput.addEventListener('input', () => {
  if (!newRecord) return;
  const name = playerNameInput.value.trim();
  newRecord.name = name || 'Anónimo';
  saveRecords();
  try { localStorage.setItem('playerName', name); } catch (e) {}
  renderRecords();
});

playerNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') playerNameInput.blur();
});

resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Borrar todos los récords?')) return;
  records = { top: [], bestCombo: 0, maxLines: 0 };
  newRecord = null;
  newBestCombo = false;
  newMaxLines = false;
  saveRecords();
  renderRecords();
});

themeToggle.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(theme);
  try { localStorage.setItem('theme', theme); } catch (e) {}
  themeToggle.blur(); // evita que Space (caída) active el botón
});

let savedTheme = null;
try { savedTheme = localStorage.getItem('theme'); } catch (e) {}
applyTheme(savedTheme === 'light' ? 'light' : 'dark');

showOverlay('start', '¿LISTO?', 'Pulsa Jugar para empezar');
