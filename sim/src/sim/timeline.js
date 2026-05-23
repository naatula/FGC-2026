import { MATCH, BRACE } from '../field/dims.js';

// Key match time boundaries (seconds). Exported so scheduler.js and validate.mjs
// can import them directly — no more hand-duplicated magic numbers.
export const SCORING_END   = 113.0; // robots stop scoring, begin walk to brace
export const CLIMB_WALK_END = 126.0; // walk ends, hook grips brace, liftoff at 127.5
export const HOLD_START     = 139.0; // Z3 reached, all robots hold to match end

// Phase boundaries (seconds from match start).
// Derived from the exported constants above so they never drift.
export const PHASES = [
  { at: 0,              name: 'Rush' },              // balls scatter, robots charge
  { at: 30,             name: 'Sustained Scoring' }, // field thinning, steady cycle
  { at: SCORING_END,    name: 'Positioning' },       // scoring stops, walk to brace
  { at: CLIMB_WALK_END, name: 'Climb' },             // hook on, liftoff at 127.5
  { at: HOLD_START,     name: 'Hold' },              // Z3 reached, hold to match end
];

export function getPhaseName(t) {
  let name = PHASES[0].name;
  for (const p of PHASES) {
    if (t >= p.at) name = p.name;
  }
  return name;
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
    { t: 126.0, frac: BRACE.attachFrac,  onGround: true  }, // at attach XZ on ground, hook gripping brace (+ 10s precision delay)
    { t: 127.5, frac: BRACE.attachFrac,  onGround: false }, // anchor lifts the unit off ground
    { t: 134.5, frac: Z_MID.z2,          onGround: false }, // through Z2
    { t: 139.0, frac: Z_MID.z3,          onGround: false }, // up to Z3
    { t: 150.0, frac: Z_MID.z3,          onGround: false },
  ],
};

export const MATCH_DURATION = MATCH.durationSec;
