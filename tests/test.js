// Run with:  node tests/test.js
const assert = require("assert");
const CAMPUS = require("../js/campus-data.js");
const INFO = require("../js/campus-info.js");
const Router = require("../js/router.js");
const NLP = require("../js/nlp.js");

const router = new Router(CAMPUS);
const nlp = new NLP(CAMPUS);
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log("  ok   " + name); }
  catch (e) { fail++; console.log("  FAIL " + name + "\n       " + e.message); }
}

// footprint rectangle in metres, relative to a fixed origin
const MLAT = CAMPUS.mPerDegLat, MLNG = CAMPUS.mPerDegLng;
function rect(l) {
  const x = (l.lng - CAMPUS.center.lng) * MLNG, y = (l.lat - CAMPUS.center.lat) * MLAT;
  return { x0: x - l.w / 2, x1: x + l.w / 2, y0: y - l.h / 2, y1: y + l.h / 2 };
}
const buildings = CAMPUS.locations.filter(l => l.w > 3);

console.log("Data integrity");
t("unique location ids", () => {
  const ids = CAMPUS.locations.map(l => l.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});
t("every location inside campus bounds", () => {
  const b = CAMPUS.bounds;
  CAMPUS.locations.forEach(l => assert(l.lat > b.south && l.lat < b.north && l.lng > b.west && l.lng < b.east, l.id));
});
t("every category known", () => {
  CAMPUS.locations.forEach(l => assert(CAMPUS.categories[l.category], l.id));
});
t("every location has a short label", () => {
  CAMPUS.locations.forEach(l => assert(l.short && l.short.length <= 22, l.id + " short: " + l.short));
});
t("parent references resolve", () => {
  const ids = new Set(CAMPUS.locations.map(l => l.id));
  CAMPUS.locations.forEach(l => { if (l.parent) assert(ids.has(l.parent), l.id + " -> " + l.parent); });
});
t("road graph is connected", () => {
  const seen = new Set(["gate"]); const q = ["gate"];
  while (q.length) { const x = q.pop(); router.adj[x].forEach(e => { if (!seen.has(e.to)) { seen.add(e.to); q.push(e.to); } }); }
  assert.strictEqual(seen.size, CAMPUS.nodes.length);
});
t("buildings do not overlap each other (>= 6 m gap)", () => {
  for (let i = 0; i < buildings.length; i++) for (let j = i + 1; j < buildings.length; j++) {
    const a = rect(buildings[i]), b = rect(buildings[j]), g = 6;
    const overlap = a.x0 < b.x1 + g && b.x0 < a.x1 + g && a.y0 < b.y1 + g && b.y0 < a.y1 + g;
    assert(!overlap, buildings[i].id + " overlaps " + buildings[j].id);
  }
});
t("buildings stay inside their block (>= 8 m from roads)", () => {
  buildings.forEach(l => {
    const rc = CAMPUS.cellRect(l.cell[0], l.cell[1]);
    const r = rect(l);
    const cx0 = (rc.west - CAMPUS.center.lng) * MLNG, cx1 = (rc.east - CAMPUS.center.lng) * MLNG;
    const cy0 = (rc.south - CAMPUS.center.lat) * MLAT, cy1 = (rc.north - CAMPUS.center.lat) * MLAT;
    assert(r.x0 >= cx0 + 8 && r.x1 <= cx1 - 8 && r.y0 >= cy0 + 8 && r.y1 <= cy1 - 8, l.id + " crowds a road");
  });
});
t("every block that holds a building is bordered by roads on all 4 sides", () => {
  const E = new Set(CAMPUS.edges.map(e => e[0] + "|" + e[1]).concat(CAMPUS.edges.map(e => e[1] + "|" + e[0])));
  buildings.forEach(l => {
    const [c, r] = l.cell;
    const k = (a, b) => E.has("c" + a[0] + "r" + a[1] + "|c" + b[0] + "r" + b[1]);
    assert(k([c, r], [c + 1, r]) && k([c, r + 1], [c + 1, r + 1]) && k([c, r], [c, r + 1]) && k([c + 1, r], [c + 1, r + 1]), l.id + " block " + l.cell);
  });
});
t("info: tour stops and place info reference real ids", () => {
  const ids = new Set(CAMPUS.locations.map(l => l.id));
  INFO.tour.forEach(s => assert(s.id === "__finish__" || ids.has(s.id), s.id));
  Object.keys(INFO.places).forEach(id => assert(ids.has(id), "info for unknown " + id));
});

console.log("Routing");
t("gate -> library: sensible distance and arrival step", () => {
  const r = router.route("main_gate", "library");
  assert(r && r.distance > 100 && r.distance < 700, "distance " + (r && r.distance));
  assert(r.steps[r.steps.length - 1].arrive);
});
t("route starts and ends at building edges, not centres", () => {
  const r = router.route("dept_cs", "cafeteria");
  const a = router.locById.dept_cs, c0 = r.coords[0];
  const dx = Math.abs(c0.lng - a.lng) * MLNG, dy = Math.abs(c0.lat - a.lat) * MLAT;
  assert(Math.abs(dx - a.w / 2) < 1 || Math.abs(dy - a.h / 2) < 1, "start not on footprint edge");
});
t("symmetric distance", () => {
  const a = router.route("dept_ee", "hostel_girls"), b = router.route("hostel_girls", "dept_ee");
  assert(Math.abs(a.distance - b.distance) < 1);
});
t("direct is not much longer than going via a third place", () => {
  const ab = router.route("dept_cs", "mosque").distance;
  const via = router.route("dept_cs", "library").distance + router.route("library", "mosque").distance;
  assert(ab <= via + 30, ab + " vs " + via);
});
t("two doors on the same road segment route directly", () => {
  const r = router.route("tea_point", "photocopy");
  assert(r && r.distance < 140, "dist " + r.distance);
});
t("every location reachable from the gate", () => {
  CAMPUS.locations.forEach(l => assert(router.route("main_gate", l.id), l.id));
});
t("nearest food from CS dept sorted", () => {
  const n = router.nearest("dept_cs", "food", 2);
  assert(n.length === 2 && n[0].distance <= n[1].distance);
});
t("route from raw GPS point", () => {
  const r = router.route({ lat: 31.5785, lng: 74.3566 }, "dept_me");
  assert(r && r.distance > 0);
});
t("reach: bigger window reaches more, includes self", () => {
  const a = router.reach("library", 2), b = router.reach("library", 6);
  assert(a.ids.includes("library") && b.ids.length >= a.ids.length && b.ids.length > 5);
});

console.log("NLP");
const P = q => nlp.parse(q);
t("where is the library", () => { const p = P("Where is the library?"); assert.strictEqual(p.intent, "locate"); assert.strictEqual(p.target.id, "library"); });
t("typo: libary", () => assert.strictEqual(P("where is libary").target.id, "library"));
t("alias: cs dept", () => assert.strictEqual(P("where is cs dept").target.id, "dept_cs"));
t("alias: EE", () => assert.strictEqual(P("find EE department").target.id, "dept_ee"));
t("from X to Y", () => { const p = P("how do I get from main gate to the cafeteria"); assert.strictEqual(p.intent, "route"); assert.strictEqual(p.from.id, "main_gate"); assert.strictEqual(p.to.id, "cafeteria"); });
t("X to Y", () => { const p = P("library to mosque"); assert.strictEqual(p.from.id, "library"); assert.strictEqual(p.to.id, "mosque"); });
t("to Y from X", () => { const p = P("take me to the mosque from the library"); assert.strictEqual(p.from.id, "library"); assert.strictEqual(p.to.id, "mosque"); });
t("single-target route", () => { const p = P("take me to mechanical department"); assert.strictEqual(p.intent, "route"); assert.strictEqual(p.to.id, "dept_me"); assert.strictEqual(p.from, null); });
t("nearest category", () => { const p = P("nearest atm"); assert.strictEqual(p.intent, "nearest"); assert.strictEqual(p.category, "bank"); });
t("nearest with origin", () => { const p = P("closest cafe from library"); assert.strictEqual(p.intent, "nearest"); assert.strictEqual(p.category, "food"); assert.strictEqual(p.from.id, "library"); });
t("list all hostels", () => { const p = P("show all hostels"); assert.strictEqual(p.intent, "list"); assert.strictEqual(p.category, "hostel"); });
t("roman urdu locate", () => { const p = P("masjid kahan hai"); assert.strictEqual(p.intent, "locate"); assert.strictEqual(p.target.id, "mosque"); });
t("roman urdu route", () => { const p = P("cafeteria kaise jaun"); assert.strictEqual(p.intent, "route"); assert.strictEqual(p.to.id, "cafeteria"); });
t("info intent", () => { const p = P("tell me about the library"); assert.strictEqual(p.intent, "info"); assert.strictEqual(p.target.id, "library"); });
t("info intent 2", () => { const p = P("what is in the cs department"); assert.strictEqual(p.intent, "info"); assert.strictEqual(p.target.id, "dept_cs"); });
t("tour intent", () => assert.strictEqual(P("give me a campus tour").intent, "tour"));
t("reach intent", () => { const p = P("what can I reach within 5 minutes"); assert.strictEqual(p.intent, "reach"); assert.strictEqual(p.minutes, 5); });
t("help", () => assert.strictEqual(P("hello").intent, "help"));
t("gibberish -> unknown", () => assert.strictEqual(P("asdf qwerty zzzz").intent, "unknown"));
t("autocomplete", () => { const s = nlp.suggest("comp"); assert(s.some(x => x.id === "dept_cs" || x.id === "lab_cs")); });

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
