// Regression tests for the map's layer configuration (no browser needed).
// They read app.js as text, evaluate the small pure helpers in a sandbox, and check the rules that
// keep the network readable: bus routes appear at city zoom, never at the regional view, labels never
// share a source with the dots they label, and every agency color stays visible in every map style.
// The rendering check with a real browser is scripts/verify-map-render.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function slice(startMarker, endMarker) {
  const a = source.indexOf(startMarker);
  assert.ok(a >= 0, `app.js should contain ${startMarker}`);
  const b = source.indexOf(endMarker, a + startMarker.length);
  assert.ok(b > a, `app.js should contain ${endMarker} after ${startMarker}`);
  return source.slice(a, b);
}

// Pure pieces only: color helpers, the theme table, and the zoom rules.
const sandbox = { state: { mapMode: 'standard' } };
vm.createContext(sandbox);
vm.runInContext([
  slice('function luminance(hex) {', 'const ICONS = {'),
  slice('const THEME = {', '/* Rove\'s basemap palettes'),
  slice('const MAP_ZOOM = ', 'function addTransitLayers() {')
].join('\n') + '\nthis.api = { luminance, contrast, normalizeColor, mixHex, mapLineColor, THEME, MAP_ZOOM, BUS_OPACITY, BUS_WIDTH };', sandbox);
const { luminance, contrast, mapLineColor, THEME, MAP_ZOOM, BUS_OPACITY, BUS_WIDTH } = sandbox.api;

/** Evaluates a MapLibre ['interpolate', ['linear'], ['zoom'], z0, v0, z1, v1, ...] at a zoom. */
function atZoom(expr, z) {
  const stops = expr.slice(3);
  if (z <= stops[0]) return stops[1];
  for (let i = 0; i < stops.length - 2; i += 2) {
    const [z0, v0, z1, v1] = stops.slice(i, i + 4);
    if (z <= z1) return v0 + (v1 - v0) * ((z - z0) / (z1 - z0));
  }
  return stops[stops.length - 1];
}

const initialZoom = (() => { const m = source.match(/zoom: isMobile\(\) \? ([\d.]+) : ([\d.]+)/); return m ? { mobile: Number(m[1]), desktop: Number(m[2]) } : null; })();

test('bus routes stay off the regional view, so the Bay Area reads as a rail map first', () => {
  assert.ok(initialZoom, 'initial zoom found');
  assert.ok(MAP_ZOOM.busRoutes > initialZoom.desktop && MAP_ZOOM.busRoutes > initialZoom.mobile);
  assert.equal(atZoom(BUS_OPACITY, MAP_ZOOM.busRoutes), 0, 'buses fade in rather than popping');
});

test('bus routes are clearly visible at city and neighborhood zoom (audit P0)', () => {
  assert.ok(MAP_ZOOM.busRoutes <= 10.5, 'buses start appearing by zoom 10.5');
  assert.ok(atZoom(BUS_OPACITY, 11) >= 0.45, `opacity at 11 is ${atZoom(BUS_OPACITY, 11)}`);
  assert.ok(atZoom(BUS_OPACITY, 12) >= 0.6, `opacity at 12 is ${atZoom(BUS_OPACITY, 12)}`);
  assert.ok(atZoom(BUS_OPACITY, 14) >= 0.8, `opacity at 14 is ${atZoom(BUS_OPACITY, 14)}`);
  assert.ok(atZoom(BUS_WIDTH, 12) >= 1.2, 'lines are at least 1.2 px wide at zoom 12');
});

test('bus stops, labels and vehicles follow at sensible zooms', () => {
  assert.ok(MAP_ZOOM.busStops <= 15, 'bus stops by zoom 15');
  assert.ok(MAP_ZOOM.busStopLabels > MAP_ZOOM.busStops, 'labels after dots');
  assert.ok(MAP_ZOOM.busVehicles <= 13, 'live buses by zoom 13');
});

test('bus routes use the route color, not a single gray', () => {
  const layers = slice('function addTransitLayers() {', 'const ROUTE_LAYERS');
  const busLayer = layers.match(/id: 'tr-bus',[^\n]*/)[0];
  assert.match(busLayer, /'line-color': \['get', 'lc'\]/);
  assert.match(busLayer, /minzoom: MAP_ZOOM\.busRoutes/);
});

