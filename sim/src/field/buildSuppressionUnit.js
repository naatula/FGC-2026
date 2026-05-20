import * as THREE from 'three';
import { SUPPRESSION, FIELD, COLORS, WILDFIRE } from './dims.js';

// Suppression Units sit at the back edge of the field, flanking the
// Extinguisher. Red is at +X side, blue at -X side, both at -Z (back).
//
// Layout: back wall of unit hugs the back guardrail; the unit faces +Z.
//
// We model:
//   - translucent backboard
//   - two side walls
//   - canopy overhang at top
//   - vertical LED indicator showing wildfire fill level
//
// Returns { group, redLed, blueLed, redAnchor, blueAnchor } where the anchors
// are world-space points where a robot "drops a ball" to score.

const POLYCARB_OPACITY = 0.18;

function makeCountSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false,
  }));
  sprite.renderOrder = 10;
  return { sprite, canvas, ctx, tex };
}

function paintCountBadge(badge, n) {
  const { canvas, ctx, tex } = badge;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,20,30,0.92)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#f0b840';
  ctx.stroke();
  ctx.font = 'bold 36px Segoe UI, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 32, 34);
  tex.needsUpdate = true;
}

function makeUnit(color, ledColor) {
  const g = new THREE.Group();
  const polyMat = new THREE.MeshStandardMaterial({
    color: COLORS.polycarb,
    transparent: true,
    opacity: POLYCARB_OPACITY,
    roughness: 0.1,
    metalness: 0.0,
  });
  const tintMat = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity: 0.32,
    roughness: 0.2,
    emissive: color,
    emissiveIntensity: 0.15,
  });

  // Backboard (full height)
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(SUPPRESSION.width, SUPPRESSION.height, 0.03),
    tintMat
  );
  back.position.set(0, SUPPRESSION.height / 2, -SUPPRESSION.depth / 2);
  g.add(back);

  // Two side walls
  const sideGeo = new THREE.BoxGeometry(0.03, SUPPRESSION.height, SUPPRESSION.depth);
  const sideL = new THREE.Mesh(sideGeo, polyMat);
  sideL.position.set(-SUPPRESSION.width / 2, SUPPRESSION.height / 2, 0);
  const sideR = sideL.clone();
  sideR.position.x = SUPPRESSION.width / 2;
  g.add(sideL, sideR);

  // Canopy: a forward-projecting awning at the top, covering the opening on
  // the front face. Per manual §2.2 the canopy bottom edge sits at 165 cm
  // and projects 40 cm beyond the front vertical surface. The unit's top is
  // OPEN (no lid) — balls are tossed in from above past the canopy edge.
  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(
      SUPPRESSION.width + 0.05,
      0.04,
      SUPPRESSION.canopyOverhang
    ),
    tintMat
  );
  canopy.position.set(
    0,
    SUPPRESSION.canopyHeight,
    SUPPRESSION.depth / 2 + SUPPRESSION.canopyOverhang / 2
  );
  g.add(canopy);

  // Two slim risers that visually attach the canopy to the back-top of the
  // unit, so the awning reads as a roof rather than a floating slab.
  const riserGeo = new THREE.BoxGeometry(
    0.04, SUPPRESSION.height - SUPPRESSION.canopyHeight, 0.04
  );
  const riserY = (SUPPRESSION.height + SUPPRESSION.canopyHeight) / 2;
  const riserL = new THREE.Mesh(riserGeo, polyMat);
  riserL.position.set(-SUPPRESSION.width / 2 + 0.04, riserY, SUPPRESSION.depth / 2);
  const riserR = riserL.clone();
  riserR.position.x = SUPPRESSION.width / 2 - 0.04;
  g.add(riserL, riserR);

  // LED column inside the back wall — vertical bar that grows in fill
  // We render it as two stacked boxes: dim base + bright fill that scales.
  const ledBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, SUPPRESSION.canopyHeight, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 1 })
  );
  ledBase.position.set(0, SUPPRESSION.canopyHeight / 2, -SUPPRESSION.depth / 2 + 0.04);
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
  led.position.set(0, 0, -SUPPRESSION.depth / 2 + 0.05);
  g.add(led);

  // Containment "fill" — a stack of small spheres rising visually as balls are
  // contained. We pre-make many spheres and reveal them progressively.
  const fillGroup = new THREE.Group();
  const ballGeo = new THREE.SphereGeometry(WILDFIRE.radius, 10, 8);
  const ballMat = new THREE.MeshStandardMaterial({
    color: COLORS.wildfire, roughness: 0.65
  });
  const cols = 9, rows = 5;
  const layerHeight = SUPPRESSION.canopyHeight - 0.2;
  for (let i = 0; i < 200; i++) {
    const m = new THREE.Mesh(ballGeo, ballMat);
    const layer = Math.floor(i / (cols * rows));
    const idxInLayer = i % (cols * rows);
    const r = Math.floor(idxInLayer / cols);
    const c = idxInLayer % cols;
    const jitter = (Math.random() - 0.5) * 0.01;
    m.position.set(
      (c - (cols - 1) / 2) * (WILDFIRE.radius * 2.05) + jitter,
      WILDFIRE.radius + layer * (WILDFIRE.radius * 1.7) +
        (r * 0.02) + jitter,
      (r - (rows - 1) / 2) * (WILDFIRE.radius * 1.6) + jitter -
        SUPPRESSION.depth * 0.1
    );
    if (m.position.y > layerHeight) break;
    m.visible = false;
    fillGroup.add(m);
  }
  g.add(fillGroup);

  // Count badge (floating number)
  const countBadge = makeCountSprite();
  countBadge.sprite.position.set(0, SUPPRESSION.canopyHeight + 0.3, -SUPPRESSION.depth / 2 + 0.4);
  countBadge.sprite.scale.set(0.4, 0.4, 1);
  g.add(countBadge.sprite);

  return { group: g, led, fillGroup, countBadge };
}

