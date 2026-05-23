import * as THREE from 'three';
import {
  WILDFIRE, COLORS, FIELD, ROBOT, SUPPRESSION, EXTINGUISHER,
} from '../field/dims.js';

// A pool of `count` wildfire balls implemented as an InstancedMesh.
// Each ball has a position and a `state`:
//   - 'pending':   not yet released (hidden inside spawn slot)
//   - 'field':     on the playing field surface, idle
//   - 'rolling':   moving on the field after being pushed (not targetable)
//   - 'carried':   held by a robot (hidden; carry count shown via badge)
//   - 'inShield':  inside the fire-shield queue (hidden)
//   - 'scored':    deposited in a suppression unit or extinguisher (hidden)

const HIDDEN = new THREE.Vector3(0, -10, 0);
const DUMMY = new THREE.Object3D();

// Exclusion AABBs (inflated by robot half-size + clearance) where wildfire
// must NOT come to rest — robots can't fetch balls trapped in these zones.
const _half = FIELD.size / 2;
const _inflate = ROBOT.size / 2 + 0.10;
// Suppression unit AABB center X (inner side flush with Extinguisher)
const _sUnitX = EXTINGUISHER.width / 2 + SUPPRESSION.width / 2;
// Fire shield geometry constants for exclusion zones
const _shieldWallLen = 0.80;
const _shieldAngleRad = 30 * Math.PI / 180;
const _shieldOffX = _shieldWallLen * Math.cos(_shieldAngleRad);  // ≈ 0.693
const _shieldOffZ = _shieldWallLen * Math.sin(_shieldAngleRad);  // ≈ 0.40
const _shieldExtension = 1.00;
const _exclusions = [
  {
    minX: _sUnitX - SUPPRESSION.width / 2 - _inflate,
    maxX: _sUnitX + SUPPRESSION.width / 2 + _inflate,
    minZ: -_half - _inflate,
    maxZ: -_half + SUPPRESSION.depth + _inflate,
  },
  {
    minX: -_sUnitX - SUPPRESSION.width / 2 - _inflate,
    maxX: -_sUnitX + SUPPRESSION.width / 2 + _inflate,
    minZ: -_half - _inflate,
    maxZ: -_half + SUPPRESSION.depth + _inflate,
  },
  {
    minX: -EXTINGUISHER.width / 2 - _inflate,
    maxX:  EXTINGUISHER.width / 2 + _inflate,
    minZ: -_half - _inflate,
    maxZ: -_half + EXTINGUISHER.depth + _inflate,
  },
  // Red fire shield (top-right corner at +X, +Z)
  {
    minX: _half - _shieldOffX - _inflate,
    maxX: _half + _inflate,
    minZ: _half - _shieldExtension - _shieldOffZ - _inflate,
    maxZ: _half + _inflate,
  },
  // Blue fire shield (top-left corner at -X, +Z)
  {
    minX: -_half - _inflate,
    maxX: -_half + _shieldOffX + _inflate,
    minZ: _half - _shieldExtension - _shieldOffZ - _inflate,
    maxZ: _half + _inflate,
  },
];

export function isInExclusionZone(x, z) {
  for (const ab of _exclusions) {
    if (x >= ab.minX && x <= ab.maxX && z >= ab.minZ && z <= ab.maxZ) return true;
  }
  return false;
}

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

  function randomScatter() {
    const span = _half - 0.30; // keep balls 0.30m off the guardrails
    for (let attempt = 0; attempt < 25; attempt++) {
      const x = (Math.random() - 0.5) * 2 * span;
      const z = (Math.random() - 0.5) * 2 * span;
      if (!isInExclusionZone(x, z)) {
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
      vel: { x: 0, z: 0 },
    });
  }

  function update() {
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.state === 'carried' || b.state === 'scored' || b.state === 'inShield') {
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

