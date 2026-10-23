// Visual interpolation between two real GPS observations, never extrapolation.
(function (root) {
  'use strict';
  function interpolateVehicles(previous, next, progress, maxJumpMeters = 2500) {
    const p = Math.max(0, Math.min(1, Number(progress) || 0));
    const old = new Map((previous?.features || []).map(f => [f.properties?.id + ':' + f.properties?.agency, f]));
    return { type: 'FeatureCollection', features: (next?.features || []).map(f => {
      const a = old.get(f.properties?.id + ':' + f.properties?.agency);
      if (!a || !Array.isArray(a.geometry?.coordinates) || !Array.isArray(f.geometry?.coordinates) || a.properties?.stale || f.properties?.stale) return f;
      const [x1,y1] = a.geometry.coordinates, [x2,y2] = f.geometry.coordinates;
      const metres = Math.hypot((y2-y1)*111200, (x2-x1)*111200*Math.cos(y1*Math.PI/180));
      if (!Number.isFinite(metres) || metres > maxJumpMeters || metres < 1) return f;
      const ease = p*p*(3-2*p);
      return { ...f, geometry: { ...f.geometry, coordinates: [x1+(x2-x1)*ease,y1+(y2-y1)*ease] } };
    }) };
  }
  root.RoveVehicleMotion = { interpolateVehicles };
})(typeof globalThis !== 'undefined' ? globalThis : window);
