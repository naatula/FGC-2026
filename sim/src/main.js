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
import { MATCH } from './field/dims.js';
import { PARAMS, MAX_ROBOTS, resetParams } from './sim/config.js';

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

// Create MAX_ROBOTS robot objects per alliance (inactive ones are parked below field).
const robots = {
  red:  Array.from({ length: MAX_ROBOTS }, (_, i) => makeRobot(`R${i + 1}`, 'red')),
  blue: Array.from({ length: MAX_ROBOTS }, (_, i) => makeRobot(`B${i + 1}`, 'blue')),
};
robots.red.forEach(r => scene.add(r.group));
robots.blue.forEach(r => scene.add(r.group));

const wildfire = makeWildfire(scene, extinguisher.spawnSlot);

const world = { robots, wildfire, suppression, extinguisher, fireShields, braces, humans, missPiles };
const scheduler = createScheduler(world);

initRobotList(PARAMS.robotCount.red, PARAMS.robotCount.blue);

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
function doRestart() {
  simTime = 0;
  playing = false;
  btnPlay.textContent = '▶ Play';
  scheduler.reset();
  resetHudCache();
}

btnPlay.addEventListener('click', () => {
  playing = !playing;
  btnPlay.textContent = playing ? '⏸ Pause' : '▶ Play';
  lastReal = performance.now();
});

btnRestart.addEventListener('click', doRestart);

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
  ['turnSpeed', (v) => String(v|0)],
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

// ---------- Role grid (dynamically built from current robot counts) ----------
function makeRoleSelect(side, idx) {
  const sel = document.createElement('select');
  sel.id = `role-${side}-${idx}`;
  for (const role of ['supp', 'shield', 'fault']) {
    const opt = document.createElement('option');
    opt.value = role;
    opt.textContent = role;
    sel.appendChild(opt);
  }
  sel.value = PARAMS.roles[side][idx] ?? 'supp';
  sel.addEventListener('change', () => { PARAMS.roles[side][idx] = sel.value; });
  return sel;
}

function buildRoleGrid() {
  const grid = document.getElementById('role-grid');
  grid.innerHTML = '';
  const maxCount = Math.max(PARAMS.robotCount.red, PARAMS.robotCount.blue);
  if (maxCount === 0) return;
  for (let i = 0; i < maxCount; i++) {
    const hasRed  = i < PARAMS.robotCount.red;
    const hasBlue = i < PARAMS.robotCount.blue;

    const rLabel = document.createElement('span');
    rLabel.className = 'rk';
    rLabel.style.color = hasRed ? 'var(--red)' : 'transparent';
    rLabel.textContent = hasRed ? `R${i + 1}` : '—';
    grid.appendChild(rLabel);

    grid.appendChild(hasRed ? makeRoleSelect('red', i) : document.createElement('span'));

    const bLabel = document.createElement('span');
    bLabel.className = 'rk';
    bLabel.style.color = hasBlue ? 'var(--blue)' : 'transparent';
    bLabel.textContent = hasBlue ? `B${i + 1}` : '—';
    grid.appendChild(bLabel);

    grid.appendChild(hasBlue ? makeRoleSelect('blue', i) : document.createElement('span'));
  }
}

function refreshCfgUI() {
  for (const [key, fmt] of SLIDER_KEYS) {
    const input = document.getElementById(`cfg-${key}`);
    const out = document.getElementById(`cfg-${key}-v`);
    if (!input || !out) continue;
    input.value = String(PARAMS[key]);
    out.textContent = fmt(PARAMS[key]);
  }
  // Robot count displays
  document.getElementById('cnt-red-val').textContent  = PARAMS.robotCount.red;
  document.getElementById('cnt-blue-val').textContent = PARAMS.robotCount.blue;
  // Rebuild role grid to match current counts
  buildRoleGrid();
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

// ---------- Robot count +/- buttons ----------
for (const side of ['red', 'blue']) {
  document.getElementById(`cnt-${side}-minus`).addEventListener('click', () => {
    if (PARAMS.robotCount[side] <= 0) return;
    PARAMS.robotCount[side]--;
    document.getElementById(`cnt-${side}-val`).textContent = PARAMS.robotCount[side];
    buildRoleGrid();
    initRobotList(PARAMS.robotCount.red, PARAMS.robotCount.blue);
    doRestart();
  });
  document.getElementById(`cnt-${side}-plus`).addEventListener('click', () => {
    if (PARAMS.robotCount[side] >= MAX_ROBOTS) return;
    PARAMS.robotCount[side]++;
    document.getElementById(`cnt-${side}-val`).textContent = PARAMS.robotCount[side];
    buildRoleGrid();
    initRobotList(PARAMS.robotCount.red, PARAMS.robotCount.blue);
    doRestart();
  });
}

document.getElementById('cfg-reset').addEventListener('click', () => {
  resetParams();
  refreshCfgUI();
  initRobotList(PARAMS.robotCount.red, PARAMS.robotCount.blue);
  doRestart();
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

  if (playing) {
    simTime += dtReal * speed;
    if (simTime >= MATCH.durationSec) {
      simTime = MATCH.durationSec;
      playing = false;
      btnPlay.textContent = '▶ Play';
    }
  }

  // Always step (so HUD updates on first frame and after restart)
  const state = scheduler.step(simTime);
  updateHud(state, simTime, MATCH.durationSec, world);

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
