import { MATCH, BRACE } from '../field/dims.js';

// Phase boundaries (seconds from match start).
export const PHASES = [
  { at: 0,    name: 'Pre-rush' },
  { at: 1,    name: 'Rush' },
  { at: 30,   name: 'Sustained Scoring' },
  { at: 90,   name: 'Position' },
  { at: 115,  name: 'Climb' },
  { at: 140,  name: 'Hold' },
];

export function getPhaseName(t) {
  let name = PHASES[0].name;
  for (const p of PHASES) {
    if (t >= p.at) name = p.name;
  }
  return name;
}

// Plan a list of scoring trips for one robot. Each trip is:
//   { t_start, t_at_ball, t_at_score, dest: 'supp'|'shield' }
//
// Robots cycle continuously until t_end. Trip duration grows slightly as the
// field thins out and balls are farther away. We add ~0.8s of slack after each
// trip to give the projectile arc time to land before the robot starts the
// next cycle from the goal area.
export function planTrips(t_start, t_end, alliance, robotIdx) {
  const trips = [];
  let t = t_start + robotIdx * 0.25 + (alliance === 'blue' ? 0.15 : 0);
  let i = 0;
  while (t < t_end - 4.5) {
    const phaseFrac = (t - t_start) / (t_end - t_start);
    const baseDur = 3.5 + phaseFrac * 2.0 + (Math.random() - 0.5) * 0.6;
    const t_at_ball = t + baseDur * 0.45;
    const t_at_score = t + baseDur;
    const dest = (i % 6 === 5) ? 'shield' : 'supp';
    trips.push({ t_start: t, t_at_ball, t_at_score, dest });
    t = t_at_score + 0.15;
    i++;
  }
  return trips;
}

// Climb is a single 3-robot unit. Per manual §3.5, a partner robot "fully
// supported indirectly" by the brace (via the anchor's mechanism) earns the
// anchor's zone for the multiplier AND a +25 partner-climb. So the optimal
// climb is: anchor goes up the brace with both partners latched on from the
// start, riding to Zone 3 as one chained unit.
//
// `frac` is the anchor's fractional position along the brace (0=low end,
// 1=high end). Z1 boundary ≈ 0.333, Z2 ≈ 0.667. `onGround` = true means the
// alliance is still walking toward the brace base.
export const Z_MID = {
  z1: 0.16,
  z2: 0.50,
  z3: 0.85,
};

// Robots do NOT start from the brace's lower end (24 cm — below the chassis):
// they walk to the spot beneath BRACE.attachFrac, where the climb hook can
// grab the brace at hook height (~85 cm) while still standing on the ground.
export const CLIMB = {
  unit: [
    { t: 113.0, frac: 0,                 onGround: true  },
    { t: 116.0, frac: BRACE.attachFrac,  onGround: true  }, // at attach XZ on ground, hook gripping brace
    { t: 117.5, frac: BRACE.attachFrac,  onGround: false }, // anchor lifts the unit off ground
    { t: 124.5, frac: Z_MID.z2,          onGround: false }, // through Z2
    { t: 129.0, frac: Z_MID.z3,          onGround: false }, // up to Z3
    { t: 150.0, frac: Z_MID.z3,          onGround: false },
  ],
};

export const MATCH_DURATION = MATCH.durationSec;
