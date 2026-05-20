import { WILDFIRE, FIELD, ROBOT, SUPPRESSION, EXTINGUISHER, FIRE_SHIELD } from '../field/dims.js';
import { isInExclusionZone } from '../entities/Wildfire.js';
import { PARAMS } from './config.js';
const WALL_RESTITUTION = 0.70;  // velocity scale after wall bounce
const OBS_RESTITUTION  = 0.65; // coefficient of restitution vs static obstacles
const BALL_RESTITUTION = 0.85; // coefficient of restitution in ball-ball collisions
const REST_SPEED       = 0.04; // m/s below which a ball stops (if in safe zone)
const ESCAPE_SPEED     = 0.10; // m/s directed toward field center when escaping exclusion zone
const ROBOT_PUSH       = 1.0;  // m/s impulse when robot contacts a ball

const ROBOT_R    = ROBOT.size / 2;
const BALL_R     = WILDFIRE.radius;
const CONTACT_RB = ROBOT_R + BALL_R;  // robot-ball contact distance = 0.30 m
const CONTACT_BB = BALL_R * 2;        // ball-ball contact distance = 0.10 m

const _half = FIELD.size / 2;
const _sX   = _half * 0.55;

// Fire shield geometry constants
const _shieldWallLen = 0.80;
const _shieldAngleRad = 30 * Math.PI / 180;
const _shieldOffX = _shieldWallLen * Math.cos(_shieldAngleRad);  // ≈ 0.693
const _shieldOffZ = _shieldWallLen * Math.sin(_shieldAngleRad);  // = 0.40
const _shieldExtension = 1.00;

// Physical AABBs of obstacles that rolling balls should bounce off.
const OBSTACLES = [
  { minX: _sX - SUPPRESSION.width / 2,  maxX: _sX + SUPPRESSION.width / 2,  minZ: -_half, maxZ: -_half + SUPPRESSION.depth },
  { minX: -_sX - SUPPRESSION.width / 2, maxX: -_sX + SUPPRESSION.width / 2, minZ: -_half, maxZ: -_half + SUPPRESSION.depth },
  { minX: -EXTINGUISHER.width / 2,       maxX: EXTINGUISHER.width / 2,       minZ: -_half, maxZ: -_half + EXTINGUISHER.depth },
  // Red fire shield (top-right corner at +X, +Z)
  {
    minX: _half - _shieldOffX,
    maxX: _half,
    minZ: _half - _shieldExtension - _shieldOffZ,
    maxZ: _half,
  },
  // Blue fire shield (top-left corner at -X, +Z)
  {
    minX: -_half,
    maxX: -_half + _shieldOffX,
    minZ: _half - _shieldExtension - _shieldOffZ,
    maxZ: _half,
  },
];

function bounceFromObstacles(b) {
  for (const ab of OBSTACLES) {
    const cx = Math.max(ab.minX, Math.min(b.pos.x, ab.maxX));
    const cz = Math.max(ab.minZ, Math.min(b.pos.z, ab.maxZ));
    const dx = b.pos.x - cx;
    const dz = b.pos.z - cz;
    const dist = Math.hypot(dx, dz);
    if (dist >= BALL_R || dist < 1e-6) continue;
    const nx = dx / dist;
    const nz = dz / dist;
    b.pos.x += nx * (BALL_R - dist);
    b.pos.z += nz * (BALL_R - dist);
    const vn = b.vel.x * nx + b.vel.z * nz;
    if (vn < 0) {
      b.vel.x -= (1 + OBS_RESTITUTION) * vn * nx;
      b.vel.z -= (1 + OBS_RESTITUTION) * vn * nz;
    }
  }
}

// Push non-targeted balls away from a robot that has overlapped them.
export function pushBallsFromRobot(balls, robotX, robotZ, targetBallIdx) {
  for (let i = 0; i < balls.length; i++) {
    if (i === targetBallIdx) continue;
    const b = balls[i];
    if (b.state !== 'field' && b.state !== 'rolling') continue;
    const dx = b.pos.x - robotX;
    const dz = b.pos.z - robotZ;
    const dist = Math.hypot(dx, dz);
    if (dist >= CONTACT_RB || dist < 1e-6) continue;
    const nx = dx / dist;
    const nz = dz / dist;
    b.pos.x += nx * (CONTACT_RB - dist);
    b.pos.z += nz * (CONTACT_RB - dist);
    // Apply impulse only if the ball isn't already moving faster in that direction.
    const vn = b.vel.x * nx + b.vel.z * nz;
    if (vn < ROBOT_PUSH) {
      b.vel.x += nx * (ROBOT_PUSH - vn);
      b.vel.z += nz * (ROBOT_PUSH - vn);
    }
    b.state = 'rolling';
  }
}

