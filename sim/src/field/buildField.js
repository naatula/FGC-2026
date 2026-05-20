import * as THREE from 'three';
import { FIELD, COLORS } from './dims.js';

// Coordinate system:
//   +X: from Blue alliance station toward Red alliance station (long axis)
//   +Z: from Suppression Units (back) toward Fire Shields / Alliance Stations (front)
//   +Y: up
//
// Field deck top sits at y=0; the elevated 70cm structure sits below it for
// visual context. Field is centered on origin in XZ.

export function buildField(scene) {
  const group = new THREE.Group();
  const half = FIELD.size / 2;

  // Ground plane (large, neutral)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x14141c, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -FIELD.deckHeight;
  ground.receiveShadow = true;
  group.add(ground);

  // Elevated deck pedestal (visual): a box from y=-deckHeight to y=0
  const pedestal = new THREE.Mesh(
    new THREE.BoxGeometry(FIELD.size + 0.05, FIELD.deckHeight, FIELD.size + 0.05),
    new THREE.MeshStandardMaterial({ color: 0x1a1a24, roughness: 0.9 })
  );
  pedestal.position.y = -FIELD.deckHeight / 2;
  group.add(pedestal);

  // Carpet surface
  const carpet = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD.size, FIELD.size),
    new THREE.MeshStandardMaterial({ color: COLORS.carpet, roughness: 1.0 })
  );
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.y = 0.001;
  carpet.receiveShadow = true;
  group.add(carpet);

  // Guardrails along the perimeter
  const railMat = new THREE.MeshStandardMaterial({ color: COLORS.guardrail, roughness: 0.5 });
  const rail = (w, d, x, z) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, FIELD.guardrailHeight, d),
      railMat
    );
    m.position.set(x, FIELD.guardrailHeight / 2, z);
    return m;
  };
  const rt = 0.05; // rail thickness
  group.add(rail(FIELD.size + rt * 2, rt, 0, -half - rt / 2)); // back
  group.add(rail(FIELD.size + rt * 2, rt, 0, half + rt / 2));  // front
  group.add(rail(rt, FIELD.size, -half - rt / 2, 0));          // left (blue side)
  group.add(rail(rt, FIELD.size, half + rt / 2, 0));           // right (red side)

  // Alliance-colored tinted rails on the long sides (red on +X, blue on -X)
  const tintMat = (c) => new THREE.MeshStandardMaterial({
    color: c, roughness: 0.4, emissive: c, emissiveIntensity: 0.2,
  });
  const redRail = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, FIELD.guardrailHeight * 0.6, FIELD.size * 0.9),
    tintMat(COLORS.red)
  );
  redRail.position.set(half + rt + 0.02, FIELD.guardrailHeight * 0.3, 0);
  group.add(redRail);
  const blueRail = redRail.clone();
  blueRail.material = tintMat(COLORS.blue);
  blueRail.position.x = -half - rt - 0.02;
  group.add(blueRail);

  // Regional zones (painted strips along the long sides)
  const zoneMatRed = new THREE.MeshBasicMaterial({
    color: COLORS.red, transparent: true, opacity: 0.18,
  });
  const zoneMatBlue = new THREE.MeshBasicMaterial({
    color: COLORS.blue, transparent: true, opacity: 0.18,
  });
  const zoneGeo = new THREE.PlaneGeometry(
    FIELD.regionalZoneWidth, FIELD.regionalZoneLength
  );
  const redZone = new THREE.Mesh(zoneGeo, zoneMatRed);
  redZone.rotation.x = -Math.PI / 2;
  redZone.position.set(half - FIELD.regionalZoneWidth / 2, 0.003, 0);
  group.add(redZone);
  const blueZone = new THREE.Mesh(zoneGeo, zoneMatBlue);
  blueZone.rotation.x = -Math.PI / 2;
  blueZone.position.set(-half + FIELD.regionalZoneWidth / 2, 0.003, 0);
  group.add(blueZone);

  // Alliance station floor markers (off-field)
  const stationGeo = new THREE.PlaneGeometry(1.5, FIELD.size);
  const redStation = new THREE.Mesh(stationGeo, new THREE.MeshBasicMaterial({
    color: COLORS.red, transparent: true, opacity: 0.08,
  }));
  redStation.rotation.x = -Math.PI / 2;
  redStation.position.set(half + 1.0, -FIELD.deckHeight + 0.005, 0);
  group.add(redStation);
  const blueStation = redStation.clone();
  blueStation.material = new THREE.MeshBasicMaterial({
    color: COLORS.blue, transparent: true, opacity: 0.08,
  });
  blueStation.position.x = -half - 1.0;
  group.add(blueStation);

  scene.add(group);
  return group;
}
