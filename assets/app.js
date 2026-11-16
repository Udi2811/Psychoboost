(() => {
  'use strict';

  // ================= Utilities =================
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rand = a => a[Math.floor(Math.random() * a.length)];
  const view = $('#view');
  const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const topicById = id => TOPICS.find(t => t.id === id);
  const domainOf = q => topicById(q.t).domain;

  function mulberry32(a) {
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function shuffle(arr, rnd = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // ================= State =================
  const KEY = 'psychoboost_v1';
  const defaults = () => ({
    name: 'אריאל', xp: 0, streak: 0, lastDay: null, answers: {}, exams: [], essays: {}, cards: {},
    settings: { coffee: 45, sound: true }, examDate: '', videos: {}, legoBest: 0, sprintBest: 0, visited: {}
  });
  let S = (() => {
    try {
      const s = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY)) || {});
      s.settings = Object.assign(defaults().settings, s.settings);
      if (!s.name) s.name = 'אריאל';
      return s;
    } catch { return defaults(); }
  })();
  const save = () => localStorage.setItem(KEY, JSON.stringify(S));

  function touchDay() {
    const today = localDay();
    if (S.lastDay === today) return;
    const y = new Date(); y.setDate(y.getDate() - 1);
    S.streak = S.lastDay === localDay(y) ? S.streak + 1 : 1;
    S.lastDay = today;
    if (S.streak > 1) toast(`🔥 ${S.streak} ימים ברצף! התמדה = הצלחה`, 'gold');
  }

  const TARGET = 780;
  const PACE = 60; // שניות לשאלה: פרק של 20 דקות ≈ 20 שאלות
  const LEVELS = ['מתחיל/ה 🌱', 'חוקר/ת 🔍', 'פותר/ת 🧩', 'אסטרטג/ית ♟️', 'מומחה/ית 🎯', 'אלוף/ת 750 🥇', 'מאסטר 780+ 🏆', 'אגדה 800 👑'];
  const XP_PER_LEVEL = 250;
  const levelOf = xp => Math.min(Math.floor(xp / XP_PER_LEVEL), LEVELS.length - 1);

  function addXP(n) {
    const before = levelOf(S.xp);
    S.xp += n;
    const after = levelOf(S.xp);
    save(); updateTopbar();
    if (after > before) {
      confetti(180);
      sound('level');
      openModal(`<div class="big-emoji">🏆</div><h2 style="text-align:center">${esc(S.name)}, עלית רמה!</h2>
        <p style="text-align:center;font-size:20px">את/ה עכשיו <b class="grad-text">${LEVELS[after]}</b></p>
        <p class="muted" style="text-align:center">כל רמה מקרבת אותך לציון ${TARGET}+. ממשיכים!</p>`);
    }
  }

  function record(q, correct) {
    const r = S.answers[q.id] || { c: 0, w: 0 };
    correct ? r.c++ : r.w++;
    r.last = correct;
    S.answers[q.id] = r;
    touchDay();
    save();
  }

  // ================= Stats & score estimate =================
  function statsFor(filter) {
    let c = 0, w = 0, seen = 0, total = 0;
    QUESTIONS.filter(filter).forEach(q => {
      total++;
      const r = S.answers[q.id];
      if (r) { c += r.c; w += r.w; seen++; }
    });
    return { c, w, seen, total, acc: c + w ? c / (c + w) : null };
  }
  const domainStats = d => statsFor(q => domainOf(q) === d);
  const topicStats = t => statsFor(q => q.t === t);
  const domainScore = acc => Math.round(50 + 100 * acc);
  const generalScore = (v, q) => Math.round(200 + 600 * (((v + q) / 2) - 50) / 100);

  function estimate() {
    const v = domainStats('verbal'), q = domainStats('quant');
    if (v.c + v.w < 5 || q.c + q.w < 5) return null;
    const V = domainScore(v.acc), Q = domainScore(q.acc);
    return { V, Q, G: generalScore(V, Q) };
  }

  // ================= Feedback: toast, sound, confetti, modal =================
  function toast(msg, cls = '', ms = 2600) {
    const el = document.createElement('div');
    el.className = `toast ${cls}`;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, ms);
  }

  let audioCtx;
  function sound(type) {
    if (!S.settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const seq = { good: [660, 880], bad: [300, 220], level: [523, 659, 784, 1047], tick: [900] }[type] || [440];
      seq.forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = type === 'bad' ? 'triangle' : 'sine';
        o.frequency.value = f;
        const t0 = audioCtx.currentTime + i * 0.09;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.15, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
        o.connect(g).connect(audioCtx.destination);
        o.start(t0); o.stop(t0 + 0.25);
      });
    } catch { /* audio unavailable */ }
  }

  const cCanvas = $('#confetti'), cCtx = cCanvas.getContext('2d');
  let parts = [], cRunning = false;
  function confetti(n = 80) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    cCanvas.width = innerWidth; cCanvas.height = innerHeight;
    const colors = ['#ff5c8a', '#4dd8ff', '#ffc94d', '#8b5cff', '#3ee8a0'];
    for (let i = 0; i < n; i++) {
      parts.push({
        x: innerWidth / 2 + (Math.random() - .5) * 200, y: innerHeight / 3,
        vx: (Math.random() - .5) * 16, vy: Math.random() * -14 - 4,
        s: Math.random() * 8 + 4, r: Math.random() * 6, vr: (Math.random() - .5) * .3,
        c: rand(colors), life: 120 + Math.random() * 60
      });
    }
    if (!cRunning) { cRunning = true; requestAnimationFrame(cLoop); }
  }
  function cLoop() {
    cCtx.clearRect(0, 0, cCanvas.width, cCanvas.height);
    parts = parts.filter(p => p.life-- > 0 && p.y < cCanvas.height + 20);
    parts.forEach(p => {
      p.vy += 0.4; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      cCtx.save(); cCtx.translate(p.x, p.y); cCtx.rotate(p.r);
      cCtx.fillStyle = p.c; cCtx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      cCtx.restore();
    });
    if (parts.length) requestAnimationFrame(cLoop); else { cRunning = false; cCtx.clearRect(0, 0, cCanvas.width, cCanvas.height); }
  }

  const modal = $('#modal');
  function openModal(html) { $('#modalBody').innerHTML = html; modal.classList.remove('hidden'); }
  function closeModal() { modal.classList.add('hidden'); }
  $('#modalClose').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  let combo = 0;
  function reward(correct) {
    if (correct) {
      combo++;
      addXP(10 + (combo >= 3 ? 5 : 0));
      sound('good');
      if (combo > 0 && combo % 5 === 0) {
        confetti(160);
        toast(`🔥 ${combo} תשובות נכונות ברצף! ככה מגיעים ל-${TARGET}+`, 'gold', 3500);
      } else {
        confetti(40);
        toast(`${S.name}, ${rand(PRAISE)}`, 'good');
      }
    } else {
      combo = 0;
      sound('bad');
      toast(`${S.name}, ${rand(ENCOURAGE)}`, 'bad');
    }
  }

  // ================= Topbar =================
  function updateTopbar() {
    const h = new Date().getHours();
    const g = h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב';
    $('#greet').innerHTML = `${g}, <b>${esc(S.name || 'אריאל')}</b> 👋`;
    $('#streak').textContent = S.streak;
    const lv = levelOf(S.xp);
    $('#levelTitle').textContent = `רמה ${lv + 1} · ${LEVELS[lv]} · ${S.xp} XP`;
    $('#xpFill').style.width = lv === LEVELS.length - 1 ? '100%' : `${(S.xp % XP_PER_LEVEL) / XP_PER_LEVEL * 100}%`;
  }

  // ================= Router =================
  let cleanups = [];
  const onLeave = fn => cleanups.push(fn);
  const routes = {
    '': home, course, topic, practice, exams, exam, writing, cards, print: printView, break: breakView, resources
  };
  function router() {
    cleanups.forEach(f => f()); cleanups = [];
    const h = location.hash.replace(/^#\/?/, '');
    const [r, ...args] = h.split('/');
    (routes[r] || home)(...args.map(decodeURIComponent));
    $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.route === (routes[r] ? r : '')));
    view.style.animation = 'none'; void view.offsetWidth; view.style.animation = '';
    scrollTo({ top: 0, behavior: 'smooth' });
  }
  addEventListener('hashchange', router);

  // ================= Views =================
  function gauge(score) {
    const r = 95, C = 2 * Math.PI * r;
    const frac = score ? Math.max(0, Math.min(1, (score - 200) / 600)) : 0;
    const t = 2 * Math.PI * ((TARGET - 200) / 600);
    const tx = 110 + r * Math.cos(t), ty = 110 + r * Math.sin(t);
    return `<div class="gauge-wrap">
      <svg viewBox="0 0 220 220">
        <defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4dd8ff"/><stop offset=".5" stop-color="#8b5cff"/><stop offset="1" stop-color="#ff5c8a"/></linearGradient></defs>
        <circle cx="110" cy="110" r="${r}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="16"/>
        <circle id="gArc" cx="110" cy="110" r="${r}" fill="none" stroke="url(#gg)" stroke-width="16" stroke-linecap="round"
          stroke-dasharray="0 ${C}" data-dash="${C * frac}" data-c="${C}" style="transition:stroke-dasharray 1.4s cubic-bezier(.2,.9,.3,1)"/>
        <circle cx="${tx}" cy="${ty}" r="7" fill="#ffc94d"><title>יעד ${TARGET}</title></circle>
      </svg>
      <div class="gauge-center"><div class="num grad-text">${score || '—'}</div><div class="lbl">${score ? 'ציון משוער' : 'פתרו 5+ שאלות בכל תחום'}</div><div class="lbl" style="color:var(--gold)">● יעד: ${TARGET}</div></div>
    </div>`;
  }
  function animateGauge() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const a = $('#gArc'); if (a) a.setAttribute('stroke-dasharray', `${a.dataset.dash} ${a.dataset.c}`);
    }));
  }

  function dayOfYear() { const n = new Date(); return Math.floor((n - new Date(n.getFullYear(), 0, 0)) / 864e5); }

  function home() {
    const est = estimate();
    const all = statsFor(() => true);
    const daysLeft = S.examDate ? Math.ceil((new Date(S.examDate) - new Date(localDay())) / 864e5) : null;
    const weakest = TOPICS.map(t => ({ t, s: topicStats(t.id) }))
      .filter(x => x.s.total)
      .sort((a, b) => (a.s.acc ?? -1) - (b.s.acc ?? -1))[0];
    const hal = HALACHOT[dayOfYear() % HALACHOT.length];
    const gap = est ? TARGET - est.G : null;

    view.innerHTML = `
      <div class="hero">
        <h1>הדרך שלך ל-<span class="grad-text">${TARGET}+</span> מתחילה כאן</h1>
        <p>קורס פסיכומטרי אינטראקטיבי: שיעורים, טריקים, סרטונים, תרגול חכם שמתמקד בנקודות החולשה, מבחנים לדוגמה עם טיימר – וגם הפסקות קפה 😉</p>
        <div class="row mt">
          <a class="btn" href="#/practice">⚡ תרגול חכם עכשיו</a>
          <a class="btn alt" href="#/exams">⏱️ סימולציה</a>
          <a class="btn ghost" href="#/course">🎓 לכל השיעורים</a>
        </div>
      </div>

      <div class="grid g2 mt">
        <div class="card">${gauge(est && est.G)}
          <p style="text-align:center;margin:10px 0 0">${est
            ? (gap <= 0 ? `🏆 את/ה מעל היעד! מילולי ≈ ${est.V} · כמותי ≈ ${est.Q}` : `עוד <b>${gap}</b> נקודות ליעד · מילולי ≈ ${est.V} · כמותי ≈ ${est.Q}`)
            : 'הציון המשוער יחושב לפי אחוזי ההצלחה שלך בתרגול.'}</p>
          <p class="muted" style="text-align:center;font-size:12px">הערכה בלבד – לא חישוב רשמי של מאל"ו. לציון ~${TARGET} נדרשת הצלחה של כ-95% ומעלה, בקצב של כדקה לשאלה.</p>
        </div>
        <div class="grid g4" style="align-content:start">
          <div class="card stat-card"><div class="num grad-text">${all.seen}</div><div class="lbl">שאלות שנפתרו מתוך ${all.total}</div></div>
          <div class="card stat-card"><div class="num grad-text">${all.acc == null ? '—' : Math.round(all.acc * 100) + '%'}</div><div class="lbl">אחוז הצלחה</div></div>
          <div class="card stat-card"><div class="num grad-text">${S.streak}🔥</div><div class="lbl">ימי רצף</div></div>
          <div class="card stat-card"><div class="num grad-text">${daysLeft == null ? '?' : Math.max(daysLeft, 0)}</div><div class="lbl">${daysLeft == null ? `<a href="#" id="setDate">קבע תאריך מבחן</a>` : 'ימים למבחן'}</div></div>
        </div>
      </div>

      <div class="grid g3 mt">
        ${Object.entries(DOMAINS).map(([d, D]) => {
          const s = domainStats(d);
          return `<div class="card"><div class="row"><span style="font-size:28px">${D.icon}</span><h4 style="margin:0">${D.title}</h4></div>
            <p class="muted" style="font-size:13px">כיסוי: ${s.seen}/${s.total} · הצלחה: ${s.acc == null ? '—' : Math.round(s.acc * 100) + '%'}</p>
            <div class="bar"><div style="width:${s.total ? s.seen / s.total * 100 : 0}%;background:${D.color}"></div></div></div>`;
        }).join('')}
      </div>

      <div class="grid g2 mt">
        <div class="card">
          <h3 style="margin-top:0">🎯 המלצה להיום</h3>
          ${weakest ? `<p>הנושא שכדאי לחזק: <b>${weakest.t.icon} ${weakest.t.title}</b> ${weakest.s.acc == null ? '(עוד לא תרגלת)' : `(הצלחה ${Math.round(weakest.s.acc * 100)}%)`}</p>
          <a class="btn small" href="#/topic/${weakest.t.id}/learn">לשיעור ←</a> <a class="btn small alt" href="#/topic/${weakest.t.id}/practice">לתרגול ←</a>` : ''}
          <p class="muted mt" style="font-size:14px">💡 טיפ: 30-45 דקות של לימוד ממוקד + הפסקה קצרה עדיפים על 3 שעות רצופות.</p>
        </div>
        <div class="card halacha">
          <h3>📜 הלכה יומית: ${hal.t}</h3>
          <p>${hal.b}</p>
          <div class="src">מקור: ${hal.s}</div>
          <a class="btn small ghost mt" href="#/break">לפינת ההפסקה ☕</a>
        </div>
      </div>`;
    animateGauge();
    const sd = $('#setDate'); if (sd) sd.addEventListener('click', e => { e.preventDefault(); openSettings(); });
  }

  function course() {
    view.innerHTML = `<h1>🎓 הקורס המלא</h1>
      <p class="muted">החל מדצמבר 2026 הבחינה הפסיכומטרית כוללת שני תחומים – <b>חשיבה מילולית</b> ו<b>חשיבה כמותית</b>. הקורס מתמקד בשני התחומים האלה.</p>
      ${Object.entries(DOMAINS).map(([d, D]) => `
        <div class="domain-head"><div class="ico" style="background:${D.color}33">${D.icon}</div><div><h2 style="margin:0">${D.title}</h2><div class="muted">${D.desc}</div></div></div>
        <div class="grid g3">
          ${TOPICS.filter(t => t.domain === d).map(t => {
            const s = topicStats(t.id);
            return `<a class="card topic-card" style="--accent:${D.color}" href="#/topic/${t.id}/learn">
              <div class="row"><span class="t-ico">${t.icon}</span><span class="spacer"></span>${S.visited[t.id] ? '<span title="נלמד">✅</span>' : ''}</div>
              <h4>${t.title}</h4><p>${t.summary}</p>
              <div class="bar"><div style="width:${s.total ? s.seen / s.total * 100 : 0}%;background:${D.color}"></div></div>
              <div class="muted" style="font-size:12px;margin-top:6px">${s.seen}/${s.total} שאלות · ${s.acc == null ? 'טרם תורגל' : 'הצלחה ' + Math.round(s.acc * 100) + '%'}</div>
            </a>`;
          }).join('')}
        </div>`).join('')}`;
  }

  function ytId(url) {
    const m = String(url).trim().match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }
  function embed(id) {
    const wrap = document.createElement('div');
    wrap.className = 'video-embed';
    const f = document.createElement('iframe');
    f.src = `https://www.youtube-nocookie.com/embed/${id}`;
    f.title = 'סרטון';
    f.allow = 'accelerometer; encrypted-media; gyroscope; picture-in-picture';
    f.allowFullscreen = true;
    f.loading = 'lazy';
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    wrap.appendChild(f);
    return wrap;
  }

  function topic(id, tab = 'learn') {
    const t = topicById(id);
    if (!t) return course();
    const D = DOMAINS[t.domain];
    S.visited[id] = true; save();
    const tabs = [['learn', '📘 הסבר'], ['tricks', '🪄 שיטות וטריקים'], ['videos', '🎬 סרטונים'], ['practice', '✏️ תרגול']];
    view.innerHTML = `
      <a href="#/course" class="muted">→ חזרה לקורס</a>
      <div class="row mt"><span style="font-size:48px">${t.icon}</span><div><h1 style="margin:0">${t.title}</h1><div class="muted">${D.icon} ${D.title} · ${t.summary}</div></div></div>
      <div class="tabs">${tabs.map(([k, l]) => `<a class="tab ${k === tab ? 'active' : ''}" href="#/topic/${id}/${k}">${l}</a>`).join('')}</div>
      <div id="tabBody"></div>`;
    const body = $('#tabBody');

    if (tab === 'learn') {
      body.innerHTML = `<div class="card lesson">${t.learn}</div>
        <div class="row mt"><a class="btn" href="#/topic/${id}/tricks">לשיטות ולטריקים ←</a><a class="btn ghost" href="#/topic/${id}/practice">ישר לתרגול</a></div>`;
    } else if (tab === 'tricks') {
      body.innerHTML = `<div class="card">${t.tricks.map((x, i) => `<div class="trick"><div class="n">${i + 1}</div><div>${x}</div></div>`).join('')}</div>
        <div class="row mt"><a class="btn" href="#/topic/${id}/videos">לסרטונים ←</a></div>`;
    } else if (tab === 'videos') {
      body.innerHTML = `
        <p class="muted">הסרטונים נפתחים ביוטיוב בחיפוש ממוקד לנושא – כך תקבלו תמיד את ההסברים העדכניים מהמורים המובילים. מצאתם סרטון שאהבתם? הוסיפו אותו למטה והוא יוטמע כאן לצפייה חוזרת.</p>
        <div class="grid g2">${t.videos.map(v => `
          <a class="card video-card" target="_blank" rel="noopener noreferrer" href="https://www.youtube.com/results?search_query=${encodeURIComponent(v.q)}">
            <div class="video-thumb">▶</div><div><b>${v.t}</b><div class="muted" style="font-size:13px">חיפוש ביוטיוב: "${v.q}"</div></div></a>`).join('')}
        </div>
        <div class="card mt">
          <h3 style="margin-top:0">📌 הסרטונים שלי לנושא</h3>
          <div class="row"><input id="vidUrl" placeholder="הדביקו קישור YouTube" style="flex:1;min-width:220px" dir="ltr"><button class="btn small" id="vidAdd">הוסף</button></div>
          <div id="myVids" class="grid g2 mt"></div>
        </div>`;
      const renderVids = () => {
        const box = $('#myVids'); box.innerHTML = '';
        (S.videos[id] || []).forEach((vid, i) => {
          const c = document.createElement('div');
          c.appendChild(embed(vid));
          const del = document.createElement('button');
          del.className = 'btn small ghost'; del.textContent = 'הסר'; del.style.marginTop = '8px';
          del.onclick = () => { S.videos[id].splice(i, 1); save(); renderVids(); };
          c.appendChild(del);
          box.appendChild(c);
        });
        if (!(S.videos[id] || []).length) box.innerHTML = '<p class="muted">עוד לא נוספו סרטונים.</p>';
      };
      $('#vidAdd').onclick = () => {
        const vid = ytId($('#vidUrl').value);
        if (!vid) return toast('קישור YouTube לא תקין', 'bad');
        (S.videos[id] = S.videos[id] || []).push(vid); save();
        $('#vidUrl').value = ''; renderVids(); toast('הסרטון נוסף 🎬', 'good');
      };
      renderVids();
    } else {
      const qs = shuffle(QUESTIONS.filter(q => q.t === id));
      if (!qs.length) { body.innerHTML = '<p class="muted">אין שאלות לנושא זה.</p>'; return; }
      runQuiz(body, qs, { title: t.title });
    }
  }

  // ---------- Quiz engine (practice mode with instant feedback) ----------
  function optButtons(q, cls = 'opt') {
    return q.o.map((o, i) => `<button class="${cls}" data-i="${i}"><span class="k">${i + 1}</span><span>${o}</span></button>`).join('');
  }

  function runQuiz(container, qs, opts = {}) {
    let idx = 0, right = 0, qTimer = null, totalSec = 0, slow = 0;
    const stopQ = () => { clearInterval(qTimer); qTimer = null; };
    onLeave(stopQ);
    const show = () => {
      stopQ();
      if (idx >= qs.length) return finish();
      const q = qs[idx], t = topicById(q.t);
      container.innerHTML = `
        <div class="bar" style="margin-bottom:14px"><div style="width:${idx / qs.length * 100}%;background:var(--grad)"></div></div>
        <div class="card q-card">
          <div class="q-meta"><span>שאלה ${idx + 1} מתוך ${qs.length}${q.d === 3 ? ' · <b style="color:var(--pink)">🔥 רמת 780+</b>' : ''}</span><span class="pace" id="pace">⏱️ 0:00 / 1:00</span><span>${t.icon} ${t.title}</span></div>
          <div class="q-text">${q.q}</div>
          <div class="opts">${optButtons(q)}</div>
          <div id="afterQ"></div>
        </div>`;
      let sec = 0;
      qTimer = setInterval(() => {
        sec++;
        const el = $('#pace', container); if (!el) return stopQ();
        el.textContent = `⏱️ ${fmtTime(sec).replace(/^0/, '')} / 1:00`;
        el.classList.toggle('over', sec > PACE);
      }, 1000);
      $$('.opt', container).forEach(b => b.addEventListener('click', () => {
        stopQ();
        totalSec += sec;
        if (sec > PACE) slow++;
        const pick = +b.dataset.i, ok = pick === q.a;
        $$('.opt', container).forEach((x, i) => { x.disabled = true; if (i === q.a) x.classList.add('correct'); });
        if (!ok) b.classList.add('wrong');
        if (ok) right++;
        record(q, ok); reward(ok);
        const paceMsg = sec <= PACE ? `⏱️ ${sec} שניות – בקצב מבחן ✅` : `⏱️ ${sec} שניות – מעל קצב המבחן (כדקה לשאלה). נסו את הטריק מהשיעור ⚠️`;
        $('#afterQ', container).innerHTML = `
          <div class="explain ${ok ? '' : 'bad'}"><div class="feedback-badge">${ok ? '✔ נכון!' : '✖ התשובה הנכונה: ' + (q.a + 1)}</div>${q.e}<div class="muted" style="margin-top:8px;font-size:14px">${paceMsg}</div></div>
          <div class="row mt"><button class="btn" id="nextQ">${idx + 1 < qs.length ? 'לשאלה הבאה ←' : 'לסיכום 🏁'}</button></div>`;
        $('#nextQ', container).onclick = () => { idx++; show(); };
        $('#nextQ', container).focus();
      }));
    };
    const finish = () => {
      const pct = Math.round(right / qs.length * 100);
      const avg = Math.round(totalSec / qs.length);
      const msg = pct >= 95 && avg <= PACE ? ['🏆', `רמה של ${TARGET}+! מדויק ומהיר – מדהים!`]
        : pct >= 95 ? ['⚡', `דיוק של ${TARGET}+! עכשיו נעבוד על המהירות – כדקה לשאלה.`]
        : pct >= 85 ? ['🚀', `מצוין! עוד קצת דיוק ואת/ה ב-${TARGET}`]
        : pct >= 60 ? ['💪', 'כיוון טוב – חזרו על הטריקים ותרגלו שוב']
        : ['🌱', 'כל התחלה קשה. קראו שוב את ההסבר ונסו שוב – תראו שיפור!'];
      if (pct >= 95) confetti(200);
      addXP(pct === 100 ? 30 : 10);
      container.innerHTML = `<div class="card" style="text-align:center">
        <div class="big-emoji">${msg[0]}</div>
        <h2>${right} / ${qs.length} נכונות (${pct}%)</h2>
        <p style="font-size:18px">${msg[1]}</p>
        <p class="muted">⏱️ ממוצע ${avg} שניות לשאלה (יעד: עד ${PACE}) · ${slow} שאלות מעל הקצב</p>
        <div class="row" style="justify-content:center">
          <button class="btn" id="again">🔁 שוב</button>
          <a class="btn alt" href="#/practice">⚡ תרגול חכם</a>
          <a class="btn ghost" href="#/break">☕ הפסקה</a>
        </div></div>`;
      $('#again').onclick = () => { idx = 0; right = 0; totalSec = 0; slow = 0; qs = shuffle(qs); show(); };
      opts.onDone && opts.onDone(right, qs.length);
    };
    show();
  }

  function practice() {
    view.innerHTML = `<h1>⚡ תרגול חכם</h1>
      <p class="muted">המערכת בוחרת שאלות לפי הביצועים שלך: שאלות חדשות ושאלות שטעית בהן מקבלות עדיפות. לכל שאלה יש שעון קצב – במבחן האמיתי יש כדקה לשאלה (פרק של 20 דקות). ל-${TARGET}+ צריך גם דיוק וגם מהירות.</p>
      <div class="card row">
        <label>תחום <select id="pDom"><option value="all">הכול</option>${Object.entries(DOMAINS).map(([d, D]) => `<option value="${d}">${D.icon} ${D.title}</option>`).join('')}</select></label>
        <label>כמות <select id="pCnt"><option>5</option><option selected>10</option><option>15</option><option>20</option></select></label>
        <label>מצב <select id="pMode"><option value="smart">🧠 חכם (מותאם אישית)</option><option value="random">🎲 אקראי</option><option value="mistakes">🔁 רק טעויות</option></select></label>
        <label>רמה <select id="pLvl"><option value="all">הכול</option><option value="hard">🔥 רמת 780+ בלבד</option><option value="base">בסיס ובינוני</option></select></label>
        <span class="spacer"></span><button class="btn" id="pGo">התחל ←</button>
      </div>
      <div id="pBody" class="mt"></div>`;
    $('#pGo').onclick = () => {
      const d = $('#pDom').value, n = +$('#pCnt').value, mode = $('#pMode').value, lvl = $('#pLvl').value;
      let pool = QUESTIONS.filter(q => (d === 'all' || domainOf(q) === d) && q.t !== 'v-writing'
        && (lvl === 'all' || (lvl === 'hard') === (q.d === 3)));
      if (mode === 'mistakes') {
        pool = pool.filter(q => S.answers[q.id] && S.answers[q.id].last === false);
        if (!pool.length) return toast('אין טעויות פתוחות – כל הכבוד! 🎉', 'good');
      }
      let picked;
      if (mode === 'smart') {
        const w = pool.map(q => { const r = S.answers[q.id]; return r ? Math.max(0.3, 1 + 2 * r.w - 0.5 * r.c + (r.last === false ? 2 : 0)) : 2.5; });
        picked = [];
        const p = pool.slice(), ww = w.slice();
        while (picked.length < n && p.length) {
          let x = Math.random() * ww.reduce((a, b) => a + b, 0), i = 0;
          while ((x -= ww[i]) > 0) i++;
          i = Math.min(i, p.length - 1);
          picked.push(p.splice(i, 1)[0]); ww.splice(i, 1);
        }
      } else picked = shuffle(pool).slice(0, n);
      runQuiz($('#pBody'), picked);
    };
  }

  // ---------- Mock exams ----------
  function buildExam(id) {
    const pool = d => QUESTIONS.filter(q => domainOf(q) === d && q.t !== 'v-writing');
    const ch = (title, domain, qs, minutes) => ({ title, domain, qs, minutes });
    const ti = q => TOPICS.findIndex(t => t.id === q.t);
    // כמו במבחן: מקובץ לפי סוג שאלה, ובתוך כל סוג בסדר קושי עולה
    const order = qs => qs.sort((a, b) => ti(a) - ti(b) || (a.d || 1) - (b.d || 1) || QUESTIONS.indexOf(a) - QUESTIONS.indexOf(b));
    const draw = (d, n, rnd, hardShare, chapters = 1) => {
      const all = pool(d);
      const hard = shuffle(all.filter(q => q.d === 3), rnd), base = shuffle(all.filter(q => q.d !== 3), rnd);
      const nh = Math.round(n * hardShare), nb = n - nh;
      return Array.from({ length: chapters }, (_, c) => order([...hard.slice(c * nh, (c + 1) * nh), ...base.slice(c * nb, (c + 1) * nb)]));
    };
    if (id === 'F') {
      const rnd = mulberry32(41);
      const [v1, v2] = draw('verbal', 20, rnd, 0.5, 2), [q1, q2] = draw('quant', 20, rnd, 0.4, 2);
      return {
        id, title: 'סימולציה מלאה',
        chapters: [
          { title: 'פרק 1 – מטלת כתיבה', type: 'writing', domain: 'verbal', qs: [], minutes: 30, prompt: ESSAY_PROMPTS[Math.floor(rnd() * ESSAY_PROMPTS.length)] },
          ch('פרק 2 – חשיבה מילולית', 'verbal', v1, 20),
          ch('פרק 3 – חשיבה כמותית', 'quant', q1, 20),
          ch('פרק 4 – חשיבה מילולית', 'verbal', v2, 20),
          ch('פרק 5 – חשיבה כמותית', 'quant', q2, 20)
        ]
      };
    }
    if (id === 'A' || id === 'B') {
      const rnd = mulberry32(id === 'A' ? 11 : 29);
      return {
        id, title: `סימולציה ${id === 'A' ? 'א' : 'ב'}`,
        chapters: [
          ch('פרק 1 – חשיבה מילולית', 'verbal', draw('verbal', 20, rnd, 0.5)[0], 20),
          ch('פרק 2 – חשיבה כמותית', 'quant', draw('quant', 20, rnd, 0.4)[0], 20)
        ]
      };
    }
    if (id === 'H') {
      const rnd = mulberry32(780);
      const qs = [...draw('verbal', 10, rnd, 1)[0], ...draw('quant', 10, rnd, 1)[0]];
      return { id, title: `אתגר ${TARGET}+`, chapters: [ch(`אתגר ${TARGET}+ – שאלות קשות בלבד`, 'mixed', qs, 20)] };
    }
    const rq = shuffle(QUESTIONS.filter(q => q.t !== 'v-writing')).slice(0, 10);
    return { id: 'Q', title: 'מבחן בזק', chapters: [ch('מבחן בזק – מעורב', 'mixed', rq, 10)] };
  }

  const EXAM_LIST = [
    ['F', '🏁', 'סימולציה מלאה', 'כמו המבחן: מטלת כתיבה 30 דקות + 4 פרקים × 20 שאלות × 20 דקות'],
    ['A', '🅰️', 'סימולציה א', 'פרק מילולי + פרק כמותי · 20 שאלות ב-20 דקות כל פרק'],
    ['B', '🅱️', 'סימולציה ב', 'סט שאלות אחר · אותו מבנה ואותם זמנים'],
    ['H', '🔥', `אתגר ${TARGET}+`, '20 שאלות ברמה הקשה ביותר · 20 דקות'],
    ['Q', '⚡', 'מבחן בזק', '10 שאלות מעורבות · 10 דקות · משתנה בכל פעם']
  ];

  function exams() {
    view.innerHTML = `<h1>⏱️ מבחנים לדוגמה</h1>
      <div class="card">
        <h3 style="margin-top:0">📋 מבנה הבחינה האמיתית (החל מדצמבר 2026, לפי מאל"ו)</h3>
        <ul>
          <li>בגרסה המודפסת יש <b>6 פרקים</b>: פרק ראשון – <b>מטלת כתיבה</b> (30 דקות בעברית), ועוד <b>5 פרקי ברירה</b> של 20 דקות כל אחד.</li>
          <li>מתוך 5 פרקי הברירה – 2 פרקים בכל תחום קובעים את הציון; פרק נוסף אינו נספר, ואי אפשר לדעת איזה – אז מתייחסים לכולם ברצינות.</li>
          <li>השאלות בכל סוג מסודרות בסדר <b>קושי עולה</b> (חוץ מהבנת הנקרא) – אל "תיתקעו" על שאלה קשה בסוף, ואל תזלזלו בקלות שבהתחלה.</li>
          <li>ציון כל תחום: 50–150. הציון הכללי: 200–800, במשקל שווה למילולי ולכמותי. מטלת הכתיבה = 25% מהציון המילולי.</li>
          <li>אין ניקוד שלילי – כל תשובה נכונה = נקודה. <b>אף פעם לא משאירים שאלה ריקה!</b></li>
        </ul>
        <div class="example"><b>🎯 מה צריך ל-${TARGET}+?</b> כ-95% תשובות נכונות בפרקים – כלומר לכל היותר טעות אחת בפרק – בקצב של כדקה לשאלה, וחיבור ברמה גבוהה. הסימולציות כאן כוללות 40%-50% שאלות קשות 🔥, והשאלות מסודרות בכל סוג מהקל לקשה – כמו במבחן.</div>
      </div>
      <div class="grid g4 mt">${EXAM_LIST.map(([id, ic, t, d]) => `
        <div class="card topic-card" style="--accent:var(--violet)"><div class="t-ico">${ic}</div><h4>${t}</h4><p>${d}</p>
          <div class="row"><a class="btn small" href="#/exam/${id}">התחל ←</a>${id !== 'Q' ? `<a class="btn small ghost" href="#/print/${id}">🖨️</a>` : ''}</div></div>`).join('')}
      </div>
      <div class="card mt"><h3 style="margin-top:0">📈 היסטוריית מבחנים</h3>
        ${S.exams.length ? `<table class="data-table" style="width:100%"><tr><th>תאריך</th><th>מבחן</th><th>תוצאה</th><th>ציון משוער</th></tr>
          ${S.exams.slice().reverse().map(x => `<tr><td>${esc(x.date)}</td><td>${esc(x.title)}</td><td>${x.right}/${x.total}</td><td>${x.score ?? '—'}</td></tr>`).join('')}</table>`
        : '<p class="muted">עוד לא נעשו מבחנים. בהצלחה בראשון! 🍀</p>'}
      </div>`;
  }

  function exam(id) {
    if (!EXAM_LIST.some(e => e[0] === id)) return exams();
    const E = buildExam(id);
    const answers = E.chapters.map(c => Array(c.qs.length).fill(null));
    const flags = E.chapters.map(c => Array(c.qs.length).fill(false));
    let ci = 0, left = 0, timer = null, essay = '';
    const used = E.chapters.map(() => 0);
    const stop = () => { clearInterval(timer); timer = null; };
    onLeave(stop);

    const startTimer = () => {
      stop();
      timer = setInterval(() => {
        left--;
        const el = $('#tmr'); if (!el) return stop();
        el.textContent = fmtTime(Math.max(left, 0));
        el.classList.toggle('warn', left <= 60);
        if (left === 60) toast('⏰ נותרה דקה אחת!', 'bad', 4000);
        if (left <= 0) { toast('⌛ הזמן לפרק הסתיים', 'bad'); nextChapter(); }
      }, 1000);
    };

    const renderWriting = C => {
      view.innerHTML = `
        <div class="progress-top"><div class="row">
          <h2 style="margin:0">${E.title} · ${C.title}</h2><span class="spacer"></span>
          <div class="timer" id="tmr">${fmtTime(left)}</div></div></div>
        <div class="card"><div class="example">${esc(C.prompt)}</div>
          <p class="muted">לפחות 25 שורות, סגנון עיוני. מומלץ: 5 דק' תכנון · 21 דק' כתיבה · 4 דק' הגהה.</p>
          <textarea class="essay" id="exEssay" placeholder="כתבו כאן את החיבור..."></textarea>
          <div class="row mt"><span class="muted" id="exCount">0 מילים</span><span class="spacer"></span><button class="btn" id="endCh">סיימתי – לפרק הבא ←</button></div></div>`;
      const ta = $('#exEssay');
      ta.value = essay;
      ta.addEventListener('input', () => {
        essay = ta.value;
        const w = essay.trim() ? essay.trim().split(/\s+/).length : 0;
        $('#exCount').textContent = `${w} מילים · ≈ ${Math.round(w / 9)} שורות (יעד: 25+)`;
      });
      $('#endCh').onclick = () => nextChapter();
      startTimer();
    };

    const renderChapter = () => {
      const C = E.chapters[ci];
      left = C.minutes * 60;
      if (C.type === 'writing') return renderWriting(C);
      view.innerHTML = `
        <div class="progress-top"><div class="row">
          <h2 style="margin:0">${E.title} · ${C.title}</h2><span class="spacer"></span>
          <div class="timer" id="tmr">${fmtTime(left)}</div>
        </div><div class="q-nav mt" id="qnav"></div></div>
        <div id="qList">${C.qs.map((q, i) => `
          <div class="card q-card" id="eq${i}">
            <div class="q-meta"><span>שאלה ${i + 1}</span><button class="flag-btn" data-f="${i}">🚩 סמן לחזרה</button></div>
            <div class="q-text">${q.q}</div>
            <div class="opts" data-q="${i}">${optButtons(q)}</div>
          </div>`).join('')}</div>
        <div class="row"><button class="btn" id="endCh">${ci + 1 < E.chapters.length ? 'סיים פרק ועבור לבא ←' : 'הגש מבחן 🏁'}</button></div>`;
      const nav = () => {
        $('#qnav').innerHTML = C.qs.map((_, i) => `<button class="${answers[ci][i] != null ? 'done' : ''} ${flags[ci][i] ? 'flag' : ''}" data-go="${i}">${i + 1}</button>`).join('');
        $$('#qnav button').forEach(b => b.onclick = () => $(`#eq${b.dataset.go}`).scrollIntoView({ behavior: 'smooth', block: 'center' }));
      };
      nav();
      $$('.opts', view).forEach(box => {
        const qi = +box.dataset.q;
        $$('.opt', box).forEach(b => b.onclick = () => {
          $$('.opt', box).forEach(x => x.classList.remove('selected'));
          b.classList.add('selected');
          answers[ci][qi] = +b.dataset.i;
          nav();
        });
      });
      $$('.flag-btn', view).forEach(b => b.onclick = () => {
        const i = +b.dataset.f; flags[ci][i] = !flags[ci][i]; b.classList.toggle('on', flags[ci][i]); nav();
      });
      $('#endCh').onclick = () => {
        const empty = answers[ci].filter(a => a == null).length;
        if (empty && !confirm(`נשארו ${empty} שאלות ללא תשובה. אין ניקוד שלילי – כדאי לנחש! להגיש בכל זאת?`)) return;
        nextChapter();
      };
      startTimer();
    };

    const nextChapter = () => {
      stop();
      used[ci] = E.chapters[ci].minutes * 60 - Math.max(left, 0);
      if (++ci < E.chapters.length) {
        view.innerHTML = `<div class="card" style="text-align:center;max-width:620px;margin:40px auto"><div class="big-emoji">⏸️</div><h2>סוף ${E.chapters[ci - 1].title}</h2><p>נשמו עמוק – הפרק הבא מתחיל כשתלחצו.</p><button class="btn" id="goNext">התחל את ${E.chapters[ci].title}</button></div>`;
        $('#goNext').onclick = renderChapter;
        scrollTo({ top: 0 });
      } else results();
    };

    const results = () => {
      let right = 0, total = 0;
      const per = { verbal: [0, 0], quant: [0, 0] };
      E.chapters.forEach((C, c) => C.qs.forEach((q, i) => {
        const ok = answers[c][i] === q.a, d = domainOf(q);
        per[d][1]++; if (ok) { per[d][0]++; right++; }
        total++;
        record(q, ok);
      }));
      const V = per.verbal[1] ? domainScore(per.verbal[0] / per.verbal[1]) : null;
      const Q = per.quant[1] ? domainScore(per.quant[0] / per.quant[1]) : null;
      const G = V != null && Q != null ? generalScore(V, Q) : null;
      const pct = Math.round(right / total * 100);
      S.exams.push({ date: localDay(), id, title: E.title, right, total, score: G ?? (pct + '%') });
      addXP(right * 5);
      save();
      const top = G != null ? G >= TARGET : pct >= 95;
      const essayLines = Math.round((essay.trim() ? essay.trim().split(/\s+/).length : 0) / 9);
      const hasWriting = E.chapters.some(c => c.type === 'writing');
      if (top) { confetti(300); sound('level'); setTimeout(() => confetti(200), 600); }

      view.innerHTML = `
        <div class="hero" style="text-align:center">
          <div class="big-emoji">${top ? '🏆' : pct >= 70 ? '🚀' : '💪'}</div>
          <h1>${G != null ? `ציון משוער: <span class="grad-text">${G}</span>` : `<span class="grad-text">${pct}%</span> הצלחה`}</h1>
          <p style="margin:auto">${top ? `מעל ${TARGET}! זו רמה של האחוזון העליון – תמשיכו לשמור על הכושר!` : G != null ? `עוד ${TARGET - G} נקודות ליעד ${TARGET}. עברו על הטעויות, תרגלו ברמת 🔥 ונסו שוב.` : 'עבודה טובה! עברו על ההסברים למטה.'}</p>
          <p class="muted">⏱️ זמנים: ${E.chapters.map((C, c) => `${C.title.split(' – ')[0]}: ${fmtTime(used[c])} מתוך ${C.minutes}:00`).join(' · ')}</p>
          ${hasWriting ? `<p>✍️ מטלת כתיבה: ≈ ${essayLines} שורות ${essayLines >= 25 ? '✅' : '❌ (נדרשות 25+)'} – בדקו אותה לפי רשימת הבדיקה ב<a href="#/writing">סדנת הכתיבה</a>.</p>` : ''}
          <div class="grid g3 mt" style="max-width:700px;margin-inline:auto">
            ${Object.entries(per).filter(([, v]) => v[1]).map(([d, v]) => `<div class="card stat-card"><div class="num">${v[0]}/${v[1]}</div><div class="lbl">${DOMAINS[d].title}${d === 'verbal' && V ? ` · ≈${V}` : ''}${d === 'quant' && Q ? ` · ≈${Q}` : ''}</div></div>`).join('')}
          </div>
          <p class="muted" style="font-size:12px">הערכה בלבד לצורכי תרגול. הציון הרשמי מחושב ע"י מאל"ו בשיטת השוואה בין מועדים, וכולל גם את מטלת הכתיבה.</p>
          <div class="row" style="justify-content:center"><a class="btn" href="#/exams">למבחנים</a><a class="btn alt" href="#/practice">תרגול חכם</a><a class="btn ghost" href="#/break">☕ מגיעה לך הפסקה</a></div>
        </div>
        <h2 class="mt">🔍 סקירת תשובות</h2>
        ${E.chapters.filter(C => C.qs.length).map(C => `<h3>${C.title}</h3>` + C.qs.map((q, i) => {
          const a = answers[E.chapters.indexOf(C)][i], ok = a === q.a;
          return `<div class="card q-card"><div class="q-meta"><span>שאלה ${i + 1} · ${ok ? '✅ נכון' : a == null ? '⬜ לא נענתה' : '❌ שגוי'}</span><span>${topicById(q.t).title}</span></div>
            <div class="q-text">${q.q}</div>
            <div class="opts">${q.o.map((o, k) => `<div class="opt ${k === q.a ? 'correct' : k === a ? 'wrong' : ''}"><span class="k">${k + 1}</span><span>${o}</span></div>`).join('')}</div>
            <div class="explain ${ok ? '' : 'bad'}">${q.e}</div></div>`;
        }).join('')).join('')}`;
    };

    view.innerHTML = `<div class="card" style="text-align:center;max-width:620px;margin:40px auto">
      <div class="big-emoji">⏱️</div><h1>${E.title}</h1>
      <p>${E.chapters.map(c => c.type === 'writing' ? `${c.title}: ${c.minutes} דקות` : `${c.title}: ${c.qs.length} שאלות · ${c.minutes} דקות`).join('<br>')}</p>
      <p class="muted">קצב מבחן: כדקה לשאלה. עברו קודם על השאלות שאתם בטוחים בהן, סמנו 🚩 את הקשות וחזרו אליהן. אין ניקוד שלילי – תמיד לנחש!</p>
      <button class="btn" id="startExam">🚀 התחל מבחן</button></div>`;
    $('#startExam').onclick = renderChapter;
  }

  // ---------- Writing workshop ----------
  const CHECKLIST = [
    'הצגתי את הנושא ואת עמדתי בפסקת הפתיחה',
    'כל פסקה עוסקת ברעיון אחד עם משפט נושא',
    'הבאתי לפחות שני נימוקים מבוססים',
    'כל נימוק מלווה בדוגמה',
    'הצגתי טיעון נגד והפרכתי אותו',
    'השתמשתי במילות קישור (יתרה מזאת, לעומת זאת...)',
    'שמרתי על משלב אחיד וענייני, בלי סלנג',
    'כתבתי סיכום שחוזר על העמדה ומרחיב אותה'
  ];
  function writing() {
    let pi = 0, left = 30 * 60, timer = null;
    const stop = () => { clearInterval(timer); timer = null; };
    onLeave(stop);
    view.innerHTML = `<h1>✍️ סדנת כתיבה</h1>
      <p class="muted">תרגול מטלת הכתיבה בתנאי מבחן: 30 דקות, לפחות 25 שורות, סגנון עיוני. הטיוטות נשמרות אוטומטית בדפדפן.</p>
      <div class="grid g2">
        <div class="card">
          <div class="row"><select id="wPrompt" style="flex:1">${ESSAY_PROMPTS.map((p, i) => `<option value="${i}">נושא ${i + 1}</option>`).join('')}</select>
          <div class="timer" id="wTmr">30:00</div><button class="btn small" id="wStart">▶ התחל</button></div>
          <div class="example" id="wText"></div>
          <textarea class="essay" id="essay" placeholder="כתבו כאן את החיבור..."></textarea>
          <div class="row mt"><span id="wCount" class="muted"></span><span class="spacer"></span><button class="btn alt" id="wDone">סיימתי – בדיקה עצמית ✔</button></div>
          <div class="bar mt"><div id="wBar" style="width:0;background:var(--grad)"></div></div>
        </div>
        <div class="card">
          <h3 style="margin-top:0">✅ רשימת בדיקה (כמו המעריכים)</h3>
          ${CHECKLIST.map((c, i) => `<label class="check-item"><input type="checkbox" data-c="${i}"> ${c}</label>`).join('')}
          <h3>🧱 שלד מומלץ</h3>
          <ol><li>פתיחה – הצגת הנושא + עמדה</li><li>נימוק 1 + דוגמה</li><li>נימוק 2 + דוגמה</li><li>טיעון נגד + הפרכה</li><li>סיכום</li></ol>
          <a href="#/topic/v-writing/learn">לשיעור המלא על מטלת הכתיבה ←</a>
        </div>
      </div>`;
    const ta = $('#essay');
    const load = () => {
      $('#wText').textContent = ESSAY_PROMPTS[pi];
      ta.value = S.essays[pi] || '';
      count();
    };
    const count = () => {
      const words = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
      const lines = Math.round(words / 9);
      $('#wCount').textContent = `${words} מילים · ≈ ${lines} שורות בכתב יד (יעד: 25+)`;
      $('#wBar').style.width = `${Math.min(100, lines / 25 * 100)}%`;
      return lines;
    };
    ta.addEventListener('input', () => { S.essays[pi] = ta.value; save(); count(); });
    $('#wPrompt').onchange = e => { pi = +e.target.value; load(); };
    $('#wStart').onclick = () => {
      if (timer) { stop(); $('#wStart').textContent = '▶ המשך'; return; }
      $('#wStart').textContent = '⏸ עצור';
      timer = setInterval(() => {
        left--;
        const el = $('#wTmr'); if (!el) return stop();
        el.textContent = fmtTime(Math.max(left, 0));
        if (left === 25 * 60) toast('⏱️ 5 דקות עברו – אם סיימתם לתכנן, התחילו לכתוב!', '', 4000);
        if (left === 4 * 60) toast('⏱️ 4 דקות אחרונות – זמן להגהה!', 'bad', 4000);
        if (left <= 0) { stop(); toast('⌛ הזמן נגמר! בצעו בדיקה עצמית.', 'bad'); }
      }, 1000);
    };
    $('#wDone').onclick = () => {
      stop();
      const lines = count(), checks = $$('[data-c]:checked').length;
      const good = lines >= 25 && checks >= 6;
      if (good) { confetti(200); addXP(50); }
      openModal(`<div class="big-emoji">${good ? '🌟' : '📝'}</div>
        <h2 style="text-align:center">${good ? 'חיבור ברמה גבוהה!' : 'כמעט שם!'}</h2>
        <p>אורך: ≈ ${lines} שורות ${lines >= 25 ? '✅' : '❌ (נדרשות 25 לפחות)'}<br>רשימת בדיקה: ${checks}/${CHECKLIST.length} ${checks >= 6 ? '✅' : '❌'}</p>
        <p class="muted">${good ? '+50 XP! מומלץ לתת לחבר/ה לקרוא ולתת משוב על התוכן.' : 'השלימו את הסעיפים החסרים – כל סעיף הוא נקודות בציון.'}</p>`);
    };
    load();
  }

  // ---------- Flashcards (Leitner) ----------
  function cards() {
    const deck = 'he';
    const list = FLASHCARDS[deck];
    const key = i => `${deck}:${list[i][0]}`;
    const box = i => S.cards[key(i)] || 0;
    let cur = -1;
    const pick = () => {
      const minBox = Math.min(...list.map((_, i) => box(i)));
      const cands = list.map((_, i) => i).filter(i => box(i) <= minBox + 1 && i !== cur);
      cur = rand(cands.length ? cands : list.map((_, i) => i));
    };
    const mastered = () => list.filter((_, i) => box(i) >= 3).length;
    view.innerHTML = `<h1>🃏 כרטיסיות אוצר מילים</h1>
      <p class="muted">לחצו על הכרטיס כדי להפוך אותו. "ידעתי" מקדם את הכרטיס – "עוד לא" מחזיר אותו להתחלה (שיטת לייטנר).</p>
      <div class="card"><div class="row"><span>שליטה:</span><b id="mst"></b><span class="spacer"></span><span class="muted" id="boxInfo"></span></div>
      <div class="bar mt"><div id="mBar" style="background:var(--grad)"></div></div></div>
      <div class="flash" id="flash"><div class="flash-inner">
        <div class="flash-face flash-front" id="fFront"></div><div class="flash-face flash-back" id="fBack"></div></div></div>
      <div class="row" style="justify-content:center"><button class="btn ghost" id="noBtn">✗ עוד לא</button><button class="btn" id="yesBtn">✓ ידעתי</button></div>`;
    const show = () => {
      pick();
      const f = $('#flash'); f.classList.remove('flipped');
      $('#fFront').textContent = list[cur][0];
      setTimeout(() => { $('#fBack').textContent = list[cur][1]; }, 200);
      const m = mastered();
      $('#mst').textContent = `${m} / ${list.length}`;
      $('#mBar').style.width = `${m / list.length * 100}%`;
      $('#boxInfo').textContent = `קופסה ${box(cur) + 1} מתוך 5`;
    };
    $('#flash').onclick = () => $('#flash').classList.toggle('flipped');
    $('#yesBtn').onclick = () => {
      S.cards[key(cur)] = Math.min(4, box(cur) + 1); touchDay(); save();
      addXP(2); sound('good');
      if (box(cur) === 3) toast(`⭐ "${list[cur][0]}" נכנסה לאוצר המילים שלך!`, 'good');
      show();
    };
    $('#noBtn').onclick = () => { S.cards[key(cur)] = 0; save(); show(); };
    show();
  }

  // ---------- Printable ----------
  function printView(sel = 'F') {
    const options = [
      ['F', 'סימולציה מלאה (כתיבה + 4 פרקים)'], ['A', 'סימולציה א'], ['B', 'סימולציה ב'], ['H', `אתגר ${TARGET}+`],
      ...TOPICS.filter(t => t.id !== 'v-writing').map(t => [`t:${t.id}`, `דף עבודה: ${t.title}`]),
      ['essay', 'דף מטלת כתיבה']
    ];
    if (!options.some(o => o[0] === sel)) sel = 'F';
    let title, chapters;
    if (sel.startsWith('t:')) {
      const t = topicById(sel.slice(2));
      title = `דף עבודה – ${t.title}`;
      chapters = [{ title: t.title, minutes: Math.max(5, QUESTIONS.filter(q => q.t === t.id).length), qs: QUESTIONS.filter(q => q.t === t.id) }];
    } else if (sel !== 'essay') {
      const E = buildExam(sel); title = E.title; chapters = E.chapters;
    }
    let num = 0;
    const header = t => `<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #8b5cff;padding-bottom:10px;margin-bottom:16px">
      <div><h1 style="margin:0;font-size:26px">${t}</h1><div style="color:#666">PsychoBoost ${TARGET}+ · חומר תרגול להדפסה</div></div>
      <div style="text-align:left;font-size:14px">שם: ______________<br>תאריך: ____________<br>ציון: ______</div></div>`;
    let doc;
    if (sel === 'essay') {
      doc = header('מטלת כתיבה') + ESSAY_PROMPTS.map((p, i) => `<div class="${i ? 'page-break' : ''}"><h3>נושא ${i + 1} (30 דקות, לפחות 25 שורות)</h3><p>${esc(p)}</p>
        ${'<div style="border-bottom:1px solid #bbb;height:30px"></div>'.repeat(28)}</div>`).join('');
    } else {
      doc = header(title) + `<p><b>הוראות:</b> לכל שאלה ארבע תשובות; בחרו את הנכונה וסמנו בגיליון התשובות. הקפידו על הזמן המצוין לכל פרק (כדקה לשאלה) – שימו שעון על השולחן. אין ניקוד שלילי – ענו על כל השאלות.</p>` +
        chapters.map(C => C.type === 'writing'
          ? `<h2>${C.title} <small style="font-weight:400">(${C.minutes} דקות)</small></h2><p>${esc(C.prompt)}</p>${'<div style="border-bottom:1px solid #bbb;height:30px"></div>'.repeat(28)}<div class="page-break"></div>`
          : `<h2>${C.title}${C.minutes ? ` <small style="font-weight:400">(${C.minutes} דקות)</small>` : ''}</h2>` +
          C.qs.map(q => `<div class="p-q"><b>${++num}.</b> ${q.q}
            <div class="p-opts">${q.o.map((o, i) => `<div>(${i + 1}) ${o}</div>`).join('')}</div></div>`).join('')).join('') +
        `<div class="page-break"></div><h2>גיליון תשובות</h2><div class="bubbles">${Array.from({ length: num }, (_, i) => `<div><b>${i + 1}.</b> ${[1, 2, 3, 4].map(k => `<span>${k}</span>`).join('')}</div>`).join('')}</div>` +
        `<div class="page-break" id="keyPage"><h2>🔑 פתרונות והסברים</h2>${(() => { let n = 0; return chapters.map(C => C.qs.map(q => `<p><b>${++n}.</b> תשובה (${q.a + 1}) – ${q.e}</p>`).join('')).join(''); })()}</div>`;
    }
    view.innerHTML = `<div class="no-print"><h1>🖨️ חומר להדפסה</h1>
      <p class="muted">בחרו מבחן או דף עבודה, הדפיסו ופתרו עם עיפרון ושעון – כמו במבחן האמיתי. גיליון התשובות והפתרונות מודפסים בעמודים נפרדים.</p>
      <div class="card row"><select id="prSel" style="flex:1">${options.map(([v, l]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <label class="check-item"><input type="checkbox" id="prKey" checked> כולל פתרונות</label>
      <button class="btn" id="prGo">🖨️ הדפס</button></div></div>
      <div class="print-area mt">${doc}</div>`;
    $('#prSel').onchange = e => { location.hash = `#/print/${encodeURIComponent(e.target.value)}`; };
    const kp = $('#keyPage');
    $('#prKey').onchange = e => { if (kp) kp.style.display = e.target.checked ? '' : 'none'; };
    $('#prGo').onclick = () => window.print();
  }

  // ---------- Break corner ----------
  function breakView() {
    let hi = dayOfYear() % HALACHOT.length, fi = dayOfYear() % FUN.length;
    view.innerHTML = `<h1>☕ פינת ההפסקה</h1>
      <p class="muted">המוח לומד גם כשהוא נח. קחו 5-10 דקות: הלכה יומית, משחק לגו קצר, ספרינט חשבון או חידה – ובחזרה ללמידה רעננים!</p>
      <div class="grid g2">
        <div class="card halacha"><h3 id="hT"></h3><p id="hB"></p><div class="src" id="hS"></div>
          <div class="row mt"><button class="btn small ghost" id="hNext">הלכה נוספת ←</button></div>
          <p class="muted" style="font-size:12px">לשאלות הלכתיות למעשה – יש להתייעץ עם רב.</p></div>
        <div class="card"><h3 style="margin-top:0">🧩 חידה / בדיחה פסיכומטרית</h3><p id="fQ" style="font-size:18px"></p>
          <p id="fA" style="color:var(--green);font-weight:700;min-height:28px"></p>
          <div class="row"><button class="btn small" id="fShow">גלה תשובה</button><button class="btn small ghost" id="fNext">הבאה ←</button></div></div>
        <div class="card"><h3 style="margin-top:0">🧱 מגדל לגו</h3>
          <p class="muted" style="font-size:14px">לחצו (או מקש רווח) כדי להפיל את הלבנה. מה שבולט – נחתך! תזמון מושלם שומר על הרוחב. שיא: <b id="legoBest">${S.legoBest}</b></p>
          <canvas id="lego" width="360" height="480"></canvas></div>
        <div class="card"><h3 style="margin-top:0">⚡ ספרינט חשבון – 60 שניות</h3>
          <p class="muted" style="font-size:14px">כמה תרגילים תפתרו בדקה? מעולה לחימום לפרק הכמותי. שיא: <b id="spBest">${S.sprintBest}</b></p>
          <div id="sprint" style="text-align:center"><button class="btn" id="spStart">התחל ספרינט</button></div></div>
      </div>
      <div class="card mt row"><span style="font-size:34px">☕</span><div><b>הפסקת קפה מודרכת</b><div class="muted" style="font-size:14px">טיימר של 5 דקות – קומו, התמתחו, שתו מים.</div></div><span class="spacer"></span><button class="btn alt" id="brk5">התחל 5 דקות</button></div>`;
    const showH = () => { const h = HALACHOT[hi]; $('#hT').textContent = `📜 ${h.t}`; $('#hB').textContent = h.b; $('#hS').textContent = `מקור: ${h.s}`; };
    const showF = () => { $('#fQ').textContent = FUN[fi].q; $('#fA').textContent = ''; };
    $('#hNext').onclick = () => { hi = (hi + 1) % HALACHOT.length; showH(); };
    $('#fShow').onclick = () => { $('#fA').textContent = FUN[fi].a; };
    $('#fNext').onclick = () => { fi = (fi + 1) % FUN.length; showF(); };
    showH(); showF();
    onLeave(legoGame($('#lego')));
    onLeave(sprintGame($('#sprint')));
    $('#brk5').onclick = () => guidedBreak(5);
  }

  function guidedBreak(min) {
    let left = min * 60;
    openModal(`<div class="big-emoji">☕</div><h2 style="text-align:center">הפסקה!</h2>
      <div class="timer" id="brkT" style="text-align:center;font-size:48px;margin:10px auto;width:fit-content">${fmtTime(left)}</div>
      <p style="text-align:center" class="muted">${rand(COFFEE_MSGS)}</p>`);
    const t = setInterval(() => {
      left--;
      const el = $('#brkT');
      if (!el || modal.classList.contains('hidden')) return clearInterval(t);
      el.textContent = fmtTime(Math.max(left, 0));
      if (left <= 0) {
        clearInterval(t); sound('level');
        $('#modalBody').innerHTML = `<div class="big-emoji">🚀</div><h2 style="text-align:center">חזרנו! רעננים ומוכנים</h2><div class="row" style="justify-content:center"><a class="btn" href="#/practice" id="backBtn">בחזרה לתרגול</a></div>`;
        $('#backBtn').onclick = closeModal;
      }
    }, 1000);
    coffeeLeft = S.settings.coffee * 60;
  }

  function legoGame(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height, BH = 26, BASE = 40;
    const COLORS = ['#e3000b', '#ffd500', '#006cb7', '#00a650', '#ff7f00', '#a05ebd', '#f5f5f5'];
    let bricks, cur, speed, over, debris, msg, msgT, raf, score;
    const reset = () => {
      bricks = [{ x: (W - 200) / 2, w: 200, c: COLORS[0] }];
      speed = 2.4; over = false; debris = []; msg = 'לחצו להפלה!'; msgT = 90; score = 0;
      spawn();
    };
    const spawn = () => {
      const last = bricks[bricks.length - 1];
      cur = { x: 0, w: last.w, dir: 1, c: COLORS[bricks.length % COLORS.length] };
    };
    const yOf = i => H - BASE - (i + 1) * BH + Math.max(0, (bricks.length - 11) * BH);
    const drawBrick = (x, y, w, c) => {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, BH - 2, 4) : ctx.rect(x, y, w, BH - 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x, y + BH - 8, w, 6);
      ctx.fillStyle = c;
      for (let sx = x + 11; sx < x + w - 6; sx += 22) {
        ctx.beginPath(); ctx.ellipse(sx, y, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.stroke();
      }
    };
    const drop = () => {
      if (over) { reset(); return; }
      const last = bricks[bricks.length - 1];
      let L = Math.max(cur.x, last.x), R = Math.min(cur.x + cur.w, last.x + last.w);
      if (R - L <= 0) {
        over = true; sound('bad');
        if (score > S.legoBest) { S.legoBest = score; save(); const b = $('#legoBest'); if (b) b.textContent = score; toast(`🧱 שיא חדש במגדל הלגו: ${score}!`, 'gold'); }
        return;
      }
      if (Math.abs(cur.x - last.x) < 5) { L = last.x; R = last.x + last.w; msg = '✨ מושלם!'; msgT = 50; sound('good'); }
      else {
        const cutX = cur.x < last.x ? cur.x : R, cutW = cur.w - (R - L);
        debris.push({ x: cutX, y: yOf(bricks.length), w: cutW, c: cur.c, vy: 0 });
        sound('tick');
      }
      bricks.push({ x: L, w: R - L, c: cur.c });
      score++; speed = Math.min(7, speed + 0.18);
      if (score % 10 === 0) { msg = `🔥 ${score} קומות!`; msgT = 70; confetti(60); }
      spawn();
    };
    const loop = () => {
      if (!over) {
        cur.x += cur.dir * speed;
        if (cur.x <= 0) { cur.x = 0; cur.dir = 1; }
        if (cur.x + cur.w >= W) { cur.x = W - cur.w; cur.dir = -1; }
      }
      ctx.clearRect(0, 0, W, H);
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a2a6c'); g.addColorStop(1, '#3a1d7a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#2b2b5a'; ctx.fillRect(0, H - BASE + Math.max(0, (bricks.length - 11) * BH), W, BASE);
      bricks.forEach((b, i) => drawBrick(b.x, yOf(i), b.w, b.c));
      debris = debris.filter(d => d.y < H);
      debris.forEach(d => { d.vy += 0.5; d.y += d.vy; drawBrick(d.x, d.y, d.w, d.c); });
      if (!over) drawBrick(cur.x, yOf(bricks.length) - 0, cur.w, cur.c);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 22px Rubik, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`קומות: ${score}`, W / 2, 34);
      if (msgT > 0) { msgT--; ctx.font = 'bold 26px Rubik, sans-serif'; ctx.fillStyle = '#ffc94d'; ctx.fillText(msg, W / 2, 80); }
      if (over) {
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 30px Rubik, sans-serif'; ctx.fillText('המגדל קרס! 🧱', W / 2, H / 2 - 20);
        ctx.font = '18px Rubik, sans-serif'; ctx.fillText(`בניתם ${score} קומות · לחצו לשחק שוב`, W / 2, H / 2 + 20);
      }
      raf = requestAnimationFrame(loop);
    };
    const onKey = e => { if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) { e.preventDefault(); drop(); } };
    canvas.addEventListener('pointerdown', drop);
    addEventListener('keydown', onKey);
    reset(); loop();
    return () => { cancelAnimationFrame(raf); removeEventListener('keydown', onKey); };
  }

  function sprintGame(box) {
    let timer = null;
    const start = () => {
      let left = 60, score = 0, ans;
      box.innerHTML = `<div class="row" style="justify-content:center"><div class="timer" id="spT">60</div><div class="pill">✔ <b id="spS">0</b></div></div>
        <div class="sprint-q" id="spQ"></div><input class="sprint-input" id="spIn" inputmode="numeric" autocomplete="off" dir="ltr">`;
      const next = () => {
        const op = rand(['+', '−', '×']);
        let a, b;
        if (op === '×') { a = 2 + Math.floor(Math.random() * 11); b = 2 + Math.floor(Math.random() * 11); ans = a * b; }
        else if (op === '+') { a = 10 + Math.floor(Math.random() * 90); b = 10 + Math.floor(Math.random() * 90); ans = a + b; }
        else { a = 20 + Math.floor(Math.random() * 80); b = Math.floor(Math.random() * a); ans = a - b; }
        $('#spQ').textContent = `${a} ${op} ${b} = ?`;
        $('#spIn').value = '';
      };
      $('#spIn').addEventListener('input', e => {
        if (+e.target.value === ans && e.target.value !== '') { score++; $('#spS').textContent = score; sound('tick'); next(); }
      });
      next(); $('#spIn').focus();
      timer = setInterval(() => {
        left--; const t = $('#spT'); if (!t) return clearInterval(timer);
        t.textContent = left;
        if (left <= 0) {
          clearInterval(timer); timer = null;
          const best = score > S.sprintBest;
          if (best) { S.sprintBest = score; confetti(120); }
          addXP(score * 2); save();
          box.innerHTML = `<div class="big-emoji">${score >= 20 ? '🏆' : '⚡'}</div><h2>${score} תרגילים בדקה!</h2>
            <p>${best ? '🎉 שיא אישי חדש!' : `השיא שלך: ${S.sprintBest}`} · +${score * 2} XP</p><button class="btn" id="spStart">שוב</button>`;
          const b = $('#spBest'); if (b) b.textContent = S.sprintBest;
          $('#spStart').onclick = start;
        }
      }, 1000);
    };
    $('#spStart', box).onclick = start;
    return () => clearInterval(timer);
  }

  // ---------- Resources ----------
  function resources() {
    const official = [
      ['https://www.nite.org.il/', 'מאל"ו – המרכז הארצי לבחינות ולהערכה', 'האתר הרשמי: הרשמה, מועדים וציונים'],
      ['https://www.nite.org.il/two-domain-psychometric-entrance-test/format/', 'מבנה הבחינה הדו-תחומית', 'פרקי הבחינה, זמנים וסוגי שאלות (מדצמבר 2026)'],
      ['https://www.nite.org.il/two-domain-psychometric-entrance-test/format-2/', 'חשיבה מילולית – הסברים', 'מטלת הכתיבה, אנלוגיות ועוד'],
      ['https://www.nite.org.il/two-domain-psychometric-entrance-test/format-4/', 'חשיבה כמותית – הסברים', 'סוגי השאלות בתחום הכמותי'],
      ['https://www.nite.org.il/wp-content/uploads/2020/07/Verbal-Reasoning-HE_acc.pdf', 'חוברת דוגמאות – חשיבה מילולית (PDF)', 'דוגמאות והסברים רשמיים'],
      ['https://www.nite.org.il/two-domain-psychometric-entrance-test/scores/calculation/', 'איך מחושב הציון', 'שקלול התחומים וסולם 200–800']
    ];
    view.innerHTML = `<h1>🔗 מקורות, סרטונים וטיפים</h1>
      <div class="card"><h3 style="margin-top:0">🏛️ מקורות רשמיים (מומלץ מאוד!)</h3>
        <p class="muted">מאל"ו מפרסם באתרו בחינות קודמות ודוגמאות – זה חומר התרגול הכי אמין שיש. שאלות מבחינות קודמות עשויות אף לחזור.</p>
        <div class="grid g2">${official.map(([u, t, d]) => `<a class="card video-card" href="${u}" target="_blank" rel="noopener noreferrer"><div class="video-thumb" style="background:var(--grad2)">📄</div><div><b>${t}</b><div class="muted" style="font-size:13px">${d}</div></div></a>`).join('')}</div>
      </div>
      <div class="card mt"><h3 style="margin-top:0">🎬 סרטונים לפי נושא</h3>
        <div class="grid g3">${TOPICS.map(t => `<div><b>${t.icon} ${t.title}</b><ul style="margin:6px 0">${t.videos.map(v => `<li><a target="_blank" rel="noopener noreferrer" href="https://www.youtube.com/results?search_query=${encodeURIComponent(v.q)}">${v.t}</a></li>`).join('')}</ul></div>`).join('')}</div>
      </div>
      <div class="card mt"><h3 style="margin-top:0">🧭 אסטרטגיה ל-${TARGET}+</h3>
        <div class="trick"><div class="n">1</div><div><b>אבחון:</b> התחילו בסימולציה כדי לדעת איפה אתם עומדים.</div></div>
        <div class="trick"><div class="n">2</div><div><b>יסודות:</b> עברו על כל שיעור + טריקים. ${TARGET} דורש כ-95% דיוק – אפס טעויות בשאלות הקלות והבינוניות, ושליטה בשאלות 🔥 הקשות שבסוף כל סוג.</div></div>
        <div class="trick"><div class="n">3</div><div><b>תרגול חכם יומי:</b> 20-30 שאלות ביום במצב "חכם" – המערכת תתמקד בחולשות.</div></div>
        <div class="trick"><div class="n">4</div><div><b>ניהול זמן:</b> ~20 דקות לפרק. שאלה שלוקחת יותר מ-2 דקות – סמנו, דלגו וחזרו.</div></div>
        <div class="trick"><div class="n">5</div><div><b>חיבור:</b> לפחות חיבור אחד בשבוע בתנאי זמן אמיתיים – 25% מהציון המילולי!</div></div>
        <div class="trick"><div class="n">6</div><div><b>אוצר מילים:</b> 15 דקות כרטיסיות ביום – משתלם גם באנלוגיות וגם בהבנת הנקרא.</div></div>
        <div class="trick"><div class="n">7</div><div><b>שבועיים אחרונים:</b> סימולציה מלאה פעמיים בשבוע, בשעה של המבחן האמיתי.</div></div>
        <div class="trick"><div class="n">8</div><div><b>יום לפני:</b> לא לומדים חומר חדש. ישנים טוב (ראו קטע הקריאה על שינה וזיכרון 😉).</div></div>
      </div>
      <p class="muted" style="font-size:12px">כל השאלות באתר נכתבו במקור לצורכי תרגול, בהשראת סוגי השאלות המתוארים באתר מאל"ו. מידע על מבנה הבחינה נכון לפרסומי מאל"ו לבחינה הדו-תחומית (החל מדצמבר 2026) – יש להתעדכן באתר הרשמי.</p>`;
  }

  // ================= Settings =================
  function openSettings(first = false) {
    openModal(`<h2>${first ? '👋 ברוכים הבאים ל-<bdi>PsychoBoost</bdi>!' : '⚙️ הגדרות'}</h2>
      ${first ? `<p class="muted">כמה פרטים קטנים כדי שנתאים לך את הדרך ל-${TARGET}+</p>` : ''}
      <div class="grid" style="gap:14px">
        <label>איך לקרוא לך?<br><input id="sName" style="width:100%" maxlength="30"></label>
        <label>תאריך המבחן שלך<br><input id="sDate" type="date" style="width:100%"></label>
        <label>תזכורת להפסקת קפה כל<br><select id="sCoffee" style="width:100%">
          ${[[25, '25 דקות (פומודורו)'], [45, '45 דקות'], [60, 'שעה'], [90, 'שעה וחצי'], [0, 'כבוי']].map(([v, l]) => `<option value="${v}" ${S.settings.coffee === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>
        <label class="check-item"><input type="checkbox" id="sSound" ${S.settings.sound ? 'checked' : ''}> צלילי משוב</label>
        <div class="row"><button class="btn" id="sSave">שמור</button><span class="spacer"></span>${first ? '' : '<button class="btn ghost small" id="sReset">🗑️ איפוס התקדמות</button>'}</div>
      </div>`);
    $('#sName').value = S.name;
    $('#sDate').value = S.examDate;
    $('#sSave').onclick = () => {
      S.name = $('#sName').value.trim().slice(0, 30) || 'אריאל';
      S.examDate = $('#sDate').value;
      S.settings.coffee = +$('#sCoffee').value;
      S.settings.sound = $('#sSound').checked;
      coffeeLeft = S.settings.coffee * 60;
      save(); updateTopbar(); closeModal(); router();
      toast(first ? `יאללה ${S.name || ''}! מתחילים 🚀` : 'נשמר ✔', 'good');
    };
    const r = $('#sReset');
    if (r) r.onclick = () => {
      if (!confirm('למחוק את כל ההתקדמות, הנקודות וההיסטוריה? לא ניתן לבטל.')) return;
      S = defaults(); save(); updateTopbar(); closeModal(); router(); toast('ההתקדמות אופסה');
    };
  }
  $('#settingsBtn').addEventListener('click', () => openSettings());

  // ================= Coffee reminder =================
  let coffeeLeft = S.settings.coffee * 60;
  function showCoffee() {
    sound('level');
    openModal(`<div class="big-emoji">☕</div><h2 style="text-align:center">${esc(S.name)}, זמן להפסקת קפה!</h2>
      <p style="text-align:center;font-size:18px">${rand(COFFEE_MSGS)}</p>
      <div class="row" style="justify-content:center"><button class="btn" id="cGo">יוצא/ת להפסקה ☕</button><button class="btn ghost" id="cSnooze">עוד 10 דקות</button></div>`);
    $('#cGo').onclick = () => { closeModal(); location.hash = '#/break'; setTimeout(() => guidedBreak(5), 300); };
    $('#cSnooze').onclick = () => { coffeeLeft = 600; closeModal(); };
  }
  $('#coffeeWidget').addEventListener('click', showCoffee);
  setInterval(() => {
    const el = $('#coffeeTime');
    if (!S.settings.coffee) { el.textContent = 'כבוי'; return; }
    if (document.hidden) return;
    coffeeLeft--;
    el.textContent = fmtTime(Math.max(coffeeLeft, 0));
    if (coffeeLeft <= 0) { coffeeLeft = S.settings.coffee * 60; showCoffee(); }
  }, 1000);

  // ================= Animated background =================
  (function background() {
    const c = $('#bg'), ctx = c.getContext('2d');
    const SYM = ['π', '√', '∑', 'x²', 'Ψ', '%', '∞', 'א', 'ב', 'A', '?', '=', '÷', '△', '○', '780', '∫', 'θ'];
    let items = [];
    const resize = () => {
      c.width = innerWidth; c.height = innerHeight;
      items = Array.from({ length: Math.round(innerWidth / 40) }, () => ({
        x: Math.random() * c.width, y: Math.random() * c.height, s: 14 + Math.random() * 26,
        v: 0.15 + Math.random() * 0.4, t: rand(SYM), a: 0.15 + Math.random() * 0.35, r: Math.random() * 6.28, vr: (Math.random() - .5) * 0.004
      }));
    };
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      items.forEach(i => {
        if (!still) { i.y -= i.v; i.r += i.vr; if (i.y < -40) { i.y = c.height + 40; i.x = Math.random() * c.width; } }
        ctx.save(); ctx.translate(i.x, i.y); ctx.rotate(i.r);
        ctx.fillStyle = `rgba(160,170,255,${i.a})`; ctx.font = `700 ${i.s}px Rubik, sans-serif`;
        ctx.fillText(i.t, 0, 0); ctx.restore();
      });
      if (!still) requestAnimationFrame(draw);
    };
    addEventListener('resize', resize);
    resize(); draw();
  })();

  // ================= Boot =================
  updateTopbar();
  router();
  if (!localStorage.getItem(KEY + '_welcomed')) {
    localStorage.setItem(KEY + '_welcomed', '1');
    setTimeout(() => openSettings(true), 600);
  }
})();
