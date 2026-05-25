import * as THREE from 'three';
import { SUPPRESSION, FIELD, EXTINGUISHER, COLORS, WILDFIRE } from './dims.js';
import { makeCountSprite, paintCountBadge } from '../ui/badge.js';

// Suppression Units flank the Extinguisher at the back of the field. Footprint
// is an asymmetric trapezoid (plan view, red on +X):
//
//     back guardrail (z = -half)
//     +------------------+
//     |                 /
//     | (inner flush  /  <- outer side, 60° from front edge
//     |  with Ext.)  /
//     +-------------+
//        90 cm front face (the "main edge")
//
// The inner side sits at world x = ±EXTINGUISHER.width/2 (no gap with the
// Extinguisher). For the blue unit the geometry is mirrored via scale.x = -1.
//
// Local coordinate frame (per unit):
//   origin  = center of AABB
//   +x      = outward (away from extinguisher)
//   +z      = forward (toward field center)
//   so inner side is at x = -backWidth/2, back side at z = -depth/2.

const POLYCARB_OPACITY = 0.18;

function makeUnit(color, ledColor) {
  const g = new THREE.Group();
  const polyMat = new THREE.MeshStandardMaterial({
    color: COLORS.polycarb,
    transparent: true,
    opacity: POLYCARB_OPACITY,
    roughness: 0.1,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const tintMat = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity: 0.32,
    roughness: 0.2,
    emissive: color,
    emissiveIntensity: 0.15,
    side: THREE.DoubleSide,
  });

  const fw = SUPPRESSION.frontWidth;
  const bw = SUPPRESSION.backWidth;
  const d  = SUPPRESSION.depth;
  const h  = SUPPRESSION.height;
  const ch = SUPPRESSION.canopyHeight;
  const ceil = SUPPRESSION.ceilingHeight;
  // Front face X span (local): from -bw/2 to -bw/2 + fw
  const frontMinX = -bw / 2;
  const frontMaxX = -bw / 2 + fw;
  const frontCenterX = (frontMinX + frontMaxX) / 2;

  // Back wall (tinted backboard): full back-edge width
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(bw, h, 0.03),
    tintMat
  );
  back.position.set(0, h / 2, -d / 2);
  g.add(back);

  // Inner side wall (flush with Extinguisher): straight, from back to front
  const innerSide = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, h, d),
    polyMat
  );
  innerSide.position.set(-bw / 2, h / 2, 0);
  g.add(innerSide);

  // Outer angled side wall: runs from front-outer-corner to back-outer-corner.
  // Height matches the front wall (ch) so the ledge sits flush on top of both.
  const outerLen = Math.hypot(SUPPRESSION.backOffset, d);
  const outerSide = new THREE.Mesh(
    new THREE.BoxGeometry(outerLen, ch, 0.03),
    polyMat
  );
  // center of the segment between (frontMaxX, d/2) and (bw/2, -d/2)
  outerSide.position.set(
    (frontMaxX + bw / 2) / 2,
    ch / 2,
    0
  );
  // angle the segment makes with +x axis (rotating in XZ-plane around Y)
  // direction from (frontMaxX, d/2) to (bw/2, -d/2) is (backOffset, -d)
  // rotation about Y: positive Y-rotation rotates +x toward -z, which matches
  outerSide.rotation.y = Math.atan2(d, SUPPRESSION.backOffset);
  g.add(outerSide);

  // Front face (the "main edge"): a polycarb wall with the door. Reaches up
  // only to where the triangular ledge begins (LEDGE.H_BOT) so the ledge
  // wraps cleanly above without intersecting this wall.
  const front = new THREE.Mesh(
    new THREE.BoxGeometry(fw, ch, 0.03),
    polyMat
  );
  front.position.set(frontCenterX, ch / 2, d / 2);
  g.add(front);

  // Roof: flat trapezoidal cap at y = ceil (ceiling height) covering the unit's full footprint
  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    frontMinX, ceil,  d / 2,   // front-inner
    frontMaxX, ceil,  d / 2,   // front-outer
    bw / 2,    ceil, -d / 2,   // back-outer
   -bw / 2,    ceil, -d / 2,   // back-inner
  ], 3));
  roofGeo.setIndex([0, 1, 2,  0, 2, 3]);
  roofGeo.computeVertexNormals();
  g.add(new THREE.Mesh(roofGeo, polyMat));

  // LED column inside the back wall — vertical bar that grows in fill
  const ledBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, ch, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 1 })
  );
  ledBase.position.set(0, ch / 2, -d / 2 + 0.04);
  g.add(ledBase);

  const ledFillGeo = new THREE.BoxGeometry(0.05, 1, 0.03);
  const led = new THREE.Mesh(
    ledFillGeo,
    new THREE.MeshStandardMaterial({
      color: ledColor,
      emissive: ledColor,
      emissiveIntensity: 1.2,
      roughness: 0.4,
    })
  );
  led.scale.y = 0.001;
  led.position.set(0, 0, -d / 2 + 0.05);
  g.add(led);

  // Containment fill — one mesh per possible ball.
  const MAX_FILL_PROXY = WILDFIRE.count;
  const fillGroup = new THREE.Group();
  const ballGeo = new THREE.SphereGeometry(WILDFIRE.radius, 8, 6);
  const ballMat = new THREE.MeshStandardMaterial({
    color: COLORS.wildfire, roughness: 0.65,
  });
  const cols = 6, rows = 4;
  for (let i = 0; i < MAX_FILL_PROXY; i++) {
    const m = new THREE.Mesh(ballGeo, ballMat);
    const layer = Math.floor(i / (cols * rows));
    const idxInLayer = i % (cols * rows);
    const r = Math.floor(idxInLayer / cols);
    const c = idxInLayer % cols;
    const jitter = (Math.random() - 0.5) * 0.01;
    m.position.set(
      frontCenterX + (c - (cols - 1) / 2) * (WILDFIRE.radius * 2.05) + jitter,
      WILDFIRE.radius + layer * (WILDFIRE.radius * 1.7) + (r * 0.02) + jitter,
      (r - (rows - 1) / 2) * (WILDFIRE.radius * 1.6) + jitter
    );
    m.visible = false;
    fillGroup.add(m);
  }
  g.add(fillGroup);

  // Count badge (floating number above the canopy)
  const countBadge = makeCountSprite();
  countBadge.sprite.position.set(frontCenterX, ch + 0.3, -d / 2 + 0.4);
  countBadge.sprite.scale.set(0.4, 0.4, 1);
  g.add(countBadge.sprite);

  return { group: g, led, fillGroup, countBadge, frontCenterX };
}

