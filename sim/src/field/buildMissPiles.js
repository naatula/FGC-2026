import * as THREE from 'three';
import { FIELD, COLORS, WILDFIRE } from './dims.js';

// Miss piles appear at the sides of the field where inaccurate shots land.
// Each alliance gets a pile outside their field boundary, displaying balls
// in a grid formation rising from ground level.

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

function makePile() {
  const g = new THREE.Group();

  // Containment "pile" — a stack of small spheres in a grid formation
  // starting from ground level, organized in columns and rows
  const fillGroup = new THREE.Group();
  const ballGeo = new THREE.SphereGeometry(WILDFIRE.radius, 10, 8);
  const ballMat = new THREE.MeshStandardMaterial({
    color: COLORS.wildfire, roughness: 0.65
  });
  
  const cols = 5;
  const rows = 4;
  for (let i = 0; i < WILDFIRE.count; i++) {
    const m = new THREE.Mesh(ballGeo, ballMat);
    const layer = Math.floor(i / (cols * rows));
    const idxInLayer = i % (cols * rows);
    const r = Math.floor(idxInLayer / cols);
    const c = idxInLayer % cols;
    
    // Small jitter for visual variety
    const jitter = (Math.random() - 0.5) * 0.01;
    
    // Position in grid: starting from ground level (y = WILDFIRE.radius)
    m.position.set(
      (c - (cols - 1) / 2) * (WILDFIRE.radius * 2.05) + jitter,
      WILDFIRE.radius + layer * (WILDFIRE.radius * 1.7) + (r * 0.02) + jitter,
      (r - (rows - 1) / 2) * (WILDFIRE.radius * 1.6) + jitter
    );
    
    m.visible = false;
    fillGroup.add(m);
  }
  g.add(fillGroup);

  // Count badge (floating number showing ball count)
  const countBadge = makeCountSprite();
  countBadge.sprite.position.set(0, 2.0, 0);
  countBadge.sprite.scale.set(0.4, 0.4, 1);
  g.add(countBadge.sprite);

  return { group: g, fillGroup, countBadge };
}

export function buildMissPiles(scene) {
  const half = FIELD.size / 2;
  const groundLevel = -FIELD.deckHeight;  // Where humans stand, ~-0.7m

  // Red miss pile: at +X side, outside the field
  const red = makePile();
  red.group.position.set(
    half + 2.0,  // 2m outside field boundary
    groundLevel,  // Ground level where humans stand
    0
  );
  scene.add(red.group);

  // Blue miss pile: at -X side, outside the field (mirrored)
  const blue = makePile();
  blue.group.position.set(
    -half - 2.0,  // 2m outside field boundary
    groundLevel,  // Ground level where humans stand
    0
  );
  scene.add(blue.group);

  return {
    red: { ...red, position: red.group.position },
    blue: { ...blue, position: blue.group.position },
  };
}

export function updateMissPileFill(pile, ballsContained) {
  // Reveal physical balls in the fillGroup proportional to count
  const visibleCount = Math.min(pile.fillGroup.children.length, ballsContained);
  for (let i = 0; i < pile.fillGroup.children.length; i++) {
    pile.fillGroup.children[i].visible = i < visibleCount;
  }

  // Update count badge
  paintCountBadge(pile.countBadge, ballsContained);
}
