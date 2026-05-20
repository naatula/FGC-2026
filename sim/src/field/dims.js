// All dimensions in meters. Sourced from the 2026 FGC Game Manual §2.2.

export const FIELD = {
  size: 7.0,
  deckHeight: 0.7,
  guardrailHeight: 0.20,
  regionalZoneWidth: 0.50,
  regionalZoneLength: 4.10,
};

export const SUPPRESSION = {
  height: 2.01,
  canopyHeight: 1.65,
  canopyOverhang: 0.40,
  width: 1.10,
  depth: 0.65,
};

export const EXTINGUISHER = {
  height: 2.01,
  width: 1.80,
  depth: 0.60,
  openingHeight: 1.66,
  ledge: 0.40,
  baseSlotHeight: 0.28,
};

export const FIRE_SHIELD = {
  width: 0.70,
  depth: 0.60,
  height: 1.10,
  portHeight: 0.25,
  chuteLength: 0.55,
};

export const BRACE = {
  length: 6.4,
  lowEnd: 0.24,
  highEnd: 1.97,
  radius: 0.025,
  // Brace is divided into 3 zones along its length.
  // Zone 1 = lower 1/3, Zone 2 = middle 1/3, Zone 3 = upper 1/3.
  zone1Frac: [0.0, 0.333],
  zone2Frac: [0.333, 0.667],
  zone3Frac: [0.667, 1.0],
  // Where the anchor's climb hook (mast top, ~0.85 m) actually meets the
  // brace while the robot still stands on the ground. The brace's lower end
  // (24 cm) is below the robot's chassis, so robots cannot attach there.
  attachFrac: 0.16,
};

export const WILDFIRE = {
  radius: 0.05,
  count: 500,
};

export const ROBOT = {
  size: 0.50,
  count: 6,
};

export const MATCH = {
  durationSec: 150,
};

export const COLORS = {
  red: 0xe8394a,
  blue: 0x3a7fe8,
  redDim: 0x5a1520,
  blueDim: 0x152050,
  gold: 0xf0b840,
  carpet: 0x3a3a44,
  guardrail: 0x222230,
  polycarb: 0xb8d8f8,
  brace: 0x999aa6,
  wildfire: 0xff7a2a,
  human: 0xc8c8d8,
};
