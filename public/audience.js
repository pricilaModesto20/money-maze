(async () => {
  const $ = (id) => document.getElementById(id);
  const cfg = await (await fetch('/api/config')).json();

  $('eventName').textContent = cfg.eventName;
  $('gameTitle').textContent = cfg.gameTitle;
  $('talkTitle').textContent = cfg.talkTitle;
  $('speaker').textContent = 'with ' + cfg.speakerName;
  const first = cfg.speakerName.split(' ')[0];
  $('qLabel').textContent = cfg.speakerName === 'Your Name' ? 'Ask a question' : `Ask ${first} a question`;
  $('q').maxLength = cfg.maxQuestionLength;
  $('counter').textContent = `0/${cfg.maxQuestionLength}`;
  for (const r of cfg.roles) $('role').append(new Option(r, r));
  if (cfg.linkedinUrl) {
    $('follow').href = cfg.linkedinUrl;
    $('followName').textContent = cfg.speakerName;
    $('follow').hidden = false;
  }

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  let clientId = store.get('mm-client');
  if (!clientId) {
    clientId = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
    store.set('mm-client', clientId);
  }
  $('name').value = store.get('mm-name') || '';
  $('role').value = store.get('mm-role') || '';

  const STATUS = { new: 'SENT', onscreen: 'ON SCREEN', answered: 'ANSWERED' };
  let lastBadgeKey = '';
  let lastStatuses = {};

  function toast(text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    document.body.append(t);
    setTimeout(() => t.remove(), 3000);
  }

  async function renderMe(me) {
    if (!me) return;
    $('scoreCard').hidden = false;
    $('myPts').textContent = me.points;
    $('myCount').textContent = me.count;
    $('qWord').textContent = me.count === 1 ? 'QUESTION' : 'QUESTIONS';

    const list = $('myQs');
    list.replaceChildren();
    for (const q of [...me.questions].reverse()) {
      const li = document.createElement('li');
      const p = document.createElement('p');
      p.textContent = q.text;
      const chip = document.createElement('span');
      chip.className = 'chip ' + q.status;
      chip.textContent = STATUS[q.status] || 'SENT';
      li.append(p, chip);
      list.append(li);
      if (q.status === 'onscreen' && lastStatuses[q.id] && lastStatuses[q.id] !== 'onscreen') {
        toast('Your question is on the big screen!');
        navigator.vibrate?.([80, 60, 80]);
      }
      lastStatuses[q.id] = q.status;
    }

    const key = [me.name, me.count, me.points, me.color].join('|');
    if (key !== lastBadgeKey && me.count > 0) {
      lastBadgeKey = key;
      const svg = badgeSvg({ ...me, eventName: cfg.eventName, gameTitle: cfg.gameTitle, talkTitle: cfg.talkTitle });
      try {
        $('badgeImg').src = await svgToPng(svg);
      } catch {
        $('badgeImg').src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      }
      $('badgeCard').hidden = false;
    }
  }

  // Saving the badge: phones handle downloads differently, so try the best option for each.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function showSaveOverlay(src) {
    $('saveImg').src = src;
    $('saveOverlay').hidden = false;
  }
  $('saveClose').addEventListener('click', () => { $('saveOverlay').hidden = true; });
  $('download').addEventListener('click', async (e) => {
    e.preventDefault();
    const src = $('badgeImg').src;
    if (!src) return;
    try {
      const blob = await (await fetch(src)).blob();
      const file = new File([blob], 'cyberweek-badge.png', { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'My CyberWeek badge' });
          return;
        } catch (err) {
          if (err.name === 'AbortError') return;
        }
      }
      if (isIOS) return showSaveOverlay(src);
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: 'cyberweek-badge.png' });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      showSaveOverlay(src);
    }
  });

  const socket = io();
  socket.on('connect', () => socket.emit('hello', { clientId }, renderMe));
  socket.on('me', renderMe);

  $('q').addEventListener('input', () => {
    $('counter').textContent = `${$('q').value.length}/${cfg.maxQuestionLength}`;
  });

  $('askForm').addEventListener('submit', (e) => {
    e.preventDefault();
    $('err').textContent = '';
    const name = $('name').value.trim();
    const text = $('q').value.trim();
    if (name.length < 2) return void ($('err').textContent = 'Please enter your name.');
    if (text.length < 5) return void ($('err').textContent = 'Please write your question.');

    store.set('mm-name', name);
    store.set('mm-role', $('role').value);
    $('send').disabled = true;
    $('send').textContent = 'Sending…';

    socket.timeout(8000).emit('ask', { clientId, name, role: $('role').value, text }, (err, res) => {
      $('send').disabled = false;
      $('send').textContent = 'Send';
      if (err) return void ($('err').textContent = 'Connection hiccup — please try again.');
      if (!res.ok) return void ($('err').textContent = res.error);
      $('q').value = '';
      $('counter').textContent = `0/${cfg.maxQuestionLength}`;
      toast(`+${cfg.pointsPerQuestion} pts! Look for your piggy bank on screen`);
      navigator.vibrate?.(60);
      renderMe(res.me);
      $('scoreCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
})();
