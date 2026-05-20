import * as THREE from 'three';
import { FIELD, COLORS } from '../field/dims.js';

// A simple human-figure marker: a body box + head sphere, alliance-tinted.
// We place 2 per alliance in their Alliance Station, off-field.

function makeFigure(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.15, 0.9, 8),
    new THREE.MeshStandardMaterial({ color: COLORS.human, roughness: 0.7 })
  );
  body.position.y = 0.45;
  g.add(body);

  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.5, 0.2),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2 })
  );
  torso.position.y = 0.75;
  g.add(torso);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xdcb898, roughness: 0.9 })
  );
  head.position.y = 1.15;
  g.add(head);

  return { group: g, torso };
}

export function buildHumanPlayers(scene) {
  const half = FIELD.size / 2;
  // Stand the figures on the floor (deck is at y=0, ground at y=-deckHeight)
  const groundY = -FIELD.deckHeight;

  const redHuman = makeFigure(COLORS.red);
  redHuman.group.position.set(half + 0.9, groundY, half - 0.6);
  redHuman.group.rotation.y = -Math.PI / 2;
  scene.add(redHuman.group);

  const redHuman2 = makeFigure(COLORS.red);
  redHuman2.group.position.set(half + 1.4, groundY, half - 1.6);
  redHuman2.group.rotation.y = -Math.PI / 2;
  scene.add(redHuman2.group);

  const blueHuman = makeFigure(COLORS.blue);
  blueHuman.group.position.set(-half - 0.9, groundY, half - 0.6);
  blueHuman.group.rotation.y = Math.PI / 2;
  scene.add(blueHuman.group);

  const blueHuman2 = makeFigure(COLORS.blue);
  blueHuman2.group.position.set(-half - 1.4, groundY, half - 1.6);
  blueHuman2.group.rotation.y = Math.PI / 2;
  scene.add(blueHuman2.group);

  return {
    red: [redHuman, redHuman2],
    blue: [blueHuman, blueHuman2],
  };
}
