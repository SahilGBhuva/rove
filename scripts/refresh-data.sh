#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p data/raw data/extracted public/data
[ -f .env ] && set -a && . ./.env && set +a

download() { name="$1"; url="$2"; echo "Refreshing $name…"; curl -L --fail --retry 3 --etag-save "data/raw/$name.etag" --etag-compare "data/raw/$name.etag" -o "data/raw/$name.zip" "$url"; }
download bart 'https://www.bart.gov/dev/schedules/google_transit.zip'
download muni 'https://muni-gtfs.apps.sfmta.com/data/muni_gtfs-current.zip'
download vta 'https://gtfs.vta.org/gtfs_vta.zip'
if [ -n "${AC_TRANSIT_STATIC_TOKEN:-}" ]; then
  download act "https://api.actransit.org/transit/gtfs/download?token=${AC_TRANSIT_STATIC_TOKEN}"
elif [ ! -f data/raw/act.zip ]; then
  echo 'AC_TRANSIT_STATIC_TOKEN is required to refresh the AC Transit archive.' >&2
  exit 1
else
  echo 'AC Transit: using the existing archive because AC_TRANSIT_STATIC_TOKEN is not configured.'
fi
download caltrain 'https://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip'

for name in bart muni vta act caltrain; do
  mkdir -p "data/extracted/$name"
  unzip -oq "data/raw/$name.zip" -d "data/extracted/$name"
done
node scripts/build-data.mjs
echo "Rove static network is current."
