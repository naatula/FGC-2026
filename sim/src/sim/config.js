import { ROBOT } from '../field/dims.js';

// Live-tunable simulation parameters. Everything in here is read each tick by
// the scheduler / steering layer / human-player tick, so changes apply mid-
// match without restart. UI bindings in main.js mutate this object directly.

export const MAX_ROBOTS = 10;

export const DEFAULTS = {
  driveSpeed: 1.2,         // m/s
  turnSpeed: 180,          // °/s — angular speed limit when changing heading
  capacity: 8,             // balls/robot
  shootInterval: 4.0,      // s/ball, suppression-unit shot
  transferInterval: 0.5,   // s/ball, robot-to-shield ground transfer
  humanInterval: 2.0,      // s/ball, human-player chute throw
  pickupTime: 0.0,         // s/ball at intake
  avoidRadius: ROBOT.size * 2.5,
  avoidStrength: 1.5,
  robotAccuracy: 80,      // % (0-100), robot suppression-unit shot hit rate
  humanAccuracy: 80,      // % (0-100), human throw hit rate
  ballFriction: 0.3,      // m/s², rolling deceleration for pushed balls
  robotCount: { red: 3, blue: 3 },
  roles: {
    // Indices 0-2: default preset; 3-9: additional robots default to 'supp'.
    red:  ['supp', 'shield', 'supp', ...Array(MAX_ROBOTS - 3).fill('supp')],
    blue: ['supp', 'shield', 'supp', ...Array(MAX_ROBOTS - 3).fill('supp')],
  },
};

function cloneDefaults() {
  return {
    ...DEFAULTS,
    robotCount: { ...DEFAULTS.robotCount },
    roles: {
      red:  [...DEFAULTS.roles.red],
      blue: [...DEFAULTS.roles.blue],
    },
  };
}

export const PARAMS = cloneDefaults();

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function notify() { for (const fn of listeners) fn(PARAMS); }

export function resetParams() {
  const d = cloneDefaults();
  for (const k of Object.keys(d)) PARAMS[k] = d[k];
  PARAMS.robotCount = { ...d.robotCount };
  PARAMS.roles.red  = d.roles.red;
  PARAMS.roles.blue = d.roles.blue;
  notify();
}
