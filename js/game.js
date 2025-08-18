// =======================
// Config
// =======================
const randBool = () => Math.random() < 0.5;
const now = () => Date.now();
const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
};

// Colors
function readPalette(){
  const CSS = getComputedStyle(document.body || document.documentElement);
  return {
    colorRed:      (CSS.getPropertyValue('--dot-red')      || '#ef4444').trim(),
    colorGreen:    (CSS.getPropertyValue('--dot-green')    || '#22c55e').trim(),
    colorStroke:   (CSS.getPropertyValue('--stroke-ring')  || 'rgba(255,255,255,0.06)').trim(),
    markerGreen:   (CSS.getPropertyValue('--marker-green') || 'rgba(34,197,94,.95)').trim(),
    markerRed:     (CSS.getPropertyValue('--marker-red')   || 'rgba(239,68,68,.95)').trim(),
    markerReveal:  (CSS.getPropertyValue('--marker-reveal')|| 'rgba(34,197,94,.65)').trim(),
    gapPx:   parseFloat(CSS.getPropertyValue('--gap'))    || 4,
    dotMin: parseFloat(CSS.getPropertyValue('--dotMin')) || 6,
  };
}
let PALETTE = readPalette();

// =======================
// State
// =======================
let rows = 10, columns = 10;
let board = [];
let options = [];
let correctIndex = 0;
let planted = { r: 0, c: 0 };
let reveal = false;

let streak = 0;
let streakAccumMs = 0;

let questionStart = null;
let timers = [];
let autoNextTimer = null;
let locked = false;

// =======================
// DOM
// =======================
const $boardWrap   = document.getElementById('boardWrap');
const $boardCanvas = document.getElementById('boardCanvas');
const $optionsWrap = document.getElementById('options');
const $optCanvases = Array.from(document.querySelectorAll('.optCanvas'));
const $streak      = document.getElementById('streak');
const $streakTime  = document.getElementById('streakTime');
const $qTime       = document.getElementById('qTime');
const $status      = document.getElementById('status');
const $newGame     = document.getElementById('newGame');
const $reveal      = document.getElementById('reveal');
const $rowsInput   = document.getElementById('rowsInput');
const $colsInput   = document.getElementById('colsInput');

// =======================
// Canvas
// =======================
const DPR = window.devicePixelRatio || 1;
let cellPx = 14;
let gapPx  = PALETTE.gapPx;
let dotMin = PALETTE.dotMin;

function sizeBoardCanvasToFit() {
  const cs = getComputedStyle($boardWrap);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const Wcss = $boardWrap.clientWidth - padX;
  const Hcss = $boardWrap.clientHeight - padY;

  const cell = Math.floor(Math.min(
    (Wcss - gapPx * (columns - 1)) / columns,
    (Hcss - gapPx * (rows - 1)) / rows
  ));
  cellPx = Math.max(dotMin, cell);

  const widthCss  = columns * cellPx + (columns - 1) * gapPx;
  const heightCss = rows    * cellPx + (rows    - 1) * gapPx;

  $boardCanvas.style.width  = `${widthCss}px`;
  $boardCanvas.style.height = `${heightCss}px`;
  $boardCanvas.width  = Math.round(widthCss  * DPR);
  $boardCanvas.height = Math.round(heightCss * DPR);
}

