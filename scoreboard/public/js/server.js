import { connect, fmtClock } from './ws.js';
import { unlockAudio, playStartTone, playEndTone } from './audio.js';

const $ = (id) => document.getElementById(id);
const setup = $('setup');
const soundGate = $('sound-gate');
const board = $('board');

const socket = connect();
let joined = false;

$('btn-new').addEventListener('click', () => {
  showSoundGate(() => socket.send({ type: 'createRoom' }));
});

$('btn-join').addEventListener('click', () => {
  const code = $('code-input').value.trim().toUpperCase();
  if (code.length !== 4) {
    $('error').textContent = 'Enter the 4-character match code.';
    return;
  }
  showSoundGate(() => socket.send({ type: 'joinRoom', code, role: 'display' }));
});

function showSoundGate(afterUnlock) {
  soundGate.hidden = false;
  $('btn-enable-sound').onclick = () => {
    unlockAudio();
    soundGate.hidden = true;
    afterUnlock();
  };
}

socket.on('joined', ({ state }) => {
  joined = true;
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
socket.on('matchEnd', () => playEndTone());

socket.on('error', ({ message }) => {
  $('error').textContent = message;
});

function render(state) {
  $('join-code').textContent = state.code;
  const { displays, remotes } = state.viewers;
  $('viewer-count').textContent = `${displays} screen${displays === 1 ? '' : 's'} · ${remotes} remote${remotes === 1 ? '' : 's'} connected`;

  const timerEl = $('timer');
  timerEl.textContent = fmtClock(state.remainingMs);
  timerEl.className = 'timer' + (state.phase === 'running' ? ' running' : '') + (state.phase === 'ended' ? ' ended' : '');

  $('red-score').textContent = state.scores.red;
  $('blue-score').textContent = state.scores.blue;

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

// Pre-fill the join field with this screen's last match code for convenience
// after a refresh (still requires a tap, which is what unlocks audio).
const lastCode = localStorage.getItem('fgc-display-code');
if (lastCode) $('code-input').value = lastCode;

// Tapping the venue screen goes fullscreen and keeps the display awake —
// this page is meant to sit untouched on a TV/monitor for the whole event.
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

board.addEventListener('click', () => {
  toggleFullscreen();
  requestWakeLock();
});
