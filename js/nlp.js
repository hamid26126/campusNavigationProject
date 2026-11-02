/*
 * Lightweight rule-based NLP for campus queries (no external services).
 *
 * Pipeline:  normalise -> intent detection -> entity linking (fuzzy) ->
 *            role assignment (from / to) -> structured result
 *
 * Understands English plus a little Roman Urdu ("library kahan hai",
 * "cafe kaise jaun", "hostel tak").
 */
(function (root) {
  var STOP = {
    the: 1, a: 1, an: 1, is: 1, are: 1, of: 1, in: 1, on: 1, at: 1, me: 1, i: 1, my: 1,
    please: 1, pls: 1, plz: 1, can: 1, you: 1, could: 1, do: 1, does: 1, am: 1, it: 1,
    there: 1, tell: 1, show: 1, want: 1, need: 1, im: 1, hai: 1, hain: 1, ka: 1, ki: 1,
    ko: 1, se: 1, mein: 1, me_: 1, ye: 1, yeh: 1, wo: 1, woh: 1, to_: 1
  };

  var CATEGORY_WORDS = {
    hostel: ["hostel", "hostels", "dorm", "dormitory", "residence"],
    food: ["food", "cafe", "cafeteria", "canteen", "eat", "lunch", "tea", "chai", "snacks", "khana", "mess"],
    library: ["library", "libraries"],
    prayer: ["mosque", "masjid", "namaz", "prayer", "pray", "jummah"],
    bank: ["atm", "bank", "cash"],
    medical: ["medical", "dispensary", "doctor", "hospital", "clinic", "firstaid"],
    sports: ["sports", "ground", "gym", "gymnasium", "playground", "cricket", "football", "badminton"],
    parking: ["parking"],
    gate: ["gate", "gates", "entrance", "exit"],
    lab: ["lab", "labs", "laboratory", "laboratories"],
    department: ["department", "departments", "dept", "depts", "faculty", "faculties"],
    classroom: ["classroom", "classrooms", "class", "lecture", "lt"],
    admin: ["office", "offices", "administration", "admin"],
    transport: ["bus", "transport", "shuttle"],
    service: ["photocopy", "printing", "print", "xerox", "stationery", "post", "wifi"]
  };

  var RE = {
    help: /^(help|hi|hello|hey|salam|assalam|assalamualaikum|salaam|\?)$|\b(what can you do|how do you work|how to use|kya kar sakte)\b/,
    list: /\b(list|all|every|show all|saare|sab)\b/,
    nearest: /\b(nearest|closest|nearby|near me|near here|around me|around here|paas|qareeb|nazdeek)\b/,
    // "from X to Y"
    fromTo: /\bfrom\s+(.+?)\s+(?:to|till|until)\s+(.+)$/,
    // "X to Y"  (guarded: only used if both sides link to places)
    xToY: /^(.+?)\s+(?:to|se)\s+(.+)$/,
    route: /\b(route|direction|directions|navigate|navigation|take me|path|way|how (?:do i|to|can i|should i) (?:get|go|reach|walk)|get to|go to|reach|walk to|jaun|jana|jaana|pohanch|kaise|rasta|raasta)\b/,
    locate: /\b(where|wheres|location|locate|find|kahan|kidhar|kahaan|which building|konsi|kaun si)\b/,
    info: /\b(about|info|information|details|detail|facilities|inside|whats in|what is in|what is there|tell me|batao|bataiye|malumat)\b/,
    tour: /\b(tour|show me around|guide me|guided|orientation|fresher|freshers|campus walk)\b/,
    reach: /\b(?:within|in|under)\s+(\d{1,2})\s*(?:min|mins|minute|minutes)\b/
  };

  function normalize(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokens(s) { return normalize(s).split(" ").filter(Boolean); }

  function lev(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      var cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  // token similarity 0..1 (exact, prefix, or small typo)
  function tokSim(a, b) {
    if (a === b) return 1;
    if (a.length < 3 || b.length < 3) return 0;
    if (a.length >= 4 && b.indexOf(a) === 0 || b.length >= 4 && a.indexOf(b) === 0) return 0.85;
    var maxd = Math.max(a.length, b.length) >= 7 ? 2 : 1;
    var d = lev(a, b);
    return d <= maxd ? 1 - d / Math.max(a.length, b.length) : 0;
  }

  // Score how well a phrase (token list) matches one candidate string. 0..1
  function phraseScore(pt, candidate) {
    var ct = tokens(candidate);
    if (!ct.length || !pt.length) return 0;
    if (pt.join(" ") === ct.join(" ")) return 1;
    // each candidate token must be matched by some phrase token
    var total = 0, matched = 0;
    ct.forEach(function (c) {
      var best = 0;
      pt.forEach(function (p) { best = Math.max(best, tokSim(p, c)); });
      total += best;
      if (best > 0) matched++;
    });
    var coverage = total / ct.length; // how much of candidate is explained
    var used = 0;
    pt.forEach(function (p) {
      var best = 0;
      ct.forEach(function (c) { best = Math.max(best, tokSim(p, c)); });
      if (best > 0) used++;
    });
    var precision = used / pt.length; // how much of phrase is explained
    if (matched < ct.length && ct.length > 1 && coverage < 0.7) return 0;
    return 0.9 * Math.min(coverage, precision) + 0.1 * Math.max(coverage, precision) - (ct.length === 1 && pt.length > 1 ? 0.05 : 0);
  }

  function NLP(campus) {
    this.campus = campus;
    this.index = campus.locations.map(function (l) {
      var names = [l.name].concat(l.aliases || []);
      // also index the part of the name in brackets-free form
      names.push(l.name.replace(/\(.*?\)/g, ""));
      return { loc: l, names: names.map(function (n) { return normalize(n); }) };
    });
  }

  // Best location matches for a token phrase
  NLP.prototype.matchPhrase = function (pt) {
    var res = [];
    this.index.forEach(function (e) {
      var best = 0;
      e.names.forEach(function (n) { best = Math.max(best, phraseScore(pt, n)); });
      if (best > 0.55) res.push({ loc: e.loc, score: best });
    });
    res.sort(function (a, b) { return b.score - a.score; });
    return res;
  };

  // Slide windows over the tokens and pick best non-overlapping entities
  NLP.prototype.findEntities = function (toks) {
    var self = this, cands = [];
    for (var len = Math.min(5, toks.length); len >= 1; len--) {
      for (var s = 0; s + len <= toks.length; s++) {
        var win = toks.slice(s, s + len);
        if (win.every(function (t) { return STOP[t]; })) continue;
        var m = self.matchPhrase(win);
        if (m.length) {
          cands.push({ start: s, end: s + len, matches: m, score: m[0].score + 0.03 * len });
        }
      }
    }
    cands.sort(function (a, b) { return b.score - a.score; });
    var taken = {}, chosen = [];
    cands.forEach(function (c) {
      for (var i = c.start; i < c.end; i++) if (taken[i]) return;
      if (c.matches[0].score < 0.7) return;
      for (var j = c.start; j < c.end; j++) taken[j] = true;
      chosen.push(c);
    });
    chosen.sort(function (a, b) { return a.start - b.start; });
    return chosen;
  };

  NLP.prototype.detectCategory = function (toks) {
    var found = null;
    Object.keys(CATEGORY_WORDS).forEach(function (cat) {
      CATEGORY_WORDS[cat].forEach(function (w) {
        toks.forEach(function (t) { if (!found && (t === w || (t.length > 4 && tokSim(t, w) >= 0.8))) found = cat; });
      });
    });
    return found;
  };

  function summarise(c) {
    var top = c.matches[0];
    var amb = c.matches.filter(function (m) { return top.score - m.score < 0.04; });
    return {
      location: top.loc,
      score: top.score,
      alternatives: amb.length > 1 ? amb.map(function (m) { return m.loc; }) : []
    };
  }

  /**
   * parse(query) ->
   *  { intent: 'help'|'route'|'locate'|'nearest'|'list'|'unknown',
   *    from: loc|null, to: loc|null, target: loc|null, category: string|null,
   *    ambiguous: [loc], confidence: 0..1, normalized }
   */
  NLP.prototype.parse = function (query) {
    var norm = normalize(query);
    var out = {
      intent: "unknown", from: null, to: null, target: null, category: null,
      ambiguous: [], confidence: 0, normalized: norm
    };
    if (!norm) return out;
    if (RE.help.test(norm)) { out.intent = "help"; out.confidence = 1; return out; }

    if (RE.tour.test(norm)) { out.intent = "tour"; out.confidence = 0.9; return out; }
    var rm = norm.match(RE.reach);
    if (rm && /\b(reach|reachable|walk|within|around|near|what)\b/.test(norm)) {
      out.intent = "reach"; out.minutes = Math.min(15, Math.max(1, parseInt(rm[1], 10))); out.confidence = 0.85;
      return out;
    }

    var toks = norm.split(" ");
    var hasInfo = RE.info.test(norm);
    var hasRoute = RE.route.test(norm);
    var hasLocate = RE.locate.test(norm);
    var hasNearest = RE.nearest.test(norm);
    var hasList = RE.list.test(norm);

    // 1) explicit "from X to Y"
    var m = norm.match(RE.fromTo);
    if (m) {
      var a = this.resolveSide(m[1]), b = this.resolveSide(m[2]);
      if (a && b) {
        out.intent = "route"; out.from = a.location; out.to = b.location;
        out.ambiguous = (a.alternatives || []).concat(b.alternatives || []);
        out.confidence = Math.min(a.score, b.score);
        return out;
      }
    }

    // 2) entities anywhere in the sentence
    var ents = this.findEntities(toks);
    var cat = this.detectCategory(toks);

    // explicit "nearest <category> [from/to X]" wins over generic X-to-Y
    if (hasNearest && cat) {
      out.intent = "nearest"; out.category = cat; out.confidence = 0.8;
      var origin = ents.filter(function (c) { return c.matches[0].loc.category !== cat; })[0];
      if (origin) out.from = summarise(origin).location;
      return out;
    }

    // "X to Y" without "from"
    if (ents.length >= 2) {
      var firstTo = null;
      for (var i = 0; i < toks.length; i++) if (toks[i] === "to" || toks[i] === "se") { firstTo = i; break; }
      var A = summarise(ents[0]), B = summarise(ents[ents.length - 1]);
      var between = firstTo !== null && ents[0].end <= firstTo && ents[ents.length - 1].start >= firstTo;
      if (between || hasRoute) {
        // keep order unless Urdu-style "B se A"? ("se" = from)
        var flip = firstTo !== null && toks[firstTo] === "se" ? false : false;
        out.intent = "route"; out.from = A.location; out.to = B.location;
        // phrasing like "to Y from X" -> swap
        var fromIdx = toks.indexOf("from");
        if (fromIdx !== -1 && fromIdx < ents[ents.length - 1].start && fromIdx >= ents[0].end) {
          out.from = B.location; out.to = A.location;
        }
        out.ambiguous = (A.alternatives || []).concat(B.alternatives || []);
        out.confidence = Math.min(A.score, B.score);
        return out;
      }
    }

    // nearest <category> [from X]
    if (hasNearest || (cat && !ents.length && !hasList)) {
      if (cat) {
        out.intent = "nearest"; out.category = cat;
        if (ents.length) { var o = summarise(ents[0]); out.from = o.location; }
        out.confidence = 0.8;
        return out;
      }
    }

    // list all <category>
    if (hasList && cat) {
      out.intent = "list"; out.category = cat; out.confidence = 0.85;
      return out;
    }

    if (ents.length) {
      var e = summarise(ents[0]);
      out.target = e.location; out.to = e.location;
      out.ambiguous = e.alternatives || [];
      out.confidence = e.score;
      if (hasInfo && !hasRoute && !hasLocate) out.intent = "info";
      else if (hasRoute && !hasLocate) out.intent = "route";
      else out.intent = "locate";
      // "route to X from Y" with one linked entity + trailing "from here/gate" is handled by UI context
      return out;
    }

    if (cat) {
      out.intent = hasList || !hasNearest ? "list" : "nearest";
      out.category = cat; out.confidence = 0.6;
      return out;
    }
    return out;
  };

  NLP.prototype.resolveSide = function (text) {
    var toks = tokens(text).filter(function (t) { return !STOP[t]; });
    if (!toks.length) return null;
    var m = this.matchPhrase(toks);
    if (!m.length || m[0].score < 0.7) return null;
    var amb = m.filter(function (x) { return m[0].score - x.score < 0.04; });
    return { location: m[0].loc, score: m[0].score, alternatives: amb.length > 1 ? amb.map(function (x) { return x.loc; }) : [] };
  };

  // Suggest locations for the search box while typing
  NLP.prototype.suggest = function (text, limit) {
    var toks = tokens(text);
    if (!toks.length) return [];
    var last = toks[toks.length - 1];
    var res = [];
    this.index.forEach(function (e) {
      var best = 0;
      e.names.forEach(function (n) {
        var s = phraseScore(toks, n);
        if (n.indexOf(normalize(text)) !== -1) s = Math.max(s, 0.8);
        else if (last.length >= 2 && n.split(" ").some(function (w) { return w.indexOf(last) === 0; })) s = Math.max(s, 0.6);
        best = Math.max(best, s);
      });
      if (best >= 0.55) res.push({ loc: e.loc, score: best });
    });
    res.sort(function (a, b) { return b.score - a.score; });
    return res.slice(0, limit || 6).map(function (r) { return r.loc; });
  };

  NLP.normalize = normalize;
  NLP.lev = lev;

  if (typeof module !== "undefined" && module.exports) module.exports = NLP;
  else root.NLP = NLP;
})(typeof window !== "undefined" ? window : globalThis);
