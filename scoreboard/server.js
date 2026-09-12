import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { computeScores, ZONES, CLIMB_SLOTS } from './scoring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 4100;

const DEFAULT_DURATION = 150; // seconds — 2026 FGC match length (Game Manual §2.2)
const TICK_MS = 200;
const ROOM_TTL_MS = 24 * 60 * 60 * 1000; // sweep rooms idle longer than 24h

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/** @type {Map<string, Room>} */
const rooms = new Map();

function newRoom(code) {
  return {
    code,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    duration: DEFAULT_DURATION,
    phase: 'idle', // idle | running | paused | ended
    endEpoch: null,
    remainingMs: DEFAULT_DURATION * 1000,
    red: { supp: 0, climb: [0, 0, 0] },
    blue: { supp: 0, climb: [0, 0, 0] },
    ext: 0,
    sockets: new Set(), // { ws, role }
    tickTimer: null,
  };
}

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  let code;
  do {
    code = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function publicState(room) {
  const scores = computeScores(room);
  const remainingMs = room.phase === 'running'
    ? Math.max(0, room.endEpoch - Date.now())
    : room.remainingMs;
  return {
    code: room.code,
    duration: room.duration,
    phase: room.phase,
    remainingMs,
    red: room.red,
    blue: room.blue,
    ext: room.ext,
    zones: ZONES,
    climbSlots: CLIMB_SLOTS,
    scores,
    viewers: countRoles(room),
  };
}

function countRoles(room) {
  let displays = 0;
  let remotes = 0;
  for (const conn of room.sockets) {
    if (conn.role === 'display') displays++;
    else remotes++;
  }
  return { displays, remotes };
}

function broadcast(room, msg) {
  const payload = JSON.stringify(msg);
  for (const conn of room.sockets) {
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(payload);
  }
}

function broadcastState(room) {
  broadcast(room, { type: 'state', state: publicState(room) });
}

function startTick(room) {
  stopTick(room);
  room.tickTimer = setInterval(() => {
    const remaining = room.endEpoch - Date.now();
    if (remaining <= 0) {
      room.phase = 'ended';
      room.remainingMs = 0;
      stopTick(room);
      broadcastState(room);
      broadcast(room, { type: 'matchEnd' });
    } else {
      broadcastState(room);
    }
  }, TICK_MS);
}

function stopTick(room) {
  if (room.tickTimer) {
    clearInterval(room.tickTimer);
    room.tickTimer = null;
  }
}

function handleAction(room, msg) {
  room.lastActivity = Date.now();
  switch (msg.type) {
    case 'start': {
      if (room.phase === 'running') break;
      const base = room.phase === 'ended' ? room.duration * 1000 : room.remainingMs;
      room.endEpoch = Date.now() + base;
      room.phase = 'running';
      startTick(room);
      broadcastState(room);
      broadcast(room, { type: 'matchStart' });
      break;
    }
    case 'stop': {
      if (room.phase !== 'running') break;
      room.remainingMs = Math.max(0, room.endEpoch - Date.now());
      room.phase = 'paused';
      stopTick(room);
      broadcastState(room);
      break;
    }
    case 'reset': {
      stopTick(room);
      room.phase = 'idle';
      room.remainingMs = room.duration * 1000;
      room.endEpoch = null;
      room.red = { supp: 0, climb: [0, 0, 0] };
      room.blue = { supp: 0, climb: [0, 0, 0] };
      room.ext = 0;
      broadcastState(room);
      break;
    }
    case 'setDuration': {
      const seconds = Number(msg.seconds);
      if (!Number.isFinite(seconds) || seconds <= 0 || room.phase === 'running') break;
      room.duration = Math.round(seconds);
      room.remainingMs = room.duration * 1000;
      broadcastState(room);
      break;
    }
    case 'adjust': {
      const alliance = msg.alliance; // 'red' | 'blue' | 'shared'
      const field = msg.field; // 'supp' | 'climb' | 'ext'
      const delta = msg.delta === -1 ? -1 : 1;
      if (alliance === 'shared' && field === 'ext') {
        room.ext = Math.max(0, room.ext + delta);
      } else if ((alliance === 'red' || alliance === 'blue') && field === 'supp') {
        room[alliance].supp = Math.max(0, room[alliance].supp + delta);
      } else if ((alliance === 'red' || alliance === 'blue') && field === 'climb') {
        const slot = msg.slot | 0;
        if (slot < 0 || slot > 2) break;
        const cur = room[alliance].climb[slot];
        const next = Math.min(ZONES.length - 1, Math.max(0, cur + delta));
        room[alliance].climb[slot] = next;
      } else {
        break;
      }
      broadcastState(room);
      break;
    }
    default:
      break;
  }
}

function sweepRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.sockets.size === 0 && now - room.lastActivity > ROOM_TTL_MS) {
      stopTick(room);
      rooms.delete(code);
    }
  }
}
setInterval(sweepRooms, 10 * 60 * 1000);

// --- static file serving -----------------------------------------------

function serveStatic(req, res) {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, reqPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocketServer({ server, path: '/ws' });

// Backgrounded tabs and flaky mobile connections can leave a socket that
// looks open but is actually dead ("zombie" connection — no close/error
// event ever fires). Ping every connection and terminate any that doesn't
// pong back within one interval, so room membership and viewer counts stay
// accurate and clients are forced through their reconnect path.
function markAlive() {
  this.isAlive = true;
}

const heartbeatTimer = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

wss.on('close', () => clearInterval(heartbeatTimer));

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', markAlive);

  let conn = null; // { ws, role, room }

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'ping') {
      // App-level liveness probe from the client (see public/js/ws.js) —
      // answered unconditionally, even before a room is joined.
      ws.send(JSON.stringify({ type: 'pong' }));
      return;
    }

    if (msg.type === 'createRoom') {
      const code = makeCode();
      const room = newRoom(code);
      rooms.set(code, room);
      conn = { ws, role: 'display' };
      room.sockets.add(conn);
      ws.send(JSON.stringify({ type: 'joined', state: publicState(room) }));
      return;
    }

    if (msg.type === 'joinRoom') {
      const code = String(msg.code || '').toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: `No match found for code ${code}` }));
        return;
      }
      const role = msg.role === 'display' ? 'display' : 'remote';
      conn = { ws, role };
      room.sockets.add(conn);
      room.lastActivity = Date.now();
      ws.send(JSON.stringify({ type: 'joined', state: publicState(room) }));
      broadcastState(room);
      return;
    }

    if (!conn) return;
    const room = rooms.get(conn.roomCode) || findRoomForConn(conn);
    if (room) handleAction(room, msg);
  });

  ws.on('close', () => {
    if (!conn) return;
    const room = findRoomForConn(conn);
    if (room) {
      room.sockets.delete(conn);
      room.lastActivity = Date.now();
      broadcastState(room);
    }
  });
});

function findRoomForConn(conn) {
  for (const room of rooms.values()) {
    if (room.sockets.has(conn)) return room;
  }
  return null;
}

server.listen(PORT, () => {
  console.log(`FGC scoreboard listening on http://localhost:${PORT}`);
});
