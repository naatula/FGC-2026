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
// Suppression unit AABB center X: inner side is flush with the Extinguisher's
// outer wall (no gap), so AABB-center = EXTINGUISHER.width/2 + backWidth/2.
const _sX   = EXTINGUISHER.width / 2 + SUPPRESSION.width / 2;

// Fire shield geometry constants
const _shieldWallLen = 0.80;
const _shieldAngleRad = 30 * Math.PI / 180;
const _shieldOffX = _shieldWallLen * Math.cos(_shieldAngleRad);  // ≈ 0.693
const _shieldOffZ = _shieldWallLen * Math.sin(_shieldAngleRad);  // = 0.40
const _shieldExtension = 1.00;

// Port barrier constants (invisible barrier at fire shield port opening)
const _portOpeningW = _shieldWallLen * 0.60;  // 60% of wall width (center 60%)
const _portOpeningH = FIRE_SHIELD.portHeight; // 0.25 m
const _portBarrierThickness = 0.05;           // thin collision plane

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

// Check collision with rotated port barrier. Barrier is a thin rectangular plane
// that blocks balls from freely rolling into the fire shield port.
function bounceFromPortBarrier(b, barX, barZ, barAngle, openingW, _openingH) {
  // Transform ball position to local barrier coordinates
  const cosA = Math.cos(barAngle);
  const sinA = Math.sin(barAngle);
  const localX = (b.pos.x - barX) * cosA - (b.pos.z - barZ) * (-sinA);
  const localZ = (b.pos.x - barX) * (-sinA) + (b.pos.z - barZ) * cosA;

  // Check if ball is within the port opening area (with thickness)
  if (Math.abs(localX) <= openingW / 2 &&
      Math.abs(localZ) <= _portBarrierThickness / 2) {
    // Ball center is in the barrier volume — bounce it back
    const worldNx = -sinA;  // normal pointing out of the barrier
    const worldNz = cosA;
    const dist = Math.abs(localZ);
    const pen = _portBarrierThickness / 2 - dist;
    if (pen > 0) {
      b.pos.x += worldNx * (BALL_R - dist);
      b.pos.z += worldNz * (BALL_R - dist);
      const vn = b.vel.x * worldNx + b.vel.z * worldNz;
      if (vn < 0) {
        b.vel.x -= (1 + OBS_RESTITUTION) * vn * worldNx;
        b.vel.z -= (1 + OBS_RESTITUTION) * vn * worldNz;
      }
    }
  }
}

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

  // Port barriers (invisible collision planes at fire shield port openings)
  // Red shield port
  {
    const P1x = _half - _shieldOffX;
    const P1z = _half - _shieldExtension;
    const P2x = _half;
    const P2z = _half - _shieldExtension - _shieldOffZ;
    const Mx = (P1x + P2x) / 2;
    const Mz = (P1z + P2z) / 2;
    const dx = P2x - P1x;
    const dz = P2z - P1z;
    const barAngle = Math.atan2(-dz, dx);
    bounceFromPortBarrier(b, Mx, Mz, barAngle, _portOpeningW, _portOpeningH);
  }
  // Blue shield port
  {
    const P1x = -_half + _shieldOffX;
    const P1z = _half - _shieldExtension;
    const P2x = -_half;
    const P2z = _half - _shieldExtension - _shieldOffZ;
    const Mx = (P1x + P2x) / 2;
    const Mz = (P1z + P2z) / 2;
    const dx = P2x - P1x;
    const dz = P2z - P1z;
    const barAngle = Math.atan2(-dz, dx);
    bounceFromPortBarrier(b, Mx, Mz, barAngle, _portOpeningW, _portOpeningH);
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
// `targeted` — optional Set of ball indices currently claimed by a robot that
// is driving toward them; those balls are exempt from inter-ball collisions so
// they cannot be knocked away before the robot arrives.
export function stepBallPhysics(balls, dt, targeted = null) {
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

  // Ball-ball collisions via spatial hash — O(n) average instead of O(n²).
  // Cell size = CONTACT_BB so neighbours are always in adjacent cells only.
  const CELL = CONTACT_BB;           // 0.10 m
  const ORIGIN = -_half;             // field spans [-half, +half]
  const NCELLS = Math.ceil(FIELD.size / CELL) + 2; // +2 for boundary slack

  // Reuse a flat index array to avoid GC pressure.
  const cellCount = NCELLS * NCELLS;
  // grid[c] = array of ball indices in cell c (cleared each frame).
  const grid = new Array(cellCount);
  for (let c = 0; c < cellCount; c++) grid[c] = [];

  function cellOf(x, z) {
    const cx = Math.floor((x - ORIGIN) / CELL);
    const cz = Math.floor((z - ORIGIN) / CELL);
    const cx2 = Math.max(0, Math.min(NCELLS - 1, cx));
    const cz2 = Math.max(0, Math.min(NCELLS - 1, cz));
    return cz2 * NCELLS + cx2;
  }

  // Insert active balls into grid.
  for (let i = 0; i < balls.length; i++) {
    const bi = balls[i];
    if (bi.state !== 'field' && bi.state !== 'rolling') continue;
    grid[cellOf(bi.pos.x, bi.pos.z)].push(i);
  }

  // For each rolling ball, check only its own cell and the 8 neighbours.
  for (let i = 0; i < balls.length; i++) {
    const bi = balls[i];
    if (bi.state !== 'rolling') continue;

    const cx = Math.floor((bi.pos.x - ORIGIN) / CELL);
    const cz = Math.floor((bi.pos.z - ORIGIN) / CELL);

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx2 = cx + dx;
        const nz2 = cz + dz;
        if (nx2 < 0 || nx2 >= NCELLS || nz2 < 0 || nz2 >= NCELLS) continue;
        const cell = grid[nz2 * NCELLS + nx2];
        for (let k = 0; k < cell.length; k++) {
          const j = cell[k];
          if (j <= i) continue;           // each pair once
          const bj = balls[j];
          if (bj.state !== 'field' && bj.state !== 'rolling') continue;
          // Skip inter-ball collision if either ball is currently targeted
          // by a robot — prevents the targeted ball from being knocked away.
          if (targeted && (targeted.has(i) || targeted.has(j))) continue;

          const ddx = bj.pos.x - bi.pos.x;
          const ddz = bj.pos.z - bi.pos.z;
          const dist = Math.hypot(ddx, ddz);
          if (dist >= CONTACT_BB || dist < 1e-6) continue;

          const nx = ddx / dist;
          const nz = ddz / dist;
          const overlap = (CONTACT_BB - dist) * 0.5;
          bi.pos.x -= nx * overlap;
          bi.pos.z -= nz * overlap;
          bj.pos.x += nx * overlap;
          bj.pos.z += nz * overlap;

          const vi_n = bi.vel.x * nx + bi.vel.z * nz;
          const vj_n = bj.vel.x * nx + bj.vel.z * nz;
          const relVn = vi_n - vj_n;
          if (relVn > 0) {
            const imp = (1 + BALL_RESTITUTION) * 0.5 * relVn;
            bi.vel.x -= imp * nx;
            bi.vel.z -= imp * nz;
            bj.vel.x += imp * nx;
            bj.vel.z += imp * nz;
          }
          if (bj.state === 'field') bj.state = 'rolling';
          if (bi.state === 'field') bi.state = 'rolling';
        }
      }
    }
  }
  // Clear grid for next frame.
  for (let c = 0; c < cellCount; c++) grid[c].length = 0;
}
