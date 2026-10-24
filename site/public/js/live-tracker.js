/* Rove live tracking: what to tell the rider, and when, from live vehicle data and their GPS.
 * Pure decision functions (tested in test/live-tracker.test.mjs); the app does the fetching,
 * rendering and speaking. Every message says "live" and never implies Rove saw the rider board. */
(function (root) {
  'use strict';
  const COUNTDOWN = [10, 5, 3, 2, 1]; // minutes before departure worth a spoken update

  function cardinal(deg) {
    if (!Number.isFinite(deg)) return '';
    return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round((((deg % 360) + 360) % 360) / 45) % 8];
  }
  function metersBetween(a, b) {
    const rad = Math.PI / 180, y = ((a[1] + b[1]) / 2) * rad;
    return Math.hypot((b[0] - a[0]) * Math.cos(y) * 111195, (b[1] - a[1]) * 111195);
  }
  function bearingTo(a, b) {
    const rad = Math.PI / 180, l1 = a[1] * rad, l2 = b[1] * rad, d = (b[0] - a[0]) * rad;
    return (Math.atan2(Math.sin(d) * Math.cos(l2), Math.cos(l1) * Math.sin(l2) - Math.sin(l1) * Math.cos(l2) * Math.cos(d)) / rad + 360) % 360;
  }
  const minutesWord = m => `${m} ${m === 1 ? 'minute' : 'minutes'}`;

  /* Spoken updates for a boarding or riding phase. `given` is a Set of keys already announced;
   * `memory` keeps the last announced delay. Returns [{ key, message, priority }] (2 = urgent). */
  function liveNotices({ kind, vehicleName, place, live, now, given, memory = {} }) {
    const out = [];
    if (!live) return out;
    if (live.status === 'canceled' && !given.has('canceled')) {
      out.push({ key: 'canceled', priority: 2, message: `The agency reports your ${vehicleName} as canceled. Open Help to find another route.` });
      return out;
    }
    if (live.status !== 'live') return out;
    if (kind === 'board' && live.board) {
      const mins = (live.board.time - now) / 60;
      if (mins <= 0.75 && mins > -2) {
        if (!given.has('arriving')) out.push({ key: 'arriving', priority: 2, message: `${vehicleName} should be arriving now, live. Confirm the route and direction before boarding.` });
      } else if (live.board.stopsAway === 1 && !given.has('one-stop')) {
        out.push({ key: 'one-stop', priority: 2, message: `${vehicleName} is one stop away, live. About ${minutesWord(Math.max(1, Math.round(mins)))}.` });
      } else {
        const t = COUNTDOWN.find(c => mins <= c && mins > c - 1);
        if (t && !given.has(`count:${t}`)) out.push({ key: `count:${t}`, priority: 1, message: `${vehicleName} in about ${minutesWord(t)}, live.` });
      }
      const delay = live.board.delay;
      if (Number.isFinite(delay) && Math.abs(delay - (memory.delay ?? 0)) >= 120) {
        const m = Math.round(Math.abs(delay) / 60);
        out.push({ key: `delay:${Math.round(delay / 60)}`, priority: 1, message: delay > 0 ? `${vehicleName} is now about ${minutesWord(m)} late, live.` : `${vehicleName} is running about ${minutesWord(m)} early, live.` });
      }
    }
    if (kind === 'ride' && live.exit && Number.isFinite(live.exit.stopsAway)) {
      const n = live.exit.stopsAway;
      if (n === 0 && !given.has('exit-next')) out.push({ key: 'exit-next', priority: 2, message: `${place} is the next stop, live. Get ready to exit, and confirm with the announcement.` });
      else if (n === 1 && !given.has('exit-2')) out.push({ key: 'exit-2', priority: 1, message: `Two stops to ${place}, live.` });
    }
    return out.filter(n => !given.has(n.key));
  }

  /* Walking guidance from GPS toward the stop. Advisory only: never confirms arrival. */
  function walkNotices({ fix, target, place, now, given, distanceWords }) {
    if (!fix || !target || !Number.isFinite(target[0])) return { notices: [], status: fix ? null : 'no-gps' };
    if (now - fix.time > 30000) return { notices: [], status: 'stale' };
    if (fix.accuracy > 35) return { notices: [], status: 'weak', accuracy: fix.accuracy };
    const d = metersBetween(fix.point, target);
    const dir = cardinal(bearingTo(fix.point, target));
    const notices = [];
    if (d <= 40 && !given.has('walk:close')) notices.push({ key: 'walk:close', priority: 2, message: `GPS estimate: ${place} should be very close. Confirm when you're there.` });
    else if (d <= 160 && d > 40 && !given.has('walk:near')) notices.push({ key: 'walk:near', priority: 1, message: `About ${distanceWords(d)} to ${place}, to the ${dir}. GPS estimate.` });
    return { notices, status: 'ok', meters: d, direction: dir, accuracy: fix.accuracy };
  }

  /* Pacing: urgent messages go now; others wait until `gapMs` after the last automatic message. */
  function createPacer(gapMs = 15000) {
    let last = -Infinity, pending = null;
    return {
      offer(notice, now) {
        if (notice.priority >= 2) { last = now; return notice; } // urgent: speak now, keep anything waiting
        if (now - last >= gapMs) { last = now; pending = null; return notice; }
        if (!pending || notice.priority >= pending.priority) pending = notice;
        return null;
      },
      flush(now) { if (pending && now - last >= gapMs) { const p = pending; pending = null; last = now; return p; } return null; }
    };
  }

  const api = Object.freeze({ cardinal, metersBetween, bearingTo, liveNotices, walkNotices, createPacer });
  root.RoveLive = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
