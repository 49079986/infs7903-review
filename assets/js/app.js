/* Shared behaviour: theme, quick/detail mode, sidebar, progress, quiz, wrong-question book, keyboard paging. */
(function () {
  'use strict';
  var KEY = 'infs7903-review-v1';
  // Chapter registry. file: null means the chapter is planned but not built yet.
  var CHAPTERS = [{"id": "bplus", "n": 1, "title": "索引与 B+ 树", "file": "chapters/bplus.html", "mins": 90}, {"id": "tx", "n": 2, "title": "事务与调度", "file": "chapters/tx.html", "mins": 60}, {"id": "cc", "n": 3, "title": "并发控制：2PL、TO、死锁", "file": "chapters/cc.html", "mins": 80}, {"id": "recovery", "n": 4, "title": "Recovery", "file": "chapters/recovery.html", "mins": 60}, {"id": "qep", "n": 5, "title": "查询处理与优化", "file": "chapters/qep.html", "mins": 70}, {"id": "ra", "n": 6, "title": "关系代数 RA", "file": "chapters/ra.html", "mins": 45}, {"id": "disk", "n": 7, "title": "磁盘与存储", "file": "chapters/disk.html", "mins": 35}, {"id": "views", "n": 8, "title": "Views", "file": "chapters/views.html", "mins": 20}, {"id": "constraints", "n": 9, "title": "Constraints 与 trigger", "file": "chapters/constraints.html", "mins": 20}];
  var root = document.documentElement, body = document.body;
  var base = body.getAttribute('data-base') || '';

  /* ---------- storage (localStorage can be unavailable or throw) ---------- */
  var mem = {};
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return mem; }
  }
  function save(s) { mem = s; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* keep in memory */ } }
  function state() { var s = load(); s.done = s.done || {}; s.wrong = s.wrong || {}; s.sections = s.sections || {}; return s; }
  window.Review = { state: state, save: save, chapters: CHAPTERS };

  /* ---------- theme + mode ---------- */
  var s0 = state();
  var THEMES = [['light', '浅色', '#fcfcfa', '#0f6f66'], ['paper', '暖纸', '#f6f1e6', '#9a4f1c'], ['ink', '墨青', '#1a2e38', '#e3a857'], ['dark', '深灰', '#14161a', '#58b8ad']];
  var DARK = { ink: 1, dark: 1 };
  var theme = s0.theme || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'ink' : 'light');
  if (!THEMES.some(function (t) { return t[0] === theme; })) theme = 'light';
  function applyTheme() { root.setAttribute('data-theme', theme); var mt = document.querySelector('meta[name="theme-color"]'); if (!mt) { mt = document.createElement('meta'); mt.name = 'theme-color'; document.head.appendChild(mt); } mt.content = (THEMES.filter(function (t) { return t[0] === theme; })[0] || THEMES[0])[2]; if (DARK[theme]) root.setAttribute('data-dark', ''); else root.removeAttribute('data-dark'); }
  var mode = s0.mode || 'quick';
  applyTheme(); root.setAttribute('data-mode', mode);
  function setTheme(t) { theme = t; applyTheme(); var s = state(); s.theme = t; save(s); syncTop(); }
  function setMode(m) {
    // keep the reader's place: remember the heading nearest the top, restore after the layout changes
    var anchor = currentHeading();
    var off = anchor ? anchor.getBoundingClientRect().top : 0;
    mode = m; root.setAttribute('data-mode', m); var s = state(); s.mode = m; save(s); syncTop();
    if (anchor) window.scrollBy(0, anchor.getBoundingClientRect().top - off);
  }
  function syncTop() {
    document.querySelectorAll('[data-mode-btn]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode-btn') === mode)); });
    var tb = document.querySelector('[data-theme-btn]'); if (tb) { tb.textContent = '配色'; tb.setAttribute('aria-haspopup', 'menu'); tb.setAttribute('aria-expanded', String(!!document.querySelector('.theme-menu'))); }
    document.querySelectorAll('.theme-menu button').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-theme-pick') === theme)); });
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-mode-btn]'); if (t) setMode(t.getAttribute('data-mode-btn'));
    var pick = e.target.closest('[data-theme-pick]'), tbtn = e.target.closest('[data-theme-btn]'), open = document.querySelector('.theme-menu');
    if (pick) setTheme(pick.getAttribute('data-theme-pick'));
    else if (tbtn && !open) {
      if (!tbtn.parentNode.classList.contains('theme-wrap')) { var w = document.createElement('span'); w.className = 'theme-wrap'; tbtn.parentNode.insertBefore(w, tbtn); w.appendChild(tbtn); }
      var m = document.createElement('div'); m.className = 'theme-menu'; m.setAttribute('role', 'menu'); m.setAttribute('aria-label', '配色主题');
      m.innerHTML = THEMES.map(function (t) { return '<button type="button" role="menuitemradio" data-theme-pick="' + t[0] + '"><span class="sw" style="background:' + t[2] + '"><i style="background:' + t[3] + '"></i></span>' + t[1] + '</button>'; }).join('');
      tbtn.parentNode.appendChild(m); syncTop();
    } else if (open && !e.target.closest('.theme-menu')) { open.remove(); syncTop(); }
    if (e.target.closest('.menu-btn')) body.classList.toggle('nav-open');
    else if (!e.target.closest('.side')) body.classList.remove('nav-open');
  });

  /* ---------- sidebar ---------- */
  var heads = Array.prototype.slice.call(document.querySelectorAll('main h2[id]'));
  var chapId = body.getAttribute('data-chapter');
  function buildSide() {
    var side = document.querySelector('.side'); if (!side) return;
    var st = state(), h = '<h4>章节</h4><a href="' + base + 'index.html"' + (chapId ? '' : ' class="cur"') + '>首页与进度</a>';
    CHAPTERS.forEach(function (c) {
      var done = chapterDone(c, st);
      h += '<a ' + (c.file ? 'href="' + base + c.file + '"' : 'class="off"') + (c.id === chapId ? ' class="cur"' : '') + '><span>' + c.n + '　' + c.title + '</span>' +
        (done ? '<span class="tick">已完成</span>' : '<span class="mins">' + (c.file ? c.mins + ' 分钟' : '待制作') + '</span>') + '</a>';
    });
    if (heads.length) {
      h += '<h4>本章目录</h4>';
      heads.forEach(function (x) { h += '<a href="#' + x.id + '" data-toc="' + x.id + '"><span>' + x.getAttribute('data-short') + '</span>' + (st.sections[chapId + '/' + x.id] ? '<span class="tick">✓</span>' : '') + '</a>'; });
    }
    side.innerHTML = h;
  }
  function chapterDone(c, st) { return !!st.done[c.id]; }
  function currentHeading() {
    var cur = null;
    for (var i = 0; i < heads.length; i++) { if (heads[i].getBoundingClientRect().top < 120) cur = heads[i]; }
    return cur || heads[0] || null;
  }
  function spy() {
    var cur = currentHeading(); if (!cur) return;
    document.querySelectorAll('.side [data-toc]').forEach(function (a) { a.classList.toggle('cur', a.getAttribute('data-toc') === cur.id); });
  }
  if (heads.length) window.addEventListener('scroll', spy, { passive: true });

  /* ---------- section "done" buttons + chapter completion ---------- */
  function setupSections() {
    if (!chapId) return;
    heads.forEach(function (h, i) {
      if (h.hasAttribute('data-nodone')) return;
      var next = heads[i + 1], row = document.createElement('div'); row.className = 'done-row col';
      var b = document.createElement('button'); b.className = 'done-btn'; b.type = 'button'; b.setAttribute('data-done', h.id);
      row.appendChild(b);
      if (next) next.parentNode.insertBefore(row, next); else { var pg = document.querySelector('.pager'); pg.parentNode.insertBefore(row, pg); }
    });
    paintDone();
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-done]'); if (!b) return;
      var st = state(), k = chapId + '/' + b.getAttribute('data-done'); st.sections[k] = !st.sections[k];
      var all = Array.prototype.every.call(document.querySelectorAll('[data-done]'), function (x) { return st.sections[chapId + '/' + x.getAttribute('data-done')]; });
      st.done[chapId] = all; save(st); paintDone(); buildSide(); spy(); topProgress();
    });
  }
  function paintDone() {
    var st = state();
    document.querySelectorAll('[data-done]').forEach(function (b) {
      var on = !!st.sections[chapId + '/' + b.getAttribute('data-done')];
      b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '✓ 这一节已学完' : '标记这一节已学完';
    });
  }
  function topProgress() {
    var el = document.querySelector('.top-progress'); if (!el) return;
    var st = state(), built = CHAPTERS.filter(function (c) { return c.file; });
    var d = built.filter(function (c) { return st.done[c.id]; }).length;
    el.textContent = '已完成 ' + d + ' / ' + CHAPTERS.length + ' 章';
  }

  /* ---------- quiz ---------- */
  function setupQuiz() {
    document.querySelectorAll('.quiz[data-quiz]').forEach(function (box) {
      var data = JSON.parse(document.getElementById(box.getAttribute('data-quiz')).textContent), answered = 0, right = 0;
      var score = document.createElement('p'); score.className = 'quiz-score';
      data.forEach(function (q, qi) {
        var el = document.createElement('div'); el.className = 'q';
        var h = '<p class="stem">' + (qi + 1) + '. ' + q.q + '</p><div class="opts">';
        q.options.forEach(function (o, oi) { h += '<button type="button" class="opt" data-i="' + oi + '">' + o + '</button>'; });
        el.innerHTML = h + '</div><div class="fb" hidden></div>';
        el.addEventListener('click', function (e) {
          var b = e.target.closest('.opt'); if (!b || el.getAttribute('data-locked')) return;
          el.setAttribute('data-locked', '1');
          var pick = +b.getAttribute('data-i'), ok = pick === q.answer, st = state(), id = chapId + '/' + q.id;
          el.querySelectorAll('.opt').forEach(function (x, xi) { x.disabled = true; if (xi === q.answer) x.classList.add('right'); else if (xi === pick) x.classList.add('wrong'); });
          var fb = el.querySelector('.fb'); fb.hidden = false;
          fb.innerHTML = '<b>' + (ok ? '答对了。' : '不对。') + '</b>' + q.why;
          if (ok) { delete st.wrong[id]; right++; }
          else st.wrong[id] = { chapter: chapId, title: document.title.split('·')[0].trim(), q: q.q, your: q.options[pick], correct: q.options[q.answer], why: q.why, at: Date.now() };
          save(st); answered++;
          score.textContent = '已答 ' + answered + ' / ' + data.length + '，答对 ' + right + ' 题。' + (answered === data.length ? '答错的题已经放进首页的错题本。' : '');
        });
        box.appendChild(el);
      });
      box.appendChild(score);
    });
  }

  /* ---------- keyboard: left/right arrows move between sections, then between chapters ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (t && t.closest && t.closest('.bp'))) return;
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    if (!heads.length) return;
    var cur = currentHeading(), i = heads.indexOf(cur), dir = e.key === 'ArrowRight' ? 1 : -1;
    if (dir === -1 && cur && cur.getBoundingClientRect().top < -40) { cur.scrollIntoView(); e.preventDefault(); return; }
    var target = heads[i + dir];
    if (target) { target.scrollIntoView(); e.preventDefault(); }
    else { var link = document.querySelector(dir === 1 ? '.pager [rel="next"]' : '.pager [rel="prev"]'); if (link) location.href = link.href; }
  });

  /* ---------- home page ---------- */
  function setupHome() {
    var tb = document.getElementById('chapter-rows'); if (!tb) return;
    var st = state(), clock = 9 * 60, h = '';
    function hhmm(m) { return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }
    var breaks = { 2: 15, 4: 60, 6: 15 };   // after chapter n: break minutes
    CHAPTERS.forEach(function (c) {
      var from = hhmm(clock); clock += c.mins;
      h += '<tr' + (st.done[c.id] ? ' class="done"' : '') + '><td>' + c.n + '</td><td>' + (c.file ? '<a href="' + c.file + '">' + c.title + '</a>' : '<span class="soon">' + c.title + '（待制作）</span>') +
        '</td><td class="mins">' + from + '–' + hhmm(clock) + '</td><td class="mins">' + c.mins + ' 分钟</td><td class="wt">' + (st.done[c.id] ? '已完成' : (c.file ? '未完成' : '—')) + '</td></tr>';
      if (breaks[c.n]) { h += '<tr class="brk"><td></td><td class="soon">' + (breaks[c.n] === 60 ? '午饭' : '休息') + '</td><td class="mins">' + hhmm(clock) + '–' + hhmm(clock + breaks[c.n]) + '</td><td class="mins">' + breaks[c.n] + ' 分钟</td><td></td></tr>'; clock += breaks[c.n]; }
    });
    tb.innerHTML = h;
    var d = CHAPTERS.filter(function (c) { return st.done[c.id]; }).length;
    var secDone = Object.keys(st.sections).filter(function (k) { return st.sections[k]; }).length;
    document.getElementById('home-progress').innerHTML = '<div class="bar"><i style="width:' + Math.round(100 * d / CHAPTERS.length) + '%"></i></div><p class="quiz-score">已完成 ' + d + ' / ' + CHAPTERS.length + ' 章，共标记学完 ' + secDone + ' 个小节。进度只保存在这个浏览器里。</p>';
    paintWrong();
  }
  function paintWrong() {
    var box = document.getElementById('wrong-book'); if (!box) return;
    var st = state(), ids = Object.keys(st.wrong).sort(function (a, b) { return st.wrong[b].at - st.wrong[a].at; });
    if (!ids.length) { box.innerHTML = '<p class="empty">还没有错题。每章末尾小测里答错的题会出现在这里。</p>'; return; }
    box.innerHTML = ids.map(function (id) {
      var w = st.wrong[id], c = CHAPTERS.filter(function (x) { return x.id === w.chapter; })[0];
      return '<div class="wrong-item"><div class="from">' + (c ? '第 ' + c.n + ' 章 · ' + c.title : '') + '</div><p><b>' + w.q + '</b></p><p>你选的：' + w.your + '<br>正确答案：' + w.correct + '</p><p>' + w.why + '</p>' +
        '<button type="button" class="done-btn" data-clear="' + id + '">已掌握，移出错题本</button></div>';
    }).join('');
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-clear]'); if (!b) return;
    var st = state(); delete st.wrong[b.getAttribute('data-clear')]; save(st); paintWrong();
  });

  syncTop(); buildSide(); setupSections(); setupQuiz(); setupHome(); topProgress(); spy();
  // KaTeX auto-render (loaded from CDN with defer); plain text stays readable if the CDN is unreachable
  window.addEventListener('load', function () {
    if (window.renderMathInElement) window.renderMathInElement(document.body, { delimiters: [{ left: '\\(', right: '\\)', display: false }, { left: '\\[', right: '\\]', display: true }], throwOnError: false });
  });
})();

