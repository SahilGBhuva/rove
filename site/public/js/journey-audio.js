/* Speech content must be derived from known itinerary facts, never GPS guesses. */
(function(root) {
  'use strict';
  const safe = value => String(value || '').replace(/[<>]/g, '').trim();
  function describeStep(step, options = {}) {
    if (!step) return 'No active journey step. Check your itinerary.';
    const leg = step.leg || {};
    const from = safe(leg.from?.name) || 'the listed stop';
    const to = safe(leg.to?.name) || 'your destination stop';
    const route = safe(step.li?.badge || leg.routeShortName || leg.routeName) || 'your selected route';
    const headsign = safe(leg.headsign);
    const platform = safe(leg.from?.platform);
    const remaining = Number.isInteger(options.remainingSteps) ? options.remainingSteps : null;
    if (step.type === 'wait') {
      if (leg.canceled) return 'This trip is marked canceled. Do not board based on this itinerary. Request a new route.';
      return 'Boarding step. Wait at ' + from + (platform ? ', platform ' + platform : '') +
        '. Expect ' + route + (headsign ? ' toward ' + headsign : '') +
        '. Confirm the vehicle route and destination with its announcement or driver before boarding. ' +
        'Vehicle location alone cannot confirm the correct bus.';
    }
    if (step.type === 'ride') {
      if (leg.canceled) return 'This trip is marked canceled. Check with transit staff and request a new route.';
      return 'Onboard step. Ride ' + route + ' to ' + to + '. ' +
        (remaining !== null && remaining > 0 ? remaining + ' journey steps remain after this one. ' : '') +
        'Listen for the onboard stop announcement. Prepare to exit before your stop, but only get off once the vehicle has stopped and you have confirmed the stop.';
    }
    if (step.type === 'walk') return 'Walking step. ' + safe(step.title) + '. ' +
      (safe(step.meta) ? 'Planned distance: ' + safe(step.meta) + '. ' : '') +
      'Walking directions are estimates. GPS cannot identify safe crossings, obstacles, or platform edges. Follow accessible pedestrian infrastructure and your mobility aids.';
    if (step.type === 'drive') return 'Driving step. ' + safe(step.title) + '. Follow traffic laws and do not operate this app while driving.';
    if (step.type === 'arrive') return safe(step.title) + '. Confirm your actual destination independently.';
    return safe(step.title) || 'Check your current journey step.';
  }
  root.RoveJourneyAudio = { describeStep };
})(typeof window !== 'undefined' ? window : globalThis);
