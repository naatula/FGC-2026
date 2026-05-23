# Sim improvement todo

## Correctness
- [x] **#1 Link SCORING_END / CLIMB_WALK_END as shared constants** — `SCORING_END=113` and `CLIMB_WALK_END=126` are hardcoded in `scheduler.js`; the phase boundaries in `timeline.js` and `validate.mjs` repeat the same numbers by hand. Export them from `timeline.js` and import into `scheduler.js` and `validate.mjs`.
- [x] **#2 Retire `planTrips` or integrate it** — exported from `timeline.js`, tested in `validate.mjs`, but never called by the scheduler. Either delete it and its validate tests, or wire it into the scheduler so the tests reflect real behavior.
- [x] **#3 Verify / fix extinguisher scoring** — `state.ext` is a single counter shared by both alliances; `computeScores` passes it to both red and blue `regionalScore`. Check game manual: if it's truly shared, clarify in code and UI; if per-alliance, split into `extRed`/`extBlue`.

## Dead code
- [x] **#4 Remove `stuckTimer`** — initialized in `makeRobotState` and cleared in `reset()` but never read or written elsewhere. Delete the field.
- [x] **#5 Remove `carryBall` mesh and `setRobotCarrying`** — `setRobotCarrying` is always called with `false`; the `carryBall` mesh is permanently hidden. The numeric badge covers the visual. Delete the mesh, the setter, all call sites, and fix the stale comment in `Wildfire.js`.
- [x] **#6 Remove dead `pickClosestFieldBall` / `pickClosestFieldBallInZone` exports** — exported from `Wildfire.js` but never imported anywhere in production code. Scheduler has its own `pickBallNoConflict`. Delete them.

## Visual quality
- [ ] **#7 Add robot heading rotation** — robots never rotate toward their direction of travel. Add `robot.group.rotation.y = Math.atan2(dx, dz)` in `updateRobot` based on the vector to the robot's current target.
- [ ] **#8 Fix partner climb elevation** — during climb, partners are placed at `y = Math.max(0, anchorPos.y)`, floating at the same height as the anchor. Apply a small downward offset so they appear physically latched below/beside the anchor rather than floating alongside it.
- [ ] **#9 Add role visual indicator on robots** — `supp`, `shield`, and `fault` robots are visually identical. Add a small colored stripe or letter overlay so viewers can identify roles at a glance.
- [ ] **#10 Add end-of-match overlay** — when `simTime >= MATCH.durationSec` the sim silently halts. Add a "MATCH OVER" overlay showing final scores and a prompt to restart.

## Performance / code quality
- [ ] **#11 Spatial hash for ball-ball physics** — `stepBallPhysics` checks all O(n²) = 124,750 pairs of 500 balls every tick. A simple fixed-cell spatial grid reduces this to ~O(n) average.
- [ ] **#12 Replace 2,500 pre-allocated fill meshes** — suppression units, extinguisher, and fire shields each pre-create 500 invisible sphere meshes for fill visualization (2,500 total). Replace with a small proxy pool (≤50 spheres) scaled by fill fraction.
- [ ] **#13 Extract shared badge utility** — `makeCountSprite` / `paintCountBadge` is copy-pasted verbatim across `buildSuppressionUnit.js`, `buildFireShield.js`, `buildExtinguisher.js`, and `Robot.js`. Extract to `src/ui/badge.js`.
