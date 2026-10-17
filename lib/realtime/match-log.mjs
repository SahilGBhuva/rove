import fs from 'node:fs';
import path from 'node:path';

const SUM_FIELDS = ['tripUpdates', 'tripMatched', 'documentedExceptions', 'addedTrips', 'stopTimes', 'stopMatched', 'stopConflicts', 'vehicles', 'vehiclesMatched'];

const hourKey = ms => new Date(ms).toISOString().slice(0, 13) + ':00Z';

/**
 * Aggregates match quality into hourly buckets. Each distinct feed snapshot is
 * counted once. Completed hours are appended to a JSONL file (ignored by Git).
 */
export class MatchRateLog {
  constructor({ file = null, keepHours = 48, now = () => Date.now() } = {}) {
    Object.assign(this, { file, keepHours, now });
    this.current = null;
    this.history = [];
    this.seen = new Set();
  }

  record(snapshotKey, quality) {
    if (this.seen.has(snapshotKey)) return;
    this.seen.add(snapshotKey);
    if (this.seen.size > 500) this.seen = new Set([snapshotKey]);
    const hour = hourKey(this.now());
    if (this.current && this.current.hour !== hour) this.#close();
    if (!this.current) this.current = { hour, snapshots: 0, agencies: {} };
    this.current.snapshots++;
    for (const [agency, q] of Object.entries(quality)) {
      const bucket = this.current.agencies[agency] ||= Object.fromEntries(SUM_FIELDS.map(f => [f, 0]));
      for (const f of SUM_FIELDS) bucket[f] += q[f] || 0;
    }
  }

  #close() {
    const done = MatchRateLog.summarize(this.current);
    this.history.push(done);
    if (this.history.length > this.keepHours) this.history.shift();
    if (this.file) {
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.appendFileSync(this.file, JSON.stringify(done) + '\n');
      } catch (error) {
        console.error(`match-rate log write failed: ${error.message}`);
      }
    }
    this.current = null;
  }

  static summarize(bucket) {
    const pct = (a, b) => b ? Number((a * 100 / b).toFixed(1)) : null;
    return {
      hour: bucket.hour,
      snapshots: bucket.snapshots,
      agencies: Object.fromEntries(Object.entries(bucket.agencies).map(([id, s]) => [id, {
        ...s,
        tripMatchPct: pct(s.tripMatched, s.tripUpdates - s.documentedExceptions - s.addedTrips),
        stopMatchPct: pct(s.stopMatched, s.stopTimes),
        vehicleMatchPct: pct(s.vehiclesMatched, s.vehicles)
      }]))
    };
  }

  report() {
    return { currentHour: this.current ? MatchRateLog.summarize(this.current) : null, completedHours: [...this.history] };
  }
}
