// HUD bindings — update DOM elements from sim state on every frame.
import { computeScores } from '../sim/scoring.js';
import { updateSuppressionFill } from '../field/buildSuppressionUnit.js';
import { updateExtinguisherFill } from '../field/buildExtinguisher.js';
import { updateFireShieldFill } from '../field/buildFireShield.js';
import { COLORS } from '../field/dims.js';
import { pushScoreSample, drawScoreGraph, clearScoreHistory } from './scoreGraph.js';

const $ = (id) => document.getElementById(id);
const graphCanvas = document.getElementById('graph-canvas');

let lastHud = { red: -1, blue: -1, ext: -1, t: -1 };

function formatClock(secLeft) {
  const s = Math.max(0, secLeft);
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}

export function updateHud(state, t, totalSec, world) {
  const scores = computeScores(state);

  // Timer
  $('timer').textContent = formatClock(totalSec - t);
  $('phase').textContent = state.phase;

  // Scores
  $('red-score').textContent = scores.red;
  $('blue-score').textContent = scores.blue;
  $('red-supp').textContent = state.suppRed;
  $('blue-supp').textContent = state.suppBlue;
  $('red-mult').textContent = scores.redMult.toFixed(2);
  $('blue-mult').textContent = scores.blueMult.toFixed(2);
  $('red-partner').textContent = state.partnerClimbs.red;
  $('blue-partner').textContent = state.partnerClimbs.blue;
  $('red-coop').textContent = scores.coop;
  $('blue-coop').textContent = scores.coop;
  if ($('ext-count')) $('ext-count').textContent = state.ext;
  if ($('red-ext'))   $('red-ext').textContent   = state.ext;
  if ($('blue-ext'))  $('blue-ext').textContent  = state.ext;
  if ($('queue-red'))  $('queue-red').textContent  = state.shieldQueueRed  ?? 0;
  if ($('queue-blue')) $('queue-blue').textContent = state.shieldQueueBlue ?? 0;

  // Coopertition badge
  const coopEl = $('coop');
  if (scores.coop > 0) {
    coopEl.textContent = `Coopertition: +${scores.coop} (${scores.z3Count} in Z3)`;
    coopEl.classList.add('active');
  } else {
    coopEl.textContent = `Coop: ${scores.z3Count}/6 in Z3`;
    coopEl.classList.remove('active');
  }
  // Suppression / Extinguisher fill visuals
  if (state.suppRed !== lastHud.red) {
    updateSuppressionFill(world.suppression.red, state.suppRed);
    lastHud.red = state.suppRed;
  }
  if (state.suppBlue !== lastHud.blue) {
    updateSuppressionFill(world.suppression.blue, state.suppBlue);
    lastHud.blue = state.suppBlue;
  }
  if (state.ext !== lastHud.ext) {
    updateExtinguisherFill(world.extinguisher, state.ext);
    lastHud.ext = state.ext;
  }

  // Fire shield queue visuals
  const shieldQueueRed = state.shieldQueueRed ?? 0;
  const shieldQueueBlue = state.shieldQueueBlue ?? 0;
  updateFireShieldFill(world.fireShields.red,  shieldQueueRed,  '#' + COLORS.red.toString(16).padStart(6, '0'));
  updateFireShieldFill(world.fireShields.blue, shieldQueueBlue, '#' + COLORS.blue.toString(16).padStart(6, '0'));

  // Score graph
  pushScoreSample(t, state, scores);
  drawScoreGraph(graphCanvas);
}

export function resetHudCache() {
  lastHud = { red: -1, blue: -1, ext: -1, t: -1 };
  clearScoreHistory();
}
