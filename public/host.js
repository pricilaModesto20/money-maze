(() => {
  const $ = (id) => document.getElementById(id);
  const socket = io();
  let filter = 'open';
  let state = null;

  const params = new URLSearchParams(location.search);
  let key = params.get('key') || sessionStorage.getItem('mm-host-key') || '';

  function join() {
    socket.emit('host:join', key, (res) => {
      if (!res.ok) {
        $('app').hidden = true;
        $('login').hidden = false;
        if (key) $('loginErr').textContent = 'That key is not right.';
        return;
      }
      sessionStorage.setItem('mm-host-key', key);
      if (params.has('key')) history.replaceState(null, '', '/host');
      $('login').hidden = true;
      $('app').hidden = false;
      render(res.state);
    });
  }
  socket.on('connect', join);
  socket.on('host:state', render);

  $('login').addEventListener('submit', (e) => {
    e.preventDefault();
    key = $('keyInput').value.trim();
    join();
  });

  function el(tag, props = {}, ...children) {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...children);
    return n;
  }
  function btn(label, onClick, cls = '') {
    return el('button', { className: cls, textContent: label, onclick: onClick });
  }
  const ago = (ts) => {
    const s = Math.round((Date.now() - ts) / 1000);
    return s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
  };

  function render(s) {
    state = s;
    $('audLink').href = s.publicUrl;
    $('audLink').textContent = s.publicUrl.replace(/^https?:\/\//, '') + ' ↗';

    const now = s.onScreen;
    $('nowText').textContent = now ? now.text : 'Nothing on screen — pick a question below.';
    $('nowMeta').textContent = now ? `Asked by ${now.name}${now.role ? ' · ' + now.role : ''}` : '';
    $('clearBtn').hidden = !now;

    const qs = [...s.questions].filter((q) =>
      filter === 'all' ? true : filter === 'answered' ? q.status === 'answered' : q.status === 'new' || q.status === 'onscreen');
    qs.sort((a, b) => a.ts - b.ts);
    $('qCount').textContent = `(${s.questions.length})`;

    const colorOf = Object.fromEntries(s.players.map((p) => [p.id, p.color]));
    const list = $('qs');
    list.replaceChildren();
    if (!qs.length) list.append(el('li', { className: 'empty', textContent: filter === 'open' ? 'No questions waiting.' : 'Nothing here yet.' }));
    for (const q of qs) {
      const li = el('li', { className: 'q ' + q.status });
      li.style.borderLeftColor = colorOf[q.playerId] || 'var(--line)';
      const meta = el('div', { className: 'meta' },
        el('b', { textContent: q.name }),
        el('span', { textContent: q.role || '' }),
        el('span', { textContent: ago(q.ts) }),
        el('span', { textContent: q.status === 'onscreen' ? '● ON SCREEN' : q.status.toUpperCase() }));
      const actions = el('div', { className: 'actions' });
      if (q.status !== 'onscreen') actions.append(btn('Show on screen', () => socket.emit('host:show', q.id), 'primary'));
      if (q.status !== 'answered') actions.append(btn('Mark answered', () => socket.emit('host:status', { qid: q.id, status: 'answered' })));
      else actions.append(btn('Reopen', () => socket.emit('host:status', { qid: q.id, status: 'new' })));
      if (q.status !== 'hidden') actions.append(btn('Hide', () => socket.emit('host:status', { qid: q.id, status: 'hidden' })));
      actions.append(btn('Delete', () => confirm('Delete this question?') && socket.emit('host:delete', q.id), 'danger'));
      li.append(el('p', { textContent: q.text }), meta, actions);
      list.append(li);
    }

    $('pCount').textContent = `(${s.players.length})`;
    const pl = $('players');
    pl.replaceChildren();
    for (const p of [...s.players].sort((a, b) => b.points - a.points)) {
      const sw = el('span', { className: 'sw' });
      sw.style.background = p.color;
      pl.append(el('li', {},
        sw,
        el('span', { textContent: p.name }),
        el('span', { className: 'pts', textContent: p.points }),
        btn('+50', () => socket.emit('host:bonus', p.id)),
        btn('Remove', () => confirm(`Remove ${p.name} from the game?`) && socket.emit('host:removePlayer', p.id), 'danger')));
    }
  }

  $('filters').addEventListener('click', (e) => {
    const f = e.target.dataset?.f;
    if (!f) return;
    filter = f;
    [...$('filters').children].forEach((b) => b.classList.toggle('on', b.dataset.f === f));
    if (state) render(state);
  });
  $('clearBtn').addEventListener('click', () => socket.emit('host:clear'));
  $('resetBtn').addEventListener('click', () => {
    if (confirm('Erase ALL players and questions? This cannot be undone.')) socket.emit('host:reset');
  });
  setInterval(() => state && render(state), 30000);
})();
