import { MATCH } from '../field/dims.js';

let history = []; // { t, red, blue, redRaw, blueRaw }
let lastPushedT = -1;

export function clearScoreHistory() {
  history = [];
  lastPushedT = -1;
}

export function pushScoreSample(t, state, scores) {
  if (t - lastPushedT < 0.1) return;
  lastPushedT = t;
  const coop = scores.coop;
  history.push({
    t,
    red:     scores.red,
    blue:    scores.blue,
    redRaw:  Math.ceil(state.suppRed  + state.partnerClimbs.red  * 25 + state.ext + coop),
    blueRaw: Math.ceil(state.suppBlue + state.partnerClimbs.blue * 25 + state.ext + coop),
  });
}

export function drawScoreGraph(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  if (!cw || !ch) return;
  const pw = Math.round(cw * dpr);
  const ph = Math.round(ch * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);

  const totalSec = MATCH.durationSec;
  const pl = 24, pr = 6, pt = 6, pb = 14;
  const gw = cw - pl - pr;
  const gh = ch - pt - pb;

  // Y scale: round up to nice grid step
  let maxScore = 50;
  for (const s of history) maxScore = Math.max(maxScore, s.red, s.blue, s.redRaw, s.blueRaw);
  const step = maxScore < 100 ? 25 : maxScore < 250 ? 50 : 100;
  maxScore = Math.ceil(maxScore / step) * step;

  const px = (t) => pl + (t / totalSec) * gw;
  const py = (v) => pt + gh - (v / maxScore) * gh;

  // Axes
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pl, pt);
  ctx.lineTo(pl, pt + gh);
  ctx.lineTo(pl + gw, pt + gh);
  ctx.stroke();

  // Horizontal grid + Y labels
  ctx.font = `${9}px system-ui, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let v = 0; v <= maxScore; v += step) {
    const y = py(v);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pl, y);
    ctx.lineTo(pl + gw, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillText(String(v), pl - 3, y);
  }

  // X axis time ticks (every 30s)
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let s = 0; s <= totalSec; s += 30) {
    const x = px(s);
    ctx.fillText(s === 0 ? '0' : s === 150 ? '2:30' : `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`, x, pt + gh + 3);
  }

  if (history.length < 2) return;

  function drawLine(color, dash, key) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(dash);
    ctx.moveTo(px(history[0].t), py(history[0][key]));
    for (let i = 1; i < history.length; i++) {
      ctx.lineTo(px(history[i].t), py(history[i][key]));
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw dim "no-mult" lines first (behind)
  drawLine('rgba(232,57,74,0.35)',  [4, 3], 'redRaw');
  drawLine('rgba(58,127,232,0.35)', [4, 3], 'blueRaw');
  // Solid "with-mult" lines on top
  drawLine('#e8394a', [], 'red');
  drawLine('#3a7fe8', [], 'blue');
}
