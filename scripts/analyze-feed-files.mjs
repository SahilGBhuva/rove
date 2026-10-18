// Run captured GTFS-Realtime protobuf files through Rove's real matcher and static index.
// Usage: node scripts/analyze-feed-files.mjs --source bart|511 [--json out.json] file.pb [file.pb ...]
// Captures are real upstream responses saved to disk (for example from the browser when the
// shell cannot reach the host). Nothing here is synthesized.
import fs from 'node:fs';
import path from 'node:path';
import { AGENCIES } from '../lib/agencies.mjs';
import { loadStaticIndexes } from '../lib/gtfs/static-index.mjs';
import { decode, decodeFeedMessage } from '../lib/realtime/decode.mjs';
import { RealtimeMatcher, arrivalsForStop } from '../lib/realtime/match.mjs';

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const source = opt('--source') || 'bart';
const jsonOut = opt('--json');
const files = args;
if (!files.length) { console.error('usage: analyze-feed-files.mjs --source bart|511 file.pb ...'); process.exit(2); }

const root = path.resolve(import.meta.dirname, '..');
const { indexes, errors } = await loadStaticIndexes(Object.values(AGENCIES), path.join(root, 'data/extracted'));
if (errors.length) console.warn(errors.join('\n'));
const matcher = new RealtimeMatcher(indexes);

const out = [];
for (const file of files) {
  const buf = fs.readFileSync(file);
  const kind = (() => { const f = decodeFeedMessage(buf); return f.entity.some(e => e.tripUpdate) ? 'updates' : f.entity.some(e => e.vehicle) ? 'vehicles' : 'alerts'; })();
  const decoded = decode(kind, buf);
  const header = decoded.headerTimestamp;
  const batch = source === 'bart' ? { source: 'bart', agency: AGENCIES.bart, [kind]: decoded.items } : { source: '511', [kind]: decoded.items };
  const r = matcher.match([batch]);
  const agencies = Object.fromEntries(Object.entries(r.quality).filter(([, q]) => q.tripUpdates || q.vehicles));
  const unmatchedTrips = r.updates.filter(u => u.tripMatch !== 'matched').map(u => `${u.agency}:${u.rawTripId}=${u.tripMatch}`);
  const unmatchedStops = [...new Set(r.updates.flatMap(u => u.stopTimes.filter(s => !s.stopId && u.tripMatch === 'matched').map(s => `${u.agency}:${s.rawStopId}${s.conflict ? ` (${s.conflict})` : ''}`)))];
  const summary = {
    file: path.basename(file), kind, entities: decoded.items.length,
    headerTimestamp: header, headerAgeAtCaptureSeconds: null,
    agencies: Object.fromEntries(Object.entries(agencies).map(([id, q]) => [id, {
      tripUpdates: q.tripUpdates, tripMatched: q.tripMatched, tripMatchPct: q.tripMatchPct, documentedExceptions: q.documentedExceptions,
      addedTrips: q.addedTrips, serviceDateMismatch: q.serviceDateMismatch, tripUnknown: q.tripUnknown, canceledTrips: q.canceledTrips,
      stopTimes: q.stopTimes, stopMatched: q.stopMatched, stopMatchPct: q.stopMatchPct, stopMethods: q.stopMethods, stopConflicts: q.stopConflicts,
      sequenceMismatches: q.sequenceMismatches, platformChanges: q.platformChanges, skippedStops: q.skippedStops, noDataStops: q.noDataStops,
      vehicles: q.vehicles, vehicleMatchPct: q.vehicleMatchPct, arrivalsVerified: q.arrivalsVerified, gateReasons: q.gateReasons
    }])),
    unmatchedTripSample: unmatchedTrips.slice(0, 15), unmatchedStopSample: unmatchedStops.slice(0, 15),
    rawSample: decoded.items.slice(0, 2)
  };
  if (kind === 'updates') {
    // Example boards at a few busy stations, computed by the same function the API uses.
    const now = header || Date.now() / 1000;
    const sample = source === 'bart' ? [['bart', 'POWL', ['M30-1', 'M30-2']], ['bart', 'MCAR', []], ['bart', '12TH', []]] : [];
    summary.boards = sample.map(([agencyId, stopId, kids]) => {
      const children = kids.length ? kids : [...indexes.get(agencyId).stops.entries()].filter(([, s]) => s.parent === stopId).map(([id]) => id);
      const b = arrivalsForStop({ updates: r.updates, quality: r.quality, agencyId, stopId, now, includeChildStops: children });
      // Show the board even when the gate hides it, so a human can inspect correctness.
      const raw = r.updates.filter(u => u.agency === agencyId && u.tripMatch === 'matched').flatMap(u => u.stopTimes.filter(s => s.stopId && (s.stopId === stopId || children.includes(s.stopId)) && (s.departure ?? s.arrival)).map(s => ({ route: u.routeName, headsign: u.headsign, platform: s.stopId, inMin: Math.round(((s.departure ?? s.arrival) - now) / 60), delay: s.delay }))).sort((a, b2) => a.inMin - b2.inMin).slice(0, 8);
      return { stopId, status: b.status, next: raw };
    });
  }
  out.push(summary);
  console.log(JSON.stringify({ ...summary, rawSample: undefined }, null, 2));
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(out, null, 2) + '\n');
