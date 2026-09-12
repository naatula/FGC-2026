export function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}/ws`;
  const listeners = new Map();
  let ws;
  let queue = [];
  let reconnectTimer = null;
  let livenessTimer = null;

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

  function scheduleReconnect(delay) {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      open();
    }, delay);
  }

  function open() {
    // Never stack a second live socket on top of one that's already
    // connecting/open (e.g. a scheduled reconnect firing right as the page
    // becomes visible and triggers its own reconnect check).
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

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
      scheduleReconnect(1500);
    });
    ws.addEventListener('error', () => ws.close());
  }

  // A backgrounded tab (switching apps, minimizing, screen lock) can leave a
  // WebSocket that silently died — no 'close' or 'error' event ever fires,
  // so readyState keeps reporting OPEN even though the connection is dead.
  // Whenever the page becomes visible again, actively verify the socket:
  // if it isn't demonstrably open, reconnect immediately; if it claims to
  // be open, send a liveness ping and force a reconnect if no pong (or any
  // other message) arrives in time.
  on('pong', () => {
    if (livenessTimer) {
      clearTimeout(livenessTimer);
      livenessTimer = null;
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;

    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      open();
      return;
    }

    if (ws.readyState === WebSocket.OPEN && !livenessTimer) {
      send({ type: 'ping' });
      livenessTimer = setTimeout(() => {
        livenessTimer = null;
        try { ws.close(); } catch { /* already gone */ }
      }, 4000);
    }
  });

  open();
  return { on, send };
}

export function fmtClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
