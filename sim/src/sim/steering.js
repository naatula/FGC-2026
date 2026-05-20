import * as THREE from 'three';
import {
  FIELD, ROBOT, SUPPRESSION, EXTINGUISHER, FIRE_SHIELD,
} from '../field/dims.js';
import { PARAMS } from './config.js';

// Reactive "boids-style" steering for robots driving toward a target.
//   - separation:   repel from other robots within avoidRadius
//   - obstacle:     repel from static field objects (units, extinguisher, shields)
//   - guardrails:   soft repulsion from field edge so the robot doesn't ride the rail
//
// The repulsion strength scales linearly from 1 at the obstacle surface to 0
// at avoidRadius. To prevent two robots from oscillating side-to-side when
// approaching head-on, separation always biases to the *right* relative to the
// desired velocity direction (in XZ). This consistently picks a side.
//
// `vDesired` is a Vector3 (XZ plane; Y unused). Returns a new Vector3 with the
// adjusted velocity. The caller integrates with dt.

const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();

// Pre-built static obstacle list. Each entry: { type: 'aabb'|'circle', ... }
let staticObstacles = null;

export function buildStaticObstacles(world) {
  const half = FIELD.size / 2;
  const obs = [];

  for (const key of ['red', 'blue']) {
    const u = world.suppression[key];
    const sw = SUPPRESSION.width;
    const sd = SUPPRESSION.depth;
    obs.push({
      type: 'aabb',
      minX: u.group.position.x - sw / 2,
      maxX: u.group.position.x + sw / 2,
      minZ: u.group.position.z - sd / 2,
      maxZ: u.group.position.z + sd / 2,
    });
  }

  const e = world.extinguisher;
  obs.push({
    type: 'aabb',
    minX: e.group.position.x - EXTINGUISHER.width / 2,
    maxX: e.group.position.x + EXTINGUISHER.width / 2,
    minZ: e.group.position.z - EXTINGUISHER.depth / 2,
    maxZ: e.group.position.z + EXTINGUISHER.depth / 2,
  });

  // Fire shields intentionally omitted: a shield robot needs to drive right
  // up to the port from the field side, and the front of the shield is open
  // at robot height. Guardrail repulsion + arrival snap handle the rest.

  staticObstacles = { items: obs, half };
}

// Distance from point (px,pz) to the closest point on an AABB. Returns
// { dist, nx, nz } where (nx,nz) is the outward unit vector. Inside the
// AABB returns dist=0 with the shortest-out direction.
function aabbDist(px, pz, ab) {
  const cx = Math.max(ab.minX, Math.min(px, ab.maxX));
  const cz = Math.max(ab.minZ, Math.min(pz, ab.maxZ));
  const dx = px - cx;
  const dz = pz - cz;
  let d = Math.hypot(dx, dz);
  if (d < 1e-6) {
    // Inside: push toward nearest edge.
    const dLeft = px - ab.minX, dRight = ab.maxX - px;
    const dBack = pz - ab.minZ, dFront = ab.maxZ - pz;
    const m = Math.min(dLeft, dRight, dBack, dFront);
    if (m === dLeft)  return { dist: 0, nx: -1, nz: 0 };
    if (m === dRight) return { dist: 0, nx:  1, nz: 0 };
    if (m === dBack)  return { dist: 0, nx:  0, nz: -1 };
    return { dist: 0, nx: 0, nz: 1 };
  }
  return { dist: d, nx: dx / d, nz: dz / d };
}

// Returns a new Vector3 with the steering-adjusted velocity. `self` is the
// robot's logical {x,z} position, `others` is an array of other robots'
// {x,z} positions.
export function steer(selfX, selfZ, vDesired, others) {
  const out = TMP_A.set(vDesired.x, 0, vDesired.z);
  const desiredLen = Math.hypot(vDesired.x, vDesired.z);
  if (desiredLen < 1e-6) return new THREE.Vector3(0, 0, 0);

  const radius = PARAMS.avoidRadius;
  const strength = PARAMS.avoidStrength;
  const minSep = ROBOT.size;        // contact distance between robot centers
  const desiredSpeed = desiredLen;
  const dirX = vDesired.x / desiredLen;
  const dirZ = vDesired.z / desiredLen;
  // "Right" of the heading in XZ (rotating 90° CW): (dx,dz) → (dz, -dx)
  const rightX = dirZ;
  const rightZ = -dirX;

  // --- Robot-robot separation ---
  for (const o of others) {
    const dx = selfX - o.x;
    const dz = selfZ - o.z;
    const d = Math.hypot(dx, dz);
    if (d >= radius || d < 1e-6) continue;
    const t = 1 - d / radius;
    // Radial push away from the other robot.
    const w = strength * t * desiredSpeed;
    out.x += (dx / d) * w;
    out.z += (dz / d) * w;
    // Head-on bias: if the other robot is roughly in front of us (dot >0.5
    // with negated-radial = heading toward), nudge to our right to break
    // symmetry deterministically.
    const toOtherX = -dx / d;
    const toOtherZ = -dz / d;
    const headOn = toOtherX * dirX + toOtherZ * dirZ;
    if (headOn > 0.3) {
      const bias = strength * t * desiredSpeed * 0.8;
      out.x += rightX * bias;
      out.z += rightZ * bias;
    }
    // Hard-contact: if already inside minSep, also push positionally.
    if (d < minSep) {
      const extra = (minSep - d) * 4.0;
      out.x += (dx / d) * extra;
      out.z += (dz / d) * extra;
    }
  }

  // --- Static obstacles ---
  // Use a tight radius for static objects so robots can still drive right
  // up to score anchors that sit next to suppression units / shields. This
  // is contact-avoidance, not the wider "give-way" radius used for other
  // robots.
  if (staticObstacles) {
    const staticMargin = 0.25;  // m beyond inflated AABB before repulsion ramps in
    const inflated = ROBOT.size / 2 + 0.02;
    for (const ab of staticObstacles.items) {
      const r = aabbDist(selfX, selfZ, ab);
      const eff = r.dist - inflated;
      if (eff >= staticMargin) continue;
      const t = 1 - Math.max(0, eff) / staticMargin;
      const w = strength * t * desiredSpeed * 1.4;
      out.x += r.nx * w;
      out.z += r.nz * w;
    }
  }

  // --- Field guardrails (soft) ---
  const half = FIELD.size / 2;
  const railMargin = 0.30;
  if (selfX > half - railMargin) out.x -= (selfX - (half - railMargin)) * 5.0 * desiredSpeed;
  if (selfX < -half + railMargin) out.x += ((-half + railMargin) - selfX) * 5.0 * desiredSpeed;
  if (selfZ > half - railMargin) out.z -= (selfZ - (half - railMargin)) * 5.0 * desiredSpeed;
  if (selfZ < -half + railMargin) out.z += ((-half + railMargin) - selfZ) * 5.0 * desiredSpeed;

  // Renormalize back to desiredSpeed so robots don't slow down or speed up
  // through obstacle fields.
  const m = Math.hypot(out.x, out.z);
  if (m < 1e-6) return new THREE.Vector3(0, 0, 0);
  const k = desiredSpeed / m;
  return new THREE.Vector3(out.x * k, 0, out.z * k);
}

export function isObstacleBuilt() { return !!staticObstacles; }
