/*
 * UET Lahore (Main Campus, GT Road) - campus data (v2: block layout)
 * ------------------------------------------------------------------
 * The campus is modelled as a grid of road junctions. The blocks between
 * roads ("cells") hold buildings, each with a footprint (metres) so the
 * illustrated map can draw real shapes instead of pins.
 *
 * IMPORTANT: positions are ILLUSTRATIVE, not surveyed. The campus centre
 * (31.57993 N, 74.3561 E) and the facts in campus-info.js come from public
 * sources; where each building actually stands must still be recorded on
 * site (README: "Calibrating the map"). Every location is `verified:false`.
 *
 * Works in the browser (window.CAMPUS) and in Node (module.exports).
 */
(function (root) {
  var COLS = [74.3530, 74.3546, 74.3562, 74.3578, 74.3594]; // c0..c4 west -> east
  var ROWS = [31.5768, 31.5779, 31.5791, 31.5803, 31.5815, 31.5827]; // r0..r5 south -> north
  var M_LAT = 111320;                                   // metres per degree latitude
  var M_LNG = 111320 * Math.cos((31.58 * Math.PI) / 180); // metres per degree longitude here

  // ---------- road graph ----------
  var nodes = [], edges = [], have = {};
  function addNode(c, r) {
    var id = "c" + c + "r" + r;
    nodes.push({ id: id, lat: ROWS[r], lng: COLS[c] });
    have[id] = true;
  }
  nodes.push({ id: "gate", lat: 31.5758, lng: 74.3562 });
  have.gate = true;
  for (var r = 0; r < ROWS.length; r++) for (var c = 1; c <= 3; c++) addNode(c, r);
  for (var r2 = 2; r2 <= 4; r2++) { addNode(0, r2); addNode(4, r2); }
  function link(a, b) { if (have[a] && have[b]) edges.push([a, b]); }
  link("gate", "c2r0");
  for (var rr = 0; rr < ROWS.length; rr++)
    for (var cc = 0; cc < COLS.length - 1; cc++) link("c" + cc + "r" + rr, "c" + (cc + 1) + "r" + rr);
  for (var cc2 = 0; cc2 < COLS.length; cc2++)
    for (var rr2 = 0; rr2 < ROWS.length - 1; rr2++) link("c" + cc2 + "r" + rr2, "c" + cc2 + "r" + (rr2 + 1));

  // ---------- placing buildings inside blocks ----------
  var SLOT = { SW: [0.27, 0.27], SE: [0.73, 0.27], NW: [0.27, 0.73], NE: [0.73, 0.73], MID: [0.5, 0.5] };

  function cellRect(ci, ri) {
    return { south: ROWS[ri], north: ROWS[ri + 1], west: COLS[ci], east: COLS[ci + 1] };
  }

  /* L(id, short, name, category, [cellCol, cellRow], slot | [fx,fy], [w,h] metres, levels, extra) */
  function L(id, short, name, cat, cell, at, size, levels, extra) {
    var f = typeof at === "string" ? SLOT[at] : at;
    var rc = cellRect(cell[0], cell[1]);
    var o = {
      id: id, short: short, name: name, category: cat, cell: cell,
      lat: rc.south + f[1] * (rc.north - rc.south),
      lng: rc.west + f[0] * (rc.east - rc.west),
      w: size[0], h: size[1], levels: levels,
      shape: "rect", aliases: [], description: "", verified: false
    };
    for (var k in extra) o[k] = extra[k];
    return o;
  }

  var locations = [
    // ---- gate zone (south) ----
    L("main_gate", "Main Gate", "Main Gate (GT Road)", "gate", [1, 0], [0.5, 0.5], [1, 1], 0,
      { lat: 31.5758, lng: 74.3562, shape: "gate",
        aliases: ["gate", "entrance", "front gate", "gt road gate", "main entrance"],
        description: "Main entrance on Grand Trunk Road." }),
    L("parking", "Parking", "Main Parking Area", "parking", [1, 0], "MID", [120, 66], 0,
      { shape: "flat", aliases: ["parking", "car park", "bike parking", "motorcycle parking", "parking lot"],
        description: "Parking for cars and motorcycles." }),
    L("bus_stop", "Bus Point", "University Bus Stop (Point)", "transport", [2, 0], "SW", [30, 20], 1,
      { aliases: ["bus stop", "bus point", "transport", "pick and drop", "point", "shuttle", "orange line", "bus"],
        description: "University transport pick-up and drop-off." }),
    L("bank_atm", "Bank & ATM", "Bank & ATM", "bank", [2, 0], "SE", [40, 28], 2,
      { aliases: ["bank", "atm", "hbl", "money", "cash", "banking"], description: "Bank branch and ATM." }),
    L("post_office", "Post Office", "Post Office", "service", [2, 0], "NW", [36, 26], 1,
      { aliases: ["post office", "post", "courier", "mail"], description: "Postal services." }),

    // ---- admin belt ----
    L("dispensary", "Medical Centre", "Medical Centre / Dispensary", "medical", [1, 1], "SW", [48, 36], 2,
      { aliases: ["dispensary", "medical", "hospital", "doctor", "clinic", "medical center", "medical centre", "first aid", "health"],
        description: "On-campus medical facility." }),
    L("accounts", "Fee Section", "Accounts / Fee Section", "admin", [1, 1], "SE", [48, 34], 2,
      { aliases: ["fee section", "fee office", "accounts office", "treasurer", "challan", "fee"],
        description: "Fee vouchers and accounts queries." }),
    L("dept_env", "Env. & Transport", "Department of Environmental / Transportation Engineering", "department", [1, 1], "NW", [54, 40], 3,
      { aliases: ["environmental", "environmental engineering", "transportation", "transportation engineering", "ent"],
        description: "Environmental and Transportation Engineering." }),
    L("student_affairs", "Student Affairs", "Student Affairs Office", "admin", [1, 1], "NE", [48, 36], 2,
      { aliases: ["student affairs", "dsa", "dean student affairs", "student office"],
        description: "ID cards, student societies, disciplinary matters." }),

    L("main_block", "Main Block", "Main Block (Administration)", "admin", [2, 1], [0.5, 0.64], [118, 42], 3,
      { aliases: ["admin block", "administration", "vc office", "vice chancellor office", "registrar office", "main building", "maclagan building"],
        description: "Historic main building (1923): Vice-Chancellor and Registrar offices." }),
    L("admissions", "Admissions", "Admissions Office", "admin", [2, 1], [0.27, 0.2], [46, 26], 1,
      { aliases: ["admission office", "admissions", "admission", "merit list office"],
        description: "Undergraduate/postgraduate admissions enquiries." }),
    L("exam_office", "Exam Office", "Controller of Examinations", "admin", [2, 1], [0.73, 0.2], [46, 26], 1,
      { aliases: ["examination office", "exam office", "exam section", "controller exams", "result office", "transcript"],
        description: "Results, transcripts and degree verification." }),

    // ---- academic core (west of spine) ----
    L("exam_hall", "Exam Hall", "Examination Hall", "hall", [1, 2], "SW", [54, 38], 1,
      { aliases: ["exam hall", "paper hall", "paper centre", "paper center"], description: "Mid-term and final examinations." }),
    L("it_centre", "IT Centre", "IT Centre / Computer Centre", "service", [1, 2], "SE", [48, 34], 2,
      { aliases: ["it center", "it centre", "computer centre", "computer center", "wifi", "network office", "uet portal", "lms support"],
        description: "Campus network, Wi-Fi and portal support." }),
    L("dept_ee", "Electrical Eng.", "Department of Electrical Engineering", "department", [1, 2], "NW", [56, 42], 4,
      { aliases: ["electrical", "electrical engineering", "ee", "ee department", "ee dept", "electrical department"],
        description: "Faculty of Electrical Engineering." }),
    L("lab_ee", "EE Labs", "Electrical Machines & Power Labs", "lab", [1, 2], "NE", [42, 32], 2,
      { parent: "dept_ee", aliases: ["ee lab", "electrical lab", "machines lab", "power lab", "electronics lab", "circuits lab", "digital electronics lab"],
        description: "Electrical machines, power systems and electronics labs." }),

    L("dept_iem", "Industrial Eng.", "Department of Industrial & Manufacturing Engineering", "department", [1, 3], "SW", [54, 40], 3,
      { aliases: ["industrial", "industrial engineering", "manufacturing", "iem", "ime"],
        description: "Industrial and Manufacturing Engineering." }),
    L("lab_civil", "Civil Labs", "Civil Materials & Structures Lab", "lab", [1, 3], "SE", [42, 32], 2,
      { parent: "dept_ce", aliases: ["civil lab", "material testing lab", "structures lab", "surveying lab", "concrete lab", "soil lab", "geotech lab"],
        description: "Material testing, structures and soil mechanics." }),
    L("dept_ce", "Civil Eng.", "Department of Civil Engineering", "department", [1, 3], "NW", [56, 42], 4,
      { aliases: ["civil", "civil engineering", "ce", "civil department"], description: "Faculty of Civil Engineering." }),
    L("dept_crp", "City Planning", "Department of City & Regional Planning", "department", [1, 3], "NE", [52, 38], 3,
      { aliases: ["city planning", "regional planning", "crp", "city and regional planning", "planning"],
        description: "City & Regional Planning." }),

    L("dept_mining", "Mining & Petroleum", "Department of Mining Engineering", "department", [1, 4], "SW", [54, 40], 3,
      { aliases: ["mining", "mining engineering", "petroleum", "petroleum engineering", "geological", "geology"],
        description: "Mining, Petroleum & Gas and Geological Engineering." }),
    L("dept_metal", "Metallurgy", "Department of Metallurgical & Materials Engineering", "department", [1, 4], "SE", [54, 40], 3,
      { aliases: ["metallurgy", "metallurgical", "materials engineering", "mme", "polymer", "polymer engineering"],
        description: "Metallurgical & Materials and Polymer & Process Engineering." }),
    L("dept_cs", "Computer Science", "Department of Computer Science (CS)", "department", [1, 4], "NW", [56, 44], 4,
      { aliases: ["computer science", "cs", "cs department", "cs dept", "cse", "computer engineering", "software", "fyp office", "it department"],
        description: "Computer Science & Engineering - the highest-merit discipline at UET." }),
    L("lab_cs", "CS Labs", "Computer Labs (CS Department)", "lab", [1, 4], "NE", [44, 34], 2,
      { parent: "dept_cs", aliases: ["computer lab", "computer labs", "cs lab", "programming lab", "software lab", "dld lab"],
        description: "Programming and software labs." }),

    // ---- library & centre ----
    L("library", "Central Library", "National Library of Engineering Sciences (Central Library)", "library", [2, 2], [0.5, 0.62], [90, 54], 3,
      { aliases: ["central library", "library", "lib", "national library", "reading room", "books", "book bank"],
        description: "Central library with reading halls and book bank." }),
    L("tea_point", "Tea Point", "Tea Point (Near Library)", "food", [2, 2], [0.2, 0.14], [34, 20], 1,
      { aliases: ["tea point", "chai point", "chai khana", "juice corner", "snacks"], description: "Quick tea and snacks." }),
    L("photocopy", "Photocopy", "Stationery & Photocopy Shop", "service", [2, 2], [0.8, 0.14], [40, 20], 1,
      { aliases: ["photocopy", "photo copy", "stationery", "printing", "print", "xerox", "copier", "fotocopy"],
        description: "Printing, photocopying and stationery." }),

    L("cafeteria", "Cafeteria", "Main Cafeteria", "food", [2, 3], "SW", [50, 36], 1,
      { aliases: ["cafe", "cafeteria", "canteen", "food court", "mess", "tuck shop", "lunch", "chai", "tea", "food", "khana", "restaurant"],
        description: "Main eating area with multiple counters." }),
    L("mosque", "Mosque", "Campus Mosque", "prayer", [2, 3], "SE", [36, 36], 2,
      { shape: "mosque", aliases: ["masjid", "mosque", "namaz", "prayer area", "prayer room", "jummah", "jumma"],
        description: "Main mosque, used for Jummah prayers." }),
    L("dept_basic", "Basic Sciences", "Department of Basic Sciences & Humanities", "department", [2, 3], "NW", [56, 42], 3,
      { aliases: ["basic sciences", "maths department", "mathematics", "physics", "chemistry department", "humanities", "english department", "islamiyat", "pak studies"],
        description: "Mathematics, physics, chemistry, humanities and language courses." }),
    L("lab_physics", "Science Labs", "Physics & Chemistry Labs (Basic Sciences)", "lab", [2, 3], "NE", [42, 32], 2,
      { parent: "dept_basic", aliases: ["physics lab", "chemistry lab", "science lab", "basic science lab"],
        description: "First-year physics and chemistry labs." }),

    L("dept_chem", "Chemical Eng.", "Department of Chemical Engineering", "department", [2, 4], "SW", [56, 42], 4,
      { aliases: ["chemical", "chemical engineering", "chem", "chemical department", "chemical metallurgical polymer"],
        description: "Faculty of Chemical, Metallurgical & Polymer Engineering." }),
    L("lab_chem", "Chem. Labs", "Chemical Process Labs", "lab", [2, 4], "SE", [42, 32], 2,
      { parent: "dept_chem", aliases: ["chemical lab", "chem lab", "process lab", "unit operations lab"],
        description: "Chemical process and unit-operation labs." }),
    L("dept_me", "Mechanical Eng.", "Department of Mechanical Engineering", "department", [2, 4], "NW", [56, 44], 4,
      { aliases: ["mechanical", "mechanical engineering", "me", "mech", "mechanical department"],
        description: "Faculty of Mechanical Engineering." }),
    L("lab_me", "ME Labs", "Thermodynamics & Fluid Mechanics Labs", "lab", [2, 4], "NE", [44, 34], 2,
      { parent: "dept_me", aliases: ["me lab", "mechanical lab", "thermo lab", "thermodynamics lab", "fluid lab", "workshop", "machine shop"],
        description: "Mechanical engineering labs and workshops." }),

    // ---- east side: sports + halls ----
    L("dept_arch", "Architecture", "Department of Architecture", "department", [3, 2], "SW", [54, 40], 3,
      { aliases: ["architecture", "arch", "architect", "architecture department", "design studio"],
        description: "Architecture design studios and jury rooms." }),
    L("placement", "Career Office", "Career & Placement Office", "admin", [3, 2], "SE", [46, 34], 2,
      { aliases: ["placement office", "career office", "career counselling", "jobs office", "internship office"],
        description: "Internships, jobs and employer visits." }),
    L("cricket_ground", "Sports Ground", "Cricket / Main Sports Ground", "sports", [3, 2], [0.5, 0.72], [126, 52], 0,
      { shape: "oval", aliases: ["cricket ground", "ground", "sports ground", "playground", "football ground", "cricket"],
        description: "Main outdoor sports ground." }),

    L("gym", "Gymnasium", "Gymnasium & Indoor Sports Complex", "sports", [3, 3], "SW", [54, 40], 2,
      { aliases: ["gym", "gymnasium", "indoor games", "table tennis", "badminton", "sports complex", "sports office", "fitness"],
        description: "Gym and indoor games." }),
    L("auditorium", "Auditorium", "Main Auditorium", "hall", [3, 3], "SE", [54, 42], 2,
      { aliases: ["auditorium", "seminar hall", "convocation hall", "main hall"], description: "Events, seminars and convocation." }),
    L("lecture_halls", "Lecture Halls", "Lecture Halls / Classrooms Complex", "classroom", [3, 3], "NW", [56, 42], 3,
      { aliases: ["classrooms", "classroom", "lecture hall", "lecture halls", "lt", "lecture theatre", "lecture theater", "class"],
        description: "Shared lecture theatres for first-year and service courses." }),

    // ---- west side: hostels ----
    L("hostel_boys_a", "Hostel A", "Boys Hostel Block A", "hostel", [0, 2], "NW", [58, 38], 4,
      { aliases: ["hostel", "hostel a", "boys hostel", "boys hostels", "dorm", "dormitory", "residence"],
        description: "Boys residential block (name to be confirmed)." }),
    L("hostel_boys_b", "Hostel B", "Boys Hostel Block B", "hostel", [0, 2], "NE", [58, 38], 4,
      { aliases: ["hostel b", "boys hostel b"], description: "Boys residential block (name to be confirmed)." }),
    L("hostel_girls", "Girls Hostel", "Girls Hostel", "hostel", [0, 3], "NW", [58, 40], 4,
      { aliases: ["girls hostel", "girls hostels", "female hostel", "ladies hostel", "girls residence"],
        description: "Girls residential block (name to be confirmed)." }),
    L("girls_common", "Girls Common Rm", "Girls Common Room", "other", [0, 3], "NE", [40, 28], 1,
      { aliases: ["girls common room", "common room", "ladies room", "girls room"], description: "Rest area for female students." })
  ];

  var categories = {
    gate: { label: "Gates", icon: "🚪", color: "#64748b" },
    admin: { label: "Administration", icon: "🏛️", color: "#7c3aed" },
    library: { label: "Library", icon: "📚", color: "#0d9488" },
    hall: { label: "Halls", icon: "🎓", color: "#db2777" },
    department: { label: "Departments", icon: "🏫", color: "#2563eb" },
    lab: { label: "Laboratories", icon: "🔬", color: "#0891b2" },
    classroom: { label: "Classrooms", icon: "🧑‍🏫", color: "#4f46e5" },
    food: { label: "Food", icon: "🍽️", color: "#ea580c" },
    prayer: { label: "Prayer", icon: "🕌", color: "#16a34a" },
    medical: { label: "Medical", icon: "⚕️", color: "#dc2626" },
    bank: { label: "Bank / ATM", icon: "🏦", color: "#ca8a04" },
    service: { label: "Services", icon: "🛎️", color: "#64748b" },
    parking: { label: "Parking", icon: "🅿️", color: "#475569" },
    transport: { label: "Transport", icon: "🚌", color: "#0284c7" },
    sports: { label: "Sports", icon: "🏏", color: "#22c55e" },
    hostel: { label: "Hostels", icon: "🛏️", color: "#9333ea" },
    other: { label: "Other", icon: "📍", color: "#64748b" }
  };

  var CAMPUS = {
    name: "UET Lahore - Main Campus",
    center: { lat: 31.57993, lng: 74.3561 },
    bounds: { south: 31.5745, west: 74.3505, north: 31.5845, east: 74.3620 },
    campusBox: { south: 31.5764, west: 74.3524, north: 31.5832, east: 74.3600 },
    walkingSpeedMps: 1.3,
    dataIsApproximate: true,
    mPerDegLat: M_LAT, mPerDegLng: M_LNG,
    cols: COLS, rows: ROWS,
    nodes: nodes, edges: edges, locations: locations, categories: categories,
    cellRect: cellRect
  };

  if (typeof module !== "undefined" && module.exports) module.exports = CAMPUS;
  else root.CAMPUS = CAMPUS;
})(typeof window !== "undefined" ? window : globalThis);
