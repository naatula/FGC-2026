import * as THREE from 'three';
import { BRACE, FIELD, EXTINGUISHER, COLORS } from './dims.js';

// A brace is a cylinder rising from a front corner (low end ~24 cm) up to
// the top outer corner of the Extinguisher (high end ~197 cm).
// We tint the cylinder in three colored segments along its length for the
// three climbing zones, with white "gaffer tape" rings between them.

function makeBrace(color, lowEndPos, highEndPos) {
  const g = new THREE.Group();
  const start = lowEndPos.clone();
  const end = highEndPos.clone();
  const dir = end.clone().sub(start);
  const len = dir.length();
  const center = start.clone().add(end).multiplyScalar(0.5);

  // For each of the three zones, build a colored cylinder segment.
  const zones = [
    { range: BRACE.zone1Frac, opacity: 0.85, shade: 0.55 },
    { range: BRACE.zone2Frac, opacity: 0.90, shade: 0.75 },
    { range: BRACE.zone3Frac, opacity: 1.00, shade: 1.00 },
  ];

  // Cylinder orientation: by default cylinders are along +Y. We need to
  // orient them along `dir`.
  const orient = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );

  const segmentObjs = [];
  for (const z of zones) {
    const segLen = len * (z.range[1] - z.range[0]);
    const midFrac = (z.range[0] + z.range[1]) / 2;
    const midPos = start.clone().lerp(end, midFrac);

    const segColor = new THREE.Color(color).multiplyScalar(z.shade);
    const mat = new THREE.MeshStandardMaterial({
      color: segColor,
      metalness: 0.6,
      roughness: 0.3,
      emissive: segColor,
      emissiveIntensity: 0.15,
    });
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(BRACE.radius, BRACE.radius, segLen, 12),
      mat
    );
    seg.position.copy(midPos);
    seg.quaternion.copy(orient);
    g.add(seg);
    segmentObjs.push(seg);
  }

  // White gaffer-tape rings at zone boundaries
  for (const frac of [BRACE.zone1Frac[1], BRACE.zone2Frac[1]]) {
    const pos = start.clone().lerp(end, frac);
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(
        BRACE.radius * 1.4, BRACE.radius * 1.4, 0.04, 12
      ),
      new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3,
      })
    );
    ring.position.copy(pos);
    ring.quaternion.copy(orient);
    g.add(ring);
  }

  // Zone labels (sprite text at midpoints)
  const labels = ['Z1', 'Z2', 'Z3'];
  for (let i = 0; i < 3; i++) {
    const midFrac = (zones[i].range[0] + zones[i].range[1]) / 2;
    const pos = start.clone().lerp(end, midFrac);
    const sprite = makeTextSprite(labels[i]);
    sprite.position.copy(pos);
    sprite.position.x += Math.sign(start.x) * 0.18;
    g.add(sprite);
  }

  return { group: g, start, end, length: len };
}

function makeTextSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, 128, 64);
  ctx.font = 'bold 36px Segoe UI, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const s = new THREE.Sprite(mat);
  s.scale.set(0.35, 0.18, 1);
  return s;
}

export function buildBraces(scene) {
  const half = FIELD.size / 2;

  // Red brace: from front-right corner low, up to top of Extinguisher right
  // Blue brace: from front-left corner low, up to top of Extinguisher left

  const extTopY = EXTINGUISHER.height; // ~1.97 m, matches BRACE.highEnd
  const extHalfW = EXTINGUISHER.width / 2;
  const extZ = -FIELD.size / 2 + EXTINGUISHER.depth / 2;

  // Lower end: in the central gap between the two (extended) fire shields,
  // along the +X/-X line passing through the center of the respective
  // suppression unit. The suppression units sit at ±half*0.55 (see
  // buildSuppressionUnits).
  const suppCenterX = half * 0.55;
  const lowZ = half - 0.50;  // sits between the two fire shields

  const redLow = new THREE.Vector3(suppCenterX, BRACE.lowEnd, lowZ);
  const redHigh = new THREE.Vector3(
    extHalfW, extTopY, extZ - EXTINGUISHER.depth / 2 + 0.03
  );

  const blueLow = new THREE.Vector3(-suppCenterX, BRACE.lowEnd, lowZ);
  const blueHigh = new THREE.Vector3(
    -extHalfW, extTopY, extZ - EXTINGUISHER.depth / 2 + 0.03
  );

  const red = makeBrace(COLORS.red, redLow, redHigh);
  const blue = makeBrace(COLORS.blue, blueLow, blueHigh);
  scene.add(red.group);
  scene.add(blue.group);

  return { red, blue };
}

// Returns a world-space point on the brace at a given fractional position
// (0 = low end, 1 = high end). Offset is how far the robot hangs below the
// brace (default 0.30 m so the chassis is visibly suspended).
export function pointOnBrace(brace, t, hangBelow = 0.30) {
  const p = brace.start.clone().lerp(brace.end, t);
  p.y -= hangBelow;
  return p;
}
