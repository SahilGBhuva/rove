#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p data/raw data/extracted data/staging public/data
[ -f .env ] && set -a && . ./.env && set +a

cleanup() { rm -rf data/staging/* data/raw/*.next data/raw/*.next.download; }
trap cleanup EXIT INT TERM

download_direct() {
  name="$1" url="$2"
  echo "Refreshing ${name}…"
  curl -L --fail --retry 3 --silent --show-error -o "data/raw/$name.zip.next" "$url"
}

download_511() {
  name="$1" operator="$2"
  echo "Refreshing ${name} from 511 operator ${operator}…"
  node scripts/fetch-511-static.mjs "$operator" "data/raw/$name.zip.next"
}

validate_and_install() {
  name="$1" stage="data/staging/$1"
  mkdir -p "$stage"
  unzip -oq "data/raw/$name.zip.next" -d "$stage"
  node scripts/audit-gtfs.mjs "$name" "$stage"
  rm -rf "data/extracted/$name.previous"
  if [ -d "data/extracted/$name" ]; then mv "data/extracted/$name" "data/extracted/$name.previous"; fi
  mv "$stage" "data/extracted/$name"
  mv "data/raw/$name.zip.next" "data/raw/$name.zip"
  rm -rf "data/extracted/$name.previous"
}

download_direct bart 'https://www.bart.gov/dev/schedules/google_transit.zip'
download_511 muni SF
download_direct vta 'https://gtfs.vta.org/gtfs_vta.zip'
download_511 act AC
download_direct caltrain 'https://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip'

for name in bart muni vta act caltrain; do validate_and_install "$name"; done
node scripts/audit-gtfs.mjs
node scripts/build-data.mjs
echo "Rove static network refreshed and validated."