test('every label layer has its own source, so a font outage cannot hide stops or vehicles', () => {
  const layers = slice('function addTransitLayers() {', 'const ROUTE_LAYERS');
  const symbolLayers = [...layers.matchAll(/id: '([^']+)', type: 'symbol', source: '([^']+)'/g)].map(m => [m[1], m[2]]);
  assert.ok(symbolLayers.length >= 5, 'symbol layers found');
  for (const [id, src] of symbolLayers) assert.ok(!['transit-stops', 'vehicles', 'journey-points'].includes(src), `${id} uses ${src}`);
});

test('layer order keeps rail above buses and casings under their lines', () => {
  const layers = slice('function addTransitLayers() {', 'const ROUTE_LAYERS');
  const order = [...layers.matchAll(/id: '(tr-[a-z-]+)'/g)].map(m => m[1]);
  const at = id => order.indexOf(id);
  assert.ok(at('tr-bus-casing') < at('tr-bus') && at('tr-bus') < at('tr-light') && at('tr-light') < at('tr-heavy') && at('tr-heavy') < at('tr-selected'));
  assert.ok(at('tr-light-casing') < at('tr-light') && at('tr-heavy-casing') < at('tr-heavy') && at('tr-selected-casing') < at('tr-selected'));
});

test('every agency color stays visible on Standard, Dark and Satellite', () => {
  const network = JSON.parse(fs.readFileSync(path.join(root, 'public/data/network.json'), 'utf8'));
  const backgrounds = { standard: '#f4f1ea', dark: '#15171a', satellite: '#1d211c' };
  const colors = new Set();
  for (const a of network.agencies) for (const r of a.routes) colors.add(r.c || a.color);
  for (const [mode, bg] of Object.entries(backgrounds)) {
    sandbox.state.mapMode = mode;
    for (const c of colors) {
      const shown = mapLineColor(c, mode);
      assert.ok(contrast(shown, bg) >= 1.95, `${c} on ${mode} becomes ${shown}, contrast ${contrast(shown, bg).toFixed(2)}`);
    }
  }
  sandbox.state.mapMode = 'standard';
});

test('agency colors are kept as they are wherever they already read well', () => {
  assert.equal(mapLineColor('#bf2b45', 'standard'), '#bf2b45');
  assert.equal(mapLineColor('#005B95', 'dark').toLowerCase(), '#005b95');
  assert.notEqual(mapLineColor('#000000', 'dark'), '#000000');
  assert.notEqual(mapLineColor('#000000', 'satellite'), '#000000');
});

test('Satellite has its own palette with light labels over imagery', () => {
  assert.ok(THEME.satellite, 'satellite theme exists');
  assert.ok(luminance(THEME.satellite.label) > 0.8, 'labels are light');
  for (const t of Object.values(THEME)) for (const key of ['casing', 'label', 'halo', 'busCasingOpacity', 'surface', 'ink']) assert.ok(t[key] !== undefined, `${key} defined`);
});

test('the only lines without a drawable shape are the documented BART bus bridges', () => {
  const network = JSON.parse(fs.readFileSync(path.join(root, 'public/data/network.json'), 'utf8'));
  const missing = network.agencies.flatMap(a => a.routes.filter(r => !(r.shapes || []).some(s => s && s.length > 1)).map(r => `${a.id}:${r.id}`));
  assert.deepEqual(missing.sort(), ['bart:BB-A', 'bart:BB-B']);
  assert.match(source, /has not published a route shape for this line/);
});


test('late-night no-service flow offers a correctly labeled later search', () => {
  assert.match(source, /NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW/);
  assert.match(source, /Try tomorrow at 8:15 AM/);
  assert.match(source, /case 'plan-next-morning'/);
  assert.match(source, /plan.timeMode = 'depart'/);
});

test('ending navigation releases location tracking before clearing state', () => {
  assert.match(source, /case 'nav-end': releaseWakeLock\(\); state.nav = null; goHome\(\); break;/);
});
