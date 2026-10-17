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
const handler = createHandler({ root, realtime, otp, stops: new StopSearch(network) });

http.createServer(handler).listen(port, () => {
  console.log(`Rove running at http://localhost:${port}`);
  console.log(`  static index: ${indexes.size}/${Object.keys(AGENCIES).length} agencies in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`  511 realtime: ${apiKey ? 'configured' : 'not configured'} · BART direct realtime: ${bartDirect ? 'on' : 'off'}`);
  console.log(`  routing: OpenTripPlanner at ${otp.url.replace(/\/\/[^/@]*@/, '//')}`);
});
