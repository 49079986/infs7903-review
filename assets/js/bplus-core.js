/* B+ tree simulator following the INFS7903 Week 6 lecture conventions.
   p = order = max pointers per node; max keys per node = p - 1 (leaf and internal).
   Search: key <= separator goes left. Separator = largest key of the left subtree.
   Leaf split: left keeps ceil(p/2) keys, largest left key is COPIED up.
   Internal split: left keeps ceil((p-1)/2) keys, the next key MOVES up.
   Delete: leaf underflow (< ceil((p-1)/2) keys) -> borrow from left sibling, else right sibling, else merge.
   Internal underflow -> combine with neighbouring node (lecture wording); see fixInternal. */
(function (root) {
  'use strict';
  function BPTree(p) {
    this.p = p; this.maxKeys = p - 1;
    this.minLeaf = Math.ceil((p - 1) / 2);
    this.minInt = Math.ceil(p / 2) - 1;
    this._id = 0; this.root = this._node(true); this.frames = [];
  }
  var P = BPTree.prototype;
  P._node = function (leaf) { return { id: ++this._id, leaf: leaf, keys: [], children: [] }; };
  P._snap = function (n) {
    var self = this;
    return { id: n.id, leaf: n.leaf, keys: n.keys.slice(), children: n.children.map(function (c) { return self._snap(c); }) };
  };
  P._frame = function (msg, hl, extra) {
    var f = { tree: this._snap(this.root), msg: msg, hl: (hl || []).map(function (n) { return n.id; }), final: false };
    if (extra) for (var k in extra) f[k] = extra[k];
    this.frames.push(f); return f;
  };
  P._path = function (k) {
    var path = [], n = this.root;
    while (!n.leaf) {
      var i = 0; while (i < n.keys.length && k > n.keys[i]) i++;
      path.push({ node: n, idx: i }); n = n.children[i];
    }
    return { leaf: n, path: path };
  };
  function maxKey(n) { while (!n.leaf) n = n.children[n.children.length - 1]; return n.keys[n.keys.length - 1]; }
  P._refresh = function (n) {
    if (n.leaf) return;
    for (var i = 0; i < n.children.length; i++) this._refresh(n.children[i]);
    n.keys = []; for (var j = 0; j < n.children.length - 1; j++) n.keys.push(maxKey(n.children[j]));
  };
  function fmt(n) { return '[' + n.keys.join(', ') + ']'; }

  P.insert = function (k) {
    var start = this.frames.length, r = this._path(k), leaf = r.leaf, path = r.path;
    if (leaf.keys.indexOf(k) >= 0) { this._frame('key ' + k + ' 已经在树里，不重复插入。', [leaf], { newKey: k }).final = true; return this.frames.slice(start); }
    var i = 0; while (i < leaf.keys.length && k > leaf.keys[i]) i++;
    leaf.keys.splice(i, 0, k);
    if (leaf.keys.length <= this.maxKeys) {
      this._frame('Insert ' + k + '：找到叶子，里面还有空位，按顺序放进去，变成 ' + fmt(leaf) + '。', [leaf], { newKey: k }).final = true;
      return this.frames.slice(start);
    }
    this._frame('Insert ' + k + '：叶子变成 ' + fmt(leaf) + '，有 ' + leaf.keys.length + ' 个 key，超过上限 ' + this.maxKeys + ' 个，溢出（overflow）。', [leaf], { newKey: k, overflow: true });
    // leaf split
    var lc = Math.ceil(this.p / 2), right = this._node(true);
    right.keys = leaf.keys.splice(lc); var sep = leaf.keys[leaf.keys.length - 1];
    var child = leaf, newChild = right, upKey = sep, msg = '叶子分裂：左边留 ' + fmt(leaf) + '，右边是 ' + fmt(right) + '；把左叶最大的 ' + sep + ' 复制（copy up）到父节点。';
    var level = path.length - 1, hl = [leaf, right];
    while (true) {
      if (level < 0) {
        var nr = this._node(false); nr.keys = [upKey]; nr.children = [child, newChild]; this.root = nr;
        this._frame(msg + '原来的节点就是根，所以新建一个根 [' + upKey + ']，树长高一层。', hl.concat([nr]), { newKey: k }); break;
      }
      var par = path[level].node, idx = path[level].idx;
      par.keys.splice(idx, 0, upKey); par.children.splice(idx + 1, 0, newChild);
      if (par.keys.length <= this.maxKeys) { this._frame(msg + '父节点变成 ' + fmt(par) + '，没有溢出。', hl.concat([par]), { newKey: k }); break; }
      this._frame(msg + '父节点变成 ' + fmt(par) + '，有 ' + par.keys.length + ' 个 key，也溢出了。', hl.concat([par]), { newKey: k, overflow: true });
      var lk = Math.ceil((this.p - 1) / 2), r2 = this._node(false);
      upKey = par.keys[lk]; r2.keys = par.keys.splice(lk + 1); par.keys.splice(lk, 1);
      r2.children = par.children.splice(lk + 1);
      msg = '内部节点分裂：左边留 ' + fmt(par) + '，右边是 ' + fmt(r2) + '；中间的 ' + upKey + ' 上移（move up），不留在这一层。';
      child = par; newChild = r2; hl = [par, r2]; level--;
    }
    this.frames[this.frames.length - 1].final = true;
    return this.frames.slice(start);
  };

  P.remove = function (k) {
    var start = this.frames.length, r = this._path(k), leaf = r.leaf, path = r.path, i = leaf.keys.indexOf(k);
    if (i < 0) { this._frame('key ' + k + ' 不在树里，什么都不做。', [leaf]).final = true; return this.frames.slice(start); }
    leaf.keys.splice(i, 1);
    if (!path.length) { this._frame('Delete ' + k + '：根就是叶子，直接删掉。', [leaf]).final = true; return this.frames.slice(start); }
    if (leaf.keys.length >= this.minLeaf) {
      var before = JSON.stringify(this._snap(this.root)); this._refresh(this.root);
      var changed = before !== JSON.stringify(this._snap(this.root));
      this._frame('Delete ' + k + '：叶子还剩 ' + fmt(leaf) + '，不下溢。' + (changed ? '被删的 key 正好是上层的路标，把路标改成左边子树现在的最大值。' : '上层路标不用改。'), [leaf]).final = true;
      return this.frames.slice(start);
    }
    this._frame('Delete ' + k + '：叶子只剩 ' + leaf.keys.length + ' 个 key，少于下限 ' + this.minLeaf + ' 个，下溢（underflow）。', [leaf], { underflow: true });
    var par = path[path.length - 1].node, idx = path[path.length - 1].idx;
    var L = idx > 0 ? par.children[idx - 1] : null, R = idx < par.children.length - 1 ? par.children[idx + 1] : null;
    if (L && L.keys.length > this.minLeaf) {
      var b = L.keys.pop(); leaf.keys.unshift(b); this._refresh(this.root);
      this._frame('左兄弟有多余的 key，借（redistribute）它最大的 ' + b + ' 过来。父节点的路标改成左叶现在的最大值。', [leaf, L, par]);
    } else if (R && R.keys.length > this.minLeaf) {
      var b2 = R.keys.shift(); leaf.keys.push(b2); this._refresh(this.root);
      this._frame('左边借不到，右兄弟有多余的 key，借它最小的 ' + b2 + ' 过来，并更新父节点的路标。', [leaf, R, par]);
    } else {
      var keep;
      if (L) { L.keys = L.keys.concat(leaf.keys); par.children.splice(idx, 1); keep = L; }
      else { leaf.keys = leaf.keys.concat(R.keys); par.children.splice(idx + 1, 1); keep = leaf; }
      par.keys.pop(); this._refresh(this.root);
      this._frame('兄弟也没有多余的 key，只能合并（merge）成 ' + fmt(keep) + '，父节点少一个孩子。', [keep, par]);
      this._fixInternal(path, path.length - 1);
    }
    this.frames[this.frames.length - 1].final = true;
    return this.frames.slice(start);
  };

  P._fixInternal = function (path, level) {
    var node = path[level].node;
    if (level === 0) {
      if (node.children.length === 1) { this.root = node.children[0]; this._frame('根只剩一个孩子，根消失，树变矮一层。', [this.root]); }
      return;
    }
    if (node.keys.length >= this.minInt) return;
    var par = path[level - 1].node, idx = path[level - 1].idx;
    var L = idx > 0 ? par.children[idx - 1] : null, R = idx < par.children.length - 1 ? par.children[idx + 1] : null;
    var a = L ? L : node, b = L ? node : R;           // merge b into a (a is on the left)
    a.children = a.children.concat(b.children); par.children.splice(par.children.indexOf(b), 1);
    this._refresh(this.root);
    if (a.children.length <= this.p) {
      this._frame('内部节点也下溢：和相邻的内部节点合并成 ' + fmt(a) + '，上一层少一个孩子。', [a, par]);
    } else {
      // too many children after combining: lecture example (Week06 p45, delete 12) compacts two adjacent leaves
      var note = '';
      if (a.children[0].leaf) {
        for (var j = a.children.length - 2; j >= 0; j--) {
          if (a.children[j].keys.length + a.children[j + 1].keys.length <= this.maxKeys) {
            a.children[j].keys = a.children[j].keys.concat(a.children[j + 1].keys); a.children.splice(j + 1, 1);
            this._refresh(this.root);
            note = '合并后孩子太多，再把两个相邻的叶子并成 ' + fmt(a.children[j]) + '（课件 Week06 第 45 页的做法）。';
            break;
          }
        }
      }
      if (a.children.length > this.p) {
        var lc = Math.ceil(a.children.length / 2), r2 = this._node(false);
        r2.children = a.children.splice(lc); par.children.splice(par.children.indexOf(a) + 1, 0, r2);
        this._refresh(this.root);
        this._frame('内部节点也下溢：和相邻的内部节点合并后孩子太多，重新平分成 ' + fmt(a) + ' 和 ' + fmt(r2) + '（相当于向兄弟借一个孩子）。', [a, r2, par]);
        return;
      }
      this._frame('内部节点也下溢：和相邻的内部节点合并。' + note + '得到 ' + fmt(a) + '。', [a, par]);
    }
    this._fixInternal(path, level - 1);
  };

  /* helpers */
  BPTree.fromStructure = function (p, s) {       // s: leaf = [keys]; internal = {c:[...]} (separators are derived)
    var t = new BPTree(p);
    function build(x) {
      if (Array.isArray(x)) { var l = t._node(true); l.keys = x.slice(); return l; }
      var n = t._node(false); n.children = x.c.map(build); return n;
    }
    t.root = build(s); t._refresh(t.root); return t;
  };
  P.toString = function () {
    function s(n) { return n.leaf ? '[' + n.keys.join(',') + ']' : '{' + n.keys.join(',') + ':' + n.children.map(s).join(' ') + '}'; }
    return s(this.root);
  };
  P.height = function () { var h = 1, n = this.root; while (!n.leaf) { h++; n = n.children[0]; } return h; };
  P.check = function () {                         // structural invariants
    var self = this, depth = -1, ok = true, last = -Infinity;
    (function walk(n, d, isRoot) {
      if (n.keys.length > self.maxKeys) ok = false;
      if (n.leaf) {
        if (depth < 0) depth = d; else if (depth !== d) ok = false;
        if (!isRoot && n.keys.length < self.minLeaf) ok = false;
        n.keys.forEach(function (k) { if (k <= last) ok = false; last = k; });
      } else {
        if (n.children.length !== n.keys.length + 1) ok = false;
        if (!isRoot && n.keys.length < self.minInt) ok = false;
        if (isRoot && n.children.length < 2) ok = false;
        n.children.forEach(function (c, i) { walk(c, d + 1, false); if (i < n.keys.length && maxKey(c) !== n.keys[i]) ok = false; });
      }
    })(this.root, 0, true);
    return ok;
  };
  /* run "i25 i30 d33" style operation strings */
  BPTree.run = function (p, ops, startStructure) {
    var t = startStructure ? BPTree.fromStructure(p, startStructure) : new BPTree(p), out = [];
    if (startStructure) { var f0 = t._frame('初始的树。', []); f0.final = true; f0.op = '初始'; f0.opIndex = -1; }
    ops.forEach(function (o, n) {
      var k = parseInt(o.slice(1), 10), fs = o[0] === 'i' ? t.insert(k) : t.remove(k);
      fs.forEach(function (f) { f.op = (o[0] === 'i' ? 'Insert ' : 'Delete ') + k; f.opIndex = n; });
    });
    return t;
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = BPTree; else root.BPTree = BPTree;
})(this);
