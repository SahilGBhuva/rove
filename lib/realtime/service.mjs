import { AGENCIES, agencyFromPrefixedId, agencyFromRtPrefix } from '../agencies.mjs';
import { decode } from './decode.mjs';
import { FeedCache, RateBudget, protobufLoader } from './feed-cache.mjs';
import { RealtimeMatcher } from './match.mjs';
import { MatchRateLog } from './match-log.mjs';

export const FEED_POLICY = Object.freeze({
  vehicles: { ttlMs: 120_000, staleMs: 270_000 },
  updates: { ttlMs: 180_000, staleMs: 390_000 },
  alerts: { ttlMs: 900_000, staleMs: 1_230_000 },
  bartUpdates: { ttlMs: 30_000, staleMs: 120_000 },
  bartAlerts: { ttlMs: 300_000, staleMs: 900_000 }
});
export const MAX_511_REQUESTS_PER_HOUR = 54;

export const BART_ENDPOINTS = Object.freeze({
  updates: process.env.BART_TRIP_UPDATES_URL || 'https://api.bart.gov/gtfsrt/tripupdate.aspx',
  alerts: process.env.BART_ALERTS_URL || 'https://api.bart.gov/gtfsrt/alerts.aspx'
});

/** Live data older than this is never shown as live, whatever the feed reports. */
export const MAX_LIVE_AGE_SECONDS = 15 * 60;

/**
 * Whether an agency's live arrivals can be shown right now, and if not, why, in words a rider can read.
 * Shared by /api/v2/arrivals and /api/v2/status so both always agree.
 */
export function liveArrivalState(snapshot, agencyId, nowMs = Date.now()) {
  const bart = agencyId === 'bart' && snapshot.configured?.bartDirect;
  const key = bart ? 'bartUpdates' : 'updates';
  const source = bart ? 'BART' : '511';
  if (!bart && !snapshot.configured?.feed511) return { verified: false, reasons: ['Live data from 511 is not configured on this server.'] };
  const feed = snapshot.feeds?.[key];
  const failure = (snapshot.errors || []).find(e => e.feed === key);
  if (!feed) return { verified: false, reasons: [`The ${source} live feed could not be reached${failure ? ` (${failure.message})` : ''}.`] };
  const newest = feed.headerTimestamp ? feed.headerTimestamp * 1000 : feed.fetchedAt;
  const ageSeconds = newest ? Math.max(0, Math.round((nowMs - newest) / 1000)) : null;
  if (ageSeconds != null && ageSeconds > MAX_LIVE_AGE_SECONDS) {
    return { verified: false, ageSeconds, reasons: [`The newest ${source} live data is ${Math.round(ageSeconds / 60)} minutes old.`] };
  }
  const q = snapshot.quality?.[agencyId];
  if (!q) return { verified: false, ageSeconds, reasons: [`The ${source} live feed has no data for this agency right now.`] };
  if (!q.arrivalsVerified) return { verified: false, ageSeconds, reasons: q.gateReasons || [] };
  return { verified: true, ageSeconds, stale: Boolean(feed.stale), reasons: [] };
}

const policySummary = () => Object.fromEntries(Object.entries(FEED_POLICY).map(([k, v]) => [k, { pollSeconds: v.ttlMs / 1000, staleSeconds: v.staleMs / 1000 }]));

function feedMeta(result) {
  if (!result) return null;
  return { headerTimestamp: result.headerTimestamp ?? null, fetchedAt: result.fetchedAt ?? null, stale: Boolean(result.stale), cache: result.cache ?? null, error: result.error ?? null };
}

/** Tag an alert with the Rove agencies it informs. */
function alertAgencies(alert, sourceAgency) {
  if (sourceAgency) return [sourceAgency.id];
  const ids = new Set();
  for (const e of alert.entities) {
    const a = agencyFromRtPrefix(e.agencyId) || agencyFromPrefixedId(e.routeId) || agencyFromPrefixedId(e.stopId) || agencyFromPrefixedId(e.tripId);
    if (a) ids.add(a.id);
  }
  return [...ids];
}

