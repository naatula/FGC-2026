import * as THREE from 'three';
import {
  WILDFIRE, FIELD, ROBOT,
  SUPPRESSION, EXTINGUISHER, FIRE_SHIELD, BRACE,
} from '../field/dims.js';
import { CLIMB, getPhaseName } from './timeline.js';
import { pickClosestFieldBall, pickClosestFieldBallInZone } from '../entities/Wildfire.js';
import { pointOnBrace } from '../field/buildBrace.js';
import {
  setRobotPosition, setRobotCarrying, setAnchor, setCarryCount,
} from '../entities/Robot.js';
import { setGateOpen } from '../field/buildFireShield.js';
import { PARAMS } from './config.js';
import { buildStaticObstacles, steer } from './steering.js';

// State-machine scheduler. Each robot has a `role` (supp|shield), drives
// itself via a phase machine (toPickup → pickingUp → toScore → expelling),
// reads its tuning from PARAMS each tick, and integrates motion with the
// real frame dt. Climb / human-throw flows live alongside.

const SCORING_END = 113.0;
const CLIMB_WALK_END = 116.0;

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
    robots, wildfire, suppression, extinguisher, fireShields, braces, humans,
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

  function shotTarget(allianceKey) {
    const unit = suppression[allianceKey];
    return new THREE.Vector3(
      unit.group.position.x,
      0.50,
      unit.group.position.z - SUPPRESSION.depth * 0.20,
    );
  }
  const extinguisherTopTarget = new THREE.Vector3(
    extinguisher.group.position.x,
    EXTINGUISHER.openingHeight + 0.20,
    extinguisher.group.position.z + EXTINGUISHER.depth * 0.30,
  );

  // Pre-built static obstacle list for steering.
  buildStaticObstacles(world);

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
      stuckTimer: 0,
    };
  }

  const state = {
    suppRed: 0,
    suppBlue: 0,
    ext: 0,
    climbZones: { red: ['—','—','—'], blue: ['—','—','—'] },
    partnerClimbs: { red: 0, blue: 0 },
    phase: 'Pre-rush',
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

  // Climb walk-from snapshot.
  let walkStart = null;

  const pendingThrows = [];

  function reset() {
    state.suppRed = 0;
    state.suppBlue = 0;
    state.ext = 0;
    state.climbZones = { red: ['—','—','—'], blue: ['—','—','—'] };
    state.partnerClimbs = { red: 0, blue: 0 };
    state.phase = 'Pre-rush';
    state.shieldQueueRed = 0;
    state.shieldQueueBlue = 0;

    claimed.clear();
    walkStart = null;
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
        s.stuckTimer = 0;
        setRobotPosition(r, p.x, 0, p.z);
        setRobotCarrying(r, false);
        setCarryCount(r, 0);
      }
    }
    setGateOpen(fireShields.red, false);
    setGateOpen(fireShields.blue, false);

    for (let i = 0; i < wildfire.balls.length; i++) {
      const b = wildfire.balls[i];
      b.state = 'pending';
      b.fly = null;
      b.pos = extinguisher.spawnSlot.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 1.4,
        WILDFIRE.radius + Math.random() * 0.15,
        -0.05 - Math.random() * 0.1
      ));
    }
  }
  reset();

  // ---- Projectile launchers ----

  function launchSuppArc(ball, fromXZ, allianceKey, startT) {
    const target = shotTarget(allianceKey);
    const p0 = new THREE.Vector3(fromXZ.x, 0.45, fromXZ.z);
    ball.state = 'flying';
    ball.fly = {
      segments: [
        { p0, p1: target, arcH: 2.30, t0: startT, t1: startT + 1.10, visible: true },
      ],
      alliance: allianceKey,
      dest: 'supp',
      endT: startT + 1.10,
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
    ball.state = 'flying';
    ball.fly = {
      segments: [
        { p0: chuteExit, p1: extinguisherTopTarget, arcH: 0.85,
          t0: startT, t1: startT + 0.95, visible: true },
      ],
      alliance: allianceKey,
      dest: 'shield',
      endT: startT + 0.95,
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

  function driveToward(s, targetX, targetZ, dt) {
    const dx = targetX - s.pos.x;
    const dz = targetZ - s.pos.z;
    const dist = Math.hypot(dx, dz);
    const speed = PARAMS.driveSpeed;
    const maxStep = speed * dt;
    // Snap when within one frame of the target. Bypasses any steering noise
    // that would otherwise leave the robot oscillating just shy of its goal.
    if (dist <= maxStep + 0.01) {
      s.pos.x = targetX;
      s.pos.z = targetZ;
      return true;
    }
    const vx = (dx / dist) * speed;
    const vz = (dz / dist) * speed;
    TMP_V.set(vx, 0, vz);
    const v = steer(s.pos.x, s.pos.z, TMP_V, gatherOthers(s));
    const vm = Math.hypot(v.x, v.z) || 1;
    s.pos.x += (v.x / vm) * maxStep;
    s.pos.z += (v.z / vm) * maxStep;
    return false;
  }

  function updateRobot(s, dt, t) {
    const robot = robots[s.alliance][s.idx];
    const role = PARAMS.roles[s.alliance][s.idx];
    const capacity = PARAMS.capacity;

    if (s.phase === 'toPickup') {
      // Acquire a ball claim if none.
      if (s.targetBallIdx === -1) {
        const lane = lanes.swim[s.alliance][s.idx];
        const cx = (lane.xRange[0] + lane.xRange[1]) / 2;
        const cz = (lane.zRange[0] + lane.zRange[1]) / 2;
        const origin = new THREE.Vector3(cx, 0, cz);
        const idx = pickClosestFieldBallInZone(
          wildfire, origin, lane.xRange, lane.zRange, claimed
        );
        if (idx >= 0) {
          s.targetBallIdx = idx;
          claimed.add(idx);
        } else {
          // No balls left in lane; go score whatever we have.
          if (s.carry > 0) { s.phase = 'toScore'; s.expelTimer = 0; }
          // else idle - try again next tick
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
      const reached = driveToward(s, b.pos.x, b.pos.z, dt);
      if (reached) {
        s.phase = 'pickingUp';
        s.pickupTimer = PARAMS.pickupTime;
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
        } else {
          s.phase = 'toPickup';
        }
      }
    } else if (s.phase === 'toScore') {
      const anchor = scoreAnchorFor(s.alliance, s.idx, role);
      const reached = driveToward(s, anchor.x, anchor.z, dt);
      if (reached) {
        s.phase = 'expelling';
        s.expelTimer = 0;
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
        }
      }
    }

    setRobotPosition(robot, s.pos.x, 0, s.pos.z);
    setCarryCount(robot, s.carry);
    setRobotCarrying(robot, false);
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

    // Climb (unchanged)
    if (t >= SCORING_END) {
      if (walkStart === null) {
        walkStart = {
          red:  robots.red.map(r => r.group.position.clone()),
          blue: robots.blue.map(r => r.group.position.clone()),
        };
      }
      ['red', 'blue'].forEach((allianceKey) => {
        const brace = braces[allianceKey];
        const baseXZ = braceBase[allianceKey];
        const anchorRobot = robots[allianceKey][0];
        const partners = [robots[allianceKey][1], robots[allianceKey][2]];

        if (t < CLIMB_WALK_END) {
          const k = (t - SCORING_END) / (CLIMB_WALK_END - SCORING_END);
          const ke = easeInOut(clamp01(k));
          const inwardX = (allianceKey === 'red') ? -1 : +1;
          const baseTargets = [
            new THREE.Vector3(baseXZ.x, 0, baseXZ.z),
            new THREE.Vector3(baseXZ.x + inwardX * 0.50, 0, baseXZ.z - 0.30),
            new THREE.Vector3(baseXZ.x + inwardX * 0.95, 0, baseXZ.z - 0.55),
          ];
          for (let i = 0; i < 3; i++) {
            const r = robots[allianceKey][i];
            const start = walkStart[allianceKey][i];
            const target = baseTargets[i];
            const x = lerp(start.x, target.x, ke);
            const z = lerp(start.z, target.z, ke);
            setRobotPosition(r, x, 0, z);
            setRobotCarrying(r, false);
            setCarryCount(r, 0);
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
          for (let pi = 0; pi < 2; pi++) {
            const s = sideDir[pi] * sideMag;
            let px = anchorPos.x + perp.x * s;
            let pz = anchorPos.z + perp.z * s;
            const py = Math.max(0, anchorPos.y);
            px = Math.max(-fieldEdge, Math.min(fieldEdge, px));
            pz = Math.max(-fieldEdge, Math.min(fieldEdge, pz));
            setRobotPosition(partners[pi], px, py, pz);
            setRobotCarrying(partners[pi], false);
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

    wildfire.update();
    return state;
  }

  function resetWrapped() {
    prevT = 0;
    reset();
  }

  return { step, state, reset: resetWrapped };
}
