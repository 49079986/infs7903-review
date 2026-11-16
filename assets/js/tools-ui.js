/* Interactive widgets built on tools-core.js: schedules, timestamp ordering, recovery, disk, division, bitmap, QEP trees. */
(function () {
  'use strict';
  var T = window.Tools, NS = 'http://www.w3.org/2000/svg';
  function svg(n, a, txt) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); if (txt !== undefined) e.textContent = txt; return e; }
  function h(html) { var d = document.createElement('div'); d.innerHTML = html; return d; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function yes(b) { return b ? '<b class="ok">是</b>' : '<b class="no">不是</b>'; }
  function presets(str) { return (str || '').split(';;').filter(Boolean).map(function (x) { var p = x.split('|'); return { name: p[0].trim(), value: p.slice(1).join('|').trim() }; }); }

  /* ---------- precedence graph ---------- */
  function graphSvg(g) {
    var n = g.nodes.length, W = Math.max(260, n * 130), H = n > 2 ? 190 : 120, pos = {}, s = svg('svg', { 'class': 'graph', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img' });
    s.setAttribute('aria-label', 'Precedence graph: ' + (g.edges.map(function (e) { return 'T' + e.from + ' to T' + e.to; }).join(', ') || 'no edges'));
    var defs = svg('defs', {}), mk = svg('marker', { id: 'ah', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }); mk.appendChild(svg('path', { d: 'M0,0 L10,5 L0,10 z', 'class': 'ahead' })); defs.appendChild(mk); s.appendChild(defs);
    g.nodes.forEach(function (t, i) {
      if (n <= 2) pos[t] = { x: W / 2 + (i - (n - 1) / 2) * 150, y: H / 2 };
      else { var a = -Math.PI / 2 + i * 2 * Math.PI / n; pos[t] = { x: W / 2 + Math.cos(a) * (W / 2 - 60), y: H / 2 + Math.sin(a) * (H / 2 - 34) }; }
    });
    g.edges.forEach(function (e) {
      var a = pos[e.from], b = pos[e.to], dx = b.x - a.x, dy = b.y - a.y, L = Math.sqrt(dx * dx + dy * dy), ux = dx / L, uy = dy / L;
      var back = g.edges.some(function (x) { return x.from === e.to && x.to === e.from; }), bend = back ? 26 : 0;
      var sx = a.x + ux * 22, sy = a.y + uy * 22, ex = b.x - ux * 25, ey = b.y - uy * 25, mx = (sx + ex) / 2 - uy * bend, my = (sy + ey) / 2 + ux * bend;
      s.appendChild(svg('path', { 'class': 'gedge', d: 'M' + sx + ',' + sy + ' Q' + mx + ',' + my + ' ' + ex + ',' + ey, 'marker-end': 'url(#ah)' }));
      s.appendChild(svg('text', { 'class': 'glabel', x: mx - uy * 6, y: my + ux * 6 + (bend ? 12 : -7) }, e.items.join(', ')));
    });
    g.nodes.forEach(function (t) { s.appendChild(svg('circle', { 'class': 'gnode' + (g.cycleNodes.indexOf(t) >= 0 ? ' cyc' : ''), cx: pos[t].x, cy: pos[t].y, r: 20 })); s.appendChild(svg('text', { 'class': 'gtext', x: pos[t].x, y: pos[t].y + 5 }, 'T' + t)); });
    return s;
  }
  function schedReport(text, opts) {
    var ops = T.parseSchedule(text), box = document.createElement('div'); box.className = 'tool-out';
    if (ops.length < 2) { box.innerHTML = '<p class="bp-empty">写法示例：r1(X); w1(X); r2(X); c1; a2。r 是读，w 是写，c 是 commit，a 是 abort，数字是事务编号。</p>'; return box; }
    var g = T.precedence(ops), r = T.recoverability(ops);
    var fig = document.createElement('div'); fig.className = 'tool-fig'; fig.appendChild(graphSvg(g)); box.appendChild(fig);
    var html = '<p><b>Conflict serializable：</b>' + yes(g.serializable) + '。' + (g.serializable ? (g.edges.length ? '图里没有环，等价的串行顺序是 ' + g.order.map(function (x) { return 'T' + x; }).join(' → ') + '。' : '没有冲突操作。') : '图里有环（' + g.cycleNodes.map(function (x) { return 'T' + x; }).join('、') + '），找不到等价的串行顺序。') + '</p>';
    if (g.conflicts.length) html += '<details class="mini"><summary>所有冲突操作对（' + g.conflicts.length + ' 对）</summary><div class="scroll"><table><tr><th>先发生</th><th>后发生</th><th>数据项</th><th>得到的边</th></tr>' + g.conflicts.map(function (c) { return '<tr><td>' + c.a + '</td><td>' + c.b + '</td><td>' + c.item + '</td><td>T' + c.from + ' → T' + c.to + '</td></tr>'; }).join('') + '</table></div></details>';
    if (!opts || !opts.noRec) {
      var hasEnd = ops.some(function (o) { return o.op === 'c' || o.op === 'a'; });
      if (hasEnd) html += '<p><b>Recoverable：</b>' + yes(r.recoverable) + '。' + (r.reasons.rec[0] ? r.reasons.rec.join('；') + '。' : '') + '<br><b>Cascadeless：</b>' + yes(r.cascadeless) + '。' + (r.reasons.casc[0] ? r.reasons.casc.join('；') + '。' : '') + '<br><b>Strict：</b>' + yes(r.strict) + '。' + (r.reasons.strict[0] ? r.reasons.strict.join('；') + '。' : '') + '</p>';
      else html += '<p class="quiz-score">这个调度里没有写 commit 或 abort，所以不判断 recoverable、cascadeless、strict。</p>';
    }
    box.appendChild(h(html)); return box;
  }
  function schedTool(el) {
    var ps = presets(el.getAttribute('data-presets')), first = el.getAttribute('data-s') || (ps[0] && ps[0].value) || '';
    el.classList.add('bp');
    el.innerHTML = '<div class="bp-bar"><label style="flex:1">调度 <input type="text" class="txt" spellcheck="false" value="' + esc(first) + '" aria-label="调度"></label><button type="button" class="btn pri">分析</button></div>' +
      (ps.length ? '<div class="bp-bar"><label>载入例子 <select><option value="">选择一个调度…</option>' + ps.map(function (p, i) { return '<option value="' + i + '">' + esc(p.name) + '</option>'; }).join('') + '</select></label></div>' : '') + '<div class="tool-body"></div>';
    var inp = el.querySelector('input'), body = el.querySelector('.tool-body');
    function run() { body.textContent = ''; body.appendChild(schedReport(inp.value)); }
    el.querySelector('.btn').addEventListener('click', run); inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
    var sel = el.querySelector('select'); if (sel) sel.addEventListener('change', function () { if (sel.value !== '') { inp.value = ps[+sel.value].value; run(); sel.value = ''; } });
    run();
  }

  /* ---------- timestamp ordering ---------- */
  function parseRows(s) { return s.split(/;|\n/).map(function (x) { return x.trim(); }).filter(Boolean).map(function (x) { var p = x.split(/\s+/); return { t: p[0].toUpperCase(), op: p[1].toUpperCase(), item: p[2].toUpperCase(), calc: p[3] }; }); }
  function toTool(el) {
    var items = el.getAttribute('data-items').split(','), editable = el.hasAttribute('data-edit'), ps = presets(el.getAttribute('data-presets'));
    var text = el.getAttribute('data-rows') || (ps[0] && ps[0].value) || '', shown = el.hasAttribute('data-all') ? 999 : 0, res = [], txs = [];
    el.classList.add('bp');
    el.innerHTML = (editable ? '<div class="bp-bar"><label>载入例子 <select>' + ps.map(function (p, i) { return '<option value="' + i + '">' + esc(p.name) + '</option>'; }).join('') + '</select></label><span class="sp"></span><span class="bp-step">每行一步：事务 操作 数据项，例如 T76 R A；C 表示本地计算</span></div><div class="bp-bar"><textarea class="txt" rows="5" spellcheck="false" aria-label="调度，每行一步"></textarea><button type="button" class="btn" data-a="run">重新计算</button></div>' : '') +
      '<div class="bp-bar"><button type="button" class="btn" data-a="first">⏮</button><button type="button" class="btn" data-a="prev">◀ 上一步</button><button type="button" class="btn pri" data-a="next">下一步 ▶</button><button type="button" class="btn" data-a="all">全部显示</button><span class="bp-step"></span></div><div class="scroll tool-body"></div><div class="bp-msg" aria-live="polite"></div>';
    var body = el.querySelector('.tool-body'), msg = el.querySelector('.bp-msg'), ta = el.querySelector('textarea');
    function compute() {
      var rows; try { rows = parseRows(text); res = T.timestampOrdering(rows, items); } catch (e) { res = []; msg.textContent = '格式不对。每行写：事务 操作 数据项，例如 T76 W A。'; return; }
      txs = []; rows.forEach(function (r) { if (txs.indexOf(r.t) < 0) txs.push(r.t); }); txs.sort(function (a, b) { return parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10); });
      if (shown > res.length) shown = res.length; paint();
    }
    function paint() {
      var html = '<table class="to-table"><tr><th>Time</th>' + txs.map(function (t) { return '<th>' + t + '</th>'; }).join('') + items.map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr>' +
        '<tr><td>初始</td>' + txs.map(function () { return '<td></td>'; }).join('') + items.map(function (x) { return '<td>' + x.toLowerCase() + ', W0, R0</td>'; }).join('') + '</tr>';
      res.forEach(function (r, i) {
        var opText = r.op === 'C' ? r.item + ' := ' + (parseRows(text)[i].calc || 'f') + '(' + r.item + ')' : (r.op === 'R' ? 'Read(' : 'Write(') + r.item + ')';
        html += '<tr class="' + (i === shown - 1 ? 'cur' : '') + (r.rollback && i < shown ? ' rb' : '') + '"><td>t' + (i + 1) + '</td>' + txs.map(function (t) { return '<td>' + (t === r.t ? opText : '') + '</td>'; }).join('') +
          items.map(function (x) { return '<td>' + (i < shown && r.changed[x] ? r.changed[x] : (i < shown ? '' : '<span class="todo">?</span>')) + '</td>'; }).join('') + '</tr>';
      });
      body.innerHTML = html + '</table>';
      var cur = res[shown - 1];
      msg.innerHTML = cur ? '<span class="op">t' + shown + '</span>' + cur.msg : '点“下一步”，一行一行地填。先自己想这一行该填什么，再看结果。';
      el.querySelectorAll('.bp-step')[editable ? 1 : 0].textContent = '第 ' + shown + ' / ' + res.length + ' 步';
      el.querySelector('[data-a="prev"]').disabled = el.querySelector('[data-a="first"]').disabled = shown <= 0; el.querySelector('[data-a="next"]').disabled = shown >= res.length;
    }
    el.addEventListener('click', function (e) {
      var a = e.target.getAttribute('data-a'); if (!a) return;
      if (a === 'next') shown++; else if (a === 'prev') shown--; else if (a === 'first') shown = 0; else if (a === 'all') shown = res.length;
      else if (a === 'run') { text = ta.value; shown = 0; compute(); return; }
      paint();
    });
    if (editable) {
      ta.value = text.replace(/;\s*/g, '\n');
      el.querySelector('select').addEventListener('change', function (e) { text = ps[+e.target.value].value; ta.value = text.replace(/;\s*/g, '\n'); shown = 0; compute(); });
    }
    compute();
  }

  /* ---------- recovery ---------- */
  var POL = [['Deferred update（No-steal / No-force）', false, false], ['Immediate update（Steal / No-force）', true, false], ['Immediate update（Steal / Force）', true, true], ['No-steal / Force', false, true]];
  function recSvg(r) {
    var W = 640, rowH = 30, H = r.tx.length * rowH + 50, s = svg('svg', { 'class': 'timeline', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img' });
    function X(i) { return 70 + (i + 0.5) * (W - 110) / (r.n + 0.5); }
    s.setAttribute('aria-label', 'Transaction timeline');
    r.tx.forEach(function (t, k) {
      var y = 20 + k * rowH, x1 = X(t.start), x2 = X(t.commit === null ? r.crash : t.commit);
      s.appendChild(svg('text', { 'class': 'tname', x: 10, y: y + 4 }, t.name));
      s.appendChild(svg('line', { 'class': 'tline ' + t.action, x1: x1, y1: y, x2: x2, y2: y }));
      s.appendChild(svg('circle', { 'class': 'tdot ' + t.action, cx: x1, cy: y, r: 4 }));
      if (t.commit !== null) s.appendChild(svg('rect', { 'class': 'tdot ' + t.action, x: x2 - 3, y: y - 7, width: 5, height: 14 }));
    });
    var yb = r.tx.length * rowH + 12;
    [[r.checkpoint, 'checkpoint', 'ck'], [r.crash, 'crash', 'cr']].forEach(function (v) { if (v[0] < 0) return; s.appendChild(svg('line', { 'class': v[2], x1: X(v[0]), y1: 4, x2: X(v[0]), y2: yb })); s.appendChild(svg('text', { 'class': 'tax', x: X(v[0]), y: yb + 16 }, v[1])); });
    return s;
  }
  var ACT = { none: '不用处理', redo: 'Redo', undo: 'Undo，然后重启', ignore: '忽略，然后重启' };
  function recTool(el) {
    var ps = presets(el.getAttribute('data-presets')), log = (el.getAttribute('data-log') || (ps[0] && ps[0].value) || '').replace(/\\n/g, '\n'), fixed = el.getAttribute('data-policy');
    el.classList.add('bp');
    el.innerHTML = '<div class="bp-bar"><label>策略 <select data-a="pol">' + POL.map(function (p, i) { return '<option value="' + i + '">' + p[0] + '</option>'; }).join('') + '</select></label>' +
      (ps.length > 1 ? '<label>日志 <select data-a="pre">' + ps.map(function (p, i) { return '<option value="' + i + '">' + esc(p.name) + '</option>'; }).join('') + '</select></label>' : '') + '</div>' +
      (el.hasAttribute('data-edit') ? '<div class="bp-bar"><textarea class="txt" rows="6" spellcheck="false" aria-label="日志"></textarea><button type="button" class="btn" data-a="run">重新分析</button></div>' : '') + '<div class="tool-body"></div>';
    var body = el.querySelector('.tool-body'), pol = el.querySelector('[data-a="pol"]'), ta = el.querySelector('textarea');
    if (fixed) pol.value = fixed; if (ta) ta.value = log;
    function run() {
      var p = POL[+pol.value], r = T.recover(T.parseLog(log), { steal: p[1], force: p[2] }); body.textContent = '';
      if (!r.tx.length) { body.innerHTML = '<p class="bp-empty" style="padding:14px">没有读到事务。每行写一条日志，例如 [start_transaction, T1]、[write_item, T1, D, 10, 20]、[commit, T1]、[checkpoint]、system crash。</p>'; return; }
      var fig = document.createElement('div'); fig.className = 'tool-fig'; fig.appendChild(recSvg(r)); body.appendChild(fig);
      body.appendChild(h('<div class="tool-out"><div class="scroll"><table><tr><th>事务</th><th>位置</th><th>处理</th><th>理由</th></tr>' + r.tx.map(function (t) {
        return '<tr><td>' + t.name + '</td><td>' + (t.cls === 'before' ? 'checkpoint 前已 commit' : t.cls === 'after' ? 'checkpoint 后 commit' : 'crash 时未 commit') + '</td><td><b>' + ACT[t.action] + '</b></td><td>' + t.why + '</td></tr>'; }).join('') + '</table></div>' +
        '<p><b>Redo 顺序（从前往后）：</b>' + (r.redo.join('，') || '无') + '。<b>Undo 顺序（从后往前）：</b>' + (r.undo.join('，') || '无') + '。</p></div>'));
    }
    el.addEventListener('change', function (e) { var a = e.target.getAttribute('data-a'); if (a === 'pre') { log = ps[+e.target.value].value.replace(/\\n/g, '\n'); if (ta) ta.value = log; } if (a) run(); });
    el.addEventListener('click', function (e) { if (e.target.getAttribute('data-a') === 'run') { log = ta.value; run(); } });
    run();
  }

  /* ---------- disk calculator ---------- */
  function fmt(x) { return (Math.round(x * 1000) / 1000).toLocaleString('en-US'); }
  function diskTool(el) {
    var F = [['B', 'Block size B（bytes）', 512], ['blocksPerTrack', '每条 track 的 block 数', 20], ['tracksPerSurface', '每个盘面的 track 数', 400], ['platters', '盘片数', 15], ['rpm', '转速（rpm）', 3000], ['seek', 'Average seek time（msec）', 30], ['n', '要读的 block 数 n', 20]];
    el.classList.add('bp');
    el.innerHTML = '<div class="bp-bar form">' + F.map(function (f) { return '<label>' + f[1] + ' <input type="number" min="1" data-k="' + f[0] + '" value="' + f[2] + '"></label>'; }).join('') + '<label><input type="checkbox" data-k="doubleSided" checked> 双面（double-sided）</label></div><div class="tool-out"></div>';
    var out = el.querySelector('.tool-out');
    function run() {
      var d = {}; el.querySelectorAll('[data-k]').forEach(function (i) { d[i.getAttribute('data-k')] = i.type === 'checkbox' ? i.checked : parseFloat(i.value); });
      for (var k in d) if (typeof d[k] === 'number' && !(d[k] > 0)) { out.innerHTML = '<p class="bp-empty">每一项都要填大于 0 的数。</p>'; return; }
      var r = T.disk(d), L = [
        ['Track capacity', d.blocksPerTrack + ' × ' + d.B, fmt(r.track) + ' bytes'], ['Number of cylinders', '= tracks per surface', fmt(r.cylinders)],
        ['Cylinder capacity', d.platters + (d.doubleSided ? ' × 2' : '') + ' × ' + fmt(r.track), fmt(r.cylinder) + ' bytes'], ['Disk capacity', fmt(r.cylinders) + ' × ' + fmt(r.cylinder), fmt(r.disk) + ' bytes'],
        ['转一圈的时间', '60,000 ÷ ' + d.rpm, fmt(r.rev) + ' msec'], ['Transfer rate tr', fmt(r.track) + ' ÷ ' + fmt(r.rev), fmt(r.tr) + ' bytes/msec'], ['Block transfer time btt', d.B + ' ÷ ' + fmt(r.tr), fmt(r.btt) + ' msec'],
        ['Average rotational delay rd', fmt(r.rev) + ' ÷ 2', fmt(r.rd) + ' msec'], ['读 1 个 block', d.seek + ' + ' + fmt(r.rd) + ' + ' + fmt(r.btt), fmt(r.one) + ' msec'],
        ['读 ' + d.n + ' 个随机 block', d.n + ' × ' + fmt(r.one), fmt(r.random) + ' msec'], ['读 ' + d.n + ' 个连续 block', d.seek + ' + ' + fmt(r.rd) + ' + ' + d.n + ' × ' + fmt(r.btt), fmt(r.consecutive) + ' msec']];
      out.innerHTML = '<div class="scroll"><table><tr><th>要算什么</th><th>算式</th><th>结果</th></tr>' + L.map(function (x) { return '<tr><td>' + x[0] + '</td><td class="seq">' + x[1] + '</td><td><b>' + x[2] + '</b></td></tr>'; }).join('') + '</table></div>';
    }
    el.addEventListener('input', run); run();
  }

  /* ---------- division ---------- */
  function divTool(el) {
    var r1 = JSON.parse(el.getAttribute('data-r1')), cols = el.getAttribute('data-cols').split(','), vals = [], init = (el.getAttribute('data-r2') || '').split(',');
    r1.forEach(function (r) { var v = r[r.length - 1]; if (vals.indexOf(v) < 0) vals.push(v); });
    el.classList.add('bp');
    el.innerHTML = '<div class="bp-bar"><span>R2（' + cols[cols.length - 1] + '）里放哪些值：</span>' + vals.map(function (v) { return '<label><input type="checkbox" value="' + v + '"' + (init.indexOf(v) >= 0 ? ' checked' : '') + '> ' + v + '</label>'; }).join('') + '</div><div class="tool-out"></div>';
    var out = el.querySelector('.tool-out');
    function run() {
      var r2 = []; el.querySelectorAll('input:checked').forEach(function (i) { r2.push(i.value); });
      var res = T.divide(r1, r2);
      out.innerHTML = '<div class="div-grid"><div><p class="cap">R1</p><table><tr>' + cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr>' + r1.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (i === r.length - 1 && r2.indexOf(c) >= 0 ? ' class="hit"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</table></div>' +
        '<div><p class="cap">逐组检查</p><table><tr><th>' + cols.slice(0, -1).join(', ') + '</th><th>R2 里的值都有吗</th></tr>' + res.map(function (g) { return '<tr><td>' + g.key.join(', ') + '</td><td>' + (r2.length === 0 ? '—' : g.ok ? '<b class="ok">都有，留下</b>' : '缺 ' + g.missing.join('、') + '，去掉') + '</td></tr>'; }).join('') + '</table>' +
        '<p><b>R1 ÷ R2 = </b>' + (r2.length ? '{' + res.filter(function (g) { return g.ok; }).map(function (g) { return '(' + g.key.join(', ') + ')'; }).join(', ') + '}' : '先在上面勾选 R2 的值') + '</p></div></div>';
    }
    el.addEventListener('change', run); run();
  }

  /* ---------- bitmap ---------- */
  function bitmapTool(el) {
    var cols = el.getAttribute('data-cols').split(','), rows = JSON.parse(el.getAttribute('data-rows')), idx = JSON.parse(el.getAttribute('data-index')), opts = [];
    idx.forEach(function (c) { var b = T.bitmaps(rows, c); b.values.forEach(function (v) { opts.push({ label: cols[c] + ' = ' + v, bits: b.bits[v] }); }); });
    function sel(def) { return '<select>' + opts.map(function (o, i) { return '<option value="' + i + '"' + (o.label === def ? ' selected' : '') + '>' + o.label + '</option>'; }).join('') + '</select>'; }
    function op(def) { return '<select class="opsel"><option' + (def === 'AND' ? ' selected' : '') + '>AND</option><option' + (def === 'OR' ? ' selected' : '') + '>OR</option></select>'; }
    var d = (el.getAttribute('data-default') || '').split('|');
    el.classList.add('bp');
    el.innerHTML = '<div class="bp-bar">' + sel(d[0]) + op(d[1]) + '<span>(</span>' + sel(d[2]) + op(d[3]) + sel(d[4]) + '<span>)</span></div><div class="tool-out"></div>';
    var out = el.querySelector('.tool-out');
    function run() {
      var s = el.querySelectorAll('select'), A = opts[+s[0].value], o1 = s[1].value, B = opts[+s[2].value], o2 = s[3].value, C = opts[+s[4].value];
      var inner = o2 === 'AND' ? T.bitAnd(B.bits, C.bits) : T.bitOr(B.bits, C.bits), fin = o1 === 'AND' ? T.bitAnd(A.bits, inner) : T.bitOr(A.bits, inner);
      function line(l, b, strong) { return '<tr><td>' + l + '</td><td class="seq">' + (strong ? '<b>' : '') + b.join(' ') + (strong ? '</b>' : '') + '</td></tr>'; }
      var hit = rows.filter(function (r, i) { return fin[i]; });
      out.innerHTML = '<div class="scroll"><table>' + line(B.label, B.bits) + line(o2 + ' ' + C.label, C.bits) + line('= 括号里的结果', inner, true) + line(o1 + ' ' + A.label, A.bits) + line('= 最终结果', fin, true) + '</table></div>' +
        '<p>第 i 位是 1 表示第 i 行满足条件。命中 ' + hit.length + ' 行' + (hit.length ? '：' + hit.map(function (r) { return '(' + r.join(', ') + ')'; }).join('；') : '') + '。</p>';
    }
    el.addEventListener('change', run); run();
  }

  /* ---------- query trees ---------- */
  function treeSvg(t) {
    var pos = [], x = 0, depth = 0, GAP = 26, LH = 46;
    function w(n) { return Math.max(56, n.label.length * 8 + 16); }
    function sw(n) { if (n._sw) return n._sw; var k = 0; n.kids.forEach(function (c) { k += sw(c); }); k += GAP * Math.max(0, n.kids.length - 1); return (n._sw = Math.max(w(n), k)); }
    (function lay(n, d, left) { depth = Math.max(depth, d); n._d = d; n._x = left + sw(n) / 2; var k = -GAP; n.kids.forEach(function (c) { k += sw(c) + GAP; }); var cx = left + (sw(n) - Math.max(0, k)) / 2; n.kids.forEach(function (c) { lay(c, d + 1, cx); cx += sw(c) + GAP; }); pos.push(n); })(t, 0, 0);
    var minX = Infinity, maxX = -Infinity; pos.forEach(function (n) { minX = Math.min(minX, n._x - w(n) / 2); maxX = Math.max(maxX, n._x + w(n) / 2); });
    var W = maxX - minX + 12, H = depth * LH + 34, s = svg('svg', { 'class': 'qtree', viewBox: (minX - 6) + ' 0 ' + W + ' ' + H, width: W, height: H, role: 'img' });
    s.setAttribute('aria-label', 'Query tree: ' + T.exprOf(t));
    pos.forEach(function (n) { n.kids.forEach(function (k) { s.appendChild(svg('line', { 'class': 'edge', x1: n._x, y1: n._d * LH + 26, x2: k._x, y2: k._d * LH + 8 })); }); });
    pos.forEach(function (n) { s.appendChild(svg('text', { 'class': n.kids.length ? 'qop' : 'qtab', x: n._x, y: n._d * LH + 22 }, n.label)); });
    return s;
  }
  function qepWalk(el) {
    var q = T.qep(JSON.parse(el.getAttribute('data-cfg'))), i = 0; el.classList.add('bp');
    el.innerHTML = '<div class="bp-bar"><button type="button" class="btn" data-a="prev">◀ 上一步</button><button type="button" class="btn pri" data-a="next">下一步 ▶</button><span class="bp-step"></span><span class="sp"></span><button type="button" class="btn" data-a="grid">全部摊开看</button></div><div class="bp-stage"></div><div class="bp-msg" aria-live="polite"></div><div class="bp-grid" hidden></div>';
    var stage = el.querySelector('.bp-stage'), msg = el.querySelector('.bp-msg'), grid = el.querySelector('.bp-grid'), all = el.hasAttribute('data-grid');
    function paint() {
      stage.hidden = msg.hidden = all; grid.hidden = !all; el.querySelector('[data-a="grid"]').textContent = all ? '回到单步' : '全部摊开看';
      el.querySelector('[data-a="prev"]').disabled = all || i <= 0; el.querySelector('[data-a="next"]').disabled = all || i >= q.steps.length - 1;
      if (all) { grid.textContent = ''; q.steps.forEach(function (s) { var c = document.createElement('div'); c.className = 'bp-cell'; c.innerHTML = '<div class="cap">' + s.title + '</div>'; c.appendChild(treeSvg(s.tree)); c.appendChild(h('<p class="cellwhy">' + s.why + '</p>')); grid.appendChild(c); }); el.querySelector('.bp-step').textContent = ''; return; }
      stage.textContent = ''; stage.appendChild(treeSvg(q.steps[i].tree)); msg.innerHTML = '<span class="op">' + q.steps[i].title + '</span>' + q.steps[i].why + (i === q.steps.length - 1 ? '<br><span class="seq">' + esc(q.expr) + '</span>' : '');
      el.querySelector('.bp-step').textContent = '第 ' + (i + 1) + ' / ' + q.steps.length + ' 步';
    }
    el.addEventListener('click', function (e) { var a = e.target.getAttribute('data-a'); if (a === 'next') i++; else if (a === 'prev') i--; else if (a === 'grid') all = !all; else return; paint(); });
    el.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight' && i < q.steps.length - 1) { i++; paint(); e.preventDefault(); } else if (e.key === 'ArrowLeft' && i > 0) { i--; paint(); e.preventDefault(); } });
    paint();
  }

  function init() {
    var map = [['.sched-tool', schedTool], ['.to-tool', toTool], ['.rec-tool', recTool], ['.disk-tool', diskTool], ['.div-tool', divTool], ['.bitmap-tool', bitmapTool], ['.qep-walk', qepWalk]];
    map.forEach(function (m) { document.querySelectorAll(m[0]).forEach(function (el) { try { m[1](el); } catch (e) { el.innerHTML = '<p class="bp-empty" style="padding:14px">这个组件没能载入：' + esc(e.message) + '</p>'; } }); });
    document.querySelectorAll('.sched-show').forEach(function (el) { el.classList.add('bp'); el.appendChild(schedReport(el.getAttribute('data-s'), { noRec: el.hasAttribute('data-norec') })); });
    document.querySelectorAll('.qep-tree').forEach(function (el) { el.classList.add('bp'); var d = document.createElement('div'); d.className = 'bp-stage'; d.appendChild(treeSvg(JSON.parse(el.getAttribute('data-tree')))); el.appendChild(d); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
