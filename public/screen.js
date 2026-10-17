(async () => {
  const $ = (id) => document.getElementById(id);
  const COLS = 31, ROWS = 15;
  const COIN_RESPAWN_MS = 20000;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  const cfg = await (await fetch('/api/config')).json();
  $('eventName').textContent = cfg.eventName;
  $('gameTitle').textContent = cfg.gameTitle;
  $('talkTitle').textContent = cfg.talkTitle;
  $('speaker').textContent = cfg.speakerName;
  $('url').textContent = cfg.publicUrl.replace(/^https?:\/\//, '');
  document.title = `${cfg.gameTitle} · Screen`;
  await document.fonts.ready;

  // ── Maze: seeded recursive backtracker, then "braided" so there are loops to run around
  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = rng(cfg.mazeSeed || 1);
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(1));
  {
    const stack = [[1, 1]];
    grid[1][1] = 0;
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const opts = [[2, 0], [-2, 0], [0, 2], [0, -2]]
        .filter(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx > 0 && ny > 0 && nx < COLS - 1 && ny < ROWS - 1 && grid[ny][nx] === 1; });
      if (!opts.length) { stack.pop(); continue; }
      const [dx, dy] = opts[Math.floor(rand() * opts.length)];
      grid[y + dy / 2][x + dx / 2] = 0;
      grid[y + dy][x + dx] = 0;
      stack.push([x + dx, y + dy]);
    }
    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        if (grid[y][x] !== 1) continue;
        const h = !grid[y][x - 1] && !grid[y][x + 1] && grid[y - 1][x] && grid[y + 1][x];
        const v = !grid[y - 1][x] && !grid[y + 1][x] && grid[y][x - 1] && grid[y][x + 1];
        if ((h || v) && rand() < 0.28) grid[y][x] = 0;
      }
    }
  }
  const isOpen = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && grid[y][x] === 0;
  const openCells = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (isOpen(x, y)) openCells.push([x, y]);
  const randomOpen = () => openCells[Math.floor(Math.random() * openCells.length)];
  const key = (x, y) => x + ',' + y;

  // Fundamentals tokens spread around the maze
  const tokenSpots = [[0.08, 0.15], [0.5, 0.12], [0.92, 0.15], [0.08, 0.88], [0.5, 0.88], [0.92, 0.85], [0.3, 0.5], [0.7, 0.5]];
  const tokens = cfg.fundamentals.map((f, i) => {
    const [fx, fy] = tokenSpots[i % tokenSpots.length];
    const tx = fx * (COLS - 1), ty = fy * (ROWS - 1);
    const [x, y] = openCells.reduce((best, c) => (Math.hypot(c[0] - tx, c[1] - ty) < Math.hypot(best[0] - tx, best[1] - ty) ? c : best));
    return { ...f, x, y };
  });
  const tokenAt = new Map(tokens.map((t) => [key(t.x, t.y), t]));

  // Coins: value 0 = present, otherwise timestamp it was collected
  const coins = new Map();
  for (const [x, y] of openCells) if (!tokenAt.has(key(x, y))) coins.set(key(x, y), 0);
  const hasCoin = (x, y) => coins.get(key(x, y)) === 0;
  let coinsSaved = 0;

  // ── Walkers (piggy banks and debt ghosts)
  function makeWalker(x, y, speed) {
    return { fx: x, fy: y, tx: x, ty: y, t: 1, speed, dir: [1, 0], face: 1, born: performance.now() };
  }
  function chooseDir(w) {
    const opts = DIRS.filter(([dx, dy]) => isOpen(w.fx + dx, w.fy + dy));
    if (!opts.length) return [0, 0];
    let pool = opts.length > 1 ? opts.filter(([dx, dy]) => !(dx === -w.dir[0] && dy === -w.dir[1])) : opts;
    if (w.isPlayer) {
      const withCoin = pool.filter(([dx, dy]) => hasCoin(w.fx + dx, w.fy + dy));
      if (withCoin.length && Math.random() < 0.8) pool = withCoin;
    }
    const straight = pool.find(([dx, dy]) => dx === w.dir[0] && dy === w.dir[1]);
    if (straight && Math.random() < 0.5) return straight;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function stepWalker(w, dt) {
    w.t += dt * w.speed;
    while (w.t >= 1) {
      w.t -= 1;
      w.fx = w.tx; w.fy = w.ty;
      if (w.isPlayer) arrive(w);
      const d = chooseDir(w);
      if (!d[0] && !d[1]) { w.t = 0; break; }
      w.dir = d;
      if (d[0]) w.face = d[0];
      w.tx = w.fx + d[0]; w.ty = w.fy + d[1];
    }
  }
  const posOf = (w) => [w.fx + (w.tx - w.fx) * w.t, w.fy + (w.ty - w.fy) * w.t];

  function arrive(w) {
    const k = key(w.fx, w.fy);
    if (coins.get(k) === 0) {
      coins.set(k, performance.now());
      coinsSaved++;
      coinsDirty = true;
    }
  }

  const players = new Map();
  const ghosts = cfg.ghosts.map((label, i) => {
    const [x, y] = openCells[Math.floor(openCells.length * (0.3 + 0.2 * i)) % openCells.length];
    const g = makeWalker(x, y, 1.6 + i * 0.15);
    g.label = label;
    const shades = ['#ff5a6e', '#d93a4f', '#ff8a5c', '#8a2232', '#ffb3bd'];
    g.pattern = Array.from({ length: 36 }, () => shades[Math.floor(Math.random() * shades.length)]);
    g.cooldown = 0;
    return g;
  });

  let popups = [];
  function popup(x, y, text, color) {
    popups.push({ x, y, text, color, born: performance.now() });
  }

  // ── Canvas sizing
  const canvas = $('maze');
  const ctx = canvas.getContext('2d');
  const wallLayer = document.createElement('canvas');
  let cell = 30;

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function resize() {
    const r = $('mazeWrap').getBoundingClientRect();
    cell = Math.max(10, Math.floor(Math.min((r.width - 16) / COLS, (r.height - 16) / ROWS)));
    const dpr = window.devicePixelRatio || 1;
    const w = cell * COLS, h = cell * ROWS;
    for (const c of [canvas, wallLayer]) { c.width = w * dpr; c.height = h * dpr; }
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const wc = wallLayer.getContext('2d');
    wc.setTransform(dpr, 0, 0, dpr, 0, 0);
    const gap = Math.max(1.5, cell * 0.09), rad = cell * 0.2;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!grid[y][x]) continue;
        const px = x * cell + gap, py = y * cell + gap, s = cell - gap * 2;
        wc.fillStyle = '#5ff0d6';
        roundRect(wc, px, py, s, s, rad);
        wc.fill();
        wc.fillStyle = '#16505a';
        roundRect(wc, px, py, s, s - Math.max(2, cell * 0.08), rad);
        wc.fill();
      }
    }
  }
  new ResizeObserver(resize).observe($('mazeWrap'));
  resize();

  // ── Drawing
  function pixelFont(size) { return `${Math.round(size)}px "Press Start 2P", monospace`; }

  function drawCoins(now) {
    ctx.fillStyle = '#ffc94a';
    const r = Math.max(2, cell * 0.09);
    for (const [k, eaten] of coins) {
      if (eaten) {
        if (now - eaten > COIN_RESPAWN_MS) coins.set(k, 0);
        continue;
      }
      const [x, y] = k.split(',').map(Number);
      ctx.fillRect((x + 0.5) * cell - r, (y + 0.5) * cell - r, r * 2, r * 2);
    }
  }

  function drawTokens(now) {
    tokens.forEach((t, i) => {
      const cx = (t.x + 0.5) * cell, cy = (t.y + 0.5) * cell, r = cell * 0.42;
      const on = i < unlocked;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r * (on ? 1 + Math.sin(now / 300 + i) * 0.06 : 1), 0, Math.PI * 2);
      if (on) {
        ctx.shadowColor = '#ffc94a';
        ctx.shadowBlur = cell * 0.6;
        ctx.fillStyle = '#ffc94a';
        ctx.fill();
      } else {
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(234, 255, 246, 0.55)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = on ? '#06161b' : 'rgba(234, 255, 246, 0.6)';
      ctx.font = pixelFont(cell * 0.32);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.key, cx + 1, cy + 1);
    });
  }

  function drawGhost(g) {
    const [x, y] = posOf(g);
    const s = cell * 0.7, p = s / 6;
    const ox = (x + 0.5) * cell - s / 2, oy = (y + 0.5) * cell - s / 2;
    g.pattern.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(ox + (i % 6) * p, oy + Math.floor(i / 6) * p, Math.ceil(p), Math.ceil(p));
    });
    ctx.font = pixelFont(Math.max(7, cell * 0.2));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffb3bd';
    ctx.fillText(g.label, (x + 0.5) * cell, oy + s + 3);
  }

  function drawPlayer(id, w, now) {
    const [x, y] = posOf(w);
    const px = Math.max(2, (cell * 0.95) / 12);
    const sw = px * 12, sh = px * 8;
    const grow = Math.min(1, (now - w.born) / 500);
    const bob = Math.sin(now / 120 + w.seed) * px * 0.6;
    const cx = (x + 0.5) * cell, cy = (y + 0.5) * cell + bob;

    if (id === featuredId) {
      ctx.beginPath();
      ctx.arc(cx, cy, cell * (0.95 + Math.sin(now / 200) * 0.08), 0, Math.PI * 2);
      ctx.strokeStyle = '#ffc94a';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(grow, grow);
    drawPig(ctx, -sw / 2, -sh / 2, px, w.color, w.face < 0);
    ctx.restore();

    const label = w.name.toUpperCase().slice(0, 14);
    ctx.font = pixelFont(Math.max(8, cell * 0.24));
    const tw = ctx.measureText(label).width;
    const th = Math.max(8, cell * 0.24) + 8;
    const lx = cx - tw / 2 - 5, ly = cy - sh / 2 - th - 4;
    ctx.fillStyle = 'rgba(6, 22, 27, 0.85)';
    roundRect(ctx, lx, ly, tw + 10, th, 4);
    ctx.fill();
    ctx.fillStyle = id === featuredId ? '#ffc94a' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, ly + th / 2 + 1);
  }

  function drawPopups(now) {
    popups = popups.filter((p) => now - p.born < 1600);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of popups) {
      const age = (now - p.born) / 1600;
      ctx.globalAlpha = 1 - age;
      ctx.font = pixelFont(Math.max(9, cell * 0.3));
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#06161b';
      const py = (p.y + 0.5) * cell - cell * 0.8 - age * cell * 1.2;
      ctx.strokeText(p.text, (p.x + 0.5) * cell, py);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, (p.x + 0.5) * cell, py);
    }
    ctx.globalAlpha = 1;
  }

  function collide(now) {
    for (const g of ghosts) {
      if (now < g.cooldown) continue;
      const [gx, gy] = posOf(g);
      for (const w of players.values()) {
        const [px, py] = posOf(w);
        if (Math.hypot(px - gx, py - gy) < 0.6) {
          popup(gx, gy, `${g.label} BUSTED!`, '#2ee59d');
          let spot;
          do { spot = randomOpen(); } while (Math.hypot(spot[0] - gx, spot[1] - gy) < 10);
          Object.assign(g, { fx: spot[0], fy: spot[1], tx: spot[0], ty: spot[1], t: 1 });
          g.cooldown = now + 1500;
          break;
        }
      }
    }
  }

  let last = performance.now();
  let coinsDirty = false;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    for (const w of players.values()) stepWalker(w, dt);
    for (const g of ghosts) stepWalker(g, dt);
    collide(now);

    const w = cell * COLS, h = cell * ROWS;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(wallLayer, 0, 0, w, h);
    drawCoins(now);
    drawTokens(now);
    ghosts.forEach(drawGhost);
    [...players.entries()].sort((a, b) => posOf(a[1])[1] - posOf(b[1])[1]).forEach(([id, p]) => drawPlayer(id, p, now));
    drawPopups(now);

    if (coinsDirty) { $('statC').textContent = coinsSaved.toLocaleString(); coinsDirty = false; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ── Sidebar, question card, ticker
  const fundsEl = $('funds');
  cfg.fundamentals.forEach((f) => {
    const d = document.createElement('div');
    d.className = 'fund';
    const b = document.createElement('b');
    b.textContent = f.key;
    const s = document.createElement('span');
    s.textContent = f.label;
    d.append(b, s);
    fundsEl.append(d);
  });

  function renderLeaders(list) {
    const ol = $('leaders');
    ol.replaceChildren();
    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Scan the QR code to be the first AI Builder!';
      ol.append(li);
      return;
    }
    const sorted = [...list].sort((a, b) => b.points - a.points || a.joinedAt - b.joinedAt).slice(0, 8);
    sorted.forEach((p, i) => {
      const li = document.createElement('li');
      if (i === 0) li.className = 'lead';
      const cells = [
        ['rank', String(i + 1)],
        ['sw', ''],
        ['nm', p.name],
        ['pts', String(p.points)],
      ];
      for (const [cls, text] of cells) {
        const span = document.createElement('span');
        span.className = cls;
        span.textContent = text;
        if (cls === 'sw') span.style.background = p.color;
        li.append(span);
      }
      ol.append(li);
    });
  }

  let tickerKey = '';
  function renderTicker(list) {
    const items = [...list].sort((a, b) => b.points - a.points).map((p) => [p.name.toUpperCase(), p.points]);
    const k = JSON.stringify(items);
    if (k === tickerKey) return;
    tickerKey = k;
    const track = $('ticker');
    track.replaceChildren();
    const add = (text, cls) => { const s = document.createElement('span'); s.textContent = text; if (cls) s.className = cls; track.append(s); };
    add(`${cfg.gameTitle} · SCAN THE QR CODE TO ASK & PLAY`);
    for (const [name, pts] of items) {
      const s = document.createElement('span');
      s.append(name + ' ');
      const up = document.createElement('b');
      up.className = 'up';
      up.textContent = `▲ ${pts}`;
      s.append(up);
      track.append(s);
    }
    cfg.fundamentals.forEach((f, i) => add(`${f.label.toUpperCase()} ${i < unlocked ? '● UNLOCKED' : '○ LOCKED'}`));
    track.style.animationDuration = Math.max(25, track.scrollWidth / 90) + 's';
  }

  let currentQ = null;
  function renderQuestion(q) {
    const card = $('qcard');
    if (!q) { card.classList.remove('show'); currentQ = null; return; }
    if (currentQ === q.id) return;
    const reveal = () => {
      $('qText').textContent = q.text;
      $('qBy').textContent = 'Asked by ' + q.name + (q.role ? ' · ' + q.role : '');
      $('qDot').style.background = q.color || '#ff5fa2';
      card.classList.add('show');
    };
    if (currentQ) { card.classList.remove('show'); setTimeout(reveal, 450); } else reveal();
    currentQ = q.id;
  }

  function toast(text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    $('toasts').append(t);
    setTimeout(() => t.remove(), 4000);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
  }

  let unlocked = 0;
  let featuredId = null;
  let firstState = true;

  // ── Live updates
  const socket = io();
  socket.on('connect', () => socket.emit('screen:join'));

  socket.on('state', (s) => {
    const ids = new Set(s.players.map((p) => p.id));
    for (const id of players.keys()) if (!ids.has(id)) players.delete(id);
    for (const p of s.players) {
      let w = players.get(p.id);
      if (!w) {
        const [x, y] = randomOpen();
        w = makeWalker(x, y, 2.4 + Math.random() * 0.9);
        w.isPlayer = true;
        w.seed = Math.random() * 10;
        players.set(p.id, w);
      }
      w.name = p.name;
      w.color = p.color;
    }
    featuredId = s.onScreen ? s.onScreen.playerId : null;

    const nowUnlocked = Math.min(tokens.length, s.totalQuestions);
    if (!firstState) {
      for (let i = unlocked; i < nowUnlocked; i++) {
        popup(tokens[i].x, tokens[i].y, `${tokens[i].label.toUpperCase()} UNLOCKED`, '#ffc94a');
        fundsEl.children[i].classList.add('pop');
      }
    }
    unlocked = nowUnlocked;
    [...fundsEl.children].forEach((el, i) => el.classList.toggle('on', i < unlocked));
    $('fundCount').textContent = `${unlocked}/${tokens.length}`;

    $('statQ').textContent = s.totalQuestions;
    $('statP').textContent = s.players.length;
    renderLeaders(s.players);
    renderTicker(s.players);
    renderQuestion(s.onScreen);
    firstState = false;
  });

  socket.on('fx', (e) => {
    const w = players.get(e.playerId);
    if (e.type === 'join') toast(`${e.name} joined the market!`);
    if (e.type === 'ask') toast(`${e.name} asked another question`);
    if (e.type === 'spotlight') toast(`Spotlight on ${e.name} · +bonus`);
    // the walker may be created by the 'state' event that follows, so wait a tick
    setTimeout(() => {
      const p = w || players.get(e.playerId);
      if (!p) return;
      const [x, y] = posOf(p);
      popup(x, y, e.type === 'spotlight' ? '+BONUS' : `+${cfg.pointsPerQuestion}`, e.type === 'spotlight' ? '#ffc94a' : '#2ee59d');
    }, 50);
  });

  $('fsBtn').addEventListener('click', () => document.documentElement.requestFullscreen?.());
})();