export function buildSuppressionUnits(scene) {
  const half = FIELD.size / 2;

  const red = makeUnit(COLORS.red, COLORS.red);
  // Red unit: at the +X side of the back wall
  red.group.position.set(
    half * 0.55,
    0,
    -half + SUPPRESSION.depth / 2
  );
  scene.add(red.group);

  const blue = makeUnit(COLORS.blue, COLORS.blue);
  blue.group.position.set(
    -half * 0.55,
    0,
    -half + SUPPRESSION.depth / 2
  );
  scene.add(blue.group);

  // Anchor point: idx 0 stands here, clear of the canopy's forward overhang
  // so it has a free upward shot into the open top of the unit. Other lanes
  // queue behind via LANE_DZ in the scheduler.
  const forwardClear = SUPPRESSION.canopyOverhang + 0.20; // past canopy edge
  const redAnchor = new THREE.Vector3(
    red.group.position.x,
    0,
    red.group.position.z + SUPPRESSION.depth / 2 + forwardClear
  );
  const blueAnchor = new THREE.Vector3(
    blue.group.position.x,
    0,
    blue.group.position.z + SUPPRESSION.depth / 2 + forwardClear
  );

  return {
    red: { ...red, anchor: redAnchor },
    blue: { ...blue, anchor: blueAnchor },
  };
}

export function updateSuppressionFill(unit, ballsContained, totalCapacity = 180) {
  // LED fill ratio
  const frac = Math.min(1, ballsContained / totalCapacity);
  unit.led.scale.y = Math.max(0.001, frac);
  unit.led.position.y = (SUPPRESSION.canopyHeight * frac) / 2;

  // Reveal physical balls in the fillGroup proportional to count
  const visibleCount = Math.min(unit.fillGroup.children.length, ballsContained);
  for (let i = 0; i < unit.fillGroup.children.length; i++) {
    unit.fillGroup.children[i].visible = i < visibleCount;
  }

  // Update count badge
  paintCountBadge(unit.countBadge, ballsContained);
}
