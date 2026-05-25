import * as THREE from 'three';
import { FIRE_SHIELD, FIELD, COLORS, ROBOT, WILDFIRE } from './dims.js';
import { makeCountSprite, paintCountBadge } from '../ui/badge.js';

// FIRE SHIELDS — one per alliance, in the two front (+Z) corners of the field.
// Geometry per the 2026 FGC manual & image3.png: a triangular structure tucked
// into the corner. Two faces lie along the +Z and side guardrails; the third
// face is the angled POLYCARBONATE PORT WALL with the PORT opening at the
// bottom. The angled wall makes ~30° with the +Z guardrail so its outward
// normal points roughly toward the EXTINGUISHER at the back of the field.
//
// We omit the CHUTE and LEVER (per user clarification: the sample robots have
// no manual-loading features in this sim).
//
// A slightly-raised colored LOADING AREA extends out from the port wall into
// the field — this is where the robot parks to push wildfire through the port.

const WALL_LEN = 0.80;                    // length of the angled port wall (m)
const WALL_ANGLE_DEG = 30;                // angle vs the +Z guardrail
const EXTENSION_DEPTH = 1.00;             // shield is extended 1 m toward -Z
                                          // (toward the suppression units /
                                          // extinguisher at the back of the
                                          // field). The angled port wall moves
                                          // back; the side guardrail wall
                                          // lengthens; a new inboard wall
                                          // closes the gap to the front
                                          // guardrail.

