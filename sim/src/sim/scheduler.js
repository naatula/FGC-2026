import * as THREE from 'three';
import {
  WILDFIRE, FIELD, ROBOT,
  SUPPRESSION, EXTINGUISHER, BRACE,
} from '../field/dims.js';
import { CLIMB, getPhaseName, SCORING_END, CLIMB_WALK_END } from './timeline.js';
import { pointOnBrace } from '../field/buildBrace.js';
import {
  setRobotPosition, setRobotHeading, setRobotRole, setAnchor, setCarryCount,
} from '../entities/Robot.js';
import { setGateOpen } from '../field/buildFireShield.js';
import { updateMissPileFill } from '../field/buildMissPiles.js';
import { PARAMS } from './config.js';
import { buildStaticObstacles, steer } from './steering.js';
import { pushBallsFromRobot, stepBallPhysics } from './ballPhysics.js';

// State-machine scheduler. Each robot has a `role` (supp|shield), drives
// itself via a phase machine (toPickup → pickingUp → toScore → expelling),
// reads its tuning from PARAMS each tick, and integrates motion with the
// real frame dt. Climb / human-throw flows live alongside.


const LANE_FLANK_X = 0.40;
const LANE_FLANK_Z = 0.55;

function easeInOut(x) { return x < 0.5 ? 2*x*x : 1 - Math.pow(-2*x + 2, 2)/2; }
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(x) { return Math.max(0, Math.min(1, x)); }

function arcAt(out, p0, p1, arcH, k) {
  out.x = lerp(p0.x, p1.x, k);
  out.y = lerp(p0.y, p1.y, k) + Math.sin(k * Math.PI) * arcH;
  out.z = lerp(p0.z, p1.z, k);
}

function findSegment(frames, t) {
  for (let i = frames.length - 1; i >= 0; i--) {
    if (t >= frames[i].t) {
      const cur = frames[i];
      const next = frames[i + 1] || cur;
      const dur = Math.max(1e-6, next.t - cur.t);
      const k = clamp01((t - cur.t) / dur);
      return { cur, next, k };
    }
  }
  return { cur: frames[0], next: frames[0], k: 0 };
}

