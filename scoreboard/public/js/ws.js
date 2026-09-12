export function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}/ws`;
  const listeners = new Map();
  let ws;
  let queue = [];

  function on(type, cb) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(cb);
  }

  function emit(type, data) {
    (listeners.get(type) || []).forEach((cb) => cb(data));
  }

  function send(obj) {
    const payload = JSON.stringify(obj);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    } else {
      queue.push(payload);
    }
  }

  function open() {
    ws = new WebSocket(url);
    ws.addEventListener('open', () => {
      emit('open');
      queue.forEach((p) => ws.send(p));
      queue = [];
    });
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      emit(msg.type, msg);
    });
    ws.addEventListener('close', () => {
      emit('close');
      setTimeout(open, 1500);
    });
    ws.addEventListener('error', () => ws.close());
  }

  open();
  return { on, send };
}

export function fmtClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