export function buildFireShields(scene) {
  const half = FIELD.size / 2;
  const H = FIRE_SHIELD.height;
  const portH = FIRE_SHIELD.portHeight;
  const angleRad = WALL_ANGLE_DEG * Math.PI / 180;
  const offX = WALL_LEN * Math.cos(angleRad);  // ≈ 0.693
  const offZ = WALL_LEN * Math.sin(angleRad);  // ≈ 0.40

  function buildOne(color, cornerX, cornerZ, signX) {
    // signX = +1 for red (+X corner), -1 for blue (-X corner).
    const group = new THREE.Group();

    // Original wall endpoints (before extension):
    //   P1_front sits on the +Z guardrail at z = cornerZ.
    //   P2_orig  sat on the side guardrail at x = cornerX.
    // After extending the shield 1 m toward -Z, the angled port wall moves
    // back by EXTENSION_DEPTH; the +Z guardrail wall stays where it was; a
    // new inboard wall connects the old P1 position to the new P1 position.
    const P1x = cornerX - signX * offX;
    const P1z_front = cornerZ;
    const P1z = cornerZ - EXTENSION_DEPTH;
    const P2x = cornerX;
    const P2z = cornerZ - offZ - EXTENSION_DEPTH;
    const Mx = (P1x + P2x) / 2;
    const Mz = (P1z + P2z) / 2;
    const dx = P2x - P1x;
    const dz = P2z - P1z;

    // Three.js rotation.y = θ maps local +X → (cos θ, 0, −sin θ).
    // We want local +X to align with (dx, dz)/|·|, so θ = atan2(−dz, dx).
    const wallAngleY = Math.atan2(-dz, dx);

    // Outward normal (perpendicular to the wall, pointing INTO the field).
    // For red (signX=+1) the rotation that takes the wall vector to its
    // into-field perpendicular is CW, for blue (signX=-1) it's CCW — so we
    // flip with signX.
    const nLen = Math.hypot(dx, dz) || 1;
    const normX = signX * (dz / nLen);        // red: -0.5,  blue: +0.5
    const normZ = signX * (-dx / nLen);       // red: -0.866, blue: -0.866

    // --- Materials ---
    const tintMat = new THREE.MeshStandardMaterial({
      color, transparent: true, opacity: 0.40,
      roughness: 0.2, emissive: color, emissiveIntensity: 0.20,
    });
    const polyMat = new THREE.MeshStandardMaterial({
      color: COLORS.polycarb, transparent: true, opacity: 0.20,
      roughness: 0.1,
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x404048, metalness: 0.4, roughness: 0.6,
    });
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x18181f, transparent: true, opacity: 0.85,
      roughness: 0.7, side: THREE.DoubleSide,
    });

    // --- 1) ANGLED PORT WALL ---
    // Upper polycarb band (above the port opening).
    const upperH = H - portH;
    const upper = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_LEN, upperH, 0.04), tintMat
    );
    upper.position.set(Mx, portH + upperH / 2, Mz);
    upper.rotation.y = wallAngleY;
    group.add(upper);

    // Side strips flanking the port. The port opening occupies the middle
    // ~60% of the wall.
    const portStripW = WALL_LEN * 0.20;
    const portOpeningW = WALL_LEN - 2 * portStripW;
    const stripCenter = WALL_LEN / 2 - portStripW / 2;
    for (const sign of [-1, +1]) {
      const off = sign * stripCenter;
      const sx = off * Math.cos(wallAngleY);
      const sz = -off * Math.sin(wallAngleY);
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(portStripW, portH, 0.04), tintMat
      );
      strip.position.set(Mx + sx, portH / 2, Mz + sz);
      strip.rotation.y = wallAngleY;
      group.add(strip);
    }

    // Port top frame (decorative outline)
    const portTop = new THREE.Mesh(
      new THREE.BoxGeometry(portOpeningW, 0.025, 0.06), frameMat
    );
    portTop.position.set(Mx, portH, Mz);
    portTop.rotation.y = wallAngleY;
    group.add(portTop);

    // --- 2) GUARDRAIL-SIDE WALLS (clear polycarb) ---
    // Original +Z guardrail wall: old P1 → corner along the front guardrail
    // (axis-aligned with world X). Stays where it was; the angled port wall
    // is now offset from it by EXTENSION_DEPTH, so this stub remains at the
    // front of the shield.
    {
      const len = Math.abs(cornerX - P1x);
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(len, H, 0.03), polyMat
      );
      wall.position.set((P1x + cornerX) / 2, H / 2, cornerZ);
      group.add(wall);
    }
    // Side guardrail wall: cornerZ → new P2z (EXTENDED by EXTENSION_DEPTH).
    {
      const len = Math.abs(cornerZ - P2z);
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, H, len), polyMat
      );
      wall.position.set(cornerX, H / 2, (P2z + cornerZ) / 2);
      group.add(wall);
    }
    // NEW inboard wall (the "missing geometry" box): closes the gap from the
    // old front guardrail P1 to the moved-back angled-wall P1. Runs along Z
    // at x = P1x.
    {
      const len = Math.abs(P1z_front - P1z);
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, H, len), polyMat
      );
      wall.position.set(P1x, H / 2, (P1z_front + P1z) / 2);
      group.add(wall);
    }

    // --- 3) PENTAGONAL FLOOR (corner C → old P1 → new P1 → new P2 → C) ---
    const shape = new THREE.Shape();
    shape.moveTo(cornerX, cornerZ);
    shape.lineTo(P1x, P1z_front);
    shape.lineTo(P1x, P1z);
    shape.lineTo(P2x, P2z);
    shape.lineTo(cornerX, cornerZ);
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), floorMat);
    floor.rotation.x = -Math.PI / 2;   // shape XY-plane → world XZ-plane
    floor.position.y = 0.015;
    group.add(floor);

    // Ball pile for queue visualization — one mesh per possible ball.
    const MAX_FILL_PROXY = WILDFIRE.count;
    const fillGroup = new THREE.Group();
    const ballGeo = new THREE.SphereGeometry(WILDFIRE.radius, 8, 6);
    const ballMat = new THREE.MeshStandardMaterial({ color: COLORS.wildfire, roughness: 0.65 });
    const pileCols = 4, pileRows = 2;
    const pileCenterX = (P1x + cornerX) / 2;
    const pileCenterZ = cornerZ - EXTENSION_DEPTH / 2;
    for (let i = 0; i < MAX_FILL_PROXY; i++) {
      const m = new THREE.Mesh(ballGeo, ballMat);
      const layer = Math.floor(i / (pileCols * pileRows));
      const idxInLayer = i % (pileCols * pileRows);
      const pr = Math.floor(idxInLayer / pileCols);
      const pc = idxInLayer % pileCols;
      const jitter = (Math.random() - 0.5) * 0.01;
      m.position.set(
        pileCenterX + (pc - (pileCols - 1) / 2) * (WILDFIRE.radius * 2.05) + jitter,
        WILDFIRE.radius + layer * (WILDFIRE.radius * 1.7) + jitter,
        pileCenterZ + (pr - (pileRows - 1) / 2) * (WILDFIRE.radius * 1.6) + jitter
      );
      m.visible = false;
      fillGroup.add(m);
    }
    group.add(fillGroup);

    // Count badge (floating number)
    const countBadge = makeCountSprite();
    countBadge.sprite.position.set(Mx, portH + 0.4, Mz);
    countBadge.sprite.scale.set(0.4, 0.4, 1);
    group.add(countBadge.sprite);

    scene.add(group);

    // --- Anchors (world-space) ---
    // PORT: middle of the port opening, on the wall.
    const port = new THREE.Vector3(Mx, portH * 0.5, Mz);

    // APPROACH: robot center, parked on the loading area just outside the
    // wall. Robot drives onto the loading area and stops here.
    const approachDist = ROBOT.size / 2 + 0.15;
    const approach = new THREE.Vector3(
      Mx + normX * approachDist,
      0,
      Mz + normZ * approachDist,
    );

    // Throw-spawn point used by the human-player → extinguisher arc. Place
    // it just inside the shield at chest height (no chute is modeled).
    const throwSpawn = new THREE.Vector3(
      Mx - normX * 0.18,
      1.30,
      Mz - normZ * 0.18,
    );

    // No-op gate (we omit the chute/lever, but legacy setGateOpen still calls
    // shield.gate.rotation.x).
    const gate = { rotation: { x: 0 } };

    return {
      group, gate, port, approach,
      chuteExit: throwSpawn,
      normal: new THREE.Vector3(normX, 0, normZ),
      wallMidpoint: new THREE.Vector3(Mx, 0, Mz),
      countBadge, fillGroup,
      corners: { P1: new THREE.Vector3(P1x, 0, P1z),
                 P2: new THREE.Vector3(P2x, 0, P2z),
                 C:  new THREE.Vector3(cornerX, 0, cornerZ) },
    };
  }

  const red  = buildOne(COLORS.red,   half, half, +1);
  const blue = buildOne(COLORS.blue, -half, half, -1);

  return { red, blue };
}

export function setGateOpen(shield, open) {
  // Gate/lever are not modeled (per user). No-op kept for callers.
  if (shield && shield.gate && shield.gate.rotation) {
    shield.gate.rotation.x = open ? -1.2 : 0;
  }
}

export function updateFireShieldFill(shield, ballsContained, color = '#f0b840') {
  paintCountBadge(shield.countBadge, ballsContained, color);
  const n = shield.fillGroup.children.length;
  const visibleCount = Math.min(n, ballsContained);
  for (let i = 0; i < n; i++) {
    shield.fillGroup.children[i].visible = i < visibleCount;
  }
}
