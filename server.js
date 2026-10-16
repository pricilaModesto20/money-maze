'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const config = require('./config');

const PORT = Number(process.env.PORT) || 3000;
const HOST_KEY = process.env.HOST_KEY || crypto.randomBytes(3).toString('hex');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'state.json');

function lanAddress() {
  // Prefer the real Wi-Fi/Ethernet adapter over virtual ones (VirtualBox, Hyper-V, WSL, Docker, VPNs)
  const candidates = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      const virtual = /virtual|vbox|vmware|vethernet|wsl|docker|hyper-v|loopback|tailscale|zerotier/i.test(name) || a.address.startsWith('192.168.56.');
      const preferred = /wi-?fi|wlan|wireless|ethernet|^en|^eth/i.test(name);
      candidates.push({ address: a.address, score: (virtual ? 0 : 2) + (preferred ? 1 : 0) });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.address || 'localhost';
}
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://${lanAddress()}:${PORT}`)
  .replace(/\/+$/, '');

const PALETTE = ['#ff5fa2', '#ffc94a', '#2ee59d', '#6fd3ff', '#b48cff', '#ff8a5c', '#a8ff60', '#5cf2e0', '#ff9ad5', '#ffe08a'];

// ── State (kept in memory, mirrored to data/state.json so a restart doesn't lose the session)
function emptyState() {
  return { players: {}, questions: [], onScreen: null, colorIndex: 0 };
}
function loadState() {
  try {
    return { ...emptyState(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
  } catch {
    return emptyState();
  }
}
let state = loadState();
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFile(DATA_FILE, JSON.stringify(state, null, 2), () => {});
  }, 300);
}

