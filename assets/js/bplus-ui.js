/* B+ tree drawing, step-through walkthroughs and the free-play simulator. Needs bplus-core.js. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg', KW = 30, PAD = 9, GAP = 14, LH = 62, NH = 30;
  function el(n, a) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); return e; }

  /* draw one snapshot {id, leaf, keys, children} into an <svg> */
  function draw(tree, frame, scale) {
    frame = frame || {}; var hl = frame.hl || [], pos = {}, x = 6, depth = 0, leaves = [];
    function w(n) { return Math.max(1, n.keys.length) * KW + PAD * 2; }
    (function lay(n, d) {
      depth = Math.max(depth, d);
      if (n.leaf) { pos[n.id] = { x: x + w(n) / 2, d: d }; x += w(n) + GAP; leaves.push(n); return; }
      n.children.forEach(function (c) { lay(c, d + 1); });
      var a = pos[n.children[0].id].x, b = pos[n.children[n.children.length - 1].id].x;
      pos[n.id] = { x: (a + b) / 2, d: d };
    })(tree, 0);
    // keep wide internal nodes inside the canvas
    var minX = Infinity, maxX = -Infinity;
    (function ext(n) { var p = pos[n.id]; minX = Math.min(minX, p.x - w(n) / 2); maxX = Math.max(maxX, p.x + w(n) / 2); n.children.forEach(ext); })(tree);
    var W = maxX - minX + 12, H = depth * LH + NH + 12, s = scale || 1;
    var svg = el('svg', { 'class': 'tree', viewBox: (minX - 6) + ' 0 ' + W + ' ' + H, width: W * s, height: H * s, role: 'img' });
    svg.setAttribute('aria-label', describe(tree));
    var gE = el('g', {}), gN = el('g', {}); svg.appendChild(gE); svg.appendChild(gN);
    (function put(n) {
      var p = pos[n.id], y = p.d * LH + 6, ww = w(n), on = hl.indexOf(n.id) >= 0;
      n.children.forEach(function (c) { var q = pos[c.id]; gE.appendChild(el('line', { 'class': 'edge', x1: p.x, y1: y + NH, x2: q.x, y2: q.d * LH + 6 })); put(c); });
      var cls = (n.leaf ? 'leaf' : 'int') + (on ? ' hl' : '') + (on && (frame.overflow || frame.underflow) ? ' bad' : '');
      gN.appendChild(el('rect', { 'class': cls, x: p.x - ww / 2, y: y, width: ww, height: NH, rx: 6 }));
      n.keys.forEach(function (k, i) {
        var t = el('text', { x: p.x - ww / 2 + PAD + KW * i + KW / 2, y: y + 20 });
        if (frame.newKey === k && n.leaf) t.setAttribute('class', 'new');
        if (n.leaf) t.setAttribute('data-key', k);
        t.textContent = k + (n.leaf ? '*' : ''); gN.appendChild(t);
      });
    })(tree);
    for (var i = 0; i < leaves.length - 1; i++) {
      var a = pos[leaves[i].id], b = pos[leaves[i + 1].id], y = a.d * LH + 6 + NH / 2;
      var x1 = a.x + w(leaves[i]) / 2, x2 = b.x - w(leaves[i + 1]) / 2;
      gE.appendChild(el('line', { 'class': 'chain', x1: x1, y1: y, x2: x2 - 4, y2: y }));
      gE.appendChild(el('path', { 'class': 'arrow', d: 'M' + (x2 - 5) + ',' + (y - 3) + ' L' + x2 + ',' + y + ' L' + (x2 - 5) + ',' + (y + 3) + ' z' }));
    }
    return svg;
  }
  function describe(n) {
    var levels = []; (function walk(x, d) { (levels[d] = levels[d] || []).push('[' + x.keys.join(', ') + ']'); x.children.forEach(function (c) { walk(c, d + 1); }); })(n, 0);
    return 'B+ tree. ' + levels.map(function (l, i) { return (i === levels.length - 1 ? 'Leaves: ' : 'Level ' + (i + 1) + ': ') + l.join(' '); }).join('. ');
  }
  function parseOps(s) { return (s || '').trim().split(/\s+/).filter(Boolean); }
  function opLabel(o) { return (o[0] === 'i' ? 'Insert ' : 'Delete ') + o.slice(1); }

  /* ---------- step player shared by walkthroughs and the simulator ---------- */
  function Player(box, opts) {
    this.box = box; this.frames = []; this.i = 0; this.detail = !!opts.detail; this.grid = false;
    box.classList.add('bp');
    var bar = document.createElement('div'); bar.className = 'bp-bar';
    bar.innerHTML = '<button type="button" class="btn" data-a="first" aria-label="回到开头">⏮</button>' +
      '<button type="button" class="btn" data-a="prev">◀ 上一步</button><button type="button" class="btn pri" data-a="next">下一步 ▶</button>' +
      '<span class="bp-step" aria-live="polite"></span><span class="sp"></span>' +
      '<label><input type="checkbox" data-a="detail"' + (this.detail ? ' checked' : '') + '> 显示分裂、借位的中间过程</label>' +
      (opts.gridToggle ? '<button type="button" class="btn" data-a="grid">全部摊开看</button>' : '');
    this.bar = bar; this.stage = document.createElement('div'); this.stage.className = 'bp-stage';
    this.msg = document.createElement('div'); this.msg.className = 'bp-msg'; this.msg.setAttribute('aria-live', 'polite');
    this.gridEl = document.createElement('div'); this.gridEl.className = 'bp-grid'; this.gridEl.hidden = true;
    if (opts.before) box.appendChild(opts.before);
    box.appendChild(bar); box.appendChild(this.stage); box.appendChild(this.msg); box.appendChild(this.gridEl);
    var self = this;
    bar.addEventListener('click', function (e) {
      var a = e.target.getAttribute('data-a');
      if (a === 'prev') self.go(self.i - 1); else if (a === 'next') self.go(self.i + 1); else if (a === 'first') self.go(0);
      else if (a === 'grid') { self.grid = !self.grid; e.target.textContent = self.grid ? '回到单步' : '全部摊开看'; self.render(); }
    });
    bar.addEventListener('change', function (e) { if (e.target.getAttribute('data-a') === 'detail') { var f = self.visible()[self.i]; self.detail = e.target.checked; self.seek(f); } });
    box.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' && e.target.type === 'number') return;
      if (e.key === 'ArrowRight') { self.go(self.i + 1); e.preventDefault(); } else if (e.key === 'ArrowLeft') { self.go(self.i - 1); e.preventDefault(); }
    });
    this.onchange = opts.onchange || function () {};
  }
  Player.prototype.visible = function () { var d = this.detail; return this.frames.filter(function (f) { return d || f.final; }); };
  Player.prototype.set = function (frames, toEnd) { this.frames = frames; var v = this.visible(); this.i = toEnd ? Math.max(0, v.length - 1) : 0; this.render(); };
  Player.prototype.seek = function (frame) {      // after toggling detail: stay on the same operation
    var v = this.visible(), i = v.indexOf(frame);
    if (i < 0 && frame) { for (var j = 0; j < v.length; j++) if (v[j].opIndex === frame.opIndex) i = j; }
    this.i = Math.max(0, i); this.render();
  };
  Player.prototype.go = function (i) { var v = this.visible(); this.i = Math.max(0, Math.min(v.length - 1, i)); this.render(); };
  Player.prototype.render = function () {
    var v = this.visible(), f = v[this.i];
    this.stage.hidden = this.msg.hidden = this.grid; this.gridEl.hidden = !this.grid;
    this.bar.querySelector('[data-a="prev"]').disabled = this.bar.querySelector('[data-a="first"]').disabled = this.grid || this.i <= 0;
    this.bar.querySelector('[data-a="next"]').disabled = this.grid || this.i >= v.length - 1;
    this.stage.textContent = ''; this.gridEl.textContent = '';
    if (!f) { this.stage.innerHTML = '<p class="bp-empty">树还是空的。先插入一个 key。</p>'; this.msg.textContent = ''; this.bar.querySelector('.bp-step').textContent = ''; this.onchange(null); return; }
    if (this.grid) {
      var g = this.gridEl;
      this.frames.filter(function (x) { return x.final; }).forEach(function (x, n) {
        var c = document.createElement('div'); c.className = 'bp-cell';
        c.innerHTML = '<div class="cap">' + (x.opIndex < 0 ? '初始' : (x.opIndex + 1) + ' · ' + x.op) + '</div>'; c.appendChild(draw(x.tree, x, 0.92)); g.appendChild(c);
      });
      this.bar.querySelector('.bp-step').textContent = ''; return;
    }
    this.stage.appendChild(draw(f.tree, f, 1.15));
    this.msg.innerHTML = '<span class="op">' + f.op + '</span>' + f.msg;
    this.bar.querySelector('.bp-step').textContent = '第 ' + (this.i + 1) + ' / ' + v.length + ' 步';
    this.onchange(f);
  };

  /* ---------- fixed walkthrough: <div class="bp-walk" data-p="3" data-ops="i25 i30 d25" [data-start='{"c":[[1],[2]]}']> ---------- */
  function walk(box) {
    var p = +box.getAttribute('data-p'), ops = parseOps(box.getAttribute('data-ops')), start = box.getAttribute('data-start');
    var t = BPTree.run(p, ops, start ? JSON.parse(start) : null);
    var pl = new Player(box, { gridToggle: true, detail: box.hasAttribute('data-detail') });
    pl.set(t.frames, false);
    if (box.hasAttribute('data-grid')) { pl.grid = true; pl.bar.querySelector('[data-a="grid"]').textContent = '回到单步'; pl.render(); }
  }

  /* ---------- free-play simulator ---------- */
  var PRESETS = [
    { name: '课件插入例题（23, 20, 6, 22, 18, 27, 24, 21, 25）', p: 3, ops: 'i23 i20 i6 i22 i18 i27 i24 i21 i25' },
    { name: '2023 Q10（11 步）', p: 3, ops: 'i25 i30 i20 i33 i29 d33 d25 i17 i32 i24 d17' },
    { name: 'Tutorial 6 Exercise 3', p: 3, ops: 'i20 i17 i3 i19 i15 i24 i21 i18' },
    { name: 'p = 4 的例子', p: 4, ops: 'i3 i29 i26 i7 i11 i45 i22 i33 i18 i37' },
    { name: 'p = 5 的例子', p: 5, ops: 'i2 i4 i6 i8 i10 i12 i14 i16 i20 i22 i24 i26 i30 i32 i34 i36 i40' }
  ];
  function sandbox(box) {
    var p = 3, ops = [];
    var head = document.createElement('div');
    head.innerHTML = '<div class="bp-bar"><label>阶 p <select data-s="p"><option>3</option><option>4</option><option>5</option><option>6</option></select></label>' +
      '<label>key <input type="number" data-s="key" min="0" max="999" inputmode="numeric" placeholder="如 25"></label>' +
      '<button type="button" class="btn pri" data-s="ins">插入</button><button type="button" class="btn" data-s="del">删除</button>' +
      '<span class="sp"></span><button type="button" class="btn" data-s="undo">撤销上一个操作</button><button type="button" class="btn" data-s="clear">清空</button></div>' +
      '<div class="bp-bar"><label>载入例子 <select data-s="preset"><option value="">选择一个序列…</option>' + PRESETS.map(function (x, i) { return '<option value="' + i + '">' + x.name + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="bp-hint" role="status" aria-live="polite">插入或删除前，先在 key 框里输入数字。要删除树里已有的 key，也可以直接点树上的那个数字。</div>' +
      '<div class="bp-ops" aria-label="已执行的操作"></div>';
    var chips = head.querySelector('.bp-ops'), keyIn = head.querySelector('[data-s="key"]'), pSel = head.querySelector('[data-s="p"]');
    var pl = new Player(box, { before: head, detail: true, onchange: function (f) {
      chips.querySelectorAll('.chip').forEach(function (c, i) { c.classList.toggle('cur', !!f && i === f.opIndex); c.classList.toggle('todo', !!f && i > f.opIndex); });
    } });
    function rebuild(toEnd) {
      var t = BPTree.run(p, ops, null);
      chips.innerHTML = ops.length ? ops.map(function (o, i) { return '<button type="button" class="chip" data-op="' + i + '">' + (i + 1) + ' · ' + opLabel(o) + '</button>'; }).join('') : '<span class="bp-empty">还没有操作。输入一个 key 再点“插入”，或者从上面载入一个例子。</span>';
      pl.set(t.frames, toEnd);
      if (toEnd) { // land on the first frame of the newest operation so the reader can step through it
        var v = pl.visible(), last = ops.length - 1; for (var i = 0; i < v.length; i++) if (v[i].opIndex === last) { pl.i = i; break; } pl.render();
      }
    }
    var hint = head.querySelector('.bp-hint'), HINT0 = hint.textContent;
    function say(msg, warn) { hint.textContent = msg; hint.classList.toggle('warn', !!warn); }
    function add(kind) {
      var k = parseInt(keyIn.value, 10);
      if (isNaN(k) || k < 0 || k > 999) { say('key 框是空的。先输入一个 0 到 999 的数字，再点“' + (kind === 'i' ? '插入' : '删除') + '”。' + (kind === 'd' ? '也可以直接点树上要删的那个数字。' : ''), true); keyIn.focus(); return; }
      ops.push(kind + k); keyIn.value = ''; say(HINT0); rebuild(true); keyIn.focus();
    }
    pl.stage.addEventListener('click', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-key'); if (k === null || k === undefined) return;
      keyIn.value = k; say('已把 ' + k + ' 填进 key 框。点“删除”就会删掉它。'); head.querySelector('[data-s="del"]').focus();
    });
    head.addEventListener('click', function (e) {
      var s = e.target.getAttribute('data-s'), c = e.target.closest('.chip');
      if (s === 'ins') add('i'); else if (s === 'del') add('d');
      else if (s === 'undo') { ops.pop(); rebuild(true); if (!ops.length) rebuild(false); }
      else if (s === 'clear') { ops = []; say(HINT0); rebuild(false); }
      else if (c) { var n = +c.getAttribute('data-op'), v = pl.visible(); for (var i = 0; i < v.length; i++) if (v[i].opIndex === n) { pl.go(i); break; } }
    });
    head.addEventListener('change', function (e) {
      var s = e.target.getAttribute('data-s');
      if (s === 'p') { p = +e.target.value; rebuild(false); }
      else if (s === 'preset' && e.target.value !== '') { var x = PRESETS[+e.target.value]; p = x.p; pSel.value = String(p); ops = parseOps(x.ops); rebuild(false); e.target.value = ''; }
    });
    keyIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') add('i'); });
    rebuild(false);
  }

  function init() {
    document.querySelectorAll('.bp-walk').forEach(walk);
    document.querySelectorAll('.bp-sandbox').forEach(sandbox);
    document.querySelectorAll('[data-bp-static]').forEach(function (e) {   // a single static tree picture
      var t = BPTree.fromStructure(+e.getAttribute('data-p') || 3, JSON.parse(e.getAttribute('data-bp-static')));
      e.appendChild(draw(t._snap(t.root), {}, 1.1));
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
