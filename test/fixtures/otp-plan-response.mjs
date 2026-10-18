// Test fixture: the shape of an OpenTripPlanner 2.8 planConnection response.
export const OTP_RESPONSE = {
  data: {
    planConnection: {
      searchDateTime: '2026-10-20T09:00:00-07:00',
      routingErrors: [],
      pageInfo: { searchWindowUsed: 'PT40M' },
      edges: [{
        node: {
          start: '2026-10-20T09:02:00-07:00', end: '2026-10-20T09:24:00-07:00', duration: 1320, walkTime: 420, waitingTime: 60, walkDistance: 512.4, numberOfTransfers: 0,
          legs: [
            { mode: 'WALK', transitLeg: false, realTime: false, realtimeState: null, duration: 240, distance: 300.2, headsign: null, serviceDate: null, interlineWithPreviousLeg: false,
              steps: [{ distance: 120.4, relativeDirection: 'DEPART', absoluteDirection: 'SOUTH', streetName: 'Powell Street', bogusName: false, stayOn: false, area: false, exit: null, lat: 37.7849, lon: -122.4073 }, { distance: 179.8, relativeDirection: 'CONTINUE', absoluteDirection: 'SOUTH', streetName: 'Powell Street', bogusName: false, stayOn: true, area: false, exit: null, lat: 37.7847, lon: -122.4075 }],
              start: { scheduledTime: '2026-10-20T09:02:00-07:00', estimated: null }, end: { scheduledTime: '2026-10-20T09:06:00-07:00', estimated: null },
              from: { name: 'Origin', lat: 37.7849, lon: -122.4073, stop: null }, to: { name: 'Powell Street', lat: 37.7845, lon: -122.4078, stop: { gtfsId: 'bart:M30-1', code: '903301', platformCode: '1', parentStation: { gtfsId: 'bart:POWL', name: 'Powell Street' } } },
              route: null, agency: null, trip: null, legGeometry: { points: '_p~iF~ps|U_ulLnnqC' }, intermediateStops: null, alerts: [] },
            { mode: 'SUBWAY', transitLeg: true, realTime: true, realtimeState: 'UPDATED', duration: 900, distance: 12000, headsign: 'Antioch', serviceDate: '20261020', interlineWithPreviousLeg: false,
              start: { scheduledTime: '2026-10-20T09:07:00-07:00', estimated: { time: '2026-10-20T09:08:00-07:00', delay: 'PT1M' } }, end: { scheduledTime: '2026-10-20T09:22:00-07:00', estimated: { time: '2026-10-20T09:23:00-07:00', delay: 'PT1M' } },
              from: { name: 'Powell Street', lat: 37.7845, lon: -122.4078, stop: { gtfsId: 'bart:M30-1', code: '903301', platformCode: '1', parentStation: { gtfsId: 'bart:POWL', name: 'Powell Street' } } },
              to: { name: 'Lake Merritt', lat: 37.7973, lon: -122.2653, stop: { gtfsId: 'bart:A10-1', code: '902101', platformCode: '1', parentStation: { gtfsId: 'bart:LAKE', name: 'Lake Merritt' } } },
              route: { gtfsId: 'bart:2', shortName: 'Yellow-N', longName: 'Millbrae/SF Int\'l SFO to Antioch', color: 'FFFF33', textColor: '000000', mode: 'SUBWAY' },
              agency: { gtfsId: 'bart:BART', name: 'Bay Area Rapid Transit' }, trip: { gtfsId: 'bart:1965527', tripHeadsign: 'Antioch', tripShortName: null },
              legGeometry: { points: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' }, intermediateStops: [{ gtfsId: 'bart:M20-1', name: 'Montgomery Street', lat: 37.789, lon: -122.401 }],
              alerts: [{ alertHeaderText: 'Elevator out of service', alertDescriptionText: 'Use the street elevator', effectiveStartDate: 1792200000, effectiveEndDate: null }] },
            { mode: 'WALK', transitLeg: false, realTime: false, realtimeState: null, duration: 180, distance: 212.2, headsign: null, serviceDate: null, interlineWithPreviousLeg: false,
              start: { scheduledTime: '2026-10-20T09:23:00-07:00', estimated: null }, end: { scheduledTime: '2026-10-20T09:26:00-07:00', estimated: null },
              from: { name: 'Lake Merritt', lat: 37.7973, lon: -122.2653, stop: null }, to: { name: 'Destination', lat: 37.7974, lon: -122.2651, stop: null },
              route: null, agency: null, trip: null, legGeometry: { points: '' }, intermediateStops: null, alerts: [] }
          ]
        }
      }]
    }
  }
};
