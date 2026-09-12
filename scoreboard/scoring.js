// Regional scoring formula per §3.6 of the 2026 FGC Game Manual — mirrors the
// logic in ../sim/src/sim/scoring.js so the live scoreboard agrees with the
// simulator. Kept as an independent copy on purpose: this app deploys as a
// standalone service and should not depend on the sim's source tree.

export const ZONES = ['—', 'Ct', 'Z1', 'Z2', 'Z3'];
const ZONE_INCREMENT = [0, 0.05, 0.10, 0.20, 0.30];

// Each alliance climbs as one anchor + up to two partner robots on the brace.
export const CLIMB_SLOTS = ['Anchor', 'Partner 1', 'Partner 2'];

function climbMultiplier(zoneIdxs) {
  return 1.0 + zoneIdxs.reduce((s, i) => s + (ZONE_INCREMENT[i] || 0), 0);
}

function partnerClimbCount(zoneIdxs) {
  // Slot 0 is the anchor; slots 1-2 are partners. A partner "climbs" (earns
  // the flat +25) whenever it reaches any zone above the field (idx > 0).
  return zoneIdxs.slice(1).filter((i) => i > 0).length;
}

function coopertitionBonus(redZoneIdxs, blueZoneIdxs) {
  const z3Count = [...redZoneIdxs, ...blueZoneIdxs].filter((i) => i === 4).length;
  if (z3Count >= 6) return 40;
  if (z3Count >= 5) return 25;
  if (z3Count >= 4) return 10;
  return 0;
}

export function computeScores(room) {
  const redMult = climbMultiplier(room.red.climb);
  const blueMult = climbMultiplier(room.blue.climb);
  const coop = coopertitionBonus(room.red.climb, room.blue.climb);
  const partnerClimbsRed = partnerClimbCount(room.red.climb);
  const partnerClimbsBlue = partnerClimbCount(room.blue.climb);

  const red = Math.ceil(room.red.supp * redMult + partnerClimbsRed * 25 + room.ext + coop);
  const blue = Math.ceil(room.blue.supp * blueMult + partnerClimbsBlue * 25 + room.ext + coop);

  const z3Count = [...room.red.climb, ...room.blue.climb].filter((i) => i === 4).length;

  return {
    red,
    blue,
    redMult,
    blueMult,
    partnerClimbsRed,
    partnerClimbsBlue,
    coop,
    z3Count,
  };
}