// Integrate rolling balls and resolve ball-ball collisions each simulation step.
export function stepBallPhysics(balls, dt) {
  const wall = _half - BALL_R;

  // Integrate rolling balls: friction → move → wall bounce → obstacle bounce → rest.
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.state !== 'rolling') continue;

    const speed = Math.hypot(b.vel.x, b.vel.z);
    if (speed > 1e-6) {
      // Skip friction if ball is in an exclusion zone to help it escape faster.
      const inExclusion = isInExclusionZone(b.pos.x, b.pos.z);
      if (!inExclusion) {
        const s = Math.max(0, speed - PARAMS.ballFriction * dt) / speed;
        b.vel.x *= s;
        b.vel.z *= s;
      }
    }

    b.pos.x += b.vel.x * dt;
    b.pos.z += b.vel.z * dt;

    if (b.pos.x < -wall) { b.pos.x = -wall; if (b.vel.x < 0) b.vel.x = -WALL_RESTITUTION * b.vel.x; }
    if (b.pos.x >  wall) { b.pos.x =  wall; if (b.vel.x > 0) b.vel.x = -WALL_RESTITUTION * b.vel.x; }
    if (b.pos.z < -wall) { b.pos.z = -wall; if (b.vel.z < 0) b.vel.z = -WALL_RESTITUTION * b.vel.z; }
    if (b.pos.z >  wall) { b.pos.z =  wall; if (b.vel.z > 0) b.vel.z = -WALL_RESTITUTION * b.vel.z; }

    bounceFromObstacles(b);

    const newSpeed = Math.hypot(b.vel.x, b.vel.z);
    if (newSpeed < REST_SPEED) {
      if (!isInExclusionZone(b.pos.x, b.pos.z)) {
        b.vel.x = 0;
        b.vel.z = 0;
        b.state = 'field';
      } else {
        // Steer ball toward field center until it leaves the exclusion zone.
        const d = Math.hypot(b.pos.x, b.pos.z);
        if (d > 1e-6) {
          b.vel.x = (-b.pos.x / d) * ESCAPE_SPEED;
          b.vel.z = (-b.pos.z / d) * ESCAPE_SPEED;
        } else {
          b.vel.x = ESCAPE_SPEED;
          b.vel.z = 0;
        }
      }
    }
  }

  // Ball-ball collisions: only pairs where at least one is rolling.
  for (let i = 0; i < balls.length; i++) {
    const bi = balls[i];
    if (bi.state !== 'field' && bi.state !== 'rolling') continue;

    for (let j = i + 1; j < balls.length; j++) {
      const bj = balls[j];
      if (bj.state !== 'field' && bj.state !== 'rolling') continue;
      if (bi.state !== 'rolling' && bj.state !== 'rolling') continue;

      const dx = bj.pos.x - bi.pos.x;
      const dz = bj.pos.z - bi.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= CONTACT_BB || dist < 1e-6) continue;

      const nx = dx / dist;
      const nz = dz / dist;

      const overlap = (CONTACT_BB - dist) * 0.5;
      bi.pos.x -= nx * overlap;
      bi.pos.z -= nz * overlap;
      bj.pos.x += nx * overlap;
      bj.pos.z += nz * overlap;

      const vi_n = bi.vel.x * nx + bi.vel.z * nz;
      const vj_n = bj.vel.x * nx + bj.vel.z * nz;
      const relVn = vi_n - vj_n;
      if (relVn <= 0) continue;

      const imp = (1 + BALL_RESTITUTION) * 0.5 * relVn;
      bi.vel.x -= imp * nx;
      bi.vel.z -= imp * nz;
      bj.vel.x += imp * nx;
      bj.vel.z += imp * nz;

      if (bj.state === 'field') bj.state = 'rolling';
      if (bi.state === 'field') bi.state = 'rolling';
    }
  }
}
