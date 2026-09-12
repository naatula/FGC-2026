import { connect, fmtClock } from './ws.js';

const $ = (id) => document.getElementById(id);
const setup = $('setup');
const remote = $('remote');

const socket = connect();
let currentState = null;

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

socket.on('joined', ({ state }) => {
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
  for (const alliance of ['red', 'blue']) {
    const container = $(`${alliance}-steppers`);
    container.innerHTML = '';
    container.appendChild(stepperRow('Suppression balls', alliance, 'supp'));
    state.climbSlots.forEach((label, slot) => {
      container.appendChild(stepperRow(label + ' climb', alliance, 'climb', slot));
    });
  }
  container_bindClicks();
}

function stepperRow(label, alliance, field, slot) {
  const row = document.createElement('div');
  row.className = 'stepper-row';
  row.dataset.alliance = alliance;
  row.dataset.field = field;
  if (slot !== undefined) row.dataset.slot = slot;
  row.innerHTML = `
    <div class="stepper-label">
      <div class="name">${label}</div>
      <div class="value" data-role="value">0</div>
    </div>
    <div class="stepper-btns">
      <button class="step-btn minus" data-delta="-1">−</button>
      <button class="step-btn plus" data-delta="1">+</button>
    </div>`;
  return row;
}

function container_bindClicks() {
  document.querySelectorAll('.alliances-grid .stepper-btns button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.stepper-row');
      socket.send({
        type: 'adjust',
        alliance: row.dataset.alliance,
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

  for (const alliance of ['red', 'blue']) {
    const container = $(`${alliance}-steppers`);
    container.querySelectorAll('.stepper-row').forEach((row) => {
      const field = row.dataset.field;
      const valueEl = row.querySelector('[data-role="value"]');
      if (field === 'supp') {
        valueEl.textContent = state[alliance].supp;
      } else if (field === 'climb') {
        const slot = Number(row.dataset.slot);
        valueEl.textContent = state.zones[state[alliance].climb[slot]];
      }
    });
  }
}
