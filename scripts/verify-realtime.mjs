// Measure live static/realtime match quality through a running Rove server (npm start).
// Writes data/reports/realtime-verification.json (ignored by Git). Prints no credentials.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const base = process.env.ROVE_URL || 'http://localhost:4173';
const response = await fetch(`${base}/api/v2/realtime/quality`, { signal: AbortSignal.timeout(60_000) });
if (!response.ok) throw new Error(`Rove quality API returned ${response.status}`);
const q = await response.json();

const agencies = Object.fromEntries(Object.entries(q.quality).map(([id, a]) => [id, {
  tripUpdates: a.tripUpdates, vehicles: a.vehicles,
  tripMatchPct: a.tripMatchPct, stopMatchPct: a.stopMatchPct, vehicleMatchPct: a.vehicleMatchPct,
  stopMethods: a.stopMethods, stopConflicts: a.stopConflicts, sequenceMismatches: a.sequenceMismatches,
  documentedExceptions: a.documentedExceptions, addedTrips: a.addedTrips, serviceDateMismatch: a.serviceDateMismatch,
  canceledTrips: a.canceledTrips, skippedStops: a.skippedStops, noDataStops: a.noDataStops,
  arrivalsVerified: a.arrivalsVerified, gateReasons: a.gateReasons, samples: a.samples
}]));
const report = { verifiedAt: new Date().toISOString(), feeds: q.feeds, errors: q.errors, unassigned: q.unassigned, agencies, hourly: q.hourly };
fs.mkdirSync(path.join(root, 'data/reports'), { recursive: true });
fs.writeFileSync(path.join(root, 'data/reports/realtime-verification.json'), JSON.stringify(report, null, 2) + '\n');

const rows = Object.entries(agencies).map(([id, a]) => `${id.padEnd(9)} trips ${String(a.tripUpdates).padStart(5)}  trip ${String(a.tripMatchPct ?? '-').padStart(5)}%  stop ${String(a.stopMatchPct ?? '-').padStart(5)}%  vehicles ${String(a.vehicles).padStart(4)}  arrivals ${a.arrivalsVerified ? 'VERIFIED' : 'hidden: ' + a.gateReasons.join('; ')}`);
console.log(rows.join('\n'));
for (const e of q.errors || []) console.log(`feed error: ${e.feed}: ${e.message}`);
