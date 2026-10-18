import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENCIES } from './lib/agencies.mjs';
import { createHandler } from './lib/app.mjs';
import { loadStaticIndexes } from './lib/gtfs/static-index.mjs';
import { RealtimeService } from './lib/realtime/service.mjs';
import { OtpClient } from './lib/routing/otp.mjs';
import { StopSearch } from './lib/stops-search.mjs';
import { PlaceIndex } from './lib/places.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const apiKey = process.env.SF_511_API_KEY?.trim() || undefined;
const bartDirect = process.env.BART_DIRECT_REALTIME !== 'off';

const started = Date.now();
const { indexes, errors } = await loadStaticIndexes(Object.values(AGENCIES), path.join(root, 'data/extracted'));
for (const e of errors) console.warn(`Static index unavailable: ${e}`);

const network = JSON.parse(fs.readFileSync(path.join(root, 'public/data/network.json'), 'utf8'));
const realtime = new RealtimeService({ indexes, apiKey, bartDirect, matchLogFile: path.join(root, 'data/reports/match-rates.jsonl') });
const otp = new OtpClient();
const placesFile = process.env.ROVE_PLACES_DB || path.join(root, 'data/places/bay-area-places.sqlite');
const { index: places, reason: placesReason } = await PlaceIndex.open(placesFile);
if (!places) console.warn(`Address search unavailable: ${placesReason}`);
// ROVE_FRONTEND_DIR: serve the page files (index.html, app.js, styles.css, public/ except public/data/)
// from a separate frontend checkout, for previewing both branches together without merging them.
const frontendRoot = process.env.ROVE_FRONTEND_DIR ? path.resolve(process.env.ROVE_FRONTEND_DIR.replace(/^~(?=\/)/, process.env.HOME || '~')) : root;
if (frontendRoot !== root && !fs.existsSync(path.join(frontendRoot, 'index.html'))) { console.error(`ROVE_FRONTEND_DIR has no index.html: ${frontendRoot}`); process.exit(1); }
const handler = createHandler({ root, frontendRoot, realtime, otp, stops: new StopSearch(network), places, placesUnavailableReason: placesReason });

// Local only unless HOST says otherwise (HOST=0.0.0.0 to reach it from another device on a trusted network).
const host = process.env.HOST || '127.0.0.1';
http.createServer(handler).listen(port, host, () => {
  console.log(`Rove running at http://localhost:${port}${host === '127.0.0.1' ? '' : ` (listening on ${host})`}`);
  console.log(`  static index: ${indexes.size}/${Object.keys(AGENCIES).length} agencies in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`  511 realtime: ${apiKey ? 'configured' : 'not configured'} · BART direct realtime: ${bartDirect ? 'on' : 'off'}`);
  console.log(`  address search: ${places ? Object.entries(places.meta.counts || {}).map(([k, v]) => `${v.toLocaleString()} ${k}`).join(', ') : 'unavailable'}`);
  console.log(`  routing: OpenTripPlanner at ${otp.url.replace(/\/\/[^/@]*@/, '//')}`);
  console.log(`  frontend: ${frontendRoot === root ? 'this repository' : frontendRoot}`);
});
