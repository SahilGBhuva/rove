/* Rove navigation geometry and GPS quality helpers.
 * Runs in the browser without a build or API key; kept separate for deterministic tests. */
'use strict';
const RoveNavigation = (() => {
  const rad = Math.PI / 180;
  function meters(a, b) {
    if (!a || !b || ![...a, ...b].every(Number.isFinite)) return Infinity;
    const y = ((a[1] + b[1]) / 2) * rad;
    return Math.hypot((b[0] - a[0]) * Math.cos(y) * 111195, (b[1] - a[1]) * 111195);
  }
  function bearing(a, b) {
    const lat1 = a[1] * rad, lat2 = b[1] * rad, delta = (b[0] - a[0]) * rad;
    const x = Math.sin(delta) * Math.cos(lat2);
    const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(delta);
    return (Math.atan2(x, y) / rad + 360) % 360;
  }
  function distanceToPolyline(point, coords) {
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const lat = point[1] * rad;
    const factor = Math.cos(lat);
    let closest = Infinity;
    for (let i = 1; i < coords.length; i++) {
      const a = coords[i - 1], b = coords[i];
      if (![...a, ...b].every(Number.isFinite)) continue;
      const ax = (a[0] - point[0]) * factor * 111195;
      const ay = (a[1] - point[1]) * 111195;
      const bx = (b[0] - point[0]) * factor * 111195;
      const by = (b[1] - point[1]) * 111195;
      const dx = bx - ax, dy = by - ay, lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0;
      closest = Math.min(closest, Math.hypot(ax + dx * t, ay + dy * t));
    }
    return Number.isFinite(closest) ? closest : null;
  }
  function validFix(previous, next) {
    if (!next || !Array.isArray(next.point) || !next.point.every(Number.isFinite) ||
        !Number.isFinite(next.accuracy) || next.accuracy <= 0 || next.accuracy > 200 ||
        !Number.isFinite(next.time)) return false;
    if (!previous) return true;
    const seconds = (next.time - previous.time) / 1000;
    if (seconds <= 0) return false;
    // Don't jump across town on a GPS spike. Allow 50m measurement noise.
    return meters(previous.point, next.point) <= 55 * seconds + previous.accuracy + next.accuracy + 30;
  }
  function shouldReroute(fix, routeDistance, consecutive, elapsedSinceLastRerouteMs) {
    if (routeDistance == null || !Number.isFinite(routeDistance) ||
        fix.accuracy > 75 || elapsedSinceLastRerouteMs < 45000) return false;
    return routeDistance > Math.max(85, fix.accuracy * 2.5) && consecutive >= 3;
  }
  return Object.freeze({ meters, bearing, distanceToPolyline, validFix, shouldReroute });
})();