export function createScheduler(world) {
  const {
    robots, wildfire, suppression, extinguisher, fireShields, braces, humans, missPiles,
  } = world;

  const anchorRed = robots.red[0];
  const anchorBlue = robots.blue[0];
  setAnchor(anchorRed, true);
  setAnchor(anchorBlue, true);

  const half = FIELD.size / 2;
  const startPositions = {
    red: [
      new THREE.Vector3(half - 0.30, 0, -1.5),
      new THREE.Vector3(half - 0.30, 0,  0.0),
      new THREE.Vector3(half - 0.30, 0,  1.5),
    ],
    blue: [
      new THREE.Vector3(-half + 0.30, 0, -1.5),
      new THREE.Vector3(-half + 0.30, 0,  0.0),
      new THREE.Vector3(-half + 0.30, 0,  1.5),
    ],
  };

  // Walk target = XZ projection of the brace at the attach point (NOT the
  // brace's lower end, which is below the chassis). hangBelow is sized so the
  // anchor sits exactly on the ground (group.y = 0) at the attach frac and
  // rises with the brace as it climbs.
  const climbHangBelow =
    BRACE.lowEnd + BRACE.attachFrac * (BRACE.highEnd - BRACE.lowEnd);
  function attachXZ(brace) {
    const p = pointOnBrace(brace, BRACE.attachFrac, climbHangBelow);
    return new THREE.Vector3(p.x, 0, p.z);
  }
  const braceBase = {
    red:  attachXZ(braces.red),
    blue: attachXZ(braces.blue),
  };

  function bracePerpXZ(brace) {
    const dx = brace.end.x - brace.start.x;
    const dz = brace.end.z - brace.start.z;
    const len = Math.hypot(dx, dz) || 1;
    return { x: -dz / len, z: dx / len };
  }
  const bracePerp = {
    red:  bracePerpXZ(braces.red),
    blue: bracePerpXZ(braces.blue),
  };

  const extinguisherTopTarget = new THREE.Vector3(
    extinguisher.group.position.x,
    EXTINGUISHER.openingHeight + 0.20,
    extinguisher.group.position.z + EXTINGUISHER.depth * 0.30,
  );

  // Pre-built static obstacle list for steering.
  buildStaticObstacles(world);

  const BALL_CONFLICT_SQ = (ROBOT.size * 2.0) ** 2;

  function isBallNearOtherRobot(ballX, ballZ, others) {
    for (const o of others) {
      const dx = ballX - o.x;
      const dz = ballZ - o.z;
      if (dx * dx + dz * dz < BALL_CONFLICT_SQ) return true;
    }
    return false;
  }

  // Estimate the time (seconds) for robot state `s` to drive to (targetX,
  // targetZ) under the non-holonomic model used by driveToward: the robot
  // turns toward the goal at PARAMS.turnSpeed while translating at
  // PARAMS.driveSpeed scaled by cos(turnDiff), and may reverse when the goal
  // is behind it. This is a side-effect-free forward rollout from a copy of
  // the robot's pose, so the returned time reflects real turning + driving
  // dynamics rather than straight-line distance. Steering/avoidance is omitted
  // (it is a small perturbation and depends on live world state).
  const DRIVE_SIM_DT = 0.05;   // rollout timestep (s)
  const DRIVE_SIM_MAX_T = 30;  // safety cap (s)
  function estimateDriveTime(s, targetX, targetZ) {
    const v = PARAMS.driveSpeed;
    const omega = PARAMS.turnSpeed * (Math.PI / 180); // rad/s
    let x = s.pos.x, z = s.pos.z, heading = s.headingAngle;
    let t = 0;
    while (t < DRIVE_SIM_MAX_T) {
      const dx = targetX - x;
      const dz = targetZ - z;
      const dist = Math.hypot(dx, dz);
      const step = v * DRIVE_SIM_DT;
      if (dist <= step + 0.01) return t + dist / v;

      const rawAngle = Math.atan2(dx, dz);
      let rawDiff = rawAngle - heading;
      while (rawDiff >  Math.PI) rawDiff -= 2 * Math.PI;
      while (rawDiff < -Math.PI) rawDiff += 2 * Math.PI;
      // Reverse when the goal is behind the robot — back in instead of turning
      // all the way around.
      const reverse = Math.abs(rawDiff) > Math.PI / 2;
      const effTarget = reverse ? rawAngle + Math.PI : rawAngle;
      let turnDiff = effTarget - heading;
      while (turnDiff >  Math.PI) turnDiff -= 2 * Math.PI;
      while (turnDiff < -Math.PI) turnDiff += 2 * Math.PI;
      const maxTurn = omega * DRIVE_SIM_DT;
      heading += Math.sign(turnDiff) * Math.min(Math.abs(turnDiff), maxTurn);
      const driveScale = Math.max(0, Math.cos(turnDiff));
      const fwd = reverse ? -1 : 1;
      x += Math.sin(heading) * step * driveScale * fwd;
      z += Math.cos(heading) * step * driveScale * fwd;
      t += DRIVE_SIM_DT;
    }
    return t;
  }

  // Select the reachable ball with the shortest estimated drive time for robot
  // state `s` (accounting for turning + reverse dynamics), skipping balls
  // claimed by or too close to other robots. Prefers balls inside the robot's
  // swim-lane zone; falls back to an unrestricted search if the zone is empty.
  function pickBallNoConflict(s, xRange, zRange, others) {
    let bestIdx = -1, bestTime = Infinity;
    for (let i = 0; i < wildfire.balls.length; i++) {
      const b = wildfire.balls[i];
      if (b.state !== 'field' || claimed.has(i)) continue;
      if (b.pos.x < xRange[0] || b.pos.x > xRange[1]) continue;
      if (b.pos.z < zRange[0] || b.pos.z > zRange[1]) continue;
      if (isBallNearOtherRobot(b.pos.x, b.pos.z, others)) continue;
      const t = estimateDriveTime(s, b.pos.x, b.pos.z);
      if (t < bestTime) { bestTime = t; bestIdx = i; }
    }
    if (bestIdx >= 0) return bestIdx;
    // Fallback: unrestricted search, still filtering conflicts.
    bestTime = Infinity;
    for (let i = 0; i < wildfire.balls.length; i++) {
      const b = wildfire.balls[i];
      if (b.state !== 'field' || claimed.has(i)) continue;
      if (isBallNearOtherRobot(b.pos.x, b.pos.z, others)) continue;
      const t = estimateDriveTime(s, b.pos.x, b.pos.z);
      if (t < bestTime) { bestTime = t; bestIdx = i; }
    }
    return bestIdx;
  }

  // Per-alliance shield queue: ball indices waiting for human-player throw.
  const shieldQueues = { red: [], blue: [] };
  world.shieldQueues = shieldQueues;
  const lastHumanFire = { red: -Infinity, blue: -Infinity };

  const claimed = new Set();

  // Per-robot runtime state.
  const robotStates = {
    red:  robots.red.map((_, i)  => makeRobotState('red',  i)),
    blue: robots.blue.map((_, i) => makeRobotState('blue', i)),
  };

  function makeRobotState(alliance, idx) {
    const p = startPositions[alliance][idx];
    return {
      alliance,
      idx,
      phase: 'toPickup',
      pos: new THREE.Vector3(p.x, 0, p.z),
      carry: 0,
      targetBallIdx: -1,
      pickupTimer: 0,
      expelTimer: 0,
      headingDx: 0,
      headingDz: 1,
      headingAngle: 0,      // current visual heading in radians (Three.js rotation.y)
      reversing: false,     // hysteresis flag for non-holonomic forward/reverse mode
      approachLocked: false, // heading frozen during final-approach gate
      stuckTimer: 0,         // seconds since last meaningful progress toward current target
    };
  }

  const state = {
    suppRed: 0,
    suppBlue: 0,
    ext: 0,            // shared by both alliances (one central Extinguisher)
    missRed: 0,
    missBlue: 0,
    climbZones: { red: ['—','—','—'], blue: ['—','—','—'] },
    partnerClimbs: { red: 0, blue: 0 },
    phase: 'Rush',
    shieldQueueRed: 0,
    shieldQueueBlue: 0,
  };

  // Triangle score positions per [alliance][idx], plus per-robot swim lane.
  function buildLanes() {
    const out = { score: { red: [], blue: [] }, swim: { red: [], blue: [] } };
    const margin = 0.20;
    for (const key of ['red', 'blue']) {
      const a = suppression[key].anchor;
      const sIn  = (key === 'red') ? -1 : +1;
      const sOut = -sIn;
      out.score[key] = [
        new THREE.Vector3(a.x,                       0, a.z),
        new THREE.Vector3(a.x + sIn  * LANE_FLANK_X, 0, a.z + LANE_FLANK_Z),
        new THREE.Vector3(a.x + sOut * LANE_FLANK_X, 0, a.z + LANE_FLANK_Z),
      ];
      const allianceHalfMinX = (key === 'red') ? margin : -half + margin;
      const allianceHalfMaxX = (key === 'red') ?  half - margin : -margin;
      const r0xMin = a.x - LANE_FLANK_X;
      const r0xMax = a.x + LANE_FLANK_X;
      const inEdge  = a.x + sIn  * LANE_FLANK_X;
      const outEdge = a.x + sOut * LANE_FLANK_X;
      out.swim[key] = [
        { xRange: [r0xMin, r0xMax], zRange: [-half + margin, -1.40] },
        {
          xRange: (sIn < 0) ? [allianceHalfMinX, inEdge] : [inEdge, allianceHalfMaxX],
          zRange: [-half + margin, half - margin],
        },
        {
          xRange: (sOut > 0) ? [outEdge, allianceHalfMaxX] : [allianceHalfMinX, outEdge],
          zRange: [-half + margin, half - margin],
        },
      ];
    }
    return out;
  }
  const lanes = buildLanes();

  function scoreAnchorFor(alliance, idx, role) {
    if (role === 'shield') return fireShields[alliance].approach.clone();
    return lanes.score[alliance][idx].clone();
  }

  const climbApproachTargets = {
    red: [],
    blue: [],
  };
  for (const allianceKey of ['red', 'blue']) {
    const baseXZ = braceBase[allianceKey];
    const perp = bracePerp[allianceKey];
    climbApproachTargets[allianceKey] = [
      new THREE.Vector3(baseXZ.x, 0, baseXZ.z),
      new THREE.Vector3(baseXZ.x + perp.x * 0.55, 0, baseXZ.z + perp.z * 0.55),
      new THREE.Vector3(baseXZ.x - perp.x * 0.55, 0, baseXZ.z - perp.z * 0.55),
    ];
  }

  const pendingThrows = [];

  function reset() {
    state.suppRed = 0;
    state.suppBlue = 0;
    state.ext = 0;
    state.missRed = 0;
    state.missBlue = 0;
    state.climbZones = { red: ['—','—','—'], blue: ['—','—','—'] };
    state.partnerClimbs = { red: 0, blue: 0 };
    state.phase = 'Rush';
    state.shieldQueueRed = 0;
    state.shieldQueueBlue = 0;

    claimed.clear();
    pendingThrows.length = 0;
    shieldQueues.red.length = 0;
    shieldQueues.blue.length = 0;
    lastHumanFire.red = -Infinity;
    lastHumanFire.blue = -Infinity;

    if (humans) {
      for (const side of ['red', 'blue']) {
        if (!humans[side]) continue;
        for (const h of humans[side]) h.torso.rotation.x = 0;
      }
    }

    for (const alliance of ['red', 'blue']) {
      for (let i = 0; i < 3; i++) {
        const r = robots[alliance][i];
        const s = robotStates[alliance][i];
        const p = startPositions[alliance][i];
        s.phase = 'toPickup';
        s.pos.set(p.x, 0, p.z);
        s.carry = 0;
        s.targetBallIdx = -1;
        s.pickupTimer = 0;
        s.expelTimer = 0;
        s.headingDx = 0;
        s.headingDz = 1;
        s.headingAngle = 0;
        s.reversing = false;
        s.approachLocked = false;
        s.stuckTimer = 0;
        setRobotPosition(r, p.x, 0, p.z);
        setRobotHeading(r, 0, 1);
        setCarryCount(r, 0);
      }
    }
    setGateOpen(fireShields.red, false);
    setGateOpen(fireShields.blue, false);

    // Reset miss pile visuals
    updateMissPileFill(missPiles.red, 0);
    updateMissPileFill(missPiles.blue, 0);

    for (let i = 0; i < wildfire.balls.length; i++) {
      const b = wildfire.balls[i];
      b.state = 'pending';
      b.fly = null;
      b.vel.x = 0;
      b.vel.z = 0;
      b.pos = extinguisher.spawnSlot.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 1.4,
        WILDFIRE.radius + Math.random() * 0.15,
        -0.05 - Math.random() * 0.1
      ));
    }
  }
  reset();

  // ---- Accuracy and miss handling ----

  // Off-field pile location where missed shots bounce to
  function getMissPile(allianceKey) {
    return missPiles[allianceKey].position.clone();
  }

  // Check if a shot hits based on accuracy percentage
  function doesShotHit(accuracyPercent) {
    return Math.random() * 100 < accuracyPercent;
  }

  // ---- Projectile launchers ----

  function launchSuppArc(ball, fromXZ, allianceKey, startT) {
    const unit = suppression[allianceKey];
    const sFront = -half + SUPPRESSION.depth;  // z of front wall face ≈ -2.90

    // Clearance point: just above the suppressor front wall, at the wall face.
    const clearY  = SUPPRESSION.canopyHeight + 0.10;  // 1.75 m — 10 cm above wall
    const clearPt = new THREE.Vector3(unit.anchor.x, clearY, sFront);
    // Drop target: center of suppressor interior at floor level.
    const target  = new THREE.Vector3(unit.anchor.x, 0.40, unit.group.position.z);

    const p0 = new THREE.Vector3(fromXZ.x, 0.45, fromXZ.z);

    // Split total flight time proportionally to each segment's z-span.
    const dist1 = Math.abs(fromXZ.z - sFront);
    const dist2 = Math.abs(sFront - target.z);
    const totalTime = 1.00;
    const tMid = startT + totalTime * dist1 / (dist1 + dist2);
    const tEnd = startT + totalTime;

    const segments = [];
    const hits = doesShotHit(PARAMS.robotAccuracy);

    // Segment 1: robot → clearance point above the front wall (gentle rising arc).
    segments.push({ p0, p1: clearPt, arcH: 0.15, t0: startT, t1: tMid, visible: true });
    // Segment 2: clearance point → inside the unit (drops in past the front wall).
    segments.push({ p0: clearPt, p1: target, arcH: 0.10, t0: tMid, t1: tEnd, visible: true });

    let endT = tEnd;
    let dest = 'supp';

    if (!hits) {
      const missPile = getMissPile(allianceKey);
      segments.push({
        p0: target, p1: missPile, arcH: 0.50,
        t0: tEnd, t1: tEnd + 0.70, visible: true,
      });
      endT = tEnd + 0.70;
      dest = 'missPile';
    }

    ball.state = 'flying';
    ball.fly = {
      segments,
      alliance: allianceKey,
      dest,
      endT,
    };
  }

  // Robot pushes ball into the shield port; ball ends inside the shield
  // (hidden) and is enqueued for the human-player throw.
  function launchShieldDeposit(ballIdx, fromXZ, allianceKey, startT) {
    const ball = wildfire.balls[ballIdx];
    const shield = fireShields[allianceKey];
    const portPos = shield.port.clone();
    portPos.y += 0.12;
    const p0Robot = new THREE.Vector3(fromXZ.x, 0.35, fromXZ.z);
    ball.state = 'flying';
    ball.fly = {
      segments: [
        { p0: p0Robot, p1: portPos, arcH: 0.08,
          t0: startT, t1: startT + 0.40, visible: true },
      ],
      alliance: allianceKey,
      dest: 'shieldDeposit',
      ballIdx,
      endT: startT + 0.40,
    };
    setGateOpen(shield, true);
    setTimeout(() => setGateOpen(shield, false), 350);
  }

  // Human player launches a queued ball from chute exit into the Extinguisher.
  function launchHumanThrow(ballIdx, allianceKey, startT) {
    const ball = wildfire.balls[ballIdx];
    const shield = fireShields[allianceKey];
    const chuteExit = shield.chuteExit.clone();
    const segments = [];
    const hits = doesShotHit(PARAMS.humanAccuracy);

    segments.push({
      p0: chuteExit, p1: extinguisherTopTarget, arcH: 0.85,
      t0: startT, t1: startT + 0.95, visible: true,
    });

    let endT = startT + 0.95;
    let dest = 'shield';

    if (!hits) {
      // Ball bounces from target to off-field pile
      const missPile = getMissPile(allianceKey);
      segments.push({
        p0: extinguisherTopTarget, p1: missPile, arcH: 0.50,
        t0: startT + 0.95, t1: startT + 1.60, visible: true,
      });
      endT = startT + 1.60;
      dest = 'missPile';
    }

    ball.state = 'flying';
    ball.fly = {
      segments,
      alliance: allianceKey,
      dest,
      endT,
    };

    if (humans && humans[allianceKey] && humans[allianceKey][0]) {
      pendingThrows.push({
        torso: humans[allianceKey][0].torso,
        t0: startT - 0.10,
        t1: startT + 0.35,
      });
    }
  }

  function stepHumanThrows(t) {
    if (humans) {
      for (const side of ['red', 'blue']) {
        if (!humans[side]) continue;
        for (const h of humans[side]) h.torso.rotation.x = 0;
      }
    }
    for (let i = pendingThrows.length - 1; i >= 0; i--) {
      const th = pendingThrows[i];
      if (t < th.t0) continue;
      if (t >= th.t1) {
        th.torso.rotation.x = 0;
        pendingThrows.splice(i, 1);
        continue;
      }
      const k = (t - th.t0) / (th.t1 - th.t0);
      const swing = Math.sin(k * Math.PI) * -0.6 + Math.sin(k * Math.PI * 2) * 0.3;
      th.torso.rotation.x = swing;
    }
  }

  // Service per-alliance human-player throw queue.
  function stepShieldQueues(t) {
    for (const key of ['red', 'blue']) {
      const q = shieldQueues[key];
      if (q.length === 0) continue;
      if (t - lastHumanFire[key] < PARAMS.humanInterval) continue;
      const ballIdx = q.shift();
      lastHumanFire[key] = t;
      launchHumanThrow(ballIdx, key, t);
    }
    state.shieldQueueRed  = shieldQueues.red.length;
    state.shieldQueueBlue = shieldQueues.blue.length;
  }

  const HIDDEN = new THREE.Vector3(0, -10, 0);
  function stepFlying(t) {
    for (let i = 0; i < wildfire.balls.length; i++) {
      const b = wildfire.balls[i];
      if (b.state !== 'flying') continue;
      const f = b.fly;
      if (t >= f.endT) {
        if (f.dest === 'shieldDeposit') {
          // Ball arrives inside the shield; enqueue and hide it.
          b.state = 'inShield';
          b.pos.copy(HIDDEN);
          shieldQueues[f.alliance].push(f.ballIdx);
        } else if (f.dest === 'shield') {
          b.state = 'scored';
          state.ext++;
        } else if (f.dest === 'missPile') {
          // Ball lands in miss pile and is contained (like in goals/shields)
          b.state = 'scored';
          const missPile = missPiles[f.alliance];
          // Position doesn't matter since 'scored' state hides it, but set it anyway
          b.pos.set(missPile.position.x, missPile.position.y + WILDFIRE.radius, missPile.position.z);
          // Track and update visual
          if (f.alliance === 'red') {
            state.missRed++;
            updateMissPileFill(missPiles.red, state.missRed);
          } else {
            state.missBlue++;
            updateMissPileFill(missPiles.blue, state.missBlue);
          }
        } else {
          b.state = 'scored';
          if (f.alliance === 'red') state.suppRed++;
          else state.suppBlue++;
        }
        continue;
      }
      let active = null;
      for (const seg of f.segments) {
        if (t >= seg.t0 && t < seg.t1) { active = seg; break; }
      }
      if (!active) continue;
      if (!active.visible) {
        b.pos.copy(HIDDEN);
      } else {
        const k = clamp01((t - active.t0) / (active.t1 - active.t0));
        arcAt(b.pos, active.p0, active.p1, active.arcH, k);
      }
    }
  }

  // ---- Robot motion via state machine + steering ----

  // Pre-allocated buffers
  const TMP_V = new THREE.Vector3();
  const OTHERS = [];

  function gatherOthers(self) {
    OTHERS.length = 0;
    for (const alliance of ['red', 'blue']) {
      for (let i = 0; i < 3; i++) {
        const o = robotStates[alliance][i];
        if (o === self) continue;
        OTHERS.push({ x: o.pos.x, z: o.pos.z });
      }
    }
    return OTHERS;
  }

  // Apply the robot's current heading angle to its Three.js group rotation.
  // Turning is handled inside driveToward; this just syncs the visual.
  function stepHeading(s, robot) {
    robot.group.rotation.y = s.headingAngle;
  }

  // Non-holonomic drive — two phases:
  //
  // LONG RANGE (dist >= NEAR_APPROACH_DIST):
  //   1. Ask steer() for the avoidance-adjusted target direction.
  //   2. Decide forward vs. reverse from the RAW goal angle (hysteresis band
  //      +-20 deg around 90 deg prevents steering noise from flipping the mode).
  //   3. Rotate headingAngle toward the effective target at PARAMS.turnSpeed.
  //   4. Scale drive speed by cos(turnDiff) — robot slows to 0 when broadside,
  //      preventing overshoot while still making lateral progress.
  //
  // FINAL-APPROACH GATE (dist < NEAR_APPROACH_DIST):
  //   steer() is bypassed; the robot turns toward the raw goal angle, which is
  //   stable because the target does not move while claimed. Once turnDiff
  //   reaches exactly 0 the heading is LOCKED — rotation stops permanently for
  //   this run-in. This prevents steer() noise from ever re-triggering
  //   misalignment (the jitter seen at very low turn speeds). The robot then
  //   drives straight through at full speed until the snap threshold.

  // Hysteresis thresholds for forward <-> reverse mode (in radians).
  const ENTER_REVERSE = (110 / 180) * Math.PI;
  const EXIT_REVERSE  = (70  / 180) * Math.PI;

  // Radius at which the final-approach gate activates.
  const NEAR_APPROACH_DIST = 0.50;

  function driveToward(s, targetX, targetZ, dt) {
    const dx = targetX - s.pos.x;
    const dz = targetZ - s.pos.z;
    const dist = Math.hypot(dx, dz);
    const speed = PARAMS.driveSpeed;
    const maxStep = speed * dt;

    // Accumulate stuck time so callers can detect a robot making no progress.
    s.stuckTimer += dt;

    // Snap when close enough that one frame of driving would overshoot.
    if (dist <= maxStep + 0.01) {
      s.pos.x = targetX;
      s.pos.z = targetZ;
      s.approachLocked = false;
      return true;
    }

    // ---- Final-approach gate ----
    if (dist < NEAR_APPROACH_DIST) {
      if (!s.approachLocked) {
        // Turn only — no translation — using raw goal angle (stable target).
        const rawAngle = Math.atan2(dx, dz);
        let turnDiff = rawAngle - s.headingAngle;
        while (turnDiff >  Math.PI) turnDiff -= 2 * Math.PI;
        while (turnDiff < -Math.PI) turnDiff += 2 * Math.PI;
        const maxTurn = PARAMS.turnSpeed * (Math.PI / 180) * dt;
        s.headingAngle += Math.sign(turnDiff) * Math.min(Math.abs(turnDiff), maxTurn);
        // After the update, check if exact alignment has been reached.
        let remaining = rawAngle - s.headingAngle;
        while (remaining >  Math.PI) remaining -= 2 * Math.PI;
        while (remaining < -Math.PI) remaining += 2 * Math.PI;
        if (remaining === 0) s.approachLocked = true;
      }
      // Locked (or just became locked this frame): drive straight, heading frozen.
      if (s.approachLocked) {
        s.pos.x += Math.sin(s.headingAngle) * maxStep;
        s.pos.z += Math.cos(s.headingAngle) * maxStep;
      }
      s.headingDx = Math.sin(s.headingAngle);
      s.headingDz = Math.cos(s.headingAngle);
      return false;
    }

    // ---- Long-range approach ----
    // Clear lock if the robot has backed away from the gate (edge case).
    s.approachLocked = false;

    // Compute avoidance-adjusted velocity for turning.
    TMP_V.set((dx / dist) * speed, 0, (dz / dist) * speed);
    const v = steer(s.pos.x, s.pos.z, TMP_V, gatherOthers(s));
    const vm = Math.hypot(v.x, v.z);
    if (vm < 1e-6) return false;
    const steerAngle = Math.atan2(v.x, v.z);

    // Forward/reverse mode — based on RAW goal angle so steering noise can't
    // flip the mode on every frame when the robot is broadside to its target.
    const rawAngle = Math.atan2(dx, dz);
    let rawDiff = rawAngle - s.headingAngle;
    while (rawDiff >  Math.PI) rawDiff -= 2 * Math.PI;
    while (rawDiff < -Math.PI) rawDiff += 2 * Math.PI;
    if (s.reversing) {
      if (Math.abs(rawDiff) < EXIT_REVERSE)  s.reversing = false;
    } else {
      if (Math.abs(rawDiff) > ENTER_REVERSE) s.reversing = true;
    }

    // Effective turn target: face steer direction (forward) or steer+180 deg
    // (reverse — robot backs toward the goal).
    const effectiveAngle = s.reversing ? steerAngle + Math.PI : steerAngle;

    // Rotate heading toward the effective target at PARAMS.turnSpeed.
    let turnDiff = effectiveAngle - s.headingAngle;
    while (turnDiff >  Math.PI) turnDiff -= 2 * Math.PI;
    while (turnDiff < -Math.PI) turnDiff += 2 * Math.PI;
    const maxTurn = PARAMS.turnSpeed * (Math.PI / 180) * dt;
    s.headingAngle += Math.sign(turnDiff) * Math.min(Math.abs(turnDiff), maxTurn);

    // Proportional velocity: scale drive speed by cos(turnDiff) so the robot
    // decelerates to 0 when perpendicular to its goal — prevents overshoot.
    const driveScale = Math.max(0, Math.cos(turnDiff));

    // Translate along the current heading — forward, or backward when reversing.
    const fwd = s.reversing ? -1 : 1;
    s.pos.x += Math.sin(s.headingAngle) * maxStep * driveScale * fwd;
    s.pos.z += Math.cos(s.headingAngle) * maxStep * driveScale * fwd;

    // Keep headingDx/Dz consistent with headingAngle for external consumers.
    s.headingDx = Math.sin(s.headingAngle);
    s.headingDz = Math.cos(s.headingAngle);

    return false;
  }

  function updateRobot(s, dt, t) {
    const robot = robots[s.alliance][s.idx];
    const role = PARAMS.roles[s.alliance][s.idx];
    const capacity = PARAMS.capacity;

    if (role === 'fault') {
      // Fault: chase the nearest ball but never collect it.
      s.phase = 'toPickup';
      s.carry = 0;
      if (s.targetBallIdx === -1) {
        const lane = lanes.swim[s.alliance][s.idx];
        const others = gatherOthers(s);
        const idx = pickBallNoConflict(s, lane.xRange, lane.zRange, others);
        if (idx >= 0) { s.targetBallIdx = idx; claimed.add(idx); s.stuckTimer = 0; }
      } else {
        const b = wildfire.balls[s.targetBallIdx];
        if (!b || b.state !== 'field') {
          claimed.delete(s.targetBallIdx);
          s.targetBallIdx = -1;
          s.stuckTimer = 0;
        } else {
          const reached = driveToward(s, b.pos.x, b.pos.z, dt);
          if (reached) {
            claimed.delete(s.targetBallIdx);
            s.targetBallIdx = -1;
            s.stuckTimer = 0;
          }
        }
      }
      setRobotPosition(robot, s.pos.x, 0, s.pos.z);
      stepHeading(s, robot);
      setCarryCount(robot, 0);
      // Pass -1 (no exclusion) intentionally: fault robots push every ball,
      // including the one they are chasing, so they act as disruptors rather
      // than collectors. Normal robots pass s.targetBallIdx to exempt their
      // claimed ball from being knocked away.
      pushBallsFromRobot(wildfire.balls, s.pos.x, s.pos.z, -1);
      return;
    }

    if (s.phase === 'toPickup') {
      // Acquire a ball claim if none.
      if (s.targetBallIdx === -1) {
        const lane = lanes.swim[s.alliance][s.idx];
        const others = gatherOthers(s);
        const idx = pickBallNoConflict(s, lane.xRange, lane.zRange, others);
        if (idx >= 0) {
          s.targetBallIdx = idx;
          claimed.add(idx);
          s.stuckTimer = 0;
        } else {
          // No balls left in lane; go score whatever we have, otherwise
          // drift toward the swim-lane staging point so the robot stays
          // mobile and pre-positioned for when a ball frees up.
          if (s.carry > 0) { s.phase = 'toScore'; s.expelTimer = 0; s.stuckTimer = 0; }
          else {
            // Nothing to do — return to spawn and wait for a ball to free up.
            const spawn = startPositions[s.alliance][s.idx];
            driveToward(s, spawn.x, spawn.z, dt);
            // driveToward moved s.pos but we return before the bottom-of-function
            // sync block — keep the Three.js mesh and ball-push in lock-step.
            setRobotPosition(robot, s.pos.x, 0, s.pos.z);
            stepHeading(s, robot);
            pushBallsFromRobot(wildfire.balls, s.pos.x, s.pos.z, -1);
          }
          return;
        }
      }
      // Ball might have been collected by something else somehow — guard.
      const b = wildfire.balls[s.targetBallIdx];
      if (!b || b.state !== 'field') {
        claimed.delete(s.targetBallIdx);
        s.targetBallIdx = -1;
        return;
      }
      // Abandon if another robot has moved too close to the targeted ball.
      if (isBallNearOtherRobot(b.pos.x, b.pos.z, gatherOthers(s))) {
        claimed.delete(s.targetBallIdx);
        s.targetBallIdx = -1;
        s.stuckTimer = 0;
        return;
      }
      const reached = driveToward(s, b.pos.x, b.pos.z, dt);
      if (reached) {
        s.phase = 'pickingUp';
        s.pickupTimer = PARAMS.pickupTime;
      } else if (s.stuckTimer > 4.0) {
        // Robot has been driving toward this ball for too long without reaching
        // it — obstacle or conflict is blocking the route. Release the claim
        // and let the robot pick a different target next tick.
        console.log(
          `[stuck] ${s.alliance[0].toUpperCase()}${s.idx + 1} | toPickup → release ball #${s.targetBallIdx}` +
          ` | stuck ${s.stuckTimer.toFixed(2)}s` +
          ` | pos (${s.pos.x.toFixed(2)}, ${s.pos.z.toFixed(2)})` +
          ` | ball (${b.pos.x.toFixed(2)}, ${b.pos.z.toFixed(2)})`
        );
        claimed.delete(s.targetBallIdx);
        s.targetBallIdx = -1;
        s.stuckTimer = 0;
      }
    } else if (s.phase === 'pickingUp') {
      s.pickupTimer -= dt;
      if (s.pickupTimer <= 0) {
        const idx = s.targetBallIdx;
        if (idx >= 0) {
          const b = wildfire.balls[idx];
          if (b && b.state === 'field') {
            b.state = 'carried';
            s.carry++;
          }
          claimed.delete(idx);
          s.targetBallIdx = -1;
        }
        if (s.carry >= capacity) {
          s.phase = 'toScore';
          s.expelTimer = 0;
          s.stuckTimer = 0;
        } else {
          s.phase = 'toPickup';
          s.stuckTimer = 0;
        }
      }
    } else if (s.phase === 'toScore') {
      const anchor = scoreAnchorFor(s.alliance, s.idx, role);
      const reached = driveToward(s, anchor.x, anchor.z, dt);
      if (reached) {
        s.phase = 'expelling';
        s.expelTimer = 0;
        s.stuckTimer = 0;
      } else if (s.stuckTimer > 5.0) {
        // Can't reach the anchor — retreat to spawn and re-approach from a
        // fresh angle rather than teleporting.
        console.log(
          `[stuck] ${s.alliance[0].toUpperCase()}${s.idx + 1} | toScore → toStart (retreat to spawn)` +
          ` | stuck ${s.stuckTimer.toFixed(2)}s` +
          ` | pos (${s.pos.x.toFixed(2)}, ${s.pos.z.toFixed(2)})` +
          ` | carry ${s.carry}`
        );
        s.phase = 'toStart';
        s.stuckTimer = 0;
      }
    } else if (s.phase === 'toStart') {
      // Retreat to spawn point, then resume whatever the robot needs to do.
      const spawn = startPositions[s.alliance][s.idx];
      const reached = driveToward(s, spawn.x, spawn.z, dt);
      if (reached) {
        console.log(
          `[stuck] ${s.alliance[0].toUpperCase()}${s.idx + 1} | toStart → ${s.carry > 0 ? 'toScore' : 'toPickup'} (spawn reached)` +
          ` | pos (${s.pos.x.toFixed(2)}, ${s.pos.z.toFixed(2)})`
        );
        s.phase = s.carry > 0 ? 'toScore' : 'toPickup';
        s.stuckTimer = 0;
      }
    } else if (s.phase === 'expelling') {
      const interval = (role === 'shield') ? PARAMS.transferInterval : PARAMS.shootInterval;
      s.expelTimer -= dt;
      if (s.expelTimer <= 0 && s.carry > 0) {
        // Find any ball we own (currently 'carried' with no owner tracking) —
        // use a free 'carried' ball that hasn't been launched yet.
        const ballIdx = takeCarriedBall();
        if (ballIdx >= 0) {
          const launchPos = { x: s.pos.x, z: s.pos.z };
          if (role === 'shield') {
            launchShieldDeposit(ballIdx, launchPos, s.alliance, t);
          } else {
            launchSuppArc(wildfire.balls[ballIdx], launchPos, s.alliance, t);
          }
          s.carry--;
          s.expelTimer = interval;
        } else {
          // No carried ball found; clear carry to avoid stuck state.
          s.carry = 0;
        }
        if (s.carry === 0) {
          s.phase = 'toPickup';
          s.stuckTimer = 0;
        }
      }
    }

    setRobotPosition(robot, s.pos.x, 0, s.pos.z);
    stepHeading(s, robot);
    setCarryCount(robot, s.carry);
    pushBallsFromRobot(wildfire.balls, s.pos.x, s.pos.z, s.targetBallIdx);
  }

  // Carried balls aren't owned per-robot in the ball record, but we
  // de-dup by always pulling the lowest-indexed carried ball. This is fine
  // because all carried balls are equivalent — what matters is the count.
  function takeCarriedBall() {
    for (let i = 0; i < wildfire.balls.length; i++) {
      const b = wildfire.balls[i];
      if (b.state === 'carried') return i;
    }
    return -1;
  }

  // ---- Step ----

  let prevT = 0;

  function step(t) {
    let dt = t - prevT;
    if (dt < 0) dt = 0;
    if (dt > 0.25) dt = 0.25; // clamp big jumps so steering stays stable
    prevT = t;

    state.phase = getPhaseName(t);

    // Ball release (t ∈ [0, ~1])
    for (let i = 0; i < wildfire.balls.length; i++) {
      const b = wildfire.balls[i];
      if (b.state === 'pending' && t >= b.releaseAt) {
        const since = t - b.releaseAt;
        const dur = 0.4;
        if (since >= dur) {
          b.state = 'field';
          b.pos.copy(b.scatter);
        } else {
          const k = since / dur;
          const sx = lerp(extinguisher.spawnSlot.x, b.scatter.x, k);
          const sz = lerp(extinguisher.spawnSlot.z, b.scatter.z, k);
          const sy = WILDFIRE.radius + Math.sin(k * Math.PI) * 0.25;
          b.pos.set(sx, sy, sz);
        }
      }
    }

    // Robot state machines
    if (t >= 1.0 && t < SCORING_END) {
      for (const alliance of ['red', 'blue']) {
        for (let i = 0; i < 3; i++) {
          updateRobot(robotStates[alliance][i], dt, t);
        }
      }
    }

    // Servicing in-flight projectiles and rate-limited human throws.
    stepFlying(t);
    stepShieldQueues(t);
    stepHumanThrows(t);

    // Climb approach + climb.
    if (t >= SCORING_END) {
      ['red', 'blue'].forEach((allianceKey) => {
        const brace = braces[allianceKey];
        const anchorRobot = robots[allianceKey][0];
        const partners = [robots[allianceKey][1], robots[allianceKey][2]];

        if (t < CLIMB_WALK_END) {
          for (let i = 0; i < 3; i++) {
            const r = robots[allianceKey][i];
            const rs = robotStates[allianceKey][i];
            const target = climbApproachTargets[allianceKey][i];
            driveToward(rs, target.x, target.z, dt);
            setRobotPosition(r, rs.pos.x, 0, rs.pos.z);
            stepHeading(rs, r);
            setCarryCount(r, 0);
            pushBallsFromRobot(wildfire.balls, rs.pos.x, rs.pos.z, -1);
          }
          state.climbZones[allianceKey] = ['—','—','—'];
          state.partnerClimbs[allianceKey] = 0;
        } else {
          const seg = findSegment(CLIMB.unit, t);
          const frac = lerp(seg.cur.frac, seg.next.frac, easeInOut(seg.k));
          const onGround = seg.cur.onGround;

          const anchorPos = pointOnBrace(brace, frac, climbHangBelow);
          setRobotPosition(anchorRobot, anchorPos.x, anchorPos.y, anchorPos.z);

          const perp = bracePerp[allianceKey];
          const sideMag = 0.55;
          const sideDir = [+1, -1];
          const fieldEdge = FIELD.size / 2 - 0.10;
          // Partners hang from the anchor: offset slightly below it so they
          // appear latched on rather than floating alongside.
          const partnerDropY = ROBOT.size * 0.7; // ≈ one chassis height below anchor
          for (let pi = 0; pi < 2; pi++) {
            const s = sideDir[pi] * sideMag;
            let px = anchorPos.x + perp.x * s;
            let pz = anchorPos.z + perp.z * s;
            const py = Math.max(0, anchorPos.y - partnerDropY);
            px = Math.max(-fieldEdge, Math.min(fieldEdge, px));
            pz = Math.max(-fieldEdge, Math.min(fieldEdge, pz));
            setRobotPosition(partners[pi], px, py, pz);
            setCarryCount(partners[pi], 0);
          }

          let z;
          if (onGround || frac < 0.01) z = 'Contact';
          else if (frac < 0.333)        z = 'Z1';
          else if (frac < 0.667)        z = 'Z2';
          else                          z = 'Z3';

          state.climbZones[allianceKey] = [z, z, z];
          state.partnerClimbs[allianceKey] = (z === 'Contact' || z === '—') ? 0 : 2;
        }
      });
    }

    // Sync role badge on each robot (reads live PARAMS so config changes
    // are reflected immediately without a restart).
    for (const alliance of ['red', 'blue']) {
      for (let i = 0; i < 3; i++) {
        setRobotRole(robots[alliance][i], PARAMS.roles[alliance][i]);
      }
    }

    // Collect currently-targeted ball indices so stepBallPhysics can exempt
    // them from inter-ball collisions.
    const targeted = new Set();
    for (const alliance of ['red', 'blue']) {
      for (const s of robotStates[alliance]) {
        if (s.targetBallIdx >= 0) targeted.add(s.targetBallIdx);
      }
    }
    stepBallPhysics(wildfire.balls, dt, targeted);
    wildfire.update();
    return state;
  }

  function resetWrapped() {
    prevT = 0;
    reset();
  }

  return { step, state, reset: resetWrapped };
}
