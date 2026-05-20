// Implements the match scoring formula from §3.6 of the 2026 FGC Game Manual.
//
// regional_score = ceil(
//   suppression_balls × climb_multiplier
//   + partner_climbs × 25
//   + extinguisher_balls
//   + coopertition_bonus
// )

const ZONE_INCREMENTS = {
  '—': 0,
  'Contact': 0.05,
  'Z1': 0.10,
  'Z2': 0.20,
  'Z3': 0.30,
};

export function climbMultiplier(zones) {
  // zones = ['Z3', 'Z3', '—'] etc.
  return 1.0 + zones.reduce((s, z) => s + (ZONE_INCREMENTS[z] || 0), 0);
}

export function coopertitionBonus(redZones, blueZones) {
  const z3 = [...redZones, ...blueZones].filter(z => z === 'Z3').length;
  if (z3 >= 6) return 40;
  if (z3 >= 5) return 25;
  if (z3 >= 4) return 10;
  return 0;
}

export function regionalScore({ suppression, multiplier, partnerClimbs, extinguisher, coop }) {
  return Math.ceil(
    suppression * multiplier +
    partnerClimbs * 25 +
    extinguisher +
    coop
  );
}

export function computeScores(state) {
  const redMult = climbMultiplier(state.climbZones.red);
  const blueMult = climbMultiplier(state.climbZones.blue);
  const coop = coopertitionBonus(state.climbZones.red, state.climbZones.blue);
  const red = regionalScore({
    suppression: state.suppRed,
    multiplier: redMult,
    partnerClimbs: state.partnerClimbs.red,
    extinguisher: state.ext,
    coop,
  });
  const blue = regionalScore({
    suppression: state.suppBlue,
    multiplier: blueMult,
    partnerClimbs: state.partnerClimbs.blue,
    extinguisher: state.ext,
    coop,
  });
  return {
    red, blue,
    redMult, blueMult,
    coop,
    z3Count: [...state.climbZones.red, ...state.climbZones.blue]
              .filter(z => z === 'Z3').length,
  };
}
