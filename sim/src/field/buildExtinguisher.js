import * as THREE from 'three';
import { EXTINGUISHER, FIELD, SUPPRESSION, COLORS, WILDFIRE } from './dims.js';

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
  ctx.strokeStyle = COLORS.gold;
  ctx.stroke();
  ctx.font = 'bold 36px Segoe UI, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 32, 34);
  tex.needsUpdate = true;
}

export function buildExtinguisher(scene) {
  const g = new THREE.Group();
  const polyMat = new THREE.MeshStandardMaterial({
    color: COLORS.polycarb,
    transparent: true,
    opacity: 0.20,
    roughness: 0.1,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: COLORS.gold,
    transparent: true,
    opacity: 0.28,
    emissive: COLORS.gold,
    emissiveIntensity: 0.1,
  });

  // Backboard
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(EXTINGUISHER.width, EXTINGUISHER.height, 0.03),
    goldMat
  );
  back.position.set(0, EXTINGUISHER.height / 2, -EXTINGUISHER.depth / 2);
  g.add(back);

  // Side walls
  const sideGeo = new THREE.BoxGeometry(0.03, EXTINGUISHER.height, EXTINGUISHER.depth);
  const sideL = new THREE.Mesh(sideGeo, polyMat);
  sideL.position.set(-EXTINGUISHER.width / 2, EXTINGUISHER.height / 2, 0);
  const sideR = sideL.clone();
  sideR.position.x = EXTINGUISHER.width / 2;
  g.add(sideL, sideR);

  // Front wall: floor to ledge-bottom height (= SUPPRESSION.canopyHeight),
  // placed at the actual front face of the extinguisher.
  const front = new THREE.Mesh(
    new THREE.BoxGeometry(EXTINGUISHER.width, SUPPRESSION.canopyHeight, 0.03),
    polyMat
  );
  front.position.set(0, SUPPRESSION.canopyHeight / 2, EXTINGUISHER.depth / 2);
  g.add(front);

  // Base slot indicator (where balls spawn) — a subtle dark band
  const slot = new THREE.Mesh(
    new THREE.BoxGeometry(EXTINGUISHER.width * 0.95, EXTINGUISHER.baseSlotHeight, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x111118, emissive: 0x331111 })
  );
  slot.position.set(0, EXTINGUISHER.baseSlotHeight / 2, -EXTINGUISHER.depth / 2 + 0.02);
  g.add(slot);

  // Containment fill visualization (balls pile up in the back portion)
  const fillGroup = new THREE.Group();
  const ballGeo = new THREE.SphereGeometry(WILDFIRE.radius, 10, 8);
  const ballMat = new THREE.MeshStandardMaterial({
    color: COLORS.wildfire, roughness: 0.65
  });
  const cols = 7, rows = 4;
  for (let i = 0; i < WILDFIRE.count; i++) {
    const m = new THREE.Mesh(ballGeo, ballMat);
    const layer = Math.floor(i / (cols * rows));
    const idx = i % (cols * rows);
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    m.position.set(
      (c - (cols - 1) / 2) * (WILDFIRE.radius * 2.05),
      WILDFIRE.radius + layer * (WILDFIRE.radius * 1.7),
      (r - (rows - 1) / 2) * (WILDFIRE.radius * 1.6) - EXTINGUISHER.depth * 0.2
    );
    m.visible = false;
    fillGroup.add(m);
  }
  g.add(fillGroup);

  // Count badge (floating number)
  const countBadge = makeCountSprite();
  countBadge.sprite.position.set(0, EXTINGUISHER.openingHeight + 0.3, -EXTINGUISHER.depth / 2 + 0.4);
  countBadge.sprite.scale.set(0.4, 0.4, 1);
  g.add(countBadge.sprite);

  // LED indicator strip on the front face
  const ledBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, EXTINGUISHER.openingHeight * 0.7, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 1 })
  );
  ledBase.position.set(
    EXTINGUISHER.width / 2 - 0.1,
    EXTINGUISHER.openingHeight * 0.4,
    -EXTINGUISHER.depth / 2 + 0.04
  );
  g.add(ledBase);

  const led = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 1, 0.03),
    new THREE.MeshStandardMaterial({
      color: COLORS.gold,
      emissive: COLORS.gold,
      emissiveIntensity: 1.2,
    })
  );
  led.scale.y = 0.001;
  led.position.copy(ledBase.position);
  led.position.x += 0.001;
  g.add(led);

  // Position the whole extinguisher centered on back wall, between
  // suppression units. Place its back face flush with the back guardrail.
  g.position.set(0, 0, -FIELD.size / 2 + EXTINGUISHER.depth / 2);
  scene.add(g);

  const anchor = new THREE.Vector3(
    g.position.x,
    EXTINGUISHER.openingHeight,
    g.position.z + EXTINGUISHER.depth / 2 + 0.2
  );

  // Spawn slot center (where balls release from at start)
  const spawnSlot = new THREE.Vector3(
    g.position.x,
    EXTINGUISHER.baseSlotHeight / 2,
    g.position.z + EXTINGUISHER.depth / 2
  );

  return { group: g, anchor, spawnSlot, led, fillGroup, countBadge };
}

export function updateExtinguisherFill(ext, ballsContained, totalCapacity = 100) {
  const frac = Math.min(1, ballsContained / totalCapacity);
  ext.led.scale.y = Math.max(0.001, frac);
  ext.led.position.y = (EXTINGUISHER.openingHeight * 0.7 * frac) / 2;
  const visibleCount = Math.min(ext.fillGroup.children.length, ballsContained);
  for (let i = 0; i < ext.fillGroup.children.length; i++) {
    ext.fillGroup.children[i].visible = i < visibleCount;
  }
  paintCountBadge(ext.countBadge, ballsContained);
}
