/* Rove journey guide: turns a planned itinerary into confirmed rider phases.
 *
 * Principles (do not weaken without review):
 * - The rider confirms every boarding, exit, and arrival. GPS and the clock never advance a phase.
 * - Reminders are timed from the itinerary's own times and always say whether those are live or scheduled.
 * - Platform, stop count, and vehicle details are stated only when the planner supplied them.
 * Runs as a plain browser script; Node tests load it through require().
 */
(function (root) {
  'use strict';
  const MIN = 60000;
  const TINY_WALK_METERS = 25;

  const clean = (v, fallback) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, 120) : fallback);
  const time = v => { const t = v instanceof Date ? v.getTime() : Date.parse(v); return Number.isFinite(t) ? t : null; };
  const defaultClock = ms => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });
  const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
  /* US riders: feet under about 0.2 miles, then tenths of a mile. Always spelled out for speech. */
  function distanceWords(meters) {
    const feet = meters * 3.28084;
    if (feet < 1000) { const f = feet < 200 ? Math.max(10, Math.round(feet / 10) * 10) : Math.round(feet / 50) * 50; return `${f} feet`; }
    const miles = Math.round((meters / 1609.34) * 10) / 10;
    return `${miles} ${miles === 1 ? 'mile' : 'miles'}`;
  }
  const squash = s => s.replace(/\s+/g, ' ').trim();

  /* Rider-facing description of a transit leg, by agency and mode. */
  function vehicle(leg) {
    const agency = leg.agencyId || '';
    const mode = String(leg.transitMode || '').toUpperCase();
    const route = clean(leg.routeName, '');
    const trainNo = clean(leg.tripShortName, '');
    if (agency === 'bart') {
      const color = /^(red|orange|yellow|green|blue|grey|gray|beige)/i.exec(route)?.[1];
      return { agency: 'BART', noun: 'train', name: color ? `BART ${color[0].toUpperCase()}${color.slice(1).toLowerCase()} line` : 'BART train', check: 'Listen for the destination announcement at the train doors, or ask station staff.' };
    }
    if (agency === 'caltrain') {
      return { agency: 'Caltrain', noun: 'train', name: squash(`Caltrain ${route} train ${trainNo}`), check: trainNo ? `Confirm train ${trainNo} and its direction with the conductor or platform announcement.` : 'Confirm the train direction with the conductor or platform announcement.' };
    }
    if (agency === 'vta') {
      if (mode === 'TRAM' || /line/i.test(route)) return { agency: 'VTA', noun: 'light rail train', name: squash(`VTA ${route || 'light rail'}`), check: 'Listen for the destination announcement, or ask the operator.' };
      return { agency: 'VTA', noun: 'bus', name: squash(`VTA ${route} bus`), check: 'Ask the driver to confirm the route number and direction as you board.' };
    }
    if (agency === 'act') return { agency: 'AC Transit', noun: 'bus', name: squash(`AC Transit ${route} bus`), check: 'Ask the driver to confirm the route number and direction as you board.' };
    if (agency === 'muni') {
      if (mode === 'CABLE_CAR') return { agency: 'Muni', noun: 'cable car', name: squash(`Muni ${route} cable car`), check: 'Ask the operator to confirm the line before boarding.' };
      if (mode === 'TRAM' || mode === 'SUBWAY') return { agency: 'Muni', noun: 'train', name: squash(`Muni ${route} train`), check: 'Listen for the line and destination announcement, or ask the operator.' };
      return { agency: 'Muni', noun: 'bus', name: squash(`Muni ${route} bus`), check: 'Ask the driver to confirm the route number and direction as you board.' };
    }
    const noun = mode === 'BUS' ? 'bus' : mode === 'FERRY' ? 'ferry' : 'vehicle';
    return { agency: '', noun, name: route ? `${route} ${noun}` : `the ${noun}`, check: 'Confirm the route and direction with the operator or announcements before boarding.' };
  }

  function timing(leg) {
    if (leg.canceled) return { live: false, text: 'This trip is marked canceled.' };
    if (leg.realtime) {
      const d = Number.isFinite(leg.delaySeconds) ? Math.round(leg.delaySeconds / 60) : 0;
      return { live: true, text: d > 0 ? `Live time, about ${plural(d, 'minute')} late.` : d < 0 ? `Live time, about ${plural(-d, 'minute')} early.` : 'Live time.' };
    }
    return { live: false, text: 'Scheduled time, not live.' };
  }

  /* Builds the ordered list of phases from normalized itinerary legs. */
  function buildGuide(itinerary, opts = {}) {
    const clock = opts.clock || defaultClock;
    const legs = Array.isArray(itinerary?.legs) ? itinerary.legs : [];
    const destination = clean(opts.destinationName, clean(legs[legs.length - 1]?.to?.name, 'your destination'));
    const phases = [];
    const transitIdx = legs.map((l, i) => (l?.mode === 'TRANSIT' ? i : -1)).filter(i => i >= 0);
    legs.forEach((leg, i) => {
      if (!leg) return;
      const prevTransit = transitIdx.filter(t => t < i).pop();
      const nextTransit = transitIdx.find(t => t > i);
      if (leg.mode !== 'TRANSIT') {
        const meters = Number.isFinite(leg.distanceMeters) ? leg.distanceMeters : null;
        const last = i === legs.length - 1;
        // A few metres between a place and its stop is not worth a confirmation tap.
        if (meters != null && meters < TINY_WALK_METERS && (last || nextTransit === i + 1)) return;
        const between = prevTransit != null && nextTransit != null;
        const target = last ? destination : clean(leg.to?.name, 'the next stop');
        const nextVehicle = nextTransit != null ? vehicle(legs[nextTransit]) : null;
        const drive = leg.mode === 'CAR';
        const verified = !drive && Array.isArray(leg.steps) && leg.steps.length > 0 && Boolean(leg.geometry);
        phases.push({
          kind: drive ? 'drive' : between ? 'transfer' : 'walk', legIndex: i, leg,
          heading: drive ? `Drive to ${target}` : between ? `Transfer to ${nextVehicle.name}` : `Go to ${target}`,
          place: target,
          facts: [
            between ? `Change services here. Walk toward ${target}; confirm the boarding point before crossing or entering a platform.` : null,
            between && nextVehicle ? `Next service: ${nextVehicle.name}.` : null,
            meters != null ? `About ${distanceWords(meters)}${verified || drive ? '' : ', straight-line estimate'}` : null,
            verified || drive ? (between ? 'Follow station signs or ask staff to verify the accessible transfer path; Rove does not detect obstacles or platform edges.' : null) : 'Walking path not verified. Use your usual mobility aids for crossings and obstacles.'
          ].filter(Boolean),
          confirmLabel: last ? "I've arrived" : `I'm at ${target}`,
          confirmSpeech: `Confirmed at ${target}.`
        });
        return;
      }
      const v = vehicle(leg);
      const headsign = clean(leg.headsign, '');
      const from = clean(leg.from?.name, 'the stop');
      const to = clean(leg.to?.name, 'your stop');
      const platform = clean(leg.from?.platform, '');
      const departs = time(leg.startTime);
      const arrives = time(leg.endTime);
      const stops = Array.isArray(leg.intermediateStops) ? leg.intermediateStops.length + 1 : null;
      const t = timing(leg);
      const nextLeg = nextTransit != null ? legs[nextTransit] : null;
      const nextStart = nextLeg ? time(nextLeg.startTime) : null;
      const connectMin = nextStart != null && arrives != null ? Math.round((nextStart - arrives) / MIN) : null;
      const toward = headsign ? ` toward ${headsign}` : '';
      if (!leg.staySeated) {
        phases.push({
          kind: 'board', legIndex: i, leg, vehicle: v, isTransfer: prevTransit != null, departs, live: t.live, canceled: Boolean(leg.canceled),
          heading: `Board ${v.name}`,
          place: from,
          facts: [
            headsign ? `Toward ${headsign}` : 'Direction not provided. Ask the operator before boarding.',
            `At ${from}`,
            platform ? `Platform ${platform}` : v.noun === 'bus' ? null : 'Platform not provided. Check signs or ask staff.',
            departs != null ? `Departs ${clock(departs)}. ${t.text}` : t.text
          ].filter(Boolean),
          check: v.check,
          confirmLabel: "I've boarded",
          confirmAria: `I've boarded ${v.name}${toward}`,
          confirmSpeech: `Boarding confirmed: ${v.name}${toward}. Rove cannot verify the vehicle, so keep listening for announcements.`
        });
      }
      phases.push({
        kind: 'ride', legIndex: i, leg, vehicle: v, arrives, live: t.live, stops, connectMin, staySeated: Boolean(leg.staySeated),
        heading: `Ride to ${to}`,
        place: to,
        facts: [
          leg.staySeated ? `Stay on board. It continues as ${v.name}${toward}.` : null,
          `Get off at ${to}`,
          stops ? plural(stops, 'stop') : null,
          arrives != null ? `Arrives ${clock(arrives)}. ${t.text}` : t.text,
          nextLeg ? `Then transfer to ${vehicle(nextLeg).name}${connectMin != null ? `; ${connectMin <= 0 ? 'connection may already be missed' : connectMin < 7 ? `only ${plural(connectMin, 'minute')} scheduled to connect; consider another route if you need more time` : `${plural(connectMin, 'minute')} scheduled to connect`}` : ''}. Verify the next boarding location with station signs or staff.` : null
        ].filter(Boolean),
        confirmLabel: "I've got off",
        confirmAria: `I've got off at ${to}`,
        confirmSpeech: `Exit confirmed at ${to}.`
      });
    });
    phases.push({ kind: 'arrive', legIndex: legs.length, heading: `You've arrived at ${destination}`, place: destination, facts: [], confirmLabel: 'End trip', confirmSpeech: 'Trip ended.' });
    return { phases, destination };
  }

  /* Full spoken instruction for the phase (Repeat, and on entering a phase). */
  function speech(phase, opts = {}) {
    const clock = opts.clock || defaultClock;
    if (!phase) return '';
    if (phase.kind === 'arrive') return `${phase.heading}. Choose Done to finish.`;
    if (phase.kind === 'board') {
      const headsign = clean(phase.leg.headsign, '');
      const platform = clean(phase.leg.from?.platform, '');
      const parts = [`${phase.isTransfer ? 'Transfer. ' : ''}At ${phase.place}, board ${phase.vehicle.name}${headsign ? ` toward ${headsign}.` : '. The direction was not provided; ask the operator.'}`];
      if (platform) parts.push(`Platform ${platform}.`);
      if (phase.canceled) parts.push('This trip is marked canceled. Open Help to find another route.');
      else if (phase.departs != null) parts.push(`It departs at ${clock(phase.departs)}, ${phase.live ? 'live time' : 'scheduled time'}.`);
      parts.push(phase.check, "When you are on board, choose I've boarded.");
      return parts.join(' ');
    }
    if (phase.kind === 'ride') {
      const parts = [`Ride to ${phase.place}.`];
      if (phase.stops) parts.push(`${plural(phase.stops, 'stop')}.`);
      if (phase.arrives != null) parts.push(`Arrival ${clock(phase.arrives)}, ${phase.live ? 'live time' : 'by the schedule'}.`);
      if (phase.connectMin != null) parts.push(phase.connectMin <= 0 ? 'Your connection may already be missed. Open Help to find another route from your location.' : phase.connectMin < 7 ? `Only ${plural(phase.connectMin, 'minute')} scheduled for the transfer. You can open Help and find another route from your location if you need more time.` : `About ${plural(phase.connectMin, 'minute')} scheduled for your transfer. Verify the next boarding point with station staff.`);
      parts.push("Rove will remind you before your stop. Confirm it with the onboard announcement, then choose I've got off.");
      return parts.join(' ');
    }
    return `${phase.heading}. ${phase.facts.map(f => f.replace(/\.$/, '')).join('. ')}. When you reach ${phase.place}, choose ${phase.confirmLabel}.`;
  }

  function createState(guide, now = Date.now()) {
    return { guide, index: 0, startedAt: now, enteredAt: now, history: [], given: {}, snoozeUntil: 0, done: false };
  }

  /* Pure transitions. Only explicit rider events move the journey forward. */
  function reduce(s, event) {
    const phase = s.guide.phases[s.index];
    switch (event.type) {
      case 'CONFIRM': {
        // A stale double tap (the phase already changed) must not skip the next step.
        if (event.phaseIndex != null && event.phaseIndex !== s.index) return s;
        if (!phase || phase.kind === 'arrive') return { ...s, done: true };
        return { ...s, index: s.index + 1, enteredAt: event.now, snoozeUntil: 0, history: [...s.history, { index: s.index, kind: phase.kind, at: event.now }] };
      }
      case 'BACK': {
        if (!s.history.length) return s;
        const last = s.history[s.history.length - 1];
        return { ...s, index: last.index, enteredAt: event.now, history: s.history.slice(0, -1), snoozeUntil: 0 };
      }
      case 'STILL_WAITING': return { ...s, snoozeUntil: event.now + 5 * MIN };
      case 'REMINDED': return { ...s, given: { ...s.given, [event.key]: true } };
      default: return s;
    }
  }

  /* Departure status for a boarding phase; drives missed-connection recovery. */
  function departureStatus(s, now, opts = {}) {
    const clock = opts.clock || defaultClock;
    const phase = s.guide.phases[s.index];
    if (!phase || phase.kind !== 'board') return null;
    const basis = phase.live ? 'live time' : 'by the schedule';
    if (phase.canceled) return { state: 'canceled', message: 'This trip is marked canceled. Open Help and choose Find another route.' };
    if (phase.departs == null) return { state: 'unknown', message: 'Departure time is not known. Listen for announcements.' };
    const late = now - phase.departs;
    if (late > 2 * MIN) {
      if (now < s.snoozeUntil) return { state: 'waiting', message: 'You said you are still waiting. Rove will check again in a few minutes.' };
      return { state: 'maybe-missed', message: `The ${phase.live ? 'live' : 'scheduled'} departure at ${clock(phase.departs)} has passed. If it has left, open Help and choose Find another route. If you are still waiting, it may be late${phase.live ? '' : '; Rove has no live data for this trip'}.` };
    }
    const mins = Math.round(-late / MIN);
    if (mins <= 0) return { state: 'due', message: `Due now, ${basis}.` };
    return { state: 'upcoming', message: `${plural(mins, 'minute')} until departure, ${basis}.` };
  }

  /* Advance reminders that are due and not yet given. Each has a stable key so it fires once. */
  function dueReminders(s, now, opts = {}) {
    const clock = opts.clock || defaultClock;
    const phase = s.guide.phases[s.index];
    const out = [];
    if (!phase) return out;
    const basis = phase.live ? 'by live time' : 'by the schedule';
    if (phase.kind === 'ride' && phase.arrives != null) {
      const left = phase.arrives - now;
      const bus = phase.vehicle?.noun === 'bus';
      if (left <= 3 * MIN && left > MIN) out.push({ key: `${s.index}:prepare`, level: 'prepare', message: `${phase.place} in about ${plural(Math.max(2, Math.round(left / MIN)), 'minute')} ${basis}. Get ready to exit.${bus ? ' Press the stop request strip or pull the cord.' : ''}` });
      if (left <= MIN && left > -3 * MIN) out.push({ key: `${s.index}:next`, level: 'exit', message: `Your stop, ${phase.place}, should be next ${basis}. Confirm with the announcement before getting off.` });
      if (left <= -3 * MIN) out.push({ key: `${s.index}:overdue`, level: 'uncertain', message: `Arrival at ${phase.place} was expected at ${clock(phase.arrives)}. If you have not heard it announced, ask the operator. If you passed it, open Help.` });
      if (phase.connectMin != null && phase.connectMin < 3 && left <= 4 * MIN && left > 0) out.push({ key: `${s.index}:tight`, level: 'prepare', message: `Tight connection after this stop: ${phase.connectMin <= 0 ? 'less than a minute' : plural(phase.connectMin, 'minute')}. If you miss it, Help can find another route.` });
    }
    if (phase.kind === 'board') {
      const st = departureStatus(s, now, opts);
      if (st?.state === 'maybe-missed') out.push({ key: `${s.index}:missed:${s.snoozeUntil}`, level: 'uncertain', message: st.message });
      if (st?.state === 'canceled') out.push({ key: `${s.index}:canceled`, level: 'uncertain', message: st.message });
      const left = phase.departs != null ? phase.departs - now : null;
      if (!phase.canceled && left != null && left <= 2 * MIN && left > 0) out.push({ key: `${s.index}:soon`, level: 'prepare', message: `${phase.vehicle.name} departs in about ${plural(Math.max(1, Math.round(left / MIN)), 'minute')} ${basis}.` });
    }
    return out.filter(r => !s.given[r.key]);
  }

  /* One always-visible line stating what Rove does and doesn't know right now. */
  function certainty(phase, fixQuality) {
    if (!phase || phase.kind === 'arrive') return '';
    const gps = fixQuality === 'good' ? 'GPS is approximate.' : fixQuality === 'poor' ? 'GPS signal is weak.' : 'No GPS signal.';
    if (phase.kind === 'board') return `${phase.live ? 'Live' : 'Scheduled'} time. Rove cannot see which vehicle you board. ${gps}`;
    if (phase.kind === 'ride') return `${phase.live ? 'Live' : 'Scheduled'} time. Stop reminders are estimates; trust onboard announcements. ${gps}`;
    return `${gps} Rove does not detect crossings or obstacles.`;
  }

  const api = Object.freeze({ distanceWords, vehicle, buildGuide, speech, createState, reduce, departureStatus, dueReminders, certainty });
  root.RoveJourneyGuide = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