/* ---------- lecture slide galleries: one bundle per lecture, loaded when a gallery comes near the viewport ---------- */
(function () {
  var gal = document.querySelectorAll('.slides'); if (!gal.length) return;
  var asked = {}, base = (document.querySelector('script[src*="assets/js/app.js"]').getAttribute('src') || '').replace('js/app.js', 'decks/');
  function fill(lec) {
    var d = (window.DECKS || {})[lec]; if (!d) return;
    document.querySelectorAll('.slides a[data-sl^="' + lec + '-"]').forEach(function (a) {
      var img = a.firstChild, p = a.getAttribute('data-sl').split('-')[1];
      if (d[p] && !a.getAttribute('data-ok')) { img.src = 'data:image/webp;base64,' + d[p]; a.setAttribute('data-ok', '1'); }
    });
  }
  window.onDeck = fill;
  function need(el) {
    el.querySelectorAll('a[data-sl]').forEach(function (a) {
      var lec = a.getAttribute('data-sl').split('-')[0]; if (asked[lec]) return; asked[lec] = 1;
      var s = document.createElement('script'); s.src = base + lec + '.js'; s.async = true; document.body.appendChild(s);
    });
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { need(e.target); io.unobserve(e.target); } }); }, { rootMargin: '900px 0px' });
    gal.forEach(function (g) { io.observe(g); });
  } else gal.forEach(need);
  var box = null;
  function close() { if (box) { box.remove(); box = null; } }
  document.addEventListener('click', function (e) {
    if (box) { close(); e.preventDefault(); return; }
    var a = e.target.closest ? e.target.closest('.slides a[data-sl]') : null; if (!a) return;
    e.preventDefault(); if (!a.getAttribute('data-ok')) return;
    box = document.createElement('div'); box.className = 'lightbox'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', '课件大图，点击或按 Esc 关闭');
    var im = document.createElement('img'); im.src = a.firstChild.src; im.alt = a.firstChild.alt; box.appendChild(im); document.body.appendChild(box);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
})();

