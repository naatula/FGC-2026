import { connect, fmtClock } from './ws.js';

const $ = (id) => document.getElementById(id);
const setup = $('setup');
const remote = $('remote');

const socket = connect();
let currentState = null;
let activeCode = null; // room code once joined — used to silently rejoin after a dropped connection

const savedCode = localStorage.getItem('fgc-remote-code');
if (savedCode) $('code-input').value = savedCode;

$('btn-join').addEventListener('click', join);
$('code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

function join() {
  const code = $('code-input').value.trim().toUpperCase();
  if (code.length !== 4) {
    $('error').textContent = 'Enter the 4-character match code.';
    return;
  }
  socket.send({ type: 'joinRoom', code, role: 'remote' });
}

// If the socket reconnects (network blip, backgrounded tab, phone sleep),
// silently rejoin the same room instead of leaving the remote stuck showing
// stale state with dead buttons.
socket.on('open', () => {
  if (activeCode) socket.send({ type: 'joinRoom', code: activeCode, role: 'remote' });
});

socket.on('joined', ({ state }) => {
  activeCode = state.code;
  localStorage.setItem('fgc-remote-code', state.code);
  setup.hidden = true;
  remote.hidden = false;
  buildSteppers(state);
  render(state);
});

socket.on('state', ({ state }) => {
  currentState = state;
  render(state);
});

socket.on('error', ({ message }) => {
  $('error').textContent = message;
  if (activeCode) {
    // The room vanished server-side while we were trying to silently
    // rejoin it — surface the setup screen again instead of leaving the
    // remote frozen on stale data with no visible feedback.
    activeCode = null;
    remote.hidden = true;
    setup.hidden = false;
  }
});

$('btn-start').addEventListener('click', () => socket.send({ type: 'start' }));
$('btn-stop').addEventListener('click', () => socket.send({ type: 'stop' }));
$('btn-reset').addEventListener('click', () => {
  if (confirm('Reset timer and all scores for this match?')) socket.send({ type: 'reset' });
});
$('btn-set-duration').addEventListener('click', () => {
  const seconds = Number($('duration-input').value);
  if (seconds > 0) socket.send({ type: 'setDuration', seconds });
});

function buildSteppers(state) {
  const suppContainer = $('supp-rows');
  suppContainer.innerHTML = '';
  suppContainer.appendChild(dualRow('Balls scored', 'supp'));

  const climbContainer = $('climb-rows');
  climbContainer.innerHTML = '';
  state.climbSlots.forEach((label, slot) => {
    climbContainer.appendChild(dualRow(label, 'climb', slot));
  });

  bindDualClicks();
}

function dualRow(label, field, slot) {
  const row = document.createElement('div');
  row.className = 'dual-row';
  row.dataset.field = field;
  if (slot !== undefined) row.dataset.slot = slot;
  row.innerHTML = `
    <div class="row-label">${label}</div>
    <div class="dual-sides">
      <div class="dual-side red">
        <button class="step-btn sm minus" data-alliance="red" data-delta="-1">−</button>
        <div class="dual-value" data-role="value">0</div>
        <button class="step-btn sm plus" data-alliance="red" data-delta="1">+</button>
      </div>
      <div class="dual-side blue">
        <button class="step-btn sm minus" data-alliance="blue" data-delta="-1">−</button>
        <div class="dual-value" data-role="value">0</div>
        <button class="step-btn sm plus" data-alliance="blue" data-delta="1">+</button>
      </div>
    </div>`;
  return row;
}

function bindDualClicks() {
  document.querySelectorAll('.dual-row .dual-side button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.dual-row');
      socket.send({
        type: 'adjust',
        alliance: btn.dataset.alliance,
        field: row.dataset.field,
        slot: row.dataset.slot !== undefined ? Number(row.dataset.slot) : undefined,
        delta: Number(btn.dataset.delta),
      });
    });
  });
}

document.querySelectorAll('.shared-card .step-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    socket.send({ type: 'adjust', alliance: btn.dataset.alliance, field: btn.dataset.field, delta: Number(btn.dataset.delta) });
  });
});

function render(state) {
  $('join-code').textContent = state.code;
  const { displays, remotes } = state.viewers;
  $('viewer-count').textContent = `${displays} screen${displays === 1 ? '' : 's'} · ${remotes} remote${remotes === 1 ? '' : 's'}`;

  $('timer').textContent = fmtClock(state.remainingMs);
  $('btn-start').disabled = state.phase === 'running';
  $('btn-stop').disabled = state.phase !== 'running';

  if (document.activeElement !== $('duration-input')) {
    $('duration-input').value = state.duration;
  }
  $('duration-input').disabled = state.phase === 'running';
  $('btn-set-duration').disabled = state.phase === 'running';

  $('red-score').textContent = state.scores.red;
  $('blue-score').textContent = state.scores.blue;
  $('ext-value').textContent = state.ext;

  document.querySelectorAll('#supp-rows .dual-row, #climb-rows .dual-row').forEach((row) => {
    const field = row.dataset.field;
    const redVal = row.querySelector('.dual-side.red [data-role="value"]');
    const blueVal = row.querySelector('.dual-side.blue [data-role="value"]');
    if (field === 'supp') {
      redVal.textContent = state.red.supp;
      blueVal.textContent = state.blue.supp;
    } else if (field === 'climb') {
      const slot = Number(row.dataset.slot);
      redVal.textContent = state.zones[state.red.climb[slot]];
      blueVal.textContent = state.zones[state.blue.climb[slot]];
    }
  });
}
