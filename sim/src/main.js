import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { buildField } from './field/buildField.js';
import { buildSuppressionUnits } from './field/buildSuppressionUnit.js';
import { buildExtinguisher } from './field/buildExtinguisher.js';
import { buildTriangularLedge } from './field/buildTriangularLedge.js';
import { buildFireShields } from './field/buildFireShield.js';
import { buildBraces } from './field/buildBrace.js';
import { buildMissPiles } from './field/buildMissPiles.js';
import { makeRobot } from './entities/Robot.js';
import { makeWildfire } from './entities/Wildfire.js';
import { buildHumanPlayers } from './entities/HumanPlayer.js';
import { createScheduler } from './sim/scheduler.js';
import { initRobotList, updateHud, resetHudCache } from './ui/hud.js';
import { computeScores } from './sim/scoring.js';
import { MATCH } from './field/dims.js';
import { PARAMS, resetParams } from './sim/config.js';

// ---------- Three.js scaffolding ----------
const canvasRoot = document.getElementById('canvas-root');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(canvasRoot.clientWidth, canvasRoot.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;
canvasRoot.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a12);
scene.fog = new THREE.Fog(0x0a0a12, 18, 40);

const camera = new THREE.PerspectiveCamera(
  50, canvasRoot.clientWidth / canvasRoot.clientHeight, 0.1, 200
);
camera.position.set(6, 6, 8);
camera.lookAt(0, 1, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3;
controls.maxDistance = 20;
controls.maxPolarAngle = Math.PI / 2 - 0.05;

// Lighting
const hemi = new THREE.HemisphereLight(0xffffff, 0x222244, 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(6, 10, 4);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xa0c8ff, 0.4);
fill.position.set(-6, 4, -6);
scene.add(fill);

// ---------- Build the world ----------
buildField(scene);
const suppression = buildSuppressionUnits(scene);
const extinguisher = buildExtinguisher(scene);
buildTriangularLedge(scene);
const fireShields = buildFireShields(scene);
const braces = buildBraces(scene);
const humans = buildHumanPlayers(scene);
const missPiles = buildMissPiles(scene);

const robots = {
  red: [
    makeRobot('R1', 'red'),
    makeRobot('R2', 'red'),
    makeRobot('R3', 'red'),
  ],
  blue: [
    makeRobot('B1', 'blue'),
    makeRobot('B2', 'blue'),
    makeRobot('B3', 'blue'),
  ],
};
robots.red.forEach(r => scene.add(r.group));
robots.blue.forEach(r => scene.add(r.group));

const wildfire = makeWildfire(scene, extinguisher.spawnSlot);

const world = { robots, wildfire, suppression, extinguisher, fireShields, braces, humans, missPiles };
const scheduler = createScheduler(world);

initRobotList();

// ---------- Sim clock & playback controls ----------
let playing = false;
let simTime = 0;
let speed = 1.0;
let lastReal = performance.now();

const btnPlay = document.getElementById('btn-play');
const btnRestart = document.getElementById('btn-restart');
const speedSlider = document.getElementById('speed');
const speedVal = document.getElementById('speed-val');
const camSelect = document.getElementById('cam');
const matchOverEl = document.getElementById('match-over');
const btnRestartOver = document.getElementById('btn-restart-over');

function doRestart() {
  simTime = 0;
  playing = false;
  btnPlay.textContent = '▶ Play';
  matchOverEl.classList.remove('visible');
  scheduler.reset();
  resetHudCache();
}

function showMatchOver(scores) {
  document.getElementById('over-red').textContent  = scores.red;
  document.getElementById('over-blue').textContent = scores.blue;
  matchOverEl.classList.add('visible');
}

btnPlay.addEventListener('click', () => {
  playing = !playing;
  btnPlay.textContent = playing ? '⏸ Pause' : '▶ Play';
  lastReal = performance.now();
});

btnRestart.addEventListener('click', doRestart);
btnRestartOver.addEventListener('click', doRestart);

speedSlider.addEventListener('input', () => {
  speed = parseFloat(speedSlider.value);
  speedVal.textContent = speed.toFixed(1) + '×';
});

// Camera presets
const CAM_PRESETS = {
  orbit: { pos: [6, 6, 8],  target: [0, 1.0, 0],  orbit: true  },
  red:   { pos: [6.5, 1.8, 3.5], target: [0, 1.0, -2], orbit: false },
  blue:  { pos: [-6.5, 1.8, 3.5], target: [0, 1.0, -2], orbit: false },
  top:   { pos: [0, 12, 0.01], target: [0, 0, 0], orbit: false },
};
function applyCam(name) {
  const p = CAM_PRESETS[name];
  camera.position.set(...p.pos);
  controls.target.set(...p.target);
  controls.enabled = p.orbit;
  controls.update();
}
camSelect.addEventListener('change', () => applyCam(camSelect.value));

// ---------- Configurator wiring ----------
const SLIDER_KEYS = [
  ['driveSpeed', (v) => v.toFixed(1)],
  ['capacity', (v) => String(v|0)],
  ['shootInterval', (v) => v.toFixed(1)],
  ['transferInterval', (v) => v.toFixed(2)],
  ['humanInterval', (v) => v.toFixed(1)],
  ['pickupTime', (v) => v.toFixed(2)],
  ['avoidRadius', (v) => v.toFixed(2)],
  ['avoidStrength', (v) => v.toFixed(1)],
  ['robotAccuracy', (v) => String(v|0)],
  ['humanAccuracy', (v) => String(v|0)],
  ['ballFriction', (v) => v.toFixed(1)],
];

function refreshCfgUI() {
  for (const [key, fmt] of SLIDER_KEYS) {
    const input = document.getElementById(`cfg-${key}`);
    const out = document.getElementById(`cfg-${key}-v`);
    if (!input || !out) continue;
    input.value = String(PARAMS[key]);
    out.textContent = fmt(PARAMS[key]);
  }
  for (const side of ['red', 'blue']) {
    for (let i = 0; i < 3; i++) {
      const sel = document.getElementById(`role-${side}-${i}`);
      if (sel) sel.value = PARAMS.roles[side][i];
    }
  }
}

for (const [key, fmt] of SLIDER_KEYS) {
  const input = document.getElementById(`cfg-${key}`);
  const out = document.getElementById(`cfg-${key}-v`);
  if (!input || !out) continue;
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    PARAMS[key] = (key === 'capacity') ? (v|0) : v;
    out.textContent = fmt(PARAMS[key]);
  });
}

