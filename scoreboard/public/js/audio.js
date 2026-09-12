let ctx = null;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, startAt, duration, gainVal = 0.35, type = 'square') {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(gainVal, startAt + 0.02);
  gain.gain.linearRampToValueAtTime(0, startAt + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

export function playStartTone() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  tone(880, t0, 0.15);
  tone(1320, t0 + 0.2, 0.25);
}

export function playEndTone() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  // Descending buzzer, FGC end-of-match feel.
  tone(440, t0, 0.5, 0.4, 'sawtooth');
  tone(330, t0 + 0.45, 0.5, 0.4, 'sawtooth');
  tone(220, t0 + 0.9, 0.9, 0.45, 'sawtooth');
}

export function playStopTone() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  // Two flat low blips — distinct from the rising start tone and the
  // descending end buzzer, reading as "paused" rather than "finished".
  tone(300, t0, 0.16, 0.35, 'square');
  tone(300, t0 + 0.22, 0.16, 0.35, 'square');
}
