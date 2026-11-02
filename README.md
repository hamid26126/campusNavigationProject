# UET Navigator - AI-Based Campus Navigation Assistant

A Google-Maps-style assistant for **UET Lahore, Main Campus (GT Road)**. New students can type natural questions ("where is the library?", "how do I get from the main gate to CS?", "nearest ATM", "masjid kahan hai") and get a map pin, a walking route and turn-by-turn directions.

## Run it

No build step and no backend. Open `index.html` in a browser (internet needed for the Leaflet library and map tiles).
For GPS ("Locate me") use a local server: `python3 -m http.server 8000`, then open http://localhost:8000.

Tests: `node tests/test.js` (39 checks)

## How it works

| Layer | File | What it does |
|---|---|---|
| Data | `js/campus-data.js` | 45 locations laid out as buildings (footprint, floors, shape) inside road-bounded blocks, plus a 25-junction road graph |
| Info | `js/campus-info.js` | What's inside each place, study areas, tips, freshers' tour script, About facts (sourced) |
| Route optimisation | `js/router.js` | Dijkstra (binary heap) on the road graph; doors are snapped onto the nearest road segment, routes start/end at building edges; turn-by-turn from bearings; nearest-X and walking-range queries |
| NLP | `js/nlp.js` | Rule-based pipeline: normalise -> intent detection -> fuzzy entity linking (typo tolerant, aliases, abbreviations) -> from/to role assignment. Intents: locate, info, route, nearest, list, tour, reach (walking range), help. Understands some Roman Urdu |
| UI | `index.html`, `css/style.css`, `js/app.js` | Illustrated 2.5D campus map (buildings with depth and shadows, trees, roads) drawn from our own data on Leaflet; Street/Satellite switch; place drawer; animated route + walk preview; freshers' tour; walking-range rings; voice input; day/night theme; shareable route links |

## Status (~40% of the full project)

Done:
- Map with all pins, category filters, popups
- Natural-language queries (English + Roman Urdu), typo and alias handling
- Shortest-path walking routes, distance/time, step-by-step directions
- Nearest-facility search, ambiguity prompts, autocomplete
- Automated tests (39): data integrity, building overlap/road clearance, routing, NLP intents

## IMPORTANT: map data is approximate

Positions in `campus-data.js` are placeholders laid out on a grid around the campus centre (31.57993 N, 74.3561 E). Department names are real UET units, but their exact positions, the hostel names, and the walkway layout have **not** been surveyed. Every location has `verified: false`.

### Calibrating the map (next step)
1. Walk to each place and record its GPS point (phone map -> long-press -> copy coordinates).
2. Update `lat`/`lng` and set `verified: true`.
3. Replace the grid in the "walkway graph" section with real junctions: add `{id, lat, lng}` nodes along actual footpaths and `[idA, idB]` edges. Turn on "Show walkway network" in the UI to check it against the map.

## Remaining roadmap (the other ~65%)

- Real surveyed coordinates, footpaths, building entrances, floors/room numbers
- Better NLP: embeddings or an LLM-based parser with the rule-based one as fallback, multi-turn context ("and from there to the mosque?")
- Accessibility routes (ramps), time-aware info (opening hours, prayer times)
- Offline/PWA mode, admin page to edit data, feedback button for wrong pins
- Evaluation: query test-set accuracy, user study with new students