export class RealtimeService {
  /**
   * @param {object} o
   * @param {Map} o.indexes static indexes by agency id
   * @param {string|undefined} o.apiKey 511 key (held only in memory, never returned)
   * @param {object} [o.loaders] test hook: { vehicles, updates, alerts, bartUpdates, bartAlerts } -> () => Promise<ArrayBuffer>
   * @param {boolean} [o.bartDirect]
   * @param {() => number} [o.now]
   * @param {string} [o.matchLogFile]
   */
  constructor({ indexes, apiKey, loaders = {}, bartDirect = true, now = () => Date.now(), matchLogFile = null, fetchImpl = fetch }) {
    this.indexes = indexes;
    this.configured511 = Boolean(apiKey);
    this.bartDirect = bartDirect;
    this.now = now;
    this.matcher = new RealtimeMatcher(indexes);
    this.matchLog = new MatchRateLog({ file: matchLogFile, now });
    this.budget = new RateBudget(MAX_511_REQUESTS_PER_HOUR, now);
    const url511 = type => () => `https://api.511.org/transit/${type}?agency=RG&api_key=${encodeURIComponent(apiKey)}`;
    const make = (key, type, loader) => new FeedCache({
      name: key, load: loader, decode: buf => decode(type, buf),
      ttlMs: FEED_POLICY[key].ttlMs, staleMs: FEED_POLICY[key].staleMs,
      budget: key.startsWith('bart') ? null : this.budget, now
    });
    this.feeds = {
      vehicles: make('vehicles', 'vehicles', loaders.vehicles || protobufLoader(url511('vehiclepositions'), { fetchImpl, label: '511 vehicle positions' })),
      updates: make('updates', 'updates', loaders.updates || protobufLoader(url511('tripupdates'), { fetchImpl, label: '511 trip updates' })),
      alerts: make('alerts', 'alerts', loaders.alerts || protobufLoader(url511('servicealerts'), { fetchImpl, label: '511 alerts' })),
      bartUpdates: make('bartUpdates', 'updates', loaders.bartUpdates || protobufLoader(() => BART_ENDPOINTS.updates, { fetchImpl, label: 'BART trip updates' })),
      bartAlerts: make('bartAlerts', 'alerts', loaders.bartAlerts || protobufLoader(() => BART_ENDPOINTS.alerts, { fetchImpl, label: 'BART alerts' }))
    };
    this.memo = null;
  }

