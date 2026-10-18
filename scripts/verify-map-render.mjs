// Browser check of what the map actually draws, against a running Rove server.
//   ROVE_URL=http://localhost:4173 node scripts/verify-map-render.mjs
// Needs Playwright (npm i -D playwright, or a global install); prints SKIPPED without it.
// For each map style it visits San Francisco, Oakland and Sunnyvale at several zooms and asks
// MapLibre what it rendered, then checks the bus, rail, selection and filter rules.
// OFFLINE_TILES=1 blocks basemap hosts and answers font requests empty, for sandboxes without them;
// MAPLIBRE_DIST=<folder> serves MapLibre from a local copy when the CDN is unreachable.
let chromium;
try { ({ chromium } = await import('playwright')); } catch { console.log('SKIPPED: Playwright is not installed.'); process.exit(0); }

const BASE = process.env.ROVE_URL || 'http://localhost:4173';
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {});
const failures = [];
const expect = (ok, message) => { if (!ok) failures.push(message); console.log(`${ok ? 'PASS' : 'FAIL'} ${message}`); };
const places = { 'San Francisco': [-122.42, 37.775], Oakland: [-122.27, 37.805], Sunnyvale: [-122.03, 37.37] };

for (const mode of ['standard', 'dark', 'satellite']) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(m => { try { localStorage.setItem('rove-tour-v2', '"done"'); localStorage.setItem('rove-map-mode-v1', JSON.stringify(m)); } catch {} }, mode);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (process.env.MAPLIBRE_DIST) {
    // Serve MapLibre from a local copy where the CDN is not reachable.
    await page.route(/maplibre-gl@[^/]+\/dist\/maplibre-gl\.(js|css)$/, r => r.fulfill({ path: `${process.env.MAPLIBRE_DIST}/maplibre-gl.${r.request().url().endsWith('.css') ? 'css' : 'js'}` }));
  }
  if (process.env.OFFLINE_TILES) {
    await page.route(/openfreemap|arcgisonline/, r => r.abort());
    await page.route(/fonts\/.*\.pbf/, r => r.fulfill({ status: 200, body: Buffer.alloc(0), contentType: 'application/x-protobuf' }));
  }
  await page.goto(BASE);
  await page.waitForSelector('#mapLoading.done', { timeout: 45000 });
  const settle = () => page.evaluate(() => new Promise(r => { state.map.once('idle', r); setTimeout(r, 4000); }));
  const count = layer => page.evaluate(id => state.map.queryRenderedFeatures({ layers: [id] }).length, layer);
  for (const [name, center] of Object.entries(places)) {
    for (const zoom of [9, 11, 12, 14]) {
      await page.evaluate(([c, z]) => state.map.jumpTo({ center: c, zoom: z }), [center, zoom]);
      await settle();
      const bus = await count('tr-bus');
      const rail = (await count('tr-heavy')) + (await count('tr-light'));
      if (zoom < 10) expect(bus === 0, `${mode} ${name} z${zoom}: no bus routes at the regional view (${bus})`);
      else expect(bus > 0, `${mode} ${name} z${zoom}: bus routes drawn (${bus})`);
      if (zoom <= 12) expect(rail > 0, `${mode} ${name} z${zoom}: rail drawn (${rail})`);
    }
  }
  await page.evaluate(() => { openRoute('muni::38R'); });
  await page.waitForTimeout(1200);
  await page.evaluate(() => state.map.jumpTo({ center: [-122.45, 37.78], zoom: 9 }));
  await settle();
  expect(await count('tr-selected') > 0, `${mode}: a selected bus route is drawn even at zoom 9`);
  await page.evaluate(() => { goHome(); state.showBus = false; applyMapState(); state.map.jumpTo({ center: [-122.42, 37.775], zoom: 13 }); });
  await settle();
  expect(await count('tr-bus') === 0, `${mode}: the Bus lines switch hides bus routes`);
  expect(await page.evaluate(() => document.querySelector('#layersButton').classList.contains('filtered')), `${mode}: the layers button shows that a filter is on`);
  await page.evaluate(() => { state.showBus = true; applyMapState(); });
  expect(errors.length === 0, `${mode}: no page errors (${errors.join('; ')})`);
  await context.close();
}
await browser.close();
console.log(failures.length ? `\n${failures.length} map rendering checks failed` : '\nAll map rendering checks passed');
process.exit(failures.length ? 1 : 0);
