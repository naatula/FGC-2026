import { connect, fmtClock } from './ws.js';
import { unlockAudio, playStartTone, playStopTone, playEndTone } from './audio.js';

const $ = (id) => document.getElementById(id);
const setup = $('setup');
const board = $('board');
const tapHint = $('tap-hint');

const socket = connect();
let joined = false;
let activeCode = null; // room code once joined/created — used to rejoin after a dropped connection

// If the socket reconnects (network blip, backgrounded tab, phone sleep),
// silently rejoin the same room instead of leaving the page stuck showing
// stale state. Sending 'joinRoom' again (never 'createRoom') is what keeps
// us in the same match rather than spawning a new one.
socket.on('open', () => {
  if (activeCode) socket.send({ type: 'joinRoom', code: activeCode, role: 'display' });
});

$('btn-new').addEventListener('click', () => {
  socket.send({ type: 'createRoom' });
});

$('btn-join').addEventListener('click', () => {
  const code = $('code-input').value.trim().toUpperCase();
  if (code.length !== 4) {
    $('error').textContent = 'Enter the 4-character match code.';
    return;
  }
  socket.send({ type: 'joinRoom', code, role: 'display' });
});

socket.on('joined', ({ state }) => {
  joined = true;
  activeCode = state.code;
  setup.hidden = true;
  board.hidden = false;
  localStorage.setItem('fgc-display-code', state.code);
  render(state);
});

socket.on('state', ({ state }) => {
  if (!joined) return;
  render(state);
});

socket.on('matchStart', () => playStartTone());
socket.on('matchStop', () => playStopTone());
socket.on('matchEnd', () => playEndTone());

socket.on('error', ({ message }) => {
  $('error').textContent = message;
  if (joined) {
    // The room vanished server-side (e.g. a server restart) while we were
    // trying to silently rejoin it — surface the setup screen again instead
    // of leaving the board frozen on stale data with no visible feedback.
    joined = false;
    activeCode = null;
    board.hidden = true;
    setup.hidden = false;
  }
});

function render(state) {
  $('join-code').textContent = state.code;
  const { displays, remotes } = state.viewers;
  $('viewer-count').textContent = `${displays} screen${displays === 1 ? '' : 's'} · ${remotes} remote${remotes === 1 ? '' : 's'} connected`;

  const timerEl = $('timer');
  timerEl.textContent = fmtClock(state.remainingMs);
  timerEl.className = 'timer' + (state.phase === 'running' ? ' running' : '') + (state.phase === 'ended' ? ' ended' : '');

  setScoreText($('red-score'), state.scores.red);
  setScoreText($('blue-score'), state.scores.blue);

  $('red-detail').textContent = detailLine(state.red, state.scores.redMult, state.scores.partnerClimbsRed, state.ext);
  $('blue-detail').textContent = detailLine(state.blue, state.scores.blueMult, state.scores.partnerClimbsBlue, state.ext);

  $('coop-line').textContent = state.scores.coop > 0
    ? `Coopertition bonus +${state.scores.coop} (Z3 x${state.scores.z3Count})`
    : `Extinguisher: ${state.ext}`;
}

function detailLine(alliance, mult, partnerClimbs, ext) {
  const zoneStr = alliance.climb.map((i) => ['—','C','Z1','Z2','Z3'][i]).join(' / ');
  return `Suppression ${alliance.supp} × ${mult.toFixed(2)}  ·  Climb ${zoneStr}  ·  Partner +${partnerClimbs * 25}  ·  Ext ${ext}`;
}

// The score digits are huge by design (see .alliance-score), sized off
// viewport width so they read from across a room. But a viewport-width-only
// size has no idea how many digits it's rendering — once a score climbs
// past two digits (or the window gets narrow/tall), the number can outgrow
// its column and push the whole page into horizontal scroll. Rather than
// hardcode a digit-count breakpoint, measure the actual rendered width
// after every change and shrink the font just enough to fit.
function setScoreText(el, value) {
  const text = String(value);
  if (el.textContent === text) return;
  el.textContent = text;
  fitScoreText(el);
}

const MIN_SCORE_FONT_PX = 32;

function fitScoreText(el) {
  const panel = el.parentElement;
  if (!panel) return;
  // Clear any earlier shrink first so we measure against the CSS default
  // (clamp) size — otherwise a score that goes back down (e.g. after a
  // reset) would stay shrunk forever.
  el.style.fontSize = '';
  const available = panel.clientWidth;
  const natural = el.scrollWidth;
  if (!available || natural <= available) return;
  const currentPx = parseFloat(getComputedStyle(el).fontSize);
  const fitted = Math.floor(currentPx * (available / natural) * 0.96);
  el.style.fontSize = `${Math.max(MIN_SCORE_FONT_PX, fitted)}px`;
}

let resizeRaf = null;
window.addEventListener('resize', () => {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = null;
    fitScoreText($('red-score'));
    fitScoreText($('blue-score'));
  });
});

// Pre-fill the join field with this screen's last match code for convenience
// after a refresh.
const lastCode = localStorage.getItem('fgc-display-code');
if (lastCode) $('code-input').value = lastCode;

function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
      if (req) req.call(el);
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
      if (exit) exit.call(document);
    }
  } catch {
    // Fullscreen unsupported or blocked — not fatal, ignore.
  }
}

let wakeLock = null;
async function requestWakeLock() {
  if (!('wakeLock' in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch {
    wakeLock = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestWakeLock();
});

// No blocking prompt — the board shows immediately. A small hint on the
// edge (see server.html/#tap-hint) tells the operator that tapping the
// screen unlocks sound and goes fullscreen; the first tap does all three
// (audio needs a gesture too), and it fades away once used.
board.addEventListener('click', () => {
  unlockAudio();
  toggleFullscreen();
  requestWakeLock();
  tapHint.classList.add('gone');
});
