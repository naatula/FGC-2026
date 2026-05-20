import * as THREE from 'three';
import {
  WILDFIRE, COLORS, FIELD, ROBOT, SUPPRESSION, EXTINGUISHER,
} from '../field/dims.js';

// A pool of `count` wildfire balls implemented as an InstancedMesh.
// Each ball has a position and a `state`:
//   - 'pending':   not yet released (hidden inside spawn slot)
//   - 'field':     on the playing field surface, idle
//   - 'carried':   attached to a robot (hidden — robot's carryBall is shown)
//   - 'scored':    deposited in a suppression unit or extinguisher (hidden)

const HIDDEN = new THREE.Vector3(0, -10, 0);
const DUMMY = new THREE.Object3D();

export function makeWildfire(scene, spawnSlot) {
  const geo = new THREE.SphereGeometry(WILDFIRE.radius, 10, 8);
  const mat = new THREE.MeshStandardMaterial({
    color: COLORS.wildfire,
    roughness: 0.65,
    emissive: COLORS.wildfire,
    emissiveIntensity: 0.05,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, WILDFIRE.count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);

  // Compute exclusion AABBs (inflated by robot half-size + clearance) where
  // wildfire must NOT land — otherwise robots get stuck trying to fetch balls
  // physically trapped under the suppression units / extinguisher / shields.
  const half = FIELD.size / 2;
  const inflate = ROBOT.size / 2 + 0.10;
  const sUnitX = half * 0.55;
  const sUnitMinZ = -half;
  const sUnitMaxZ = -half + SUPPRESSION.depth;
  const exclusions = [
    // Red suppression unit
    {
      minX: sUnitX - SUPPRESSION.width / 2 - inflate,
      maxX: sUnitX + SUPPRESSION.width / 2 + inflate,
      minZ: sUnitMinZ - inflate,
      maxZ: sUnitMaxZ + inflate,
    },
    // Blue suppression unit
    {
      minX: -sUnitX - SUPPRESSION.width / 2 - inflate,
      maxX: -sUnitX + SUPPRESSION.width / 2 + inflate,
      minZ: sUnitMinZ - inflate,
      maxZ: sUnitMaxZ + inflate,
    },
    // Extinguisher (at center back)
    {
      minX: -EXTINGUISHER.width / 2 - inflate,
      maxX:  EXTINGUISHER.width / 2 + inflate,
      minZ: -half - inflate,
      maxZ: -half + EXTINGUISHER.depth + inflate,
    },
    // Red fire shield triangle (front-right corner). Triangle vertices are
    // (corner, +Z-guardrail point, side-guardrail point); exclude their AABB
    // (with inflation) so wildfire never lands inside the shield's footprint
    // or right against the port wall.
    {
      minX: half - 0.80 * Math.cos(Math.PI / 6) - inflate,
      maxX: half + inflate,
      minZ: half - 0.80 * Math.sin(Math.PI / 6) - inflate,
      maxZ: half + inflate,
    },
    // Blue fire shield (front-left corner) — mirrored.
    {
      minX: -half - inflate,
      maxX: -half + 0.80 * Math.cos(Math.PI / 6) + inflate,
      minZ: half - 0.80 * Math.sin(Math.PI / 6) - inflate,
      maxZ: half + inflate,
    },
  ];

  function insideExclusion(x, z) {
    for (const ab of exclusions) {
      if (x >= ab.minX && x <= ab.maxX && z >= ab.minZ && z <= ab.maxZ) return true;
    }
    return false;
  }

  function randomScatter() {
    const span = half - 0.30; // keep balls 0.30m off the guardrails
    for (let attempt = 0; attempt < 25; attempt++) {
      const x = (Math.random() - 0.5) * 2 * span;
      const z = (Math.random() - 0.5) * 2 * span;
      if (!insideExclusion(x, z)) {
        return new THREE.Vector3(x, WILDFIRE.radius, z);
      }
    }
    // Fallback: push toward the field center.
    return new THREE.Vector3(
      (Math.random() - 0.5) * 1.5,
      WILDFIRE.radius,
      (Math.random() - 0.5) * 1.5,
    );
  }

  // Initialize: pack all balls into the spawn slot (hidden behind the
  // extinguisher's base slot panel until release).
  const balls = [];
  for (let i = 0; i < WILDFIRE.count; i++) {
    balls.push({
      state: 'pending',
      pos: spawnSlot.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 1.4,
        WILDFIRE.radius + Math.random() * 0.15,
        -0.05 - Math.random() * 0.1
      )),
      scatter: randomScatter(),
      releaseAt: 0.05 + Math.random() * 0.8,
    });
  }

  function update() {
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.state === 'carried' || b.state === 'scored') {
        DUMMY.position.copy(HIDDEN);
      } else {
        DUMMY.position.copy(b.pos);
      }
      DUMMY.rotation.set(0, 0, 0);
      DUMMY.scale.set(1, 1, 1);
      DUMMY.updateMatrix();
      mesh.setMatrixAt(i, DUMMY.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, balls, update };
}

// Pick an idle ball that lies closest to `from` and not in the given exclude
// set. Returns its index or -1.
export function pickClosestFieldBall(wildfire, from, exclude = new Set()) {
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < wildfire.balls.length; i++) {
    const b = wildfire.balls[i];
    if (b.state !== 'field' || exclude.has(i)) continue;
    const d = b.pos.distanceToSquared(from);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx;
}

// Pick the closest idle ball whose XZ position lies inside the given lane
// rectangle. `xRange` and `zRange` are [min, max] arrays. Falls back to the
// unrestricted search when the lane is empty so a robot doesn't stall.
export function pickClosestFieldBallInZone(
  wildfire, from, xRange, zRange, exclude = new Set()
) {
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < wildfire.balls.length; i++) {
    const b = wildfire.balls[i];
    if (b.state !== 'field' || exclude.has(i)) continue;
    if (b.pos.x < xRange[0] || b.pos.x > xRange[1]) continue;
    if (b.pos.z < zRange[0] || b.pos.z > zRange[1]) continue;
    const d = b.pos.distanceToSquared(from);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  if (bestIdx >= 0) return bestIdx;
  return pickClosestFieldBall(wildfire, from, exclude);
}
