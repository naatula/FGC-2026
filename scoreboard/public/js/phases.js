// Match phase boundaries, mirrored from ../sim/src/sim/timeline.js (2026 FGC
// Game Manual §3.5), assuming the standard 150s match length.
const PHASES = [
  { at: 0, name: 'Rush' },
  { at: 30, name: 'Sustained Scoring' },
  { at: 113, name: 'Positioning' },
  { at: 126, name: 'Climb' },
  { at: 139, name: 'Hold' },
];

export function getPhaseName(elapsedSec) {
  let name = PHASES[0].name;
  for (const p of PHASES) {
    if (elapsedSec >= p.at) name = p.name;
  }
  return name;
}