// =======================
// Option canvases
// =======================
function sizeAndDrawOptionCanvases() {
  const dims = $optCanvases.map(cv => {
    const r = cv.getBoundingClientRect();
    return { w: r.width || 140, h: r.height || 96 };
  });
  const minH    = Math.max(1, Math.min(...dims.map(d => d.h)));
  const headerH = Math.max(18, Math.floor(minH * 0.24));
  const fontPx  = Math.max(14, Math.floor(headerH * 0.72));

  $optCanvases.forEach((cv, idx) => {
    const cssW = dims[idx].w, cssH = dims[idx].h;

    cv.width  = Math.max(1, Math.floor(cssW * DPR));
    cv.height = Math.max(1, Math.floor(cssH * DPR));

    const g = cv.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.clearRect(0, 0, cssW, cssH);

    // Option number
    g.fillStyle = 'rgba(15,23,42,0.75)';
    g.fillRect(0, 0, cssW, headerH);
    g.strokeStyle = 'rgba(255,255,255,0.10)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, headerH + 0.5);
    g.lineTo(cssW, headerH + 0.5);
    g.stroke();

    g.font = `800 ${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
    g.fillStyle = '#e5e7eb';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(idx + 1), cssW / 2, headerH / 2);

    // Option pattern
    const pad = Math.max(6, Math.floor(cssW * 0.06));
    const availW = cssW - pad * 2;
    const availH = cssH - headerH - pad * 2;
    const gridSize = Math.max(1, Math.min(availW, availH));
    const gx = (cssW - gridSize) / 2;
    const gy = headerH + pad + (availH - gridSize) / 2;

    const pat = options[idx];
    if (pat) {
      const cell = gridSize / 3;
      const r = Math.max(2, Math.floor(cell * 0.42));
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const cx = gx + j * cell + cell / 2;
          const cy = gy + i * cell + cell / 2;
          g.beginPath();
          g.arc(cx, cy, r, 0, Math.PI * 2);
          g.closePath();
          g.fillStyle = pat[i][j] ? PALETTE.colorGreen : PALETTE.colorRed;
          g.fill();
          g.lineWidth = Math.max(1, cell * 0.10);
          g.strokeStyle = PALETTE.colorStroke;
          g.stroke();
        }
      }
      // Subtle border for the mini grid
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(255,255,255,0.08)';
      g.strokeRect(gx, gy, gridSize, gridSize);
    }
  });
}

// =======================
// Main board
// =======================
function drawBoard(markerColor = null) {
  const g = $boardCanvas.getContext('2d');
  g.setTransform(DPR, 0, 0, DPR, 0, 0);

  const wCss = $boardCanvas.width  / DPR;
  const hCss = $boardCanvas.height / DPR;

  g.clearRect(0, 0, wCss, hCss);

  const r = cellPx / 2;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < columns; j++) {
      const cx = j * (cellPx + gapPx) + r;
      const cy = i * (cellPx + gapPx) + r;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.closePath();
      g.fillStyle = board[i][j] ? PALETTE.colorGreen : PALETTE.colorRed;
      g.fill();
      g.lineWidth = Math.max(1, cellPx * 0.12);
      g.strokeStyle = PALETTE.colorStroke;
      g.stroke();
    }
  }

  // Answer marker
  const x = planted.c * (cellPx + gapPx);
  const y = planted.r * (cellPx + gapPx);
  const w = 3 * cellPx + 2 * gapPx;
  const h = w;

  if (markerColor) {
    g.lineWidth = Math.max(2, Math.floor(cellPx * 0.18));
    g.strokeStyle = markerColor === 'green' ? PALETTE.markerGreen : PALETTE.markerRed;
    g.strokeRect(x, y, w, h);
  } else if (reveal) {
    g.lineWidth = Math.max(2, Math.floor(cellPx * 0.18));
    g.strokeStyle = PALETTE.markerReveal;
    g.strokeRect(x, y, w, h);
  }
}

// =======================
// Patterns
// =======================
function mkPattern() {
  const p = Array.from({ length: 3 }, () => Array.from({ length: 3 }, randBool));
  let sum = 0;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) sum += p[r][c] ? 1 : 0;
  if (sum < 2 || sum > 7 ) return mkPattern();
  return p;
}

function difference(p1, p2) {
  let d = 0;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      if (p1[i][j] !== p2[i][j]) d++;
  return d;
}

function generateUniquePatterns(n, minDiff = 4) {
  const arr = [];
  let guard = 0;
  while (arr.length < n && guard < 5000) {
    guard++;
    const cand = mkPattern();
    let ok = true;
    for (const ex of arr) {
      if (difference(cand, ex) < minDiff) { ok = false; break; }
    }
    if (ok) arr.push(cand);
  }
  if (arr.length !== n) {
    return generateUniquePatterns(n, minDiff);
  }
  return arr;
}

function randomFillBoard() {
  board = Array.from({ length: rows }, () => Array.from({ length: columns }, randBool));
}

function placePatternAt(mat, r, c, pat) {
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      mat[r + i][c + j] = pat[i][j];
}

function patternMatchesAt(mat, r, c, pat) {
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      if (mat[r + i][c + j] !== pat[i][j]) return false;
  return true;
}


const SWEEPS = [
  { name: 'TL_BR', rStart: 0, rEnd: () => rows-3, rStep: 1, cStart: 0, cEnd: () => columns-3, cStep: 1,
    flip: (r,c) => [r+2, c+2] },
  { name: 'TR_BL', rStart: 0, rEnd: () => rows-3, rStep: 1, cStart: () => columns-3, cEnd: 0, cStep: -1,
    flip: (r,c) => [r+2, c] },
  { name: 'BL_TR', rStart: () => rows-3, rEnd: 0, rStep: -1, cStart: 0, cEnd: () => columns-3, cStep: 1,
    flip: (r,c) => [r, c+2] },
  { name: 'BR_TL', rStart: () => rows-3, rEnd: 0, rStep: -1, cStart: () => columns-3, cEnd: 0, cStep: -1,
    flip: (r,c) => [r, c] }
];
function breakAllMatches(patterns, exceptCoord = null, blacklistCells = new Set()) {
  let changed = false;
  for (const s of SWEEPS) {
    const rStart = typeof s.rStart === 'function' ? s.rStart() : s.rStart;
    const rEnd   = typeof s.rEnd   === 'function' ? s.rEnd()   : s.rEnd;
    const cStart = typeof s.cStart === 'function' ? s.cStart() : s.cStart;
    const cEnd   = typeof s.cEnd   === 'function' ? s.cEnd()   : s.cEnd;

    for (let r = rStart; s.rStep > 0 ? r <= rEnd : r >= rEnd; r += s.rStep) {
      for (let c = cStart; s.cStep > 0 ? c <= cEnd : c >= cEnd; c += s.cStep) {
        if (exceptCoord && r === exceptCoord.r && c === exceptCoord.c) continue;
        for (const pat of patterns) {
          if (patternMatchesAt(board, r, c, pat)) {
            const [fr, fc] = s.flip(r, c);
            const key = `${fr},${fc}`;
            if (!blacklistCells.has(key)) {
              board[fr][fc] ^= 1;
              changed = true;
            }
            break;
          }
        }
      }
    }
  }

  return changed;
}

function sanitizeBoard(correctPat, decoys, planted) {
  placePatternAt(board, planted.r, planted.c, correctPat);

  const blacklist = new Set();
  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      blacklist.add(`${planted.r + dr},${planted.c + dc}`);
    }
  }

  let guard = 0;
  while (guard++ < 5) {
    const changed = breakAllMatches(decoys, planted, blacklist);
    if(guard>2)
      console.log("IMPOSSIBLE");
    placePatternAt(board, planted.r, planted.c, correctPat);
    if (!changed) break;
  }
}

// =======================
// Timers
// =======================
function statusMessage(msg) { $status.textContent = msg; }

function updateTimersLoop() {
  timers.forEach(clearInterval);
  timers = [];
  timers.push(setInterval(() => {
    $streakTime.textContent = fmtTime(streakAccumMs);
    if (questionStart) $qTime.textContent = fmtTime(now() - questionStart);
  }, 200));
}

function setLocked(v) {
  locked = v;
  $optCanvases.forEach(cv => cv.classList.toggle('optDisabled', v));
}

function resetForWrongOrReveal() {
  streak = 0;
  streakAccumMs = 0;
  $streak.textContent = '0';
  $streakTime.textContent = fmtTime(0);
  setLocked(true);
}

// =======================
// Round start
// =======================
function newRound() {
  const rV = Math.max(8, Math.min(60, parseInt($rowsInput.value || '16', 16)));
  const cV = Math.max(8, Math.min(60, parseInt($colsInput.value || '9', 9)));
  if (rV != rows || cV != columns) {
    resetForWrongOrReveal();
  }
  rows = rV;
  columns = cV;

  clearTimeout(autoNextTimer);
  autoNextTimer = null;
  setLocked(false);
  $optCanvases.forEach(c => c.classList.remove('opt-correct', 'opt-wrong'));

  // Generate Options
  options = generateUniquePatterns(4, 4);
  correctIndex = Math.floor(Math.random() * 4);

  randomFillBoard();
  planted = {
    r: Math.floor(Math.random() * (rows - 2)),
    c: Math.floor(Math.random() * (columns - 2))
  };
  placePatternAt(board, planted.r, planted.c, options[correctIndex]);

  const decoys = options.filter((_, i) => i !== correctIndex);
  sanitizeBoard(options[correctIndex], decoys, planted);

  sizeBoardCanvasToFit();
  sizeAndDrawOptionCanvases();
  drawBoard(null);

  questionStart = now();
  $qTime.textContent = '00:00';
  statusMessage("Find the pattern");
  updateTimersLoop();
}

// =======================
// Handle choice
// =======================
function choose(i) {
  if (locked) return;
  const cv = $optCanvases[i];
  if (!cv) return;

  const isCorrect = (i === correctIndex);
  $optCanvases.forEach(c => c.classList.remove('opt-correct', 'opt-wrong'));

  if (isCorrect) {
    const qms = now() - questionStart;
    streakAccumMs += qms;
    $streakTime.textContent = fmtTime(streakAccumMs);

    cv.classList.add('opt-correct');
    statusMessage(`✅ Correct! Option ${i+1}.`);
    streak++;
    $streak.textContent = String(streak);

    setLocked(true);
    drawBoard('green');

    autoNextTimer = setTimeout(() => {
      cv.classList.remove('opt-correct');
      autoNextTimer = null;
      newRound();
    }, 500);
  } else {
    cv.classList.add('opt-wrong');
    $optCanvases[correctIndex].classList.add('opt-correct');
    statusMessage(`Wrong. It was ${correctIndex+1}.`);
    drawBoard('red');
    resetForWrongOrReveal();
  }
}

// =======================
// Keybinds and Buttons
// =======================
$optCanvases.forEach(cv => {
  cv.addEventListener('click', () => choose(parseInt(cv.dataset.idx, 10)));
});

window.addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '4') {
    e.preventDefault();
    choose(parseInt(e.key, 10) - 1);
  }
  if (e.key.toLowerCase() === 'r') {
    drawBoard('green');
    statusMessage(`Revealed answer: ${correctIndex+1}.`);
    resetForWrongOrReveal();
  }
});

$newGame.addEventListener('click', () => {
  statusMessage('New round.');
  newRound();
});
$reveal.addEventListener('click', () => {
  drawBoard('green');
  statusMessage(`Revealed answer: ${correctIndex+1}.`);
  resetForWrongOrReveal();
});

const $bwToggle = document.getElementById('bwToggle');
$bwToggle.addEventListener('change', () => {
  document.body.classList.toggle('bw', $bwToggle.checked);
  PALETTE = readPalette();
  gapPx   = PALETTE.gapPx;
  dotMin  = PALETTE.dotMin;
  sizeBoardCanvasToFit();
  sizeAndDrawOptionCanvases();
  drawBoard(null);
});


function refitAll() {
  sizeBoardCanvasToFit();
  sizeAndDrawOptionCanvases();
  drawBoard(null);
}
window.addEventListener('resize', refitAll);
window.addEventListener('load', refitAll);

const ro = new ResizeObserver(() => sizeAndDrawOptionCanvases());
ro.observe($optionsWrap);

// =======================
// Init
// =======================
(function init() {
  sizeAndDrawOptionCanvases();
  newRound();

})();