for (const side of ['red', 'blue']) {
  for (let i = 0; i < 3; i++) {
    const sel = document.getElementById(`role-${side}-${i}`);
    if (!sel) continue;
    sel.addEventListener('change', () => {
      PARAMS.roles[side][i] = sel.value;
    });
  }
}

document.getElementById('cfg-reset').addEventListener('click', () => {
  resetParams();
  refreshCfgUI();
});

const btnConfig = document.getElementById('btn-config');
const cfgPanel = document.getElementById('config-panel');
btnConfig.addEventListener('click', () => {
  cfgPanel.classList.toggle('open');
});

refreshCfgUI();

// ---------- Animation loop ----------
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dtReal = (now - lastReal) / 1000;
  lastReal = now;

  let matchJustEnded = false;
  if (playing) {
    simTime += dtReal * speed;
    if (simTime >= MATCH.durationSec) {
      simTime = MATCH.durationSec;
      playing = false;
      btnPlay.textContent = '▶ Play';
      matchJustEnded = true;
    }
  }

  // Always step (so HUD updates on first frame and after restart)
  const state = scheduler.step(simTime);
  updateHud(state, simTime, MATCH.durationSec, world);

  if (matchJustEnded) {
    showMatchOver(computeScores(state));
  }

  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  const w = canvasRoot.clientWidth;
  const h = canvasRoot.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

// Initial state visible on first paint
scheduler.step(0);
animate();

// Expose for debugging
window.__sim = { scheduler, world, scene, camera };