export function buildSuppressionUnits(scene) {
  const half = FIELD.size / 2;
  const bw = SUPPRESSION.backWidth;
  const d  = SUPPRESSION.depth;

  // Inner side (flush with Extinguisher) sits at x = ±EXTINGUISHER.width/2.
  // The unit's local origin is at its AABB center → world X = innerX + bw/2.
  const innerX = EXTINGUISHER.width / 2;
  const aabbCenterX = innerX + bw / 2;
  const groupZ = -half + d / 2;

  const red = makeUnit(COLORS.red, COLORS.red);
  red.group.position.set(aabbCenterX, 0, groupZ);
  scene.add(red.group);

  const blue = makeUnit(COLORS.blue, COLORS.blue);
  // Mirror the local +x = outward convention by flipping the group
  blue.group.position.set(-aabbCenterX, 0, groupZ);
  blue.group.scale.x = -1;
  scene.add(blue.group);

  // Anchor point: idx 0 stands here, clear of the canopy's forward overhang
  // so it has a free upward shot into the open top of the unit. Other lanes
  // queue behind via LANE_DZ in the scheduler.
  const forwardClear = SUPPRESSION.canopyOverhang + 0.20;
  // World X of the front face center for red = aabbCenterX + frontCenterX(local)
  const redFrontX = red.group.position.x + red.frontCenterX;
  const blueFrontX = blue.group.position.x - blue.frontCenterX; // mirrored
  const anchorZ = groupZ + d / 2 + forwardClear;

  const redAnchor = new THREE.Vector3(redFrontX, 0, anchorZ);
  const blueAnchor = new THREE.Vector3(blueFrontX, 0, anchorZ);

  return {
    red:  { ...red,  anchor: redAnchor  },
    blue: { ...blue, anchor: blueAnchor },
  };
}

export function updateSuppressionFill(unit, ballsContained, totalCapacity = 180) {
  const frac = Math.min(1, ballsContained / totalCapacity);
  unit.led.scale.y = Math.max(0.001, frac);
  unit.led.position.y = (SUPPRESSION.canopyHeight * frac) / 2;

  const n = unit.fillGroup.children.length;
  const visibleCount = Math.min(n, ballsContained);
  for (let i = 0; i < n; i++) {
    unit.fillGroup.children[i].visible = i < visibleCount;
  }

  paintCountBadge(unit.countBadge, ballsContained);
}
