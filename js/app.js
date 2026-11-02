/* UET Navigator - UI: illustrated 2.5D map, assistant, drawer, tour, walking range. */
(function () {
  var C = window.CAMPUS, INFO = window.CAMPUS_INFO;
  var router = new Router(C);
  var nlp = new NLP(C);
  var MLAT = C.mPerDegLat, MLNG = C.mPerDegLng;

  // ------------------------------------------------------------------ helpers
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "class") n.className = attrs[k];
      else if (k === "text") n.textContent = attrs[k];
      else if (k.indexOf("on") === 0) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  var $ = function (id) { return document.getElementById(id); };
  function ll(lat, lng, dx, dy) { return [lat + dy / MLAT, lng + dx / MLNG]; }           // offset in metres
  function rectPts(lat, lng, w, h, dx, dy) {                                              // SW, SE, NE, NW
    dx = dx || 0; dy = dy || 0; var a = w / 2, b = h / 2;
    return [ll(lat, lng, -a + dx, -b + dy), ll(lat, lng, a + dx, -b + dy), ll(lat, lng, a + dx, b + dy), ll(lat, lng, -a + dx, b + dy)];
  }
  function ovalPts(lat, lng, w, h, k) {
    var pts = [];
    for (var i = 0; i < 48; i++) { var t = (i / 48) * 2 * Math.PI; pts.push(ll(lat, lng, (w / 2) * k * Math.cos(t), (h / 2) * k * Math.sin(t))); }
    return pts;
  }
  function seeded(seed) { return function () { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function catOf(l) { return C.categories[l.category] || C.categories.other; }
  function fmtDist(m) { return m >= 950 ? (m / 1000).toFixed(2) + " km" : Math.round(m / 5) * 5 + " m"; }
  function fmtTime(min) { return Math.max(1, Math.round(min)) + " min walk"; }
  function shortName(n) { return n.length > 30 ? n.slice(0, 28) + "…" : n; }
  function safe(fn) { try { return fn(); } catch (e) { return null; } }
  function buildingH(l) { return Math.min(18, (l.levels || 1) * 3.6); }

  // category colour classes (so CSS can theme every path)
  (function () {
    var css = Object.keys(C.categories).map(function (k) { return ".cat-" + k + "{--cat:" + C.categories[k].color + ";}"; }).join("");
    document.head.appendChild(el("style", { text: css }));
  })();

  // ------------------------------------------------------------------ state
  var origin = { id: "main_gate" };
  var selId = null, lastRoute = null, routeLayer = null, walker = null, walkAnim = null;
  var reach = { on: false, minutes: 5, ids: null };
  var activeCats = {};
  var parts = {};                // id -> {roof, others[], badge}
  var basemap = "illus";
  var tour = { on: false, i: 0 };

  var logEl = $("log"), askInput = $("askInput"), suggestEl = $("suggest"), fromSelect = $("fromSelect");

  // ------------------------------------------------------------------ theme
  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    $("themeBtn").textContent = t === "dark" ? "☀️" : "🌙";
    safe(function () { localStorage.setItem("uetnav-theme", t); });
  }
  var savedTheme = safe(function () { return localStorage.getItem("uetnav-theme"); });
  setTheme(savedTheme || (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  $("themeBtn").addEventListener("click", function () {
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });

  // ------------------------------------------------------------------ map
  var BOX = { south: 31.5753, west: 74.3524, north: 31.5832, east: 74.3600 };
  var b = C.bounds;
  var map = L.map("map", { zoomControl: false, minZoom: 15, maxZoom: 20, zoomSnap: 0.25, zoomDelta: 0.5 });
  L.control.zoom({ position: "bottomright" }).addTo(map);
  [["p-land", 300], ["p-trees", 320], ["p-shadow", 330], ["p-bld", 340], ["p-route", 450]].forEach(function (p) {
    map.createPane(p[0]).style.zIndex = p[1];
  });
  map.getPane("p-land").style.pointerEvents = "none";
  map.getPane("p-trees").style.pointerEvents = "none";
  map.getPane("p-shadow").style.pointerEvents = "none";
  map.getPane("p-route").style.pointerEvents = "none";
  map.setMaxBounds([[b.south - 0.006, b.west - 0.006], [b.north + 0.006, b.east + 0.006]]);

  function pads() {
    var mobile = window.innerWidth <= 820;
    if (mobile) return { paddingTopLeft: [16, 90], paddingBottomRight: [16, Math.round(window.innerHeight * 0.5)] };
    var left = $("panel").classList.contains("collapsed") ? 40 : 410;
    var right = $("drawer").hidden ? 70 : 380;
    return { paddingTopLeft: [left, 40], paddingBottomRight: [right, 110] };
  }
  function fitTo(bounds, maxZoom) {
    var o = pads(); o.maxZoom = maxZoom || 19; o.animate = true; o.duration = 0.6;
    map.fitBounds(bounds, o);
  }
  var campusBounds = L.latLngBounds([[31.5756, C.cols[0] - 0.0002], [C.rows[C.rows.length - 1] + 0.0003, C.cols[C.cols.length - 1] + 0.0002]]);
  var o0 = pads(); o0.animate = false; map.fitBounds(campusBounds, o0);

  map.on("zoomend", function () {
    map.getContainer().classList.toggle("show-labels", map.getZoom() >= 17.75);
  });
  map.getContainer().classList.toggle("show-labels", map.getZoom() >= 17.75);

  // ---- basemaps
  var tiles = {
    street: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 20, maxNativeZoom: 19, attribution: "&copy; OpenStreetMap contributors" }),
    sat: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 20, maxNativeZoom: 19, attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics" })
  };
  var gIllus = L.layerGroup();         // everything drawn by us (land, roads, trees, buildings)
  var gBadges = L.layerGroup().addTo(map);

  // ---- draw the illustrated campus
  function drawLand() {
    // GT road band + centre line
    L.polygon([[31.5742, b.west], [31.5742, b.east], [31.5752, b.east], [31.5752, b.west]], { pane: "p-land", className: "gtroad", interactive: false }).addTo(gIllus);
    L.polyline([[31.5747, b.west], [31.5747, b.east]], { pane: "p-land", className: "gt-center", interactive: false }).addTo(gIllus);
    L.marker([31.5744, 74.3548], { icon: L.divIcon({ className: "", html: '<div class="road-label">Grand Trunk Road (GT Road)</div>', iconSize: [0, 0] }), interactive: false, keyboard: false }).addTo(gIllus);
    // campus ground
    L.polygon([[BOX.south, BOX.west], [BOX.south, BOX.east], [BOX.north, BOX.east], [BOX.north, BOX.west]], { pane: "p-land", className: "land", interactive: false }).addTo(gIllus);
    L.polygon([[BOX.south, BOX.west], [BOX.south, BOX.east], [BOX.north, BOX.east], [BOX.north, BOX.west]], { pane: "p-land", className: "campus-edge", interactive: false, fill: false }).addTo(gIllus);

    // lawn blocks between roads
    var E = {};
    C.edges.forEach(function (e) { E[e[0] + "|" + e[1]] = 1; E[e[1] + "|" + e[0]] = 1; });
    function has(a, c) { return E["c" + a[0] + "r" + a[1] + "|c" + c[0] + "r" + c[1]]; }
    var cells = [];
    for (var ci = 0; ci < C.cols.length - 1; ci++) for (var ri = 0; ri < C.rows.length - 1; ri++) {
      if (has([ci, ri], [ci + 1, ri]) && has([ci, ri + 1], [ci + 1, ri + 1]) && has([ci, ri], [ci, ri + 1]) && has([ci + 1, ri], [ci + 1, ri + 1])) {
        var rc = C.cellRect(ci, ri);
        cells.push(rc);
        var inLat = 6 / MLAT, inLng = 6 / MLNG;
        L.polygon([[rc.south + inLat, rc.west + inLng], [rc.south + inLat, rc.east - inLng], [rc.north - inLat, rc.east - inLng], [rc.north - inLat, rc.west + inLng]],
          { pane: "p-land", className: "lawn", interactive: false }).addTo(gIllus);
      }
    }

    // roads (9 m wide ribbons so they scale with zoom)
    var nodeById = router.nodeById, hw = 4.5;
    // road from gate to GT Road
    var g = nodeById.gate, g2 = nodeById.c2r0;
    L.polygon([ll(g.lat, g.lng, -hw, -8), ll(g.lat, g.lng, hw, -8), ll(g2.lat, g2.lng, hw, 0), ll(g2.lat, g2.lng, -hw, 0)], { pane: "p-land", className: "road", interactive: false }).addTo(gIllus);
    C.edges.forEach(function (e) {
      var a = nodeById[e[0]], c = nodeById[e[1]];
      var dx = (c.lng - a.lng) * MLNG, dy = (c.lat - a.lat) * MLAT, len = Math.sqrt(dx * dx + dy * dy);
      var ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
      var p1 = ll(a.lat, a.lng, -ux * hw + nx * hw, -uy * hw + ny * hw);
      var p2 = ll(a.lat, a.lng, -ux * hw - nx * hw, -uy * hw - ny * hw);
      var p3 = ll(c.lat, c.lng, ux * hw - nx * hw, uy * hw - ny * hw);
      var p4 = ll(c.lat, c.lng, ux * hw + nx * hw, uy * hw + ny * hw);
      L.polygon([p1, p2, p3, p4], { pane: "p-land", className: "road", interactive: false }).addTo(gIllus);
    });
    C.edges.forEach(function (e) {
      var a = nodeById[e[0]], c = nodeById[e[1]];
      L.polyline([[a.lat, a.lng], [c.lat, c.lng]], { pane: "p-land", className: "lane", interactive: false }).addTo(gIllus);
    });
    return cells;
  }

  function drawTrees(cells) {
    var rnd = seeded(20260);
    var blds = C.locations.filter(function (l) { return l.w > 3; });
    function blocked(lat, lng) {
      for (var i = 0; i < blds.length; i++) {
        var l = blds[i];
        var x = (lng - l.lng) * MLNG, y = (lat - l.lat) * MLAT;
        if (Math.abs(x) < l.w / 2 + 9 && y > -l.h / 2 - 9 && y < l.h / 2 + 16) return true;
      }
      return false;
    }
    cells.forEach(function (rc) {
      for (var i = 0; i < 26; i++) {
        var lat = rc.south + (0.1 + 0.8 * rnd()) * (rc.north - rc.south);
        var lng = rc.west + (0.08 + 0.84 * rnd()) * (rc.east - rc.west);
        if (blocked(lat, lng)) continue;
        L.circle([lat, lng], { pane: "p-trees", className: "tree", radius: 2.6 + rnd() * 2.4, interactive: false }).addTo(gIllus);
      }
    });
  }

  function addPart(id, layer) { (parts[id] = parts[id] || { others: [] }).others.push(layer); }

  function drawBuildings() {
    var list = C.locations.filter(function (l) { return l.w > 3; }).sort(function (a, c) { return c.lat - a.lat; }); // north first
    // shadows first
    list.forEach(function (l) {
      if (l.shape !== "rect" && l.shape !== "mosque") return;
      var H = buildingH(l);
      L.polygon(rectPts(l.lat, l.lng, l.w, l.h, H * 0.9, -H * 0.55), { pane: "p-shadow", className: "shadow", interactive: false }).addTo(gIllus);
    });
    list.forEach(function (l) {
      var cls = "cat-" + l.category, H = buildingH(l);
      var roof;
      if (l.shape === "oval") {
        roof = L.polygon(ovalPts(l.lat, l.lng, l.w, l.h, 1), { pane: "p-bld", className: "roof flat " + cls, bubblingMouseEvents: false });
        roof.addTo(gIllus);
        addPart(l.id, L.polygon(ovalPts(l.lat, l.lng, l.w, l.h, 0.82), { pane: "p-bld", className: "field", interactive: false }).addTo(gIllus));
        addPart(l.id, L.polygon(rectPts(l.lat, l.lng, 20, 7), { pane: "p-bld", className: "pitch", interactive: false }).addTo(gIllus));
      } else if (l.shape === "flat") {
        roof = L.polygon(rectPts(l.lat, l.lng, l.w, l.h), { pane: "p-bld", className: "roof flat " + cls, bubblingMouseEvents: false });
        roof.addTo(gIllus);
        for (var i = 1; i < 10; i++) {
          var x = -l.w / 2 + i * (l.w / 10);
          addPart(l.id, L.polyline([ll(l.lat, l.lng, x, -l.h / 2 + 7), ll(l.lat, l.lng, x, l.h / 2 - 7)], { pane: "p-bld", className: "stripe " + cls, interactive: false }).addTo(gIllus));
        }
      } else {
        var lift = H * 0.55, sx = -H * 0.2;
        var base = rectPts(l.lat, l.lng, l.w, l.h, 0, 0), top = rectPts(l.lat, l.lng, l.w, l.h, sx, lift);
        addPart(l.id, L.polygon(base, { pane: "p-bld", className: "base " + cls, interactive: false }).addTo(gIllus));
        addPart(l.id, L.polygon([base[0], base[1], top[1], top[0]], { pane: "p-bld", className: "wall-s " + cls, interactive: false }).addTo(gIllus));
        addPart(l.id, L.polygon([base[1], base[2], top[2], top[1]], { pane: "p-bld", className: "wall-e " + cls, interactive: false }).addTo(gIllus));
        roof = L.polygon(top, { pane: "p-bld", className: "roof " + cls, bubblingMouseEvents: false });
        roof.addTo(gIllus);
        if (l.shape === "mosque") {
          var c = ll(l.lat, l.lng, sx, lift);
          addPart(l.id, L.circle(c, { pane: "p-bld", className: "dome", radius: 8.5, interactive: false }).addTo(gIllus));
          [[-1, 1], [1, 1]].forEach(function (s) {
            addPart(l.id, L.circle(ll(l.lat, l.lng, sx + s[0] * (l.w / 2 - 3), lift + s[1] * (l.h / 2 - 3)), { pane: "p-bld", className: "minaret", radius: 2.2, interactive: false }).addTo(gIllus));
          });
        }
      }
      roof.on("click", function () { selectLocation(l.id, { chat: true }); });
      roof.on("mouseover", function () { hover(l.id, true); });
      roof.on("mouseout", function () { hover(l.id, false); });
      (parts[l.id] = parts[l.id] || { others: [] }).roof = roof;
    });

    // gate pillars
    var gt = router.locById.main_gate;
    [-7, 7].forEach(function (dx) {
      L.polygon(rectPts(gt.lat, gt.lng, 4, 4, dx, 0), { pane: "p-bld", className: "roof cat-gate", interactive: false }).addTo(gIllus);
    });
    L.polyline([ll(gt.lat, gt.lng, -7, 0), ll(gt.lat, gt.lng, 7, 0)], { pane: "p-bld", className: "stripe cat-gate", interactive: false }).addTo(gIllus);
  }

  function drawBadges() {
    C.locations.forEach(function (l) {
      var H = l.w > 3 && l.shape !== "flat" && l.shape !== "oval" ? buildingH(l) : 0;
      var pos = ll(l.lat, l.lng, -H * 0.2, H * 0.55);
      var cat = catOf(l);
      var html = '<div class="bd cat-' + l.category + '"><div class="face">' + cat.icon + '</div><div class="lbl"></div></div>';
      var icon = L.divIcon({ className: "", html: html, iconSize: [30, 30], iconAnchor: [15, 15] });
      var m = L.marker(pos, { icon: icon, title: l.name, keyboard: true, riseOnHover: true });
      m.on("add", function () {
        var lbl = m.getElement() && m.getElement().querySelector(".lbl");
        if (lbl) lbl.textContent = l.short;
      });
      m.on("click", function () { selectLocation(l.id, { chat: true }); });
      m.on("mouseover", function () { hover(l.id, true); });
      m.on("mouseout", function () { hover(l.id, false); });
      (parts[l.id] = parts[l.id] || { others: [] }).badge = m;
      m.addTo(gBadges);
    });
  }

  var cells = drawLand();
  drawTrees(cells);
  drawBuildings();
  drawBadges();
  gIllus.addTo(map);

  // ---- state classes on SVG/DOM elements
  function toggleCls(layer, cls, on) {
    var n = layer && layer.getElement && layer.getElement();
    if (n && n.classList) n.classList.toggle(cls, !!on);
  }
  function hover(id, on) {
    var p = parts[id]; if (!p) return;
    var n = p.badge && p.badge.getElement(); if (n) { var bd = n.querySelector(".bd"); if (bd) bd.classList.toggle("hv", on); }
  }
  function applyStates() {
    Object.keys(parts).forEach(function (id) {
      var p = parts[id], sel = id === selId;
      var dim = reach.on && reach.ids && reach.ids.indexOf(id) === -1;
      toggleCls(p.roof, "sel", sel); toggleCls(p.roof, "dim", dim);
      p.others.forEach(function (o) { toggleCls(o, "dim", dim); });
      var n = p.badge && p.badge.getElement();
      if (n) { var bd = n.querySelector(".bd"); if (bd) { bd.classList.toggle("sel", sel); bd.classList.toggle("dim", dim); } }
    });
  }
  map.on("layeradd", function () { clearTimeout(applyStates._t); applyStates._t = setTimeout(applyStates, 30); });

  // ---- basemap switch
  function setBasemap(m) {
    basemap = m;
    ["street", "sat"].forEach(function (k) { if (map.hasLayer(tiles[k])) map.removeLayer(tiles[k]); });
    if (m === "illus") { if (!map.hasLayer(gIllus)) gIllus.addTo(map); }
    else {
      if (map.hasLayer(gIllus)) map.removeLayer(gIllus);
      tiles[m].addTo(map);
      toast("Real-world map: pins use illustrative positions until the campus is surveyed.");
    }
    document.querySelectorAll("#basemapSeg button").forEach(function (btn) { btn.setAttribute("aria-pressed", String(btn.getAttribute("data-base") === m)); });
    setTimeout(applyStates, 50);
  }
  document.querySelectorAll("#basemapSeg button").forEach(function (btn) {
    btn.addEventListener("click", function () { setBasemap(btn.getAttribute("data-base")); });
  });

  // ---- toast
  var toastT;
  function toast(text) {
    var t = $("toast"); t.textContent = text; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3200);
  }

  // ------------------------------------------------------------------ origin
  var youMarker = null;
  function originPlace() { return origin.id ? origin.id : { lat: origin.lat, lng: origin.lng, name: origin.name }; }
  function originName() { return origin.id ? router.locById[origin.id].name : origin.name; }
  function originPoint() { return origin.id ? { lat: router.locById[origin.id].lat, lng: router.locById[origin.id].lng } : { lat: origin.lat, lng: origin.lng }; }

  C.locations.slice().sort(function (a, c) { return a.name.localeCompare(c.name); }).forEach(function (l) {
    fromSelect.appendChild(el("option", { value: l.id, text: l.name }));
  });
  fromSelect.appendChild(el("option", { value: "", text: "— a point I chose —", disabled: "disabled" }));
  fromSelect.value = origin.id;
  fromSelect.addEventListener("change", function () { if (fromSelect.value) setOrigin({ id: fromSelect.value }); });

  function setOrigin(o) {
    origin = o;
    var p = originPoint();
    if (youMarker) map.removeLayer(youMarker);
    youMarker = L.marker([p.lat, p.lng], {
      icon: L.divIcon({ className: "", html: '<div class="you"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }),
      interactive: false, keyboard: false, zIndexOffset: 500
    }).addTo(map);
    fromSelect.value = o.id || "";
    if (reach.on) updateReach();
  }

  $("gpsBtn").addEventListener("click", function () {
    if (!navigator.geolocation) { say("This browser can't share your location. Pick your start from the list instead."); return; }
    toast("Looking for your position…");
    navigator.geolocation.getCurrentPosition(function (pos) {
      var p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      var inside = p.lat > b.south - 0.002 && p.lat < b.north + 0.002 && p.lng > b.west - 0.002 && p.lng < b.east + 0.002;
      if (!inside) { say("You seem to be outside campus, so I kept your start at " + originName() + "."); return; }
      setOrigin({ lat: p.lat, lng: p.lng, name: "Your location" });
      map.panTo([p.lat, p.lng]);
      say("Got you. Your start is now your current location.");
    }, function () {
      say("I couldn't get your location (permission denied or unavailable). Pick your start from the list.");
    }, { enableHighAccuracy: true, timeout: 10000 });
  });

  map.on("click", function (e) {
    var box = el("div", {}, [el("div", { text: "Custom point" }), el("button", { class: "btn", text: "Start here" })]);
    var pop = L.popup({ className: "map-click-pop" }).setLatLng(e.latlng).setContent(box).openOn(map);
    box.querySelector("button").onclick = function () {
      setOrigin({ lat: e.latlng.lat, lng: e.latlng.lng, name: "Selected point on map" });
      map.closePopup(pop);
      toast("Start set to the point you tapped.");
    };
  });

  // ------------------------------------------------------------------ chat log
  function push(node, cls) {
    var m = el("div", { class: "msg " + cls }, [node]);
    logEl.appendChild(m);
    m.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return m;
  }
  function say(text) { return push(el("p", { text: text }), "bot"); }
  function userSays(text) { push(el("span", { text: text }), "user"); }
  function actionBtn(label, fn, primary) { return el("button", { type: "button", class: primary ? "primary" : "", text: label, onclick: fn }); }
  function pickList(title, locs, onPick) {
    var list = el("div", { class: "pick" });
    locs.forEach(function (l) { list.appendChild(el("button", { type: "button", text: catOf(l).icon + " " + l.name, onclick: function () { onPick(l); } })); });
    push(el("div", {}, [el("p", { class: "meta", text: title }), list]), "bot");
  }

  // ------------------------------------------------------------------ selection + drawer
  function selectLocation(id, opts) {
    opts = opts || {};
    var l = router.locById[id]; if (!l) return;
    if (tour.on) return;
    selId = id;
    applyStates();
    openDrawer(l);
    var H = l.w > 3 ? buildingH(l) : 0;
    var pad = Math.max(l.w || 30, 40) / 2 + 24;
    fitTo(L.latLngBounds(ll(l.lat, l.lng, -pad, -pad * 0.8), ll(l.lat, l.lng, pad, pad * 0.8 + H * 0.5)), 19);
    if (opts.chat) {
      push(el("div", {}, [
        el("h3", { text: catOf(l).icon + " " + l.name }),
        el("p", { class: "meta", text: l.description || catOf(l).label }),
        el("div", { class: "actions" }, [actionBtn("Directions from " + shortName(originName()), function () { goTo(l.id); }, true)])
      ]), "bot");
    }
  }

  function closeDrawer() {
    $("drawer").hidden = true; selId = null; applyStates();
  }

  function openDrawer(l) {
    var cat = catOf(l), info = (INFO.places || {})[l.id] || {};
    var d = $("drawer"); d.innerHTML = "";
    var hero = el("div", { class: "d-hero cat-" + l.category }, [
      el("button", { class: "icon-btn x", type: "button", "aria-label": "Close", text: "✕", onclick: closeDrawer }),
      el("div", { class: "big", text: cat.icon }),
      el("h2", { text: l.name }),
      el("span", { class: "pill", text: cat.label }),
      el("span", { class: "pill", text: l.verified ? "Position verified" : "Approximate position" })
    ]);
    hero.style.setProperty("--cat", cat.color);

    var body = el("div", { class: "d-body" });
    if (l.description) body.appendChild(el("p", { text: l.description, style: "margin:0" }));

    function tagsSection(title, items) {
      if (!items || !items.length) return;
      var t = el("div", { class: "tags" }); items.forEach(function (x) { t.appendChild(el("span", { class: "tag", text: x })); });
      body.appendChild(el("div", {}, [el("h4", { text: title }), t]));
    }
    tagsSection("What's here", info.inside);
    tagsSection(l.category === "department" ? "Study areas" : "At a glance", info.areas);

    var tips = info.tips || INFO.defaultTips[l.category] || INFO.defaultTips.default;
    if (tips && tips.length) {
      var ul = el("ul"); tips.forEach(function (x) { ul.appendChild(el("li", { text: x })); });
      body.appendChild(el("div", {}, [el("h4", { text: "Good to know" }), ul]));
    }

    // family links
    var kids = C.locations.filter(function (x) { return x.parent === l.id; });
    if (kids.length || l.parent) {
      var lr = el("div", { class: "linkrow" });
      kids.forEach(function (k) { lr.appendChild(el("button", { class: "btn", type: "button", text: catOf(k).icon + " " + k.name, onclick: function () { selectLocation(k.id); } })); });
      if (l.parent) { var pl = router.locById[l.parent]; lr.appendChild(el("button", { class: "btn", type: "button", text: "↑ Part of: " + pl.name, onclick: function () { selectLocation(pl.id); } })); }
      body.appendChild(el("div", {}, [el("h4", { text: kids.length ? "Inside this building" : "Related" }), lr]));
    }

    // nearby (walking)
    var near = router.nearest(l.id, function (x) { return x.id !== l.id && x.category !== "gate"; }, 4).filter(function (n) { return n.distance <= 300; });
    if (near.length) {
      var nr = el("div", { class: "linkrow" });
      near.forEach(function (n) { nr.appendChild(el("button", { class: "btn", type: "button", text: catOf(n.location).icon + " " + n.location.short + " · " + fmtDist(n.distance), onclick: function () { selectLocation(n.location.id); } })); });
      body.appendChild(el("div", {}, [el("h4", { text: "Nearby (short walk)" }), nr]));
    }

    body.appendChild(el("div", { class: "actions" }, [
      actionBtn("Directions from " + shortName(originName()), function () { goTo(l.id); }, true),
      actionBtn("Start here", function () { setOrigin({ id: l.id }); toast("Start set to " + l.short + "."); })
    ]));
    if (!l.verified) body.appendChild(el("div", { class: "warn-line", text: "Position and contents are illustrative and still to be confirmed on campus." }));

    d.appendChild(hero); d.appendChild(body); d.hidden = false; d.scrollTop = 0;
  }

  // ------------------------------------------------------------------ routing
  function clearRoute() {
    if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
    stopWalk(); lastRoute = null; $("hud").hidden = true;
  }

  function drawRoute(r) {
    if (routeLayer) map.removeLayer(routeLayer);
    stopWalk();
    var pts = r.coords.map(function (p) { return [p.lat, p.lng]; });
    routeLayer = L.layerGroup([
      L.polyline(pts, { pane: "p-route", className: "route-casing", interactive: false }),
      L.polyline(pts, { pane: "p-route", className: "route-main", interactive: false }),
      L.polyline(pts, { pane: "p-route", className: "route-flow", interactive: false })
    ]).addTo(map);
    fitTo(L.latLngBounds(pts).pad(0.15), 19);
  }

  function stopWalk() {
    if (walkAnim) cancelAnimationFrame(walkAnim); walkAnim = null;
    if (walker) { map.removeLayer(walker); walker = null; }
  }
  function previewWalk() {
    if (!lastRoute) return;
    stopWalk();
    var pts = lastRoute.coords, seg = [], total = 0;
    for (var i = 1; i < pts.length; i++) { var d = Router.haversine(pts[i - 1], pts[i]); seg.push(d); total += d; }
    walker = L.marker([pts[0].lat, pts[0].lng], { icon: L.divIcon({ className: "", html: '<div class="walker">🚶</div>', iconSize: [24, 24], iconAnchor: [12, 20] }), interactive: false, zIndexOffset: 1500 }).addTo(map);
    var dur = Math.min(16000, Math.max(4500, (total / 70) * 1000)), t0 = null;
    function frame(ts) {
      if (t0 === null) t0 = ts;
      var f = Math.min(1, (ts - t0) / dur), want = f * total, acc = 0, k = 0;
      while (k < seg.length - 1 && acc + seg[k] < want) { acc += seg[k]; k++; }
      var u = seg[k] ? (want - acc) / seg[k] : 1;
      var a = pts[k], c = pts[k + 1];
      walker.setLatLng([a.lat + (c.lat - a.lat) * u, a.lng + (c.lng - a.lng) * u]);
      if (f < 1) walkAnim = requestAnimationFrame(frame); else setTimeout(stopWalk, 1200);
    }
    walkAnim = requestAnimationFrame(frame);
  }

  function shareLink() {
    if (!lastRoute) return;
    var from = origin.id ? origin.id : "@" + origin.lat.toFixed(5) + "," + origin.lng.toFixed(5);
    var url = location.href.split("#")[0] + "#r=" + encodeURIComponent(from) + "~" + encodeURIComponent(lastRoute.to.id || "");
    safe(function () { history.replaceState(null, "", "#r=" + encodeURIComponent(from) + "~" + encodeURIComponent(lastRoute.to.id || "")); });
    var done = function () { toast("Route link copied - send it to a friend!"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { toast(url); });
    else toast(url);
  }

  function showHud(r) {
    var h = $("hud"); h.innerHTML = "";
    h.appendChild(el("div", { class: "grow" }, [
      el("div", { class: "route-title", text: r.from.name + "  →  " + r.to.name }),
      el("div", {}, [el("span", { class: "big", text: fmtDist(r.distance) }), el("span", { class: "sub", text: "  ·  about " + fmtTime(r.minutes) })]),
      el("div", { class: "next", text: "Next: " + r.steps[0].text })
    ]));
    h.appendChild(el("div", { class: "btns" }, [
      el("button", { class: "btn primary", type: "button", text: "▶ Preview", onclick: previewWalk }),
      el("button", { class: "btn", type: "button", text: "🔗 Share", onclick: shareLink }),
      el("button", { class: "btn", type: "button", text: "✕", "aria-label": "Clear route", onclick: clearRoute })
    ]));
    h.hidden = tour.on;
  }

  function showRoute(fromPlace, toId, opts) {
    opts = opts || {};
    var r = router.route(fromPlace, toId);
    if (!r) { say("I couldn't find a walkable path for that trip."); return null; }
    lastRoute = r;
    drawRoute(r);
    if (!opts.silent) {
      var steps = el("ol");
      r.steps.forEach(function (s) { steps.appendChild(el("li", { text: s.text })); });
      push(el("div", {}, [
        el("h3", { text: r.from.name + "  →  " + r.to.name }),
        el("p", { class: "meta", text: fmtDist(r.distance) + " · about " + fmtTime(r.minutes) }),
        steps,
        el("div", { class: "actions" }, [actionBtn("▶ Preview walk", previewWalk, true), actionBtn("🔗 Share", shareLink)])
      ]), "bot");
      showHud(r);
    }
    return r;
  }

  function goTo(id, fromLoc) {
    var from = fromLoc ? fromLoc.id : originPlace();
    if (typeof from === "string" && from === id) { say("You're already at " + router.locById[id].name + "."); return; }
    if (tour.on) endTour();
    $("drawer").hidden = true; selId = id; applyStates();
    showRoute(from, id);
  }

  // ------------------------------------------------------------------ walking range
  var ring = null;
  function updateReach() {
    if (ring) { map.removeLayer(ring); ring = null; }
    if (!reach.on) { reach.ids = null; applyStates(); $("reachCard").hidden = true; $("reachBtn").setAttribute("aria-pressed", "false"); return; }
    var res = router.reach(originPlace(), reach.minutes);
    reach.ids = res.ids;
    var p = originPoint();
    ring = L.circle([p.lat, p.lng], { radius: res.limitMeters, className: "ring", interactive: false, pane: "p-route" }).addTo(map);
    $("reachMin").textContent = reach.minutes + " min";
    $("reachSummary").textContent = res.ids.length + " of " + C.locations.length + " places within " + reach.minutes + " min of " + shortName(originName()) + ".";
    $("reachCard").hidden = false;
    $("reachBtn").setAttribute("aria-pressed", "true");
    applyStates();
  }
  function setReach(on, minutes) {
    reach.on = on; if (minutes) reach.minutes = minutes;
    $("reachRange").value = reach.minutes;
    updateReach();
    if (on) fitTo(ring.getBounds().pad(0.1), 18.5);
  }
  $("reachBtn").addEventListener("click", function () { setReach(!reach.on); });
  $("reachRange").addEventListener("input", function (e) { reach.minutes = parseInt(e.target.value, 10); updateReach(); });

  // ------------------------------------------------------------------ freshers' tour
  function startTour() {
    clearRoute(); closeDrawer(); setReach(false);
    tour.on = true; tour.i = 0;
    $("hud").hidden = true; $("tourbar").hidden = false;
    tourStep();
  }
  function endTour() {
    tour.on = false; $("tourbar").hidden = true; selId = null; applyStates();
  }
  function tourStep() {
    var s = INFO.tour[tour.i], bar = $("tourbar"), n = INFO.tour.length;
    bar.innerHTML = "";
    var dots = el("div", { class: "dots" });
    for (var k = 0; k < n; k++) dots.appendChild(el("i", { class: k === tour.i ? "on" : k < tour.i ? "done" : "" }));
    bar.appendChild(el("h3", { text: (tour.i + 1) + "/" + n + " · " + s.title }));
    bar.appendChild(el("p", { text: s.text }));

    if (s.id === "__finish__") {
      clearRoute();
      var dd = el("div", { class: "tour-dept" });
      C.locations.filter(function (l) { return l.category === "department"; }).forEach(function (l) {
        dd.appendChild(el("button", { class: "btn", type: "button", text: l.short, onclick: function () { endTour(); goTo(l.id); } }));
      });
      bar.appendChild(dd);
      fitTo(campusBounds, 18);
    } else {
      var l = router.locById[s.id];
      selId = s.id; applyStates();
      var prev = tour.i > 0 ? INFO.tour[tour.i - 1].id : null;
      if (prev && prev !== "__finish__") showRoute(prev, s.id, { silent: true });
      else { if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; } fitTo(L.latLngBounds(ll(l.lat, l.lng, -70, -60), ll(l.lat, l.lng, 70, 80)), 19); }
    }
    bar.appendChild(el("div", { class: "tour-foot" }, [
      dots,
      el("div", { class: "btns", style: "display:flex;gap:6px" }, [
        tour.i > 0 ? el("button", { class: "btn", type: "button", text: "← Back", onclick: function () { tour.i--; tourStep(); } }) : null,
        tour.i < n - 1 ? el("button", { class: "btn primary", type: "button", text: "Next →", onclick: function () { tour.i++; tourStep(); } }) : null,
        el("button", { class: "btn", type: "button", text: "Exit", onclick: function () { endTour(); clearRoute(); } })
      ])
    ]));
  }
  $("tourBtn").addEventListener("click", function () { tour.on ? (endTour(), clearRoute()) : startTour(); });

  // ------------------------------------------------------------------ about
  function openAbout() {
    var A = INFO.about, body = $("aboutBody"); body.innerHTML = "";
    var dl = el("dl", { class: "facts" });
    A.facts.forEach(function (f) { dl.appendChild(el("dt", { text: f.k })); dl.appendChild(el("dd", { text: f.v })); });
    body.appendChild(el("h2", { id: "aboutTitle", text: A.title }));
    body.appendChild(dl);
    body.appendChild(el("p", { class: "meta", text: A.source }));
    body.appendChild(el("div", { class: "warn-line", text: "Prototype note: the map is an illustration. Building positions, hostel names and room details are drafts to be confirmed on campus." }));
    $("aboutModal").hidden = false;
  }
  $("aboutBtn").addEventListener("click", openAbout);
  $("aboutClose").addEventListener("click", function () { $("aboutModal").hidden = true; });
  $("aboutModal").addEventListener("click", function (e) { if (e.target === $("aboutModal")) $("aboutModal").hidden = true; });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { $("aboutModal").hidden = true; if (!$("drawer").hidden) closeDrawer(); } });

  // ------------------------------------------------------------------ category filters
  var present = {};
  C.locations.forEach(function (l) { present[l.category] = true; });
  Object.keys(C.categories).filter(function (k) { return present[k]; }).forEach(function (k) {
    activeCats[k] = true;
    var btn = el("button", { type: "button", "aria-pressed": "true", text: C.categories[k].icon + " " + C.categories[k].label });
    btn.addEventListener("click", function () {
      activeCats[k] = !activeCats[k];
      btn.setAttribute("aria-pressed", String(activeCats[k]));
      C.locations.forEach(function (l) {
        if (l.category !== k) return;
        var m = parts[l.id].badge;
        if (activeCats[k]) m.addTo(gBadges); else gBadges.removeLayer(m);
      });
      applyStates();
    });
    $("chips").appendChild(btn);
  });

  // ------------------------------------------------------------------ query handling
  var HELP = [
    "Where is the library?",
    "How do I get from the main gate to the CS department?",
    "Tell me about the mechanical department",
    "Nearest cafeteria / ATM / mosque",
    "What can I reach within 5 minutes?",
    "Give me a campus tour",
    "masjid kahan hai  (Roman Urdu works too)"
  ];

  function handle(q) {
    if (!q.trim()) return;
    userSays(q);
    var p = nlp.parse(q);

    if (p.intent === "help") {
      var ul = el("ul"); HELP.forEach(function (h) { ul.appendChild(el("li", { text: h })); });
      push(el("div", {}, [el("p", { text: "I can find places, plan walking routes, show what's inside buildings and give you a freshers' tour. Try:" }), ul]), "bot");
      return;
    }
    if (p.intent === "tour") { say("Starting the freshers' tour - use Next to move along the campus."); startTour(); return; }
    if (p.intent === "reach") {
      setReach(true, p.minutes);
      var ids = reach.ids.map(function (id) { return router.locById[id]; }).filter(function (l) { return l.id !== origin.id; });
      pickList(ids.length + " places within " + p.minutes + " min of " + shortName(originName()) + ":", ids.slice(0, 10), function (l) { selectLocation(l.id); });
      return;
    }
    if (p.intent === "locate" || p.intent === "info") {
      selectLocation(p.target.id, { chat: true });
      if (p.ambiguous && p.ambiguous.length > 1) pickList("Did you mean one of these?", p.ambiguous, function (l) { selectLocation(l.id); });
      return;
    }
    if (p.intent === "route") {
      var to = p.to || p.target, from = p.from || null;
      if (!to) { say("Where would you like to go?"); return; }
      if (from && to.id === from.id) { say("Those are the same place: " + to.name + "."); return; }
      if (p.ambiguous && p.ambiguous.length > 1) {
        pickList("I found more than one match. Which did you mean?", p.ambiguous, function (l) { goTo(l.id, from); });
        return;
      }
      goTo(to.id, from);
      return;
    }
    if (p.intent === "nearest") {
      var fromPlace = p.from ? p.from.id : originPlace();
      var res = router.nearest(fromPlace, p.category, 3);
      if (!res.length) { say("I don't have any " + (C.categories[p.category] || {}).label + " listed yet."); return; }
      var list = el("div", { class: "pick" });
      res.forEach(function (x, i) {
        list.appendChild(el("button", { type: "button", text: (i === 0 ? "★ " : "") + x.location.name + " · " + fmtDist(x.distance) + " (" + fmtTime(x.minutes) + ")", onclick: function () { goTo(x.location.id, p.from); } }));
      });
      push(el("div", {}, [el("p", { text: "Closest " + C.categories[p.category].label.toLowerCase() + " from " + (p.from ? p.from.name : originName()) + ":" }), list]), "bot");
      goTo(res[0].location.id, p.from);
      return;
    }
    if (p.intent === "list") {
      var locs = C.locations.filter(function (l) { return l.category === p.category; });
      pickList(C.categories[p.category].label + " (" + locs.length + "):", locs, function (l) { selectLocation(l.id, { chat: true }); });
      return;
    }
    var sug = nlp.suggest(q, 4);
    if (sug.length) pickList("I'm not sure what you meant. Did you mean:", sug, function (l) { selectLocation(l.id, { chat: true }); });
    else say("Sorry, I couldn't find that on campus. Try a department, lab, hostel, library, cafeteria… or type “help”.");
  }

  // ---- search box + autocomplete
  var activeIdx = -1;
  function renderSuggest() {
    var q = askInput.value;
    suggestEl.innerHTML = ""; activeIdx = -1;
    if (q.trim().length < 2) { suggestEl.hidden = true; return; }
    var s = nlp.suggest(q, 6);
    if (!s.length) { suggestEl.hidden = true; return; }
    s.forEach(function (l) {
      var li = el("li", { text: catOf(l).icon + " " + l.name });
      li.addEventListener("mousedown", function (ev) {
        ev.preventDefault(); askInput.value = ""; suggestEl.hidden = true;
        userSays(l.name); selectLocation(l.id, { chat: true });
      });
      suggestEl.appendChild(li);
    });
    suggestEl.hidden = false;
  }
  askInput.addEventListener("input", renderSuggest);
  askInput.addEventListener("blur", function () { setTimeout(function () { suggestEl.hidden = true; }, 120); });
  askInput.addEventListener("keydown", function (e) {
    var items = suggestEl.querySelectorAll("li");
    if (suggestEl.hidden || !items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = (activeIdx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items.forEach(function (li, i) { li.classList.toggle("active", i === activeIdx); });
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault(); items[activeIdx].dispatchEvent(new MouseEvent("mousedown"));
    }
  });
  $("askForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var q = askInput.value; askInput.value = ""; suggestEl.hidden = true;
    handle(q);
  });
  $("quick").addEventListener("click", function (e) {
    var q = e.target.getAttribute && e.target.getAttribute("data-q");
    if (q) handle(q);
  });

  // ---- voice
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { $("micBtn").hidden = true; }
  else {
    $("micBtn").addEventListener("click", function () {
      var rec = new SR(), btn = $("micBtn");
      rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 1;
      rec.onstart = function () { btn.classList.add("listening"); toast("Listening… ask your question"); };
      rec.onend = function () { btn.classList.remove("listening"); };
      rec.onerror = function () { btn.classList.remove("listening"); toast("Couldn't hear that - try again or type."); };
      rec.onresult = function (ev) { handle(ev.results[0][0].transcript); };
      safe(function () { rec.start(); });
    });
  }

  $("collapseBtn").addEventListener("click", function () {
    var p = $("panel"); p.classList.toggle("collapsed");
    $("collapseBtn").textContent = p.classList.contains("collapsed") ? "▴" : "▾";
  });

  // ------------------------------------------------------------------ boot
  setOrigin({ id: "main_gate" });
  var fact = INFO.about.didYouKnow[Math.floor(Math.random() * INFO.about.didYouKnow.length)];
  push(el("div", {}, [
    el("p", { text: "Welcome to UET Lahore! Ask me where something is, how to get there, or what's inside a building. Your start is set to " + originName() + "." }),
    el("p", { class: "meta", text: "Did you know? " + fact })
  ]), "bot");

  // deep link: #r=<fromId or @lat,lng>~<toId>
  safe(function () {
    var m = location.hash.match(/^#r=([^~]+)~(.+)$/);
    if (!m) return;
    var f = decodeURIComponent(m[1]), t = decodeURIComponent(m[2]);
    if (!router.locById[t]) return;
    if (f.charAt(0) === "@") { var xy = f.slice(1).split(","); setOrigin({ lat: +xy[0], lng: +xy[1], name: "Shared start point" }); }
    else if (router.locById[f]) setOrigin({ id: f });
    setTimeout(function () { goTo(t); }, 300);
  });

  window.__uet = { map: map, router: router, nlp: nlp, handle: handle, parts: parts, setBasemap: setBasemap, state: function () { return { selId: selId, reach: reach, tour: tour, origin: origin, basemap: basemap }; } };
})();
