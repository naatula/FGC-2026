import * as THREE from 'three';
import { ROBOT, COLORS } from '../field/dims.js';

// Robot = 50x50x50 cm chassis + small front intake + a single combined
// info-badge sprite (role ● label ● count in one element).

// Role colours and letter map.
const ROLE_COLOR = { supp: '#40c080', shield: '#f0b840', fault: '#e8394a' };
const ROLE_LETTER = { supp: 'S', shield: 'H', fault: 'F' };

// ── Combined info badge ────────────────────────────────────────────────────
// Canvas layout (256 × 64 px, 4:1 aspect):
//   [ 0-64 ] role circle  •  [ 64-192 ] label text  •  [ 192-256 ] count circle
// The count section is only painted when count > 0; otherwise it stays blank.

function makeInfoBadge() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false,
  }));
  sprite.renderOrder = 11;
  return { sprite, canvas, ctx, tex };
}

function paintInfoBadge(badge, label, role, count, allianceColor) {
  const { canvas, ctx, tex } = badge;
  const W = canvas.width;   // 256
  const H = canvas.height;  // 64
  const roleColor  = ROLE_COLOR[role]   ?? '#888';
  const roleLetter = ROLE_LETTER[role]  ?? '?';
  const allianceCss = allianceColor === 'red' ? '#a02030' : '#204fa0';
  const goldColor   = '#' + COLORS.gold.toString(16).padStart(6, '0');

  ctx.clearRect(0, 0, W, H);

  // Background pill
  const r = 14;
  ctx.beginPath();
  ctx.roundRect(2, 4, W - 4, H - 8, r);
  ctx.fillStyle = 'rgba(10,10,18,0.88)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = allianceCss;
  ctx.stroke();

  // ── Role circle (left section, cx=32) ────────────────────────────────
  ctx.beginPath();
  ctx.arc(32, H / 2, 22, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10,10,18,0.6)';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = roleColor;
  ctx.stroke();
  ctx.font = 'bold 26px Segoe UI, sans-serif';
  ctx.fillStyle = roleColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(roleLetter, 32, H / 2 + 1);

  // ── Label text (centre section, cx=128) ──────────────────────────────
  ctx.font = 'bold 36px Segoe UI, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, H / 2 + 1);

  // ── Count circle (right section, cx=224) — only when carrying ────────
  if (count > 0) {
    ctx.beginPath();
    ctx.arc(224, H / 2, 22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,10,18,0.6)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = goldColor;
    ctx.stroke();
    ctx.font = 'bold 28px Segoe UI, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(count), 224, H / 2 + 1);
  }

  tex.needsUpdate = true;
}

export function makeRobot(label, allianceColor) {
  const colorHex = allianceColor === 'red' ? COLORS.red : COLORS.blue;
  const dimHex = allianceColor === 'red' ? COLORS.redDim : COLORS.blueDim;
  const g = new THREE.Group();

  // Chassis
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(ROBOT.size, ROBOT.size * 0.7, ROBOT.size),
    new THREE.MeshStandardMaterial({
      color: dimHex,
      roughness: 0.5,
      metalness: 0.2,
      emissive: colorHex,
      emissiveIntensity: 0.08,
    })
  );
  chassis.position.y = ROBOT.size * 0.35;
  chassis.castShadow = true;
  g.add(chassis);

  // Top "bumper" stripe (alliance color)
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(ROBOT.size + 0.02, 0.08, ROBOT.size + 0.02),
    new THREE.MeshStandardMaterial({
      color: colorHex, emissive: colorHex, emissiveIntensity: 0.4,
    })
  );
  stripe.position.y = ROBOT.size * 0.55;
  g.add(stripe);

  // Climb hook (visible top mast for the anchor)
  const mast = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.5, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x666677, metalness: 0.5 })
  );
  mast.position.y = ROBOT.size * 0.7 + 0.25;
  mast.visible = false; // only the anchor robot shows it
  g.add(mast);

  // Combined info badge: [role●] [label] [count] — single sprite for all 3.
  // Canvas 256×64 → 4:1 aspect; scale (0.72, 0.18) → ~72 cm × 18 cm in world.
  const infoBadge = makeInfoBadge();
  infoBadge.sprite.scale.set(0.72, 0.18, 1);
  infoBadge.sprite.position.set(0, ROBOT.size + 0.42, 0);
  paintInfoBadge(infoBadge, label, 'supp', 0, allianceColor);
  g.add(infoBadge.sprite);

  return {
    group: g,
    chassis,
    mast,
    infoBadge,
    // Store display state so repaints can redraw the full badge.
    _label: label,
    _role: 'supp',
    _count: 0,
    _alliance: allianceColor,
    label,
    alliance: allianceColor,
    climbZone: null,
    isAnchor: false,
    suspendedFromAnchor: null,
  };
}

export function setCarryCount(robot, n) {
  if (robot._count === n) return;
  robot._count = n;
  paintInfoBadge(robot.infoBadge, robot._label, robot._role, n, robot._alliance);
}

export function setRobotPosition(robot, x, y, z) {
  robot.group.position.set(x, y, z);
}

// Rotate the robot group to face a direction given as (dx, dz).
// No-ops if the vector is near-zero (robot stationary or snapped).
export function setRobotHeading(robot, dx, dz) {
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return;
  robot.group.rotation.y = Math.atan2(dx, dz);
}

export function setAnchor(robot, isAnchor) {
  robot.isAnchor = isAnchor;
  robot.mast.visible = isAnchor;
}

export function setRobotRole(robot, role) {
  if (robot._role === role) return;
  robot._role = role;
  paintInfoBadge(robot.infoBadge, robot._label, role, robot._count, robot._alliance);
}
