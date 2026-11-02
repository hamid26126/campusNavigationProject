/*
 * Route optimisation: weighted road graph + Dijkstra, door-to-road snapping,
 * turn-by-turn directions, nearest-facility and reachability queries.
 */
(function (root) {
  var R = 6371000;
  function toRad(d) { return (d * Math.PI) / 180; }
  function toDeg(r) { return (r * 180) / Math.PI; }

  function haversine(a, b) {
    var dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  function bearing(a, b) {
    var y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
    var x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
      Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }
  function compass(b) {
    return ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(b / 45) % 8];
  }
  function turnAngle(b1, b2) { return ((b2 - b1 + 540) % 360) - 180; }
  function turnWord(angle) {
    var a = Math.abs(angle);
    if (a < 25) return null;
    var side = angle > 0 ? "right" : "left";
    if (a > 150) return "make a U-turn";
    if (a < 60) return "bear slightly " + side;
    return "turn " + side;
  }

  function Router(campus) {
    this.campus = campus;
    this.mLat = campus.mPerDegLat || 111320;
    this.mLng = campus.mPerDegLng || 94780;
    this.nodeById = {}; this.adj = {}; this.locById = {};
    var self = this;
    campus.nodes.forEach(function (n) { self.nodeById[n.id] = n; self.adj[n.id] = []; });
    campus.edges.forEach(function (e) {
      var a = self.nodeById[e[0]], b = self.nodeById[e[1]];
      if (!a || !b) throw new Error("Bad edge " + e.join("-"));
      var w = haversine(a, b);
      self.adj[a.id].push({ to: b.id, w: w });
      self.adj[b.id].push({ to: a.id, w: w });
    });
    campus.locations.forEach(function (l) { self.locById[l.id] = l; });
  }

  // nearest road POINT (on any edge) to pt; planar approximation is fine at campus scale
  Router.prototype.snap = function (pt) {
    var best = null, self = this;
    this.campus.edges.forEach(function (e) {
      var a = self.nodeById[e[0]], b = self.nodeById[e[1]];
      var ax = (a.lng - pt.lng) * self.mLng, ay = (a.lat - pt.lat) * self.mLat;
      var bx = (b.lng - pt.lng) * self.mLng, by = (b.lat - pt.lat) * self.mLat;
      var dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      var t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
      var px = ax + t * dx, py = ay + t * dy;
      var d = Math.sqrt(px * px + py * py);
      if (!best || d < best.dist) {
        best = {
          edge: e, t: t, dist: d,
          point: { lat: pt.lat + py / self.mLat, lng: pt.lng + px / self.mLng },
          len: Math.sqrt(len2)
        };
      }
    });
    return best;
  };

  // kept for compatibility: nearest junction
  Router.prototype.nearestNode = function (pt) {
    var best = null, bd = Infinity;
    this.campus.nodes.forEach(function (n) { var d = haversine(pt, n); if (d < bd) { bd = d; best = n; } });
    return { node: best, dist: bd };
  };

  Router.prototype.shortestPath = function (fromId, toId) {
    var dist = {}, prev = {}, heap = [], self = this;
    function push(item) {
      heap.push(item);
      var i = heap.length - 1;
      while (i > 0) {
        var p = (i - 1) >> 1;
        if (heap[p].d <= heap[i].d) break;
        var t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p;
      }
    }
    function pop() {
      var top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        var i = 0;
        for (;;) {
          var l = 2 * i + 1, r = l + 1, m = i;
          if (l < heap.length && heap[l].d < heap[m].d) m = l;
          if (r < heap.length && heap[r].d < heap[m].d) m = r;
          if (m === i) break;
          var t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m;
        }
      }
      return top;
    }
    Object.keys(this.adj).forEach(function (k) { dist[k] = Infinity; });
    dist[fromId] = 0;
    push({ id: fromId, d: 0 });
    while (heap.length) {
      var cur = pop();
      if (cur.d > dist[cur.id]) continue;
      if (cur.id === toId) break;
      var es = self.adj[cur.id];
      for (var i = 0; i < es.length; i++) {
        var nd = cur.d + es[i].w;
        if (nd < dist[es[i].to]) { dist[es[i].to] = nd; prev[es[i].to] = cur.id; push({ id: es[i].to, d: nd }); }
      }
    }
    if (dist[toId] === Infinity) return null;
    var path = [], at = toId;
    while (at !== undefined) { path.unshift(at); at = prev[at]; }
    return { nodes: path, distance: dist[toId] };
  };

  Router.prototype._resolve = function (p) {
    if (typeof p === "string") {
      var l = this.locById[p];
      if (!l) throw new Error("Unknown location " + p);
      return { lat: l.lat, lng: l.lng, name: l.name, id: l.id, w: l.w, h: l.h };
    }
    return { lat: p.lat, lng: p.lng, name: p.name || "Your position", id: p.id };
  };

  // where the straight line from a building's centre to `target` leaves its footprint
  Router.prototype._exitPoint = function (c, target) {
    if (!c.w || !c.h || c.w < 3) return { lat: c.lat, lng: c.lng };
    var dx = (target.lng - c.lng) * this.mLng, dy = (target.lat - c.lat) * this.mLat;
    if (!dx && !dy) return { lat: c.lat, lng: c.lng };
    var sx = dx ? (c.w / 2) / Math.abs(dx) : Infinity, sy = dy ? (c.h / 2) / Math.abs(dy) : Infinity;
    var s = Math.min(sx, sy, 1);
    return { lat: c.lat + (dy * s) / this.mLat, lng: c.lng + (dx * s) / this.mLng };
  };

  Router.prototype.route = function (from, to) {
    var a = this._resolve(from), b = this._resolve(to);
    var s1 = this.snap(a), s2 = this.snap(b), self = this;
    var best = null;

    function edgeKey(e) { return e[0] < e[1] ? e[0] + "|" + e[1] : e[1] + "|" + e[0]; }

    if (edgeKey(s1.edge) === edgeKey(s2.edge)) {
      // both doors open onto the same road segment: walk along it
      var t2 = s1.edge[0] === s2.edge[0] ? s2.t : 1 - s2.t; // s2's position in s1's orientation
      var along = Math.abs(t2 - s1.t) * s1.len;
      best = { cost: s1.dist + along + s2.dist, nodes: [], p1: s1.point, p2: s2.point };
    }

    for (var i = 0; i < 2; i++) {
      for (var j = 0; j < 2; j++) {
        var u = s1.edge[i], v = s2.edge[j];
        var du = haversine(s1.point, this.nodeById[u]), dv = haversine(s2.point, this.nodeById[v]);
        var sp = u === v ? { nodes: [u], distance: 0 } : this.shortestPath(u, v);
        if (!sp) continue;
        var cost = s1.dist + du + sp.distance + dv + s2.dist;
        if (!best || cost < best.cost - 1e-6) best = { cost: cost, nodes: sp.nodes, p1: s1.point, p2: s2.point };
      }
    }
    if (!best) return null;

    var pts = [this._exitPoint(a, best.p1), { lat: best.p1.lat, lng: best.p1.lng }];
    best.nodes.forEach(function (id) { pts.push({ lat: self.nodeById[id].lat, lng: self.nodeById[id].lng }); });
    pts.push({ lat: best.p2.lat, lng: best.p2.lng });
    pts.push(this._exitPoint(b, best.p2));

    var clean = [pts[0]];
    for (var k = 1; k < pts.length; k++) if (haversine(clean[clean.length - 1], pts[k]) > 1) clean.push(pts[k]);
    if (clean.length === 1) clean.push(pts[pts.length - 1]);

    var total = 0;
    for (var m = 1; m < clean.length; m++) total += haversine(clean[m - 1], clean[m]);
    var speed = this.campus.walkingSpeedMps || 1.3;
    return {
      from: a, to: b, nodes: best.nodes, coords: clean,
      distance: total, minutes: total / speed / 60,
      steps: this.directions(clean, b)
    };
  };

  Router.prototype.directions = function (pts, b) {
    var legs = [];
    for (var i = 1; i < pts.length; i++) {
      var d = haversine(pts[i - 1], pts[i]), br = bearing(pts[i - 1], pts[i]);
      var last = legs[legs.length - 1];
      if (last && Math.abs(turnAngle(last.bearing, br)) < 20) last.dist += d;
      else legs.push({ bearing: br, dist: d });
    }
    var steps = [];
    legs.forEach(function (leg, idx) {
      var dist = Math.max(5, Math.round(leg.dist / 5) * 5);
      if (idx === 0) {
        steps.push({ text: "Head " + compass(leg.bearing) + " for about " + dist + " m", dist: dist });
      } else {
        var t = turnWord(turnAngle(legs[idx - 1].bearing, leg.bearing));
        steps.push({
          text: (t ? t.charAt(0).toUpperCase() + t.slice(1) + " and continue " + compass(leg.bearing) : "Continue " + compass(leg.bearing)) +
            " for about " + dist + " m", dist: dist
        });
      }
    });
    steps.push({ text: "Arrive at " + b.name, dist: 0, arrive: true });
    return steps;
  };

  Router.prototype.nearest = function (from, filter, limit) {
    var self = this;
    var cands = this.campus.locations.filter(typeof filter === "function" ? filter : function (l) { return l.category === filter; });
    var fromId = typeof from === "string" ? from : null;
    var out = [];
    cands.forEach(function (l) {
      if (fromId && l.id === fromId) return;
      var r = self.route(from, l.id);
      if (r) out.push({ location: l, distance: r.distance, minutes: r.minutes });
    });
    out.sort(function (x, y) { return x.distance - y.distance; });
    return out.slice(0, limit || 3);
  };

  // walking distance (m) from `from` to every location
  Router.prototype.distancesFrom = function (from) {
    var self = this, out = {};
    this.campus.locations.forEach(function (l) {
      if (typeof from === "string" && from === l.id) { out[l.id] = 0; return; }
      var r = self.route(from, l.id);
      out[l.id] = r ? r.distance : Infinity;
    });
    return out;
  };

  Router.prototype.reach = function (from, minutes) {
    var limit = minutes * 60 * (this.campus.walkingSpeedMps || 1.3);
    var d = this.distancesFrom(from), ids = [];
    Object.keys(d).forEach(function (id) { if (d[id] <= limit) ids.push(id); });
    return { ids: ids, distances: d, limitMeters: limit };
  };

  Router.haversine = haversine;
  Router.bearing = bearing;
  Router.compass = compass;

  if (typeof module !== "undefined" && module.exports) module.exports = Router;
  else root.Router = Router;
})(typeof window !== "undefined" ? window : globalThis);
