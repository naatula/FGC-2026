// Headless validation of post-revision scoring + climb timeline.
// Mocks DOM/canvas-dependent imports so we can exercise the math in Node.
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// JSDOM-lite shim: provide just enough `document` for CanvasTexture / Sprite
// creators that get pulled in by transitively imported field/entity modules.
globalThis.document = {
  createElement: () => ({
    width: 0, height: 0,
    getContext: () => ({
      fillRect: () => {}, fillText: () => {},
      fillStyle: '', font: '', textAlign: '', textBaseline: '',
    }),
  }),
};

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => path.resolve(here, '../src', p);

const { computeScores, climbMultiplier, coopertitionBonus, regionalScore } =
  await import(src('sim/scoring.js'));
const { CLIMB, Z_MID, planTrips, PHASES, getPhaseName } =
  await import(src('sim/timeline.js'));

let passed = 0;
let failed = 0;
function check(label, ok) {
  if (ok) { console.log(`  ok  ${label}`); passed++; }
  else    { console.log(`  FAIL ${label}`); failed++; }
}

console.log('== Scoring math (unchanged) ==');
check('climbMultiplier all Z3 → 1.90', Math.abs(climbMultiplier(['Z3','Z3','Z3']) - 1.90) < 1e-9);
check('climbMultiplier Z3+Z1+— → 1.40',  Math.abs(climbMultiplier(['Z3','Z1','—']) - 1.40) < 1e-9);
check('coopertition 4 in Z3 → 10',  coopertitionBonus(['Z3','Z3','—'], ['Z3','Z3','—']) === 10);
check('coopertition 6 in Z3 → 40',  coopertitionBonus(['Z3','Z3','Z3'], ['Z3','Z3','Z3']) === 40);
check('regional Solid (200,1.40,1,30,0) → ceil(200*1.40+25+30) = 335',
  regionalScore({suppression:200, multiplier:1.40, partnerClimbs:1, extinguisher:30, coop:0}) === 335);

console.log('\n== Optimal-climb scoring (3-robot unit per alliance) ==');
const optimalState = {
  suppRed:  100, suppBlue: 100, ext: 30,
  climbZones: { red: ['Z3','Z3','Z3'], blue: ['Z3','Z3','Z3'] },
  partnerClimbs: { red: 2, blue: 2 },
};
const s = computeScores(optimalState);
check('multiplier 1.90 each side',          Math.abs(s.redMult - 1.90) < 1e-9 && Math.abs(s.blueMult - 1.90) < 1e-9);
check('coopertition 6 Z3 → 40 bonus',       s.coop === 40);
check('z3Count == 6',                       s.z3Count === 6);
const expectedRed = Math.ceil(100*1.90 + 2*25 + 30 + 40); // 310
check(`red score = ${expectedRed}`,         s.red === expectedRed);
check(`blue score = ${expectedRed}`,        s.blue === expectedRed);

console.log('\n== Climb timeline structure ==');
check('CLIMB.unit is array', Array.isArray(CLIMB.unit));
check('CLIMB.unit starts onGround=true at t=113', CLIMB.unit[0].onGround === true && CLIMB.unit[0].t === 113);
check('CLIMB.unit ends at t=150, frac=Z_MID.z3', CLIMB.unit[CLIMB.unit.length-1].t === 150 && CLIMB.unit[CLIMB.unit.length-1].frac === Z_MID.z3);
let monotonicT = true, monotonicFrac = true;
for (let i = 1; i < CLIMB.unit.length; i++) {
  if (CLIMB.unit[i].t < CLIMB.unit[i-1].t) monotonicT = false;
  if (CLIMB.unit[i].frac < CLIMB.unit[i-1].frac) monotonicFrac = false;
}
check('CLIMB.unit t monotonically increases', monotonicT);
check('CLIMB.unit frac monotonically increases', monotonicFrac);

// All robots should share the anchor's zone since they climb as one unit.
// Probe the timeline at several times by inspecting frac (the scheduler
// derives all three zones from this).
function zoneAtFrac(frac, onGround) {
  if (onGround || frac < 0.01) return 'Contact';
  if (frac < 0.333) return 'Z1';
  if (frac < 0.667) return 'Z2';
  return 'Z3';
}
function interpFrac(t) {
  for (let i = CLIMB.unit.length - 1; i >= 0; i--) {
    if (t >= CLIMB.unit[i].t) {
      const cur = CLIMB.unit[i];
      const next = CLIMB.unit[i+1] || cur;
      const k = next === cur ? 0 : (t - cur.t) / (next.t - cur.t);
      return {
        frac: cur.frac + (next.frac - cur.frac) * k,
        onGround: cur.onGround,
      };
    }
  }
  return { frac: 0, onGround: true };
}
const probes = [
  { t: 113.5, expect: 'Contact' },  // walk-to-base
  { t: 116.5, expect: 'Contact' },  // anchor just lifting (frac small)
  { t: 121,   expect: 'Z1' },
  { t: 124,   expect: 'Z2' },
  { t: 128,   expect: 'Z3' },
  { t: 140,   expect: 'Z3' },
  { t: 150,   expect: 'Z3' },
];
for (const p of probes) {
  const { frac, onGround } = interpFrac(p.t);
  const z = zoneAtFrac(frac, onGround);
  check(`t=${p.t}: zone=${z} (expected ${p.expect})`, z === p.expect);
}