/* ---------- phone: column count for tables, swipe right to open the contents drawer, swipe left to close ---------- */
(function () {
  document.querySelectorAll('.scroll > table').forEach(function (t) {
    var r = t.rows[0]; if (r) t.style.setProperty('--cols', r.cells.length);
  });
  var side = document.querySelector('.side'), body = document.body;
  if (!side) return;
  var sx = 0, sy = 0, ok = false, locked = false, base = 0, W = 0, cur = 0, lastX = 0, lastT = 0, vel = 0;
  function scrollsSideways(el) {
    for (; el && el !== body; el = el.parentElement) {
      if (el.classList && el.classList.contains('side')) return false;
      if (el.scrollWidth > el.clientWidth + 6) { var o = getComputedStyle(el).overflowX; if (o === 'auto' || o === 'scroll') return true; }
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    }
    return false;
  }
  function place(x) { cur = x; side.style.transform = 'translate3d(' + x + 'px,0,0)'; body.style.setProperty('--nav-p', String(1 + x / W)); }
  function settle(open) {
    body.classList.remove('nav-drag'); side.style.transform = ''; body.style.removeProperty('--nav-p');
    body.classList.toggle('nav-open', open);
  }
  document.addEventListener('touchstart', function (e) {
    ok = locked = false;
    if (e.touches.length !== 1 || window.innerWidth > 900 || document.querySelector('.lightbox')) return;
    var t = e.touches[0], open = body.classList.contains('nav-open'); sx = lastX = t.clientX; sy = t.clientY; lastT = e.timeStamp; vel = 0;
    ok = open ? true : (sx > 28 && !scrollsSideways(e.target));   // the screen edge stays with the browser's own "back" gesture
    W = side.offsetWidth || 300; base = open ? 0 : -W;
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (!ok) return;
    var t = e.touches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (!locked) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dy) > Math.abs(dx) * 0.8 || (base === 0 ? dx > 0 : dx < 0)) { ok = false; return; }   // vertical scroll, or wrong direction
      locked = true; body.classList.add('nav-drag'); sx = t.clientX; dx = 0;
    }
    if (e.cancelable) e.preventDefault();
    var dt = e.timeStamp - lastT; if (dt > 0) vel = 0.7 * ((t.clientX - lastX) / dt) + 0.3 * vel; lastX = t.clientX; lastT = e.timeStamp;
    place(Math.max(-W, Math.min(0, base + dx)));
  }, { passive: false });
  function end() {
    if (!ok || !locked) { ok = false; return; } ok = locked = false;
    var open = vel > 0.35 ? true : vel < -0.35 ? false : cur > -W / 2;
    // let the browser start the transition from where the finger left it
    requestAnimationFrame(function () { settle(open); });
  }
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', end, { passive: true });
})();
