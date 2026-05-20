import * as THREE from 'three';
import { SUPPRESSION, EXTINGUISHER, FIELD, COLORS } from './dims.js';

// A unified triangular-cross-section ledge that wraps around the combined
// front and outer perimeter of the two Suppression Units and the Extinguisher.
//
// Cross-section (vertical plane perpendicular to the segment), looking along
// the segment direction; "outward" = horizontal direction away from the
// structure:
//
//   y ▲
//     │
//   A ┃────────╮
//     │         ╲    top slope  (A → B)
//     │          ╲
//     │           ● B   apex (outward by L)
//     │          ╱
//     │         ╱    bottom slope  (C → B)
//   C ┃────────╯
//     │
//     └─ outward ───►
//
// No inner vertical face — the cross-section is open on the structure side so
// the view through the top of the walls is unobstructed. One slope per zone:
//   - over the Suppression Units: bottom slope omitted  → only top slope A→B
//   - over the Extinguisher:      top slope omitted     → only bottom slope C→B
//
// The ledge also wraps around each Suppression Unit's outer angled side
// section (60° wall).

const H_TOP  = 2.01;
const H_APEX = 1.85;
const H_BOT  = 1.65;  // = SUPPRESSION.canopyHeight — ledge sits on top of walls
const L_OUT  = SUPPRESSION.canopyOverhang;  // 0.40 m

function buildCornerCap(A, B1, B2, material) {
  const positions = [A.x, A.y, A.z, B1.x, B1.y, B1.z, B2.x, B2.y, B2.z];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex([0, 1, 2]);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

function addQuad(positions, indices, v0, v1, v2, v3) {
  const i = positions.length / 3;
  positions.push(v0.x, v0.y, v0.z);
  positions.push(v1.x, v1.y, v1.z);
  positions.push(v2.x, v2.y, v2.z);
  positions.push(v3.x, v3.y, v3.z);
  indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
}

function buildSegment(p1, p2, outward, openSide, material) {
  const out = outward.clone().multiplyScalar(L_OUT);
  const A1 = new THREE.Vector3(p1.x,           H_TOP,  p1.z);
  const C1 = new THREE.Vector3(p1.x,           H_BOT,  p1.z);
  const B1 = new THREE.Vector3(p1.x + out.x,   H_APEX, p1.z + out.z);
  const A2 = new THREE.Vector3(p2.x,           H_TOP,  p2.z);
  const C2 = new THREE.Vector3(p2.x,           H_BOT,  p2.z);
  const B2 = new THREE.Vector3(p2.x + out.x,   H_APEX, p2.z + out.z);

  const positions = [];
  const indices = [];

  if (openSide !== 'top') {
    // Top slope (A → B), quad A1-B1-B2-A2
    addQuad(positions, indices, A1, B1, B2, A2);
  }
  if (openSide !== 'bottom') {
    // Bottom slope (C → B), quad C1-C2-B2-B1
    addQuad(positions, indices, C1, C2, B2, B1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

export function buildTriangularLedge(scene) {
  const half = FIELD.size / 2;
  const sBack = -half;                                       // -3.50
  const sFront = sBack + SUPPRESSION.depth;                  // -2.90
  const eHalf = EXTINGUISHER.width / 2;                      // 0.45
  const sFrontOuter = eHalf + SUPPRESSION.frontWidth;        // 1.35
  const sBackOuter = sFrontOuter + SUPPRESSION.backOffset;   // ≈1.696

  const mat = new THREE.MeshStandardMaterial({
    color: COLORS.polycarb,
    transparent: true,
    opacity: 0.28,
    roughness: 0.1,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  // ── Front-facing segments (all at z = sFront, outward = +Z) ──────────────
  const nFwd = new THREE.Vector3(0, 0, 1);

  // Blue suppression unit front (open bottom)
  scene.add(buildSegment(
    new THREE.Vector3(-sFrontOuter, 0, sFront),
    new THREE.Vector3(-eHalf,       0, sFront),
    nFwd, 'bottom', mat,
  ));
  // Extinguisher front (open top — the human-player scoop)
  scene.add(buildSegment(
    new THREE.Vector3(-eHalf, 0, sFront),
    new THREE.Vector3( eHalf, 0, sFront),
    nFwd, 'top', mat,
  ));
  // Red suppression unit front (open bottom)
  scene.add(buildSegment(
    new THREE.Vector3( eHalf,       0, sFront),
    new THREE.Vector3( sFrontOuter, 0, sFront),
    nFwd, 'bottom', mat,
  ));

  // ── Vertical filler triangles in gaps between suppressors and extinguisher ──
  // Left (blue) side gap: from (-eHalf, H_BOT/H_TOP) to (-eHalf, top-slope-apex)
  const gapLeftBottom = new THREE.Vector3(-eHalf, H_BOT, sFront);
  const gapLeftTop = new THREE.Vector3(-eHalf, H_TOP, sFront);
  const gapLeftApex = new THREE.Vector3(-eHalf, H_APEX, sFront + L_OUT);
  const gapLeftMesh = buildCornerCap(gapLeftTop, gapLeftApex, gapLeftBottom, mat);
  scene.add(gapLeftMesh);

  // Right (red) side gap: mirror on X
  const gapRightBottom = new THREE.Vector3(eHalf, H_BOT, sFront);
  const gapRightTop = new THREE.Vector3(eHalf, H_TOP, sFront);
  const gapRightApex = new THREE.Vector3(eHalf, H_APEX, sFront + L_OUT);
  const gapRightMesh = buildCornerCap(gapRightTop, gapRightApex, gapRightBottom, mat);
  scene.add(gapRightMesh);

  // ── Outer angled side-section segments (each suppression unit) ────────────
  // Red outer angled wall: from (sFrontOuter, sFront) → (sBackOuter, sBack).
  // Wall direction (cos60°, 0, -sin60°) → outward perpendicular (rotate +90°
  // CCW in XZ when viewed from above) is (sin60°, 0, cos60°).
  const s = Math.sin(SUPPRESSION.angleRad);
  const c = Math.cos(SUPPRESSION.angleRad);

  scene.add(buildSegment(
    new THREE.Vector3( sFrontOuter, 0, sFront),
    new THREE.Vector3( sBackOuter,  0, sBack),
    new THREE.Vector3( s, 0, c),
    'bottom', mat,
  ));
  // Blue outer angled wall: mirror in X
  scene.add(buildSegment(
    new THREE.Vector3(-sFrontOuter, 0, sFront),
    new THREE.Vector3(-sBackOuter,  0, sBack),
    new THREE.Vector3(-s, 0, c),
    'bottom', mat,
  ));

  // ── Corner caps: fill the triangular gap where front meets angled segment ──
  // At each corner the inner A/C vertices coincide; only the top-slope apex B
  // differs between the two outward directions. One triangle per corner.
  scene.add(buildCornerCap(
    new THREE.Vector3( sFrontOuter, H_TOP,  sFront),
    new THREE.Vector3( sFrontOuter, H_APEX, sFront + L_OUT),
    new THREE.Vector3( sFrontOuter + s * L_OUT, H_APEX, sFront + c * L_OUT),
    mat,
  ));
  scene.add(buildCornerCap(
    new THREE.Vector3(-sFrontOuter, H_TOP,  sFront),
    new THREE.Vector3(-sFrontOuter, H_APEX, sFront + L_OUT),
    new THREE.Vector3(-sFrontOuter - s * L_OUT, H_APEX, sFront + c * L_OUT),
    mat,
  ));
}