// ── Input hygiene
const BLOCKED = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'nigg', 'fag', 'whore', 'slut'];
function clean(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
function isRude(text) {
  const t = text.toLowerCase().replace(/[^a-z]/g, '');
  return BLOCKED.some((w) => t.includes(w));
}
const newId = () => crypto.randomBytes(5).toString('hex');

// ── Views of the state
function livePlayers() {
  return Object.values(state.players).filter((p) => !p.removed);
}
function liveQuestions() {
  return state.questions.filter((q) => !q.deleted && !state.players[q.playerKey]?.removed);
}
function screenState() {
  const q = state.onScreen && state.questions.find((x) => x.id === state.onScreen);
  return {
    players: livePlayers().map(({ id, name, role, color, points, count, joinedAt }) => ({ id, name, role, color, points, count, joinedAt })),
    totalQuestions: liveQuestions().length,
    onScreen: q ? { id: q.id, text: q.text, name: q.name, role: q.role, playerId: q.playerId, color: state.players[q.playerKey]?.color } : null,
  };
}
function hostState() {
  return {
    ...screenState(),
    publicUrl: PUBLIC_URL,
    questions: liveQuestions().map(({ id, playerId, name, role, text, ts, status }) => ({ id, playerId, name, role, text, ts, status })),
  };
}
function meState(clientId) {
  const p = state.players[clientId];
  if (!p || p.removed) return null;
  return {
    name: p.name,
    role: p.role,
    color: p.color,
    points: p.points,
    count: p.count,
    questions: state.questions
      .filter((q) => q.playerKey === clientId && !q.deleted)
      .map((q) => ({ id: q.id, text: q.text, status: q.status === 'hidden' ? 'new' : q.status })),
  };
}

// ── Server
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/screen', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'screen.html')));
app.get('/host', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));
app.get('/qr.svg', async (_req, res) => {
  const svg = await QRCode.toString(PUBLIC_URL, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#06161b', light: '#ffffff' } });
  res.type('image/svg+xml').send(svg);
});
app.get('/api/config', (_req, res) => {
  const { eventName, gameTitle, talkTitle, speakerName, linkedinUrl, roles, fundamentals, ghosts, pointsPerQuestion, maxQuestionLength, mazeSeed } = config;
  res.json({ eventName, gameTitle, talkTitle, speakerName, linkedinUrl, roles, fundamentals, ghosts, pointsPerQuestion, maxQuestionLength, mazeSeed, publicUrl: PUBLIC_URL });
});

function broadcast() {
  io.to('screen').emit('state', screenState());
  io.to('host').emit('host:state', hostState());
}
function notifyOwner(q) {
  if (q) io.to('me:' + q.playerKey).emit('me', meState(q.playerKey));
}

io.on('connection', (socket) => {
  const reply = (ack) => (typeof ack === 'function' ? ack : () => {});

  // Projector screen
  socket.on('screen:join', () => {
    socket.join('screen');
    socket.emit('state', screenState());
  });

  // Audience phone: reconnect to an existing profile
  socket.on('hello', (payload, ack) => {
    const clientId = String(payload?.clientId || '');
    if (!/^[A-Za-z0-9-]{8,64}$/.test(clientId)) return reply(ack)(null);
    socket.join('me:' + clientId);
    reply(ack)(meState(clientId));
  });

  // Audience phone: ask a question
  socket.on('ask', (payload, ack) => {
    const done = reply(ack);
    const clientId = String(payload?.clientId || '');
    if (!/^[A-Za-z0-9-]{8,64}$/.test(clientId)) return done({ ok: false, error: 'Please reload the page and try again.' });

    const name = clean(payload.name, 24);
    const text = clean(payload.text, config.maxQuestionLength);
    const role = config.roles.includes(payload.role) ? payload.role : '';
    if (name.length < 2) return done({ ok: false, error: 'Please enter your name.' });
    if (text.length < 5) return done({ ok: false, error: 'Your question looks a little short.' });
    if (isRude(name) || isRude(text)) return done({ ok: false, error: "Let's keep it friendly — please rephrase." });

    const now = Date.now();
    let player = state.players[clientId];
    if (player?.removed) return done({ ok: false, error: 'Thanks! Your questions are no longer being accepted.' });
    if (player && now - (player.lastAskAt || 0) < config.cooldownSeconds * 1000) {
      const wait = Math.ceil((config.cooldownSeconds * 1000 - (now - player.lastAskAt)) / 1000);
      return done({ ok: false, error: `Great energy! Wait ${wait}s before your next question.` });
    }

    const isNew = !player;
    if (isNew) {
      player = state.players[clientId] = {
        id: newId(), name, role, color: PALETTE[state.colorIndex++ % PALETTE.length],
        points: 0, count: 0, joinedAt: now,
      };
    } else {
      player.name = name;
      player.role = role || player.role;
    }
    player.points += config.pointsPerQuestion;
    player.count += 1;
    player.lastAskAt = now;

    state.questions.push({ id: newId(), playerKey: clientId, playerId: player.id, name, role: player.role, text, ts: now, status: 'new' });
    save();

    socket.join('me:' + clientId);
    io.to('screen').emit('fx', { type: isNew ? 'join' : 'ask', playerId: player.id, name });
    broadcast();
    done({ ok: true, me: meState(clientId) });
  });

  // ── Host panel
  socket.on('host:join', (key, ack) => {
    if (key !== HOST_KEY) return reply(ack)({ ok: false });
    socket.data.isHost = true;
    socket.join('host');
    reply(ack)({ ok: true, state: hostState() });
  });

  function hostOnly(event, handler) {
    socket.on(event, (arg) => {
      if (!socket.data.isHost) return;
      handler(arg);
      save();
      broadcast();
    });
  }

  hostOnly('host:show', (qid) => {
    const q = state.questions.find((x) => x.id === qid);
    if (!q) return;
    const prev = state.questions.find((x) => x.id === state.onScreen);
    if (prev && prev !== q) { prev.status = 'answered'; notifyOwner(prev); }
    state.onScreen = q.id;
    q.status = 'onscreen';
    const p = state.players[q.playerKey];
    if (p && !q.bonusGiven) { p.points += config.spotlightBonus; q.bonusGiven = true; }
    io.to('screen').emit('fx', { type: 'spotlight', playerId: q.playerId, name: q.name });
    notifyOwner(q);
  });
  hostOnly('host:clear', () => {
    const q = state.questions.find((x) => x.id === state.onScreen);
    if (q) { q.status = 'answered'; notifyOwner(q); }
    state.onScreen = null;
  });
  hostOnly('host:status', ({ qid, status } = {}) => {
    const q = state.questions.find((x) => x.id === qid);
    if (!q || !['new', 'answered', 'hidden'].includes(status)) return;
    q.status = status;
    if (state.onScreen === q.id) state.onScreen = null;
    notifyOwner(q);
  });
  hostOnly('host:delete', (qid) => {
    const q = state.questions.find((x) => x.id === qid);
    if (!q || q.deleted) return;
    q.deleted = true;
    if (state.onScreen === q.id) state.onScreen = null;
    const p = state.players[q.playerKey];
    if (p) { p.points = Math.max(0, p.points - config.pointsPerQuestion); p.count = Math.max(0, p.count - 1); }
    notifyOwner(q);
  });
  hostOnly('host:bonus', (pid) => {
    const p = livePlayers().find((x) => x.id === pid);
    if (p) p.points += 50;
  });
  hostOnly('host:removePlayer', (pid) => {
    const entry = Object.entries(state.players).find(([, p]) => p.id === pid);
    if (!entry) return;
    entry[1].removed = true;
    const onScreen = state.questions.find((x) => x.id === state.onScreen);
    if (onScreen?.playerKey === entry[0]) state.onScreen = null;
  });
  hostOnly('host:reset', () => {
    state = emptyState();
  });
});

server.listen(PORT, () => {
  console.log('\n  MONEY MAZE is running\n');
  console.log(`  Audience (QR code):  ${PUBLIC_URL}`);
  console.log(`  Projector screen:    http://localhost:${PORT}/screen`);
  console.log(`  Host panel:          http://localhost:${PORT}/host?key=${HOST_KEY}\n`);
});
