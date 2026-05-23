import * as THREE from 'three';
import { ROBOT, COLORS } from '../field/dims.js';

// Robot = 50x50x50 cm chassis + small front intake + label sprite.

function makeLabelSprite(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 128, 64);
  ctx.font = 'bold 42px Segoe UI, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
}

// Role colours and letter map.
const ROLE_COLOR = { supp: '#40c080', shield: '#f0b840', fault: '#e8394a' };
const ROLE_LETTER = { supp: 'S', shield: 'H', fault: 'F' };

function makeRoleSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false,
  }));
  sprite.renderOrder = 11;
  return { sprite, canvas, ctx, tex };
}

function paintRole(badge, role) {
  const { canvas, ctx, tex } = badge;
  const color = ROLE_COLOR[role] ?? '#888';
  const letter = ROLE_LETTER[role] ?? '?';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  ctx.arc(32, 32, 26, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10,10,18,0.88)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.font = 'bold 30px Segoe UI, sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 32, 34);
  tex.needsUpdate = true;
}

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

function paintCount(badge, n) {
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

export function makeRobot(label, allianceColor) {
  const colorHex = allianceColor === 'red' ? COLORS.red : COLORS.blue;
  const dimHex = allianceColor === 'red' ? COLORS.redDim : COLORS.blueDim;
  const colorCssRgb = allianceColor === 'red' ? '#a02030' : '#204fa0';
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

  // Label sprite
  const sprite = makeLabelSprite(label, colorCssRgb);
  sprite.scale.set(0.35, 0.18, 1);
  sprite.position.set(0, ROBOT.size + 0.3, 0);
  g.add(sprite);

  // Numeric carry-count badge above the label.
  const countBadge = makeCountSprite();
  countBadge.sprite.scale.set(0.22, 0.22, 1);
  countBadge.sprite.position.set(0, ROBOT.size + 0.62, 0);
  countBadge.sprite.visible = false;
  paintCount(countBadge, 0);
  g.add(countBadge.sprite);

  // Role indicator badge (S/H/F) — to the left of the label.
  const roleBadge = makeRoleSprite();
  roleBadge.sprite.scale.set(0.20, 0.20, 1);
  roleBadge.sprite.position.set(-0.28, ROBOT.size + 0.30, 0);
  paintRole(roleBadge, 'supp');
  g.add(roleBadge.sprite);

  return {
    group: g,
    chassis,
    mast,
    countBadge,
    roleBadge,
    label,
    alliance: allianceColor,
    climbZone: null,
    isAnchor: false,
    suspendedFromAnchor: null,
  };
}

export function setCarryCount(robot, n) {
  if (n > 0) {
    robot.countBadge.sprite.visible = true;
    paintCount(robot.countBadge, n);
  } else {
    robot.countBadge.sprite.visible = false;
  }
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
  paintRole(robot.roleBadge, role);
}
