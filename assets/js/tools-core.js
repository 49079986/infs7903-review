/* Calculation engines for the non-B+ chapters. Pure functions, usable in the browser and in Node tests. */
(function (root) {
  'use strict';
  var T = {};

  /* ================= schedules ================= */
  // "r1(X); w2(X); c1; a2"  ->  [{t:'1', op:'r', item:'X'}, ...]
  T.parseSchedule = function (s) {
    var out = [], re = /([rwca])\s*(\d+)\s*(?:\(\s*([A-Za-z]\w*)\s*\))?/gi, m;
    while ((m = re.exec(s))) out.push({ t: m[2], op: m[1].toLowerCase(), item: m[3] ? m[3].toUpperCase() : null, text: m[1].toLowerCase() + m[2] + (m[3] ? '(' + m[3].toUpperCase() + ')' : '') });
    return out;
  };
  T.conflicts = function (ops) {
    var list = [];
    for (var i = 0; i < ops.length; i++) for (var j = i + 1; j < ops.length; j++) {
      var a = ops[i], b = ops[j];
      if (!a.item || !b.item || a.item !== b.item || a.t === b.t) continue;
      if (a.op === 'w' || b.op === 'w') list.push({ from: a.t, to: b.t, item: a.item, a: a.text, b: b.text });
    }
    return list;
  };
  T.precedence = function (ops) {
    var cs = T.conflicts(ops), edges = {}, nodes = [];
    ops.forEach(function (o) { if (nodes.indexOf(o.t) < 0) nodes.push(o.t); });
    cs.forEach(function (c) { var k = c.from + '>' + c.to; (edges[k] = edges[k] || { from: c.from, to: c.to, items: [] }); if (edges[k].items.indexOf(c.item) < 0) edges[k].items.push(c.item); });
    var E = Object.keys(edges).map(function (k) { return edges[k]; });
    // Kahn topological sort
    var indeg = {}, order = [], left = nodes.slice();
    nodes.forEach(function (n) { indeg[n] = 0; }); E.forEach(function (e) { indeg[e.to]++; });
    while (true) {
      var pick = left.filter(function (n) { return indeg[n] === 0; })[0]; if (pick === undefined) break;
      order.push(pick); left.splice(left.indexOf(pick), 1); E.forEach(function (e) { if (e.from === pick) indeg[e.to]--; });
    }
    return { nodes: nodes, edges: E, conflicts: cs, serializable: left.length === 0, order: left.length === 0 ? order : null, cycleNodes: left };
  };
  // recoverable / cascadeless / strict
  T.recoverability = function (ops) {
    var endAt = {}, kind = {}, reasons = { rec: [], casc: [], strict: [] };
    ops.forEach(function (o, i) { if (o.op === 'c' || o.op === 'a') { endAt[o.t] = i; kind[o.t] = o.op; } });
    function ended(t, i) { return endAt[t] !== undefined && endAt[t] < i; }
    function lastWriter(item, i, self) { for (var k = i - 1; k >= 0; k--) { var o = ops[k]; if (o.op === 'w' && o.item === item) { if (o.t === self) return null; if (kind[o.t] === 'a' && ended(o.t, i)) continue; return o; } } return null; }
    ops.forEach(function (o, i) {
      if (o.op !== 'r' && o.op !== 'w') return;
      var w = lastWriter(o.item, i, o.t); if (!w || ended(w.t, i)) return;
      if (o.op === 'r') {
        reasons.casc.push(o.text + ' 读了 T' + w.t + ' 写过但还没提交的 ' + o.item + '（dirty read）');
        reasons.strict.push(o.text + ' 读了 T' + w.t + ' 还没提交的 ' + o.item);
        if (kind[o.t] === 'c') {
          var okc = kind[w.t] === 'c' && endAt[w.t] < endAt[o.t];
          if (!okc) reasons.rec.push('T' + o.t + ' 读了 T' + w.t + ' 写的 ' + o.item + '，却在 T' + w.t + ' 提交之前就 commit 了' + (kind[w.t] === 'a' ? '（T' + w.t + ' 后来 abort）' : ''));
        }
      } else reasons.strict.push(o.text + ' 覆盖了 T' + w.t + ' 还没提交的 ' + o.item);
    });
    return { recoverable: !reasons.rec.length, cascadeless: !reasons.casc.length, strict: !reasons.strict.length, reasons: reasons };
  };

  /* ================= timestamp ordering ================= */
  // rows: [{t:'T76', op:'R'|'W'|'C', item:'A', calc:'f1'}], timestamp = number inside the name
  T.timestampOrdering = function (rows, items) {
    var st = {}, undo = {}, readers = {}, dead = {}, out = [], fn = {};
    items.forEach(function (x) { st[x] = { val: x.toLowerCase(), W: 0, R: 0 }; readers[x] = []; });
    function ts(t) { return parseInt(t.replace(/\D/g, ''), 10); }
    function show(x) { var s = st[x]; return s.val + ', ' + (s.W ? 'W' + s.W : 'W0') + ', ' + (s.R ? 'R' + s.R : 'R0'); }
    rows.forEach(function (r, i) {
      var res = { row: i + 1, t: r.t, op: r.op, item: r.item, changed: {}, msg: '', rollback: false, skipped: false };
      if (dead[r.t]) { res.skipped = true; res.msg = r.t + ' 已经被回滚，这一步不再执行。'; out.push(res); return; }
      var t = ts(r.t), s = st[r.item];
      if (r.op === 'C') { fn[r.t + '/' + r.item] = r.calc; res.msg = '本地计算，数据库里的值和时间戳都不变，这一行留空。'; }
      else if (r.op === 'R') {
        if (t < s.W) { res.rollback = true; res.msg = 't' + t + ' < W(' + r.item + ') = t' + s.W + '：更年轻的事务已经写过 ' + r.item + '，' + r.t + ' 被回滚。'; }
        else { var old = s.R; s.R = Math.max(s.R, t); readers[r.item].push(t); res.changed[r.item] = show(r.item); res.msg = 't' + t + ' ≥ W(' + r.item + ')，允许读。R = max(t' + t + ', ' + (old ? 't' + old : 'R0') + ')' + (s.R === old ? '，不变。' : ' = t' + s.R + '。'); }
      } else if (r.op === 'W') {
        if (t < s.R || t < s.W) {
          res.rollback = true;
          res.msg = (t < s.R ? 't' + t + ' < R(' + r.item + ') = t' + s.R : 't' + t + ' < W(' + r.item + ') = t' + s.W) + '：更年轻的事务已经' + (t < s.R ? '读' : '写') + '过 ' + r.item + '，' + r.t + ' 被回滚。';
        } else {
          (undo[r.t] = undo[r.t] || []).push({ item: r.item, val: s.val, W: s.W });
          s.val = (fn[r.t + '/' + r.item] || 'f') + '(' + r.item.toLowerCase() + ')'; s.W = t; res.changed[r.item] = show(r.item);
          res.msg = 't' + t + ' 不小于 R(' + r.item + ') 和 W(' + r.item + ')，允许写。值更新，W = t' + t + '。';
        }
      }
      if (res.rollback) {
        dead[r.t] = true; var restored = [];
        (undo[r.t] || []).reverse().forEach(function (u) { st[u.item].val = u.val; st[u.item].W = u.W; restored.push(u.item); });
        items.forEach(function (x) {   // timestamps set only by the aborted transaction are recovered
          var before = st[x].R; readers[x] = readers[x].filter(function (v) { return v !== t; });
          if (restored.indexOf(x) >= 0) { st[x].R = readers[x].length ? Math.max.apply(null, readers[x]) : 0; }
          if (restored.indexOf(x) >= 0 || x === r.item) res.changed[x] = show(x);
        });
        if (restored.length) res.msg += '它之前写过 ' + restored.join('、') + '，恢复成写之前的值和时间戳。';
        else res.msg += '它之前没有成功写过任何数据项，不需要恢复。';
      }
      res.state = {}; items.forEach(function (x) { res.state[x] = show(x); });
      out.push(res);
    });
    return out;
  };

  /* ================= recovery ================= */
  // log text -> events; then classify each transaction for a policy
  T.parseLog = function (text) {
    var ev = [];
    text.split(/\n|\]\s*\[/).forEach(function (line) {
      var s = line.replace(/[\[\]]/g, '').trim(); if (!s) return;
      var m;
      if (/checkpoint/i.test(s)) ev.push({ type: 'checkpoint' });
      else if (/crash/i.test(s)) ev.push({ type: 'crash' });
      else if ((m = /start[_ ]?transaction[, ]+\s*(T\d+)/i.exec(s))) ev.push({ type: 'start', t: m[1].toUpperCase() });
      else if ((m = /commit[, ]+\s*(T\d+)/i.exec(s))) ev.push({ type: 'commit', t: m[1].toUpperCase() });
      else if ((m = /write[_ ]?item[, ]+\s*(T\d+)[, ]+\s*([A-Za-z]\w*)[, ]+\s*([\w.]+)(?:[, ]+\s*([\w.]+))?/i.exec(s))) ev.push({ type: 'write', t: m[1].toUpperCase(), item: m[2], a: m[3], b: m[4] });
    });
    return ev;
  };
  T.recover = function (events, policy) {   // policy: {steal: bool, force: bool}
    var tx = {}, order = [], ck = -1, crash = events.length;
    events.forEach(function (e, i) {
      if (e.type === 'checkpoint') ck = i; else if (e.type === 'crash') crash = i;
      else { if (!tx[e.t]) { tx[e.t] = { name: e.t, start: i, commit: null, writes: [] }; order.push(e.t); } if (e.type === 'commit') tx[e.t].commit = i; if (e.type === 'write') tx[e.t].writes.push(e); }
    });
    var res = order.map(function (n) {
      var t = tx[n], cls, action, why;
      if (t.commit !== null && t.commit < ck) { cls = 'before'; action = 'none'; why = '在 checkpoint 之前已经 commit，修改已经在磁盘上。'; }
      else if (t.commit !== null && t.commit < crash) {
        cls = 'after';
        if (policy.force) { action = 'none'; why = 'checkpoint 之后 commit。Force：commit 时修改已经强制写盘，不用 Redo。'; }
        else { action = 'redo'; why = 'checkpoint 之后、crash 之前 commit。No-force：修改可能还没写盘，需要 Redo（用 AFIM，从前往后）。'; }
      } else {
        cls = 'active';
        if (policy.steal) { action = 'undo'; why = '到 crash 时还没 commit。Steal：它的修改可能已经写盘，需要 Undo（用 BFIM，从后往前），然后重启。'; }
        else { action = 'ignore'; why = '到 crash 时还没 commit。No-steal：它的修改没有写盘，不用 Undo，忽略后重启。'; }
      }
      return { name: n, start: t.start, commit: t.commit, cls: cls, action: action, why: why, writes: t.writes };
    });
    return { tx: res, checkpoint: ck, crash: crash, n: events.length,
      redo: res.filter(function (x) { return x.action === 'redo'; }).sort(function (a, b) { return a.commit - b.commit; }).map(function (x) { return x.name; }),
      undo: res.filter(function (x) { return x.action === 'undo'; }).sort(function (a, b) { return b.start - a.start; }).map(function (x) { return x.name; }) };
  };

  /* ================= disk ================= */
  T.disk = function (d) {   // B, blocksPerTrack, tracksPerSurface, platters, doubleSided, rpm, seek, n
    var surfaces = d.platters * (d.doubleSided ? 2 : 1), track = d.blocksPerTrack * d.B, cyl = surfaces * track, disk = d.tracksPerSurface * cyl;
    var rev = 60000 / d.rpm, tr = track / rev, btt = d.B / tr, rd = rev / 2, one = d.seek + rd + btt;
    return { surfaces: surfaces, track: track, cylinders: d.tracksPerSurface, cylinder: cyl, disk: disk, rev: rev, tr: tr, btt: btt, rd: rd, one: one, random: d.n * one, consecutive: d.seek + rd + d.n * btt };
  };
  T.blocking = function (B, R, N) { var bfr = Math.floor(B / R); return { bfr: bfr, blocks: Math.ceil(N / bfr), wasted: B - bfr * R }; };

  /* ================= relational division ================= */
  // r1: array of rows (arrays), divide on the last column by the set r2
  T.divide = function (r1, r2) {
    var groups = {}, order = [];
    r1.forEach(function (row) { var k = row.slice(0, -1).join('\u0001'); if (!groups[k]) { groups[k] = { key: row.slice(0, -1), vals: [] }; order.push(k); } groups[k].vals.push(row[row.length - 1]); });
    return order.map(function (k) { var g = groups[k], missing = r2.filter(function (v) { return g.vals.indexOf(v) < 0; }); return { key: g.key, ok: missing.length === 0, missing: missing }; });
  };

  /* ================= bitmap ================= */
  T.bitmaps = function (rows, col) {
    var m = {}, order = [];
    rows.forEach(function (r, i) { var v = r[col]; if (!m[v]) { m[v] = rows.map(function () { return 0; }); order.push(v); } m[v][i] = 1; });
    return { values: order, bits: m };
  };
  T.bitAnd = function (a, b) { return a.map(function (x, i) { return x & b[i]; }); };
  T.bitOr = function (a, b) { return a.map(function (x, i) { return x | b[i]; }); };

  /* ================= QEP for the "two tables linked by a third" pattern ================= */
  // cfg: { A:{name,rows,key,out:[..]}, B:{...}, M:{name,rows,fkA,fkB,sel:'Grade=7'} , project:[..] }
  // returns the lecture's five trees: initial, rule1 (push selection), rule2 (joins), rule3 (reorder), rule4 (push projections)
  T.qep = function (c) {
    function n(label, kids) { return { label: label, kids: kids || [] }; }
    var A = c.A, B = c.B, M = c.M, jA = A.key + '=' + M.fkA, jB = M.fkB + '=' + B.key, P = 'π ' + c.project.join(',');
    var small = A.rows <= B.rows ? A : B, big = small === A ? B : A;
    var jS = small === A ? M.fkA + '=' + A.key : M.fkB + '=' + B.key, jBig = big === A ? M.fkA + '=' + A.key : M.fkB + '=' + B.key;
    var fkS = small === A ? M.fkA : M.fkB, fkBig = big === A ? M.fkA : M.fkB;
    var initial = n(P, [n('σ ' + M.sel, [n('σ ' + jA, [n('σ ' + jB, [n('×', [n('×', [n(A.name), n(M.name)]), n(B.name)])])])])]);
    var r1 = n(P, [n('σ ' + jB, [n('×', [n('σ ' + jA, [n('×', [n(A.name), n('σ ' + M.sel, [n(M.name)])])]), n(B.name)])])]);
    var r2 = n(P, [n('⋈ ' + jB, [n('⋈ ' + jA, [n('σ ' + M.sel, [n(M.name)]), n(A.name)]), n(B.name)])]);
    var r3 = n(P, [n('⋈ ' + jBig, [n('⋈ ' + jS, [n('σ ' + M.sel, [n(M.name)]), n(small.name)]), n(big.name)])]);
    var keepSmall = [small.key].concat(small.out), keepBig = [big.key].concat(big.out);
    var smallLeaf = keepSmall.length < small.attrs ? n('π ' + keepSmall.join(','), [n(small.name)]) : n(small.name);
    var bigLeaf = keepBig.length < big.attrs ? n('π ' + keepBig.join(','), [n(big.name)]) : n(big.name);
    var r4 = n(P, [n('⋈ ' + jBig, [n('π ' + [fkBig].concat(small.out).join(','), [n('⋈ ' + jS, [n('π ' + (small === A ? [M.fkA, M.fkB] : [M.fkA, M.fkB]).join(','), [n('σ ' + M.sel, [n(M.name)])]), smallLeaf])]), bigLeaf])]);
    return { steps: [
      { title: '初始树', tree: initial, why: 'SELECT 变成顶上的 π，WHERE 里的每个条件变成一个 σ，FROM 里的表用 × 连起来。' },
      { title: 'Rule 1：选择下推', tree: r1, why: 'σ ' + M.sel + ' 只涉及 ' + M.name + '，推到它正上方，尽早减少行数；连接条件放到对应的 × 上方。' },
      { title: 'Rule 2：× 加 σ 变成 ⋈', tree: r2, why: '连接比“先做笛卡尔积再筛选”便宜得多。' },
      { title: 'Rule 3：最有限制性的连接先做', tree: r3, why: small.name + ' 有 ' + small.rows.toLocaleString('en-US') + ' 行，少于 ' + big.name + ' 的 ' + big.rows.toLocaleString('en-US') + ' 行，所以先和 ' + small.name + ' 连接，中间结果更小。' },
      { title: 'Rule 4：投影下推', tree: r4, why: '每张表只留最终要输出的列和后面连接还要用的列。' }
    ], expr: exprOf(r4) };
  };
  function exprOf(t) {
    if (!t.kids.length) return t.label;
    if (t.kids.length === 1) return t.label + ' (' + exprOf(t.kids[0]) + ')';
    return '(' + exprOf(t.kids[0]) + ') ' + t.label + ' (' + exprOf(t.kids[1]) + ')';
  }
  T.exprOf = exprOf;

  if (typeof module !== 'undefined' && module.exports) module.exports = T; else root.Tools = T;
})(this);
