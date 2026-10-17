/**
 * Cached, coalesced, rate-limited fetcher for one realtime upstream.
 *
 * Behaviour (unchanged from the original server, now testable):
 * - A cached value younger than ttlMs is returned without an upstream call.
 * - Concurrent callers share one in-flight request.
 * - When the hourly budget is spent, the last good value is returned marked
 *   `rate-limited`; with no last good value, the call fails.
 * - When the upstream fails, the last good value is served marked `stale`
 *   while it is younger than staleMs; after that the error is surfaced.
 * - `stale` is also set when the feed header timestamp is older than staleMs,
 *   even if the HTTP request itself succeeded.
 */
export class RateBudget {
  constructor(limitPerHour, now = () => Date.now()) {
    this.limit = limitPerHour;
    this.now = now;
    this.times = [];
  }
  clean() { const cutoff = this.now() - 3_600_000; while (this.times.length && this.times[0] < cutoff) this.times.shift(); }
  used() { this.clean(); return this.times.length; }
  tryTake() { this.clean(); if (this.times.length >= this.limit) return false; this.times.push(this.now()); return true; }
}

export class FeedCache {
  /**
   * @param {object} o
   * @param {string} o.name
   * @param {() => Promise<ArrayBuffer>} o.load   performs the upstream request
   * @param {(buf: ArrayBuffer) => {headerTimestamp: number|null, items: any[]}} o.decode
   * @param {number} o.ttlMs
   * @param {number} o.staleMs
   * @param {RateBudget} [o.budget]
   * @param {() => number} [o.now]
   */
  constructor({ name, load, decode, ttlMs, staleMs, budget = null, now = () => Date.now() }) {
    Object.assign(this, { name, load, decode, ttlMs, staleMs, budget, now });
    this.last = null;
    this.inflight = null;
  }

  async get() {
    const now = this.now();
    const existing = this.last;
    if (existing && now - existing.fetchedAt < this.ttlMs) return { ...existing, cache: 'fresh', stale: this.#isStale(existing, now) };
    if (this.inflight) return this.inflight;
    // Note: the async body can finish synchronously (rate-limited path), so the in-flight slot is
    // cleared from outside the task; clearing it inside would run before the assignment below.
    const task = (async () => {
      try {
        if (this.budget && !this.budget.tryTake()) {
          if (existing) return { ...existing, cache: 'rate-limited', stale: this.#isStale(existing, now) || now - existing.fetchedAt >= this.staleMs, error: 'request budget reached' };
          throw new Error(`${this.name}: request budget reached and no cached data`);
        }
        const decoded = this.decode(await this.load());
        const fetchedAt = this.now();
        const value = { ...decoded, fetchedAt, error: null };
        this.last = value;
        return { ...value, cache: 'miss', stale: this.#isStale(value, fetchedAt) };
      } catch (error) {
        if (/request budget reached/.test(error.message)) throw error;
        if (existing && now - existing.fetchedAt < this.staleMs) return { ...existing, cache: 'stale', stale: true, error: error.message };
        throw error;
      }
    })();
    this.inflight = task;
    task.then(() => {}, () => {}).finally(() => { if (this.inflight === task) this.inflight = null; });
    return task;
  }

  #isStale(value, now) {
    const ageMs = value.headerTimestamp ? Math.max(0, now - value.headerTimestamp * 1000) : now - value.fetchedAt;
    return ageMs > this.staleMs;
  }
}

/** Fetch an upstream protobuf with a timeout. The URL is never logged or returned, because 511 URLs carry the API key. */
export function protobufLoader(urlFactory, { fetchImpl = fetch, timeoutMs = 15_000, label }) {
  return async () => {
    let response;
    try {
      response = await fetchImpl(urlFactory(), { headers: { Accept: 'application/x-protobuf', 'User-Agent': 'Rove-local/0.4' }, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      throw new Error(`${label} request failed (${error.name === 'TimeoutError' ? 'timeout' : 'network error'})`);
    }
    if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
    return response.arrayBuffer();
  };
}