  async #fetchAll() {
    const wanted = [];
    if (this.configured511) wanted.push('vehicles', 'updates', 'alerts');
    if (this.bartDirect) wanted.push('bartUpdates', 'bartAlerts');
    const settled = await Promise.allSettled(wanted.map(k => this.feeds[k].get()));
    const results = {};
    const errors = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') results[wanted[i]] = r.value;
      else errors.push({ feed: wanted[i], message: r.reason?.message || String(r.reason) });
    });
    return { results, errors };
  }

  /** Full matched snapshot shared by every realtime endpoint. */
  async snapshot() {
    const { results, errors } = await this.#fetchAll();
    const key = ['vehicles', 'updates', 'alerts', 'bartUpdates', 'bartAlerts'].map(k => results[k]?.fetchedAt ?? '-').join('|');
    if (this.memo?.key === key) return { ...this.memo.value, errors };

    const bartLive = Boolean(results.bartUpdates && !results.bartUpdates.stale);
    const drop511Bart = item => bartLive && agencyFromPrefixedId(item.tripId || item.routeId)?.id === 'bart';
    const batches = [];
    if (results.updates || results.vehicles) {
      batches.push({ source: '511', updates: (results.updates?.items || []).filter(u => !drop511Bart(u)), vehicles: results.vehicles?.items || [] });
    }
    if (results.bartUpdates) batches.push({ source: 'bart', agency: AGENCIES.bart, updates: results.bartUpdates.items });
    const matched = this.matcher.match(batches);

    const alerts = [];
    for (const a of results.alerts?.items || []) {
      const agencies = alertAgencies(a, null);
      if (results.bartAlerts && agencies.length === 1 && agencies[0] === 'bart') continue; // BART's own alert feed replaces 511's copy
      alerts.push({ ...a, source: '511', agencies });
    }
    for (const a of results.bartAlerts?.items || []) alerts.push({ ...a, source: 'bart', agencies: ['bart'] });

    // Only record quality for agencies that actually had live input this snapshot.
    this.matchLog.record(key, matched.quality);
    const value = {
      generatedAt: this.now(),
      configured: { feed511: this.configured511, bartDirect: this.bartDirect },
      feeds: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, feedMeta(v)])),
      requestBudget: { used: this.budget.used(), limit: MAX_511_REQUESTS_PER_HOUR },
      policy: policySummary(),
      quality: matched.quality,
      unassigned: matched.unassigned,
      updates: matched.updates,
      vehicles: matched.vehicles,
      alerts
    };
    this.memo = { key, value };
    return { ...value, errors };
  }

  /**
   * Response for the existing `/api/realtime` contract used by app.js.
   * IDs are now exact: routeId/stopId are `PREFIX:static_id` only when the
   * server resolved them exactly, and empty otherwise, so the browser's
   * suffix matcher can no longer attach a prediction to the wrong route.
   * Arrival predictions are withheld for agencies that fail the live quality gate.
   */
  async legacy() {
    if (!this.configured511 && !this.bartDirect) {
      return { configured: false, live: false, reason: 'SF_511_API_KEY is not configured', meta: { feedPolicy: policySummary(), requestBudget: { used: this.budget.used(), limit: MAX_511_REQUESTS_PER_HOUR } } };
    }
    const s = await this.snapshot();
    const pref = (agencyId, id) => id ? `${AGENCIES[agencyId].rtPrefix}:${id}` : '';
    const vehicles = s.vehicles.map(v => ({
      id: v.id, label: v.label, tripId: v.rawTripId, routeId: pref(v.agency, v.routeId), directionId: v.directionId,
      lat: v.lat, lon: v.lon, bearing: v.bearing, speed: v.speed, timestamp: v.timestamp, stopId: pref(v.agency, v.stopId), currentStopSequence: null, status: v.status
    }));
    const updates = s.updates.map(u => {
      const verified = s.quality[u.agency]?.arrivalsVerified && u.tripMatch === 'matched' && u.tripStatus !== 'CANCELED';
      return {
        id: u.rawTripId, tripId: u.rawTripId, routeId: u.tripMatch === 'matched' ? pref(u.agency, u.routeId) : '', directionId: u.directionId,
        timestamp: u.timestamp, delay: u.delay, tripStatus: u.tripStatus,
        stopTimes: verified ? u.stopTimes.filter(st => st.stopId && st.relationship !== 'SKIPPED' && (st.arrival || st.departure))
          .map(st => ({ stopId: pref(u.agency, st.stopId), sequence: st.sequence, arrival: st.arrival, departure: st.departure, delay: st.delay, relationship: st.relationship })) : []
      };
    });
    const legacyAlerts = s.alerts.map(a => ({
      id: a.id, header: a.header, description: a.description, cause: a.cause, effect: a.effect, activePeriods: a.activePeriods,
      entities: a.source === 'bart'
        ? a.entities.map(e => ({ agencyId: 'BA', routeId: pref('bart', e.routeId), stopId: pref('bart', e.stopId), tripId: e.tripId }))
        : a.entities
    }));
    const updatesFeed = s.feeds.updates || s.feeds.bartUpdates;
    return {
      configured: true,
      live: Boolean(s.feeds.vehicles || s.feeds.updates || s.feeds.alerts || s.feeds.bartUpdates),
      generatedAt: s.generatedAt,
      meta: { feedPolicy: s.policy, requestBudget: s.requestBudget, errors: s.errors.map(e => e.message) },
      quality: Object.fromEntries(Object.entries(s.quality).map(([id, q]) => [id, { arrivalsVerified: q.arrivalsVerified, tripMatchPct: q.tripMatchPct, stopMatchPct: q.stopMatchPct, vehicleMatchPct: q.vehicleMatchPct }])),
      vehicles: { ...(s.feeds.vehicles || {}), items: vehicles },
      updates: { ...(updatesFeed || {}), stale: Boolean(s.feeds.updates?.stale || s.feeds.bartUpdates?.stale), items: updates },
      alerts: { ...(s.feeds.alerts || s.feeds.bartAlerts || {}), items: legacyAlerts }
    };
  }

  status() {
    return {
      configured: this.configured511,
      bartDirect: this.bartDirect,
      feedPolicy: policySummary(),
      requestLimitPerHour: MAX_511_REQUESTS_PER_HOUR,
      staticAgencies: [...this.indexes.keys()]
    };
  }
}