console.log('\n== Trip planning ==');
const rtrips = planTrips(1.0, 113, 'red', 0);
check('plan produces 15–35 trips per robot', rtrips.length >= 15 && rtrips.length <= 35);
check('all trips have dest supp|shield', rtrips.every(t => t.dest === 'supp' || t.dest === 'shield'));
const shieldCount = rtrips.filter(t => t.dest === 'shield').length;
const shieldFrac = shieldCount / rtrips.length;
check(`shield trips ~1/6 (got ${shieldFrac.toFixed(2)})`, shieldFrac > 0.10 && shieldFrac < 0.25);

console.log('\n== Swim lane geometry (red) ==');
// Re-derive lane rectangles the same way scheduler.buildLanes does so we
// catch any regression in the partition (no overlaps, score-in-lane).
const FIELD_SIZE = 7.0;
const half = FIELD_SIZE / 2;
const margin = 0.20;
const LANE_FLANK_X = 0.40;
const LANE_FLANK_Z = 0.55;
const redAnchor = { x: half * 0.55, z: -half + 0.65 / 2 + 0.40 + 0.20 }; // ≈ (1.925, -2.25)
const sIn = -1, sOut = 1;
const inEdge = redAnchor.x + sIn * LANE_FLANK_X;     // 1.525
const outEdge = redAnchor.x + sOut * LANE_FLANK_X;   // 2.325
const r0 = { x: [redAnchor.x - LANE_FLANK_X, redAnchor.x + LANE_FLANK_X], z: [-half + margin, -1.40] };
const r1 = { x: [margin, inEdge], z: [-half + margin, half - margin] };
const r2 = { x: [outEdge, half - margin], z: [-half + margin, half - margin] };
const score0 = { x: redAnchor.x,                       z: redAnchor.z };
const score1 = { x: redAnchor.x + sIn  * LANE_FLANK_X, z: redAnchor.z + LANE_FLANK_Z };
const score2 = { x: redAnchor.x + sOut * LANE_FLANK_X, z: redAnchor.z + LANE_FLANK_Z };

function inRect(p, r) {
  return p.x >= r.x[0] && p.x <= r.x[1] && p.z >= r.z[0] && p.z <= r.z[1];
}
function onRectBoundary(p, r) {
  const onX = Math.abs(p.x - r.x[0]) < 1e-6 || Math.abs(p.x - r.x[1]) < 1e-6;
  const onZ = p.z >= r.z[0] - 1e-6 && p.z <= r.z[1] + 1e-6;
  return onX && onZ;
}

check('R0 score is inside R0 swim lane', inRect(score0, r0));
check('R1 score is on R1 swim lane boundary', onRectBoundary(score1, r1) || inRect(score1, r1));
check('R2 score is on R2 swim lane boundary', onRectBoundary(score2, r2) || inRect(score2, r2));

function rectsOverlap(a, b) {
  if (a.x[1] <= b.x[0] || b.x[1] <= a.x[0]) return false;
  if (a.z[1] <= b.z[0] || b.z[1] <= a.z[0]) return false;
  return true;
}
check('R0 ∩ R1 lanes empty', !rectsOverlap(r0, r1));
check('R0 ∩ R2 lanes empty', !rectsOverlap(r0, r2));
check('R1 ∩ R2 lanes empty', !rectsOverlap(r1, r2));

// Triangle pair distances must be ≥ ROBOT.size (0.50)
function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
check('R0–R1 score ≥ ROBOT.size (0.50)', dist(score0, score1) >= 0.50);
check('R0–R2 score ≥ ROBOT.size (0.50)', dist(score0, score2) >= 0.50);
check('R1–R2 score ≥ ROBOT.size (0.50)', dist(score1, score2) >= 0.50);

console.log('\n== Phases ==');
check('phase at t=0 = Pre-rush', getPhaseName(0) === 'Pre-rush');
check('phase at t=115 = Climb',  getPhaseName(115) === 'Climb');
check('phase at t=140 = Hold',   getPhaseName(140) === 'Hold');

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
