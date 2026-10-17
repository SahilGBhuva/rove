#!/usr/bin/env bash
# Prepare everything OpenTripPlanner needs to build Rove's routing graph:
#   1. the OTP shaded jar (checksum-verified against Maven Central)
#   2. the Northern California OSM extract (checksum-verified against Geofabrik),
#      clipped to the Bay Area
#   3. the five validated GTFS archives from data/raw, named with stable feed ids
# Nothing here needs or reads any API key.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OTP_VERSION="${OTP_VERSION:-2.8.1}"
BBOX="${ROVE_OSM_BBOX:--122.62,36.95,-121.50,38.12}"   # min_lon,min_lat,max_lon,max_lat
BIN="$ROOT/data/otp/bin"
GRAPH="$ROOT/data/otp/graph"
OSM_DIR="$ROOT/data/osm"
OSM_URL="${ROVE_OSM_URL:-https://download.geofabrik.de/north-america/us/california/norcal-latest.osm.pbf}"
MAVEN="https://repo1.maven.org/maven2/org/opentripplanner/otp-shaded/${OTP_VERSION}"

mkdir -p "$BIN" "$GRAPH" "$OSM_DIR"
say() { printf '\n==> %s\n' "$*"; }
sha1() { if command -v sha1sum >/dev/null; then sha1sum "$1" | cut -d' ' -f1; else shasum -a 1 "$1" | cut -d' ' -f1; fi; }
md5() { if command -v md5sum >/dev/null; then md5sum "$1" | cut -d' ' -f1; else md5 -q "$1"; fi; }

# --- 1. OpenTripPlanner jar ------------------------------------------------
JAR="$BIN/otp-shaded-${OTP_VERSION}.jar"
if [[ ! -s "$JAR" ]]; then
  say "Downloading OpenTripPlanner ${OTP_VERSION}"
  ok=0
  for name in "otp-shaded-${OTP_VERSION}.jar" "otp-shaded-${OTP_VERSION}-shaded.jar"; do
    if curl -fsSL "$MAVEN/$name.sha1" -o "$BIN/expected.sha1" 2>/dev/null; then
      curl -fL --progress-bar "$MAVEN/$name" -o "$JAR.part"
      expected="$(tr -d ' \n' < "$BIN/expected.sha1" | cut -c1-40)"
      actual="$(sha1 "$JAR.part")"
      if [[ "$expected" != "$actual" ]]; then echo "Checksum mismatch for $name" >&2; mv "$JAR.part" "$JAR.bad"; exit 1; fi
      mv "$JAR.part" "$JAR"; ok=1; break
    fi
  done
  [[ $ok == 1 ]] || { echo "Could not find otp-shaded ${OTP_VERSION} on Maven Central" >&2; exit 1; }
  echo "Verified $(basename "$JAR") (sha1 $(sha1 "$JAR"))"
else
  echo "OpenTripPlanner jar already present: $(basename "$JAR")"
fi

# --- 2. OpenStreetMap -------------------------------------------------------
RAW_OSM="$OSM_DIR/$(basename "$OSM_URL")"
if [[ ! -s "$RAW_OSM" || -n "${ROVE_REFRESH_OSM:-}" ]]; then
  say "Downloading $(basename "$OSM_URL") from Geofabrik"
  curl -fL --progress-bar "$OSM_URL" -o "$RAW_OSM.part"
  if curl -fsSL "$OSM_URL.md5" -o "$OSM_DIR/expected.md5" 2>/dev/null; then
    expected="$(cut -d' ' -f1 < "$OSM_DIR/expected.md5")"
    [[ "$expected" == "$(md5 "$RAW_OSM.part")" ]] || { echo "OSM checksum mismatch" >&2; exit 1; }
    echo "OSM checksum verified"
  fi
  mv "$RAW_OSM.part" "$RAW_OSM"
fi

CLIPPED="$GRAPH/bay-area.osm.pbf"
if [[ ! -s "$CLIPPED" || "$RAW_OSM" -nt "$CLIPPED" ]]; then
  say "Clipping OSM to the Bay Area ($BBOX)"
  if command -v osmium >/dev/null; then
    osmium extract --bbox "$BBOX" --strategy complete_ways --overwrite -o "$CLIPPED.tmp.pbf" "$RAW_OSM"
  else
    python3 -c 'import osmium' 2>/dev/null || { echo "Install osmium-tool (brew install osmium-tool) or pyosmium (pip install osmium)" >&2; exit 1; }
    IFS=, read -r a b c d <<< "$BBOX"
    python3 "$ROOT/scripts/otp/clip_osm.py" "$RAW_OSM" "$CLIPPED.tmp.pbf" "$a" "$b" "$c" "$d"
  fi
  mv "$CLIPPED.tmp.pbf" "$CLIPPED"
  ls -lh "$CLIPPED"
fi

# --- 3. GTFS + configuration --------------------------------------------------
say "Installing validated GTFS archives"
for feed in bart muni caltrain vta act; do
  src="$ROOT/data/raw/$feed.zip"
  [[ -s "$src" ]] || { echo "Missing $src. Run npm run refresh-data first." >&2; exit 1; }
  cp "$src" "$GRAPH/$feed-gtfs.zip"
  echo "  $feed-gtfs.zip"
done
cp "$ROOT/otp/build-config.json" "$ROOT/otp/router-config.json" "$GRAPH/"
echo
echo "Ready. Next: npm run otp:build   (then npm run otp:start)"
