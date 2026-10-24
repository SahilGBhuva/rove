// Map-graphics contracts. Keep this work isolated from the concurrent UI redesign.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../site/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../site/css/rg-map-graphics.css', import.meta.url), 'utf8');

const extract = name => {
  const match = app.match(new RegExp('function ' + name + '\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}'));
  assert.ok(match, name + ' exists');
  return match[0];
};

const state = { focusLeg: null, mapMode: 'standard', journey: null, map: null };
const isTransit = l => l.mode === 'TRANSIT';
const legShapeMissing = l => !Array.isArray(l.geometry?.coordinates) || l.geometry.coordinates.length < 2;
const context = {
  state, isTransit, legShapeMissing,
  legInfo: () => ({ color: '#0b7145' }),
  mapLineColor: c => c,
  theme: () => ({ ink: '#16191a', brightCasing: '#ffffff', surface: '#ffffff' }),
  luminance: () => .3
};
const journeyFeatures = vm.runInNewContext('(' + extract('journeyFeatures') + ')', context);
const point = (lon, lat) => ({ lon, lat, name: 'Stop' });
const leg = (mode, geometry) => ({
  mode, geometry, from: point(-122.45, 37.78), to: point(-122.42, 37.79)
});

test('walking and driving without actual geometry never draw invented street paths', () => {
  for (const mode of ['WALK', 'CAR']) {
    const result = journeyFeatures({ legs: [leg(mode, null)] });
    assert.equal(result.features.length, 0, mode + ' should not draw a straight line');
  }
});

test('actual pedestrian geometry is rendered without substituting endpoints', () => {
  const coordinates = [[-122.45, 37.78], [-122.44, 37.785], [-122.42, 37.79]];
  const result = journeyFeatures({ legs: [leg('WALK', { coordinates })] });
  assert.equal(result.features.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.features[0].geometry.coordinates)), coordinates);
});

test('transit without geometry remains explicitly approximate and dashed', () => {
  const result = journeyFeatures({ legs: [leg('TRANSIT', null)] });
  assert.equal(result.features.length, 1);
  assert.equal(result.features[0].properties.approx, 1);
  assert.match(app, /id: 'journey-approx'[\\s\\S]*?'line-dasharray'/);
  assert.match(app, /id: 'journey-glow'[\\s\\S]*?'approx'], 0/);
});

test('selected route and real transit paths receive subtle GPU glow', () => {
  assert.match(app, /id: 'tr-selected-halo'/);
  assert.match(app, /setFilter\\('tr-selected-halo', selFilter\\)/);
  assert.match(app, /id: 'journey-glow'/);
  assert.match(app, /'line-blur': 6/);
  assert.match(app, /id: 'journey-stop-halo'/);
});

test('map key exposes uncertainty without replacing text directions', () => {
  for (const id of ['rgMapLegend', 'rgMapMappedLegend', 'rgMapApproxLegend', 'rgMapWalkWarning']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /Walking path not mapped/);
  assert.match(html, /css\\/rg-map-graphics\\.css/);
  assert.match(css, /rg-map-legend-warning/);
  assert.doesNotMatch(css, /animation\\s*:/);
});

test('map legend is shown only when route information exists', () => {
  const elements = Object.fromEntries(['#rgMapLegend','#rgMapMappedLegend','#rgMapApproxLegend','#rgMapWalkWarning'].map(k => [k,{ hidden: true }]));
  const render = vm.runInNewContext('(' + extract('renderJourney') + ')', {
    ...context,
    $: k => elements[k],
    journeyFeatures: () => ({ features: [] }),
    journeyPointFeatures: () => ({ features: [] })
  });
  render();
  assert.equal(elements['#rgMapLegend'].hidden, true);
  state.journey = { legs: [leg('WALK', null)] };
  render();
  assert.equal(elements['#rgMapLegend'].hidden, false);
  assert.equal(elements['#rgMapWalkWarning'].hidden, false);
  assert.equal(elements['#rgMapMappedLegend'].hidden, true);
  state.journey = { legs: [leg('TRANSIT', null)] };
  render();
  assert.equal(elements['#rgMapApproxLegend'].hidden, false);
  assert.equal(elements['#rgMapWalkWarning'].hidden, true);
  state.journey = null;
});
