/** Conservative spoken guidance derived from a validated journey response.
 * This is trip guidance, NOT obstacle detection or turn-by-turn mobility assistance.
 */
const clean = (value, fallback) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 160) : fallback;
const finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;

export function accessibleJourney(journey) {
  const legs = Array.isArray(journey?.legs) ? journey.legs : [];
  const instructions = [];
  const warnings = [];
  if (!legs.length) return { instructions, warnings: ['No validated journey legs are available.'], guidanceLevel: 'unavailable', obstacleDetection: false };
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i] || {};
    const from = clean(leg.from?.name, 'the starting point');
    const to = clean(leg.to?.name, 'your destination');
    const transit = leg.mode === 'TRANSIT';
    if (transit) {
      const route = clean(leg.routeName, 'the indicated route');
      const destination = clean(leg.headsign, 'the displayed destination');
      instructions.push({ legIndex: i, kind: 'board', speech: `At ${from}, verify the vehicle is ${route} toward ${destination} before boarding.`, requiresConfirmation: true });
      if (Array.isArray(leg.intermediateStops) && leg.intermediateStops.length) {
        instructions.push({ legIndex: i, kind: 'prepare-exit', speech: `Prepare to exit at ${to}. Confirm the stop announcement before getting off.`, requiresConfirmation: true });
      } else {
        instructions.push({ legIndex: i, kind: 'exit', speech: `Exit at ${to}, after confirming the stop announcement.`, requiresConfirmation: true });
      }
      if (leg.canceled) warnings.push(`The scheduled ${route} trip is marked canceled. Replan before traveling.`);
      if (!leg.realtime) warnings.push(`Live timing is not verified for ${route}; departure information may be scheduled only.`);
    } else {
      const distance = finite(leg.distanceMeters) ? `, approximately ${Math.round(leg.distanceMeters)} meters` : '';
      instructions.push({ legIndex: i, kind: 'walk', speech: `Travel from ${from} to ${to}${distance}. Use your preferred mobility aid and verify crossings and obstacles independently.`, requiresConfirmation: true });
      if (!Array.isArray(leg.steps) || !leg.steps.length || !leg.geometry) warnings.push(`Detailed walking directions are unavailable or unverified between ${from} and ${to}.`);
    }
  }
  return { instructions, warnings: [...new Set(warnings)], guidanceLevel: 'trip-assistance-only', obstacleDetection: false, locationPrecision: 'not-guaranteed', emergencyNavigation: false };
}

export function accessibleJourneys(response) {
  return { generatedAt: response?.generatedAt ?? null, capabilities: { spokenTripInstructions: true, obstacleDetection: false, safeCrossingDetection: false, exactBoardingDoorDetection: false, indoorStationNavigation: false, autonomousMobilityNavigation: false }, journeys: (response?.itineraries || []).map(it => ({ journeyId: it.id, ...accessibleJourney(it) })) };
}
