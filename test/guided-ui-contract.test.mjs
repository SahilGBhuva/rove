// Source-level contracts for the guided journey UI in site/app.js. These guard behaviours that
// were verified by hand in the browser (see OVERNIGHT_PROGRESS.md) against accidental regressions.
// They do not replace browser or physical-device testing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../site/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../site/styles.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const fn = name => { const start = app.indexOf(`function ${name}(`); assert.ok(start >= 0, `${name} exists`); const next = app.indexOf('\nfunction ', start + 10); return app.slice(start, next < 0 ? undefined : next); };

test('journey guide loads before app.js and drives navigation', () => {
  assert.ok(html.indexOf('public/js/journey-guide.js') < html.indexOf('app.js?'));
  assert.match(fn('startNavigation'), /beginNav\(it,/);
  assert.match(fn('viewNavigate'), /data-action="rg-confirm" data-phase="\$\{i\}"/);
});

test('timers, GPS and returning to the app never re-render the trip screen (focus safety)', () => {
  assert.doesNotMatch(fn('guideTick'), /render\(\)/);
  assert.doesNotMatch(fn('onNavPosition'), /render\(\)/);
  assert.doesNotMatch(fn('guideGpsHint'), /render\(\)/);
  assert.match(app, /if \(state\.nav\.fix && Date\.now\(\) - state\.nav\.fix\.time > 30000\)[^\n]*\n\s*navFollowCamera\(\);\n\s*\/\/[^\n]*\n\s*updateGuideLive\(\);/);
  assert.doesNotMatch(fn('refreshLiveViews'), /'home'/);
});

test('every phase change moves focus to the new instruction and speaks it', () => {
  const enter = fn('guideEnter');
  assert.match(enter, /render\(\);\s*document\.getElementById\('rgHeading'\)\?\.focus/);
  assert.match(enter, /guideSay\(/);
});

test('GPS never confirms or advances a phase', () => {
  const gps = fn('guideGpsHint');
  assert.doesNotMatch(gps, /CONFIRM/);
  assert.match(gps, /GPS estimate:/);
  assert.doesNotMatch(fn('onNavPosition'), /maybeAdvanceNavigation/);
});

test('confirm handler ignores stale double taps and ends the trip only on arrival', () => {
  const start = app.indexOf("case 'rg-confirm':");
  const block = app.slice(start, app.indexOf("case 'rg-repeat':"));
  assert.match(block, /phaseIndex: Number\(el\.dataset\.phase\)/);
  assert.match(block, /if \(next === nav\.gs\) break;/);
  assert.match(block, /if \(before\.kind === 'arrive'\) \{ endTrip\(\); break; \}/);
});

test('help is one tap away and offers recovery without claiming detection', () => {
  const help = fn('guideHelpHtml');
  for (const action of ['rg-replan', 'rg-where', 'rg-voice']) assert.match(help, new RegExp(`data-action="${action}"`));
  assert.match(help, /cannot detect obstacles, safe crossings, platform edges, or which vehicle you are on/);
  assert.match(fn('viewNavigate'), /data-action="rg-help" aria-expanded=/);
});

test('voice destination covers denial, silence, missing support and announces what was heard', () => {
  for (const e of ['not-allowed', 'no-speech', 'audio-capture', 'network', 'unsupported']) assert.match(app, new RegExp(`'?${e}'?: ['"]`));
  assert.match(fn('voiceResultsReady'), /Heard \$\{heard\}\. \$\{plural\(results\.length, 'match', 'matches'\)\}/);
  assert.match(fn('voiceResultsReady'), /results\[0\]\.focus/);
  assert.match(app, /if \(plan\.voice\) return; if \(!plan\.to\)/, 'openPlan does not steal focus from the voice flow');
});

test('demo is labeled simulated everywhere and never uses location', () => {
  assert.match(fn('viewDemo'), /Simulated\./);
  assert.match(fn('viewNavigate'), /Simulated times from a published timetable\. Not live\./);
  assert.match(fn('beginNav'), /if \(!demo && 'geolocation' in navigator/);
  assert.match(app, /Demo\.<\/strong> Times are copied from published Muni and BART timetables/);
});

test('trip state survives a reload and expires', () => {
  assert.match(fn('saveTrip'), /store\.set\(TRIP_KEY/);
  assert.match(fn('loadTrip'), /12 \* 3600e3/);
  assert.match(fn('endTrip'), /clearTrip\(\)/);
});

test('announcements are ordered and Rove voice never doubles the live region', () => {
  const a = fn('announceAccess');
  assert.match(a, /if \(speak && speakOut\(text\)\) return;/);
  assert.match(a, /clearTimeout\(announceAccess\.timer\)/);
});

test('trip controls are large, in thumb reach, and respect reduced motion', () => {
  assert.match(css, /\.rg-confirm \{ min-height: 68px;/);
  assert.match(css, /\.rg-dock \{\s*position: sticky; bottom: 0;/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.panel-body\.view-enter > \* \{ animation: none !important; \} \}/);
  assert.match(css, /:focus-visible \{\s*outline: 3px solid var\(--rg-focus\) !important;/);
});

test('overnight service gaps are explained with real timetable times, never a generic leave-now route', () => {
  const msg = fn('noRouteMessage');
  assert.match(msg, /body\?\.routing\?\.serviceGap/);
  assert.match(msg, /The next practical trip leaves at/);
  assert.match(msg, /by the published schedule/);
  assert.match(app, /case 'plan-show-later':[\s\S]*?These trips leave later than you asked/);
  assert.match(app, /warnings: Array\.isArray\(it\.warnings\)/);
});

test('QA P0: while Help is open no Confirm button exists and the handler refuses to advance', () => {
  const nav = fn('viewNavigate');
  assert.match(nav, /nav\.showHelp && !arrive\s*\n\s*\/\/[^\n]*\n\s*\? '<button type="button" class="rg-secondary rg-close-help" data-action="rg-help"/);
  const start = app.indexOf("case 'rg-confirm':");
  assert.match(app.slice(start, start + 600), /if \(nav\.showHelp && before\.kind !== 'arrive'\) break;/);
  assert.doesNotMatch(fn('guideHelpHtml'), /Close help/, 'Close help lives in the dock, not under it');
});

test('QA P1: designed control heights override the generic 48px floor; text follows user size', () => {
  assert.match(css, /\.rove-accessible \.rg-confirm \{ min-height: 68px; \}/);
  assert.match(css, /font: -apple-system-body/);
  const layer = css.slice(css.indexOf('Rove guided design layer'));
  assert.doesNotMatch(layer, /font-size:\s*\d+px/, 'design layer uses rem for text');
  assert.match(css, /@media \(min-width: 801px\) \{ \.speech-bar \{ top: 16px; bottom: auto; \}/);
  assert.match(css, /@media \(max-height: 560px\) \{ \.rg-dock \{ position: static;/);
});


test('rerouting rejects stale or inaccurate GPS before sending a plan request', () => {
  const reroute = fn('navReroute');
  assert.match(reroute, /Date\.now\(\) - nav\.fix\.time > 30000/);
  assert.match(reroute, /nav\.fix\.accuracy > 55/);
  assert.ok(reroute.indexOf('accuracy > 55') < reroute.indexOf("fetch('/api/v2/plan?"));
});

test('no legacy GPS auto-advance function remains', () => {
  assert.doesNotMatch(app, /function maybeAdvanceNavigation\(/);
  assert.doesNotMatch(app, /nav\.i = Math\.min\(nav\.i \+ 1/);
});


test('repeated map style changes do not leak stop label zoom listeners', () => {
  const layers = fn('addTransitLayers');
  assert.match(layers, /map\.off\('zoomend', state\.stopLabelZoomHandler\)/);
  assert.match(layers, /state\.stopLabelZoomHandler = refreshStopLabels/);
});

test('rerouting does not replace focused VoiceOver controls while waiting', () => {
  const reroute = fn('navReroute');
  assert.match(reroute, /Calculating a new route from your location/);
  assert.doesNotMatch(reroute, /\n  render\(\);/);
  assert.match(reroute, /updateGuideLive\(\)/);
});
