#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
printf 'Paste your 511 SF Bay API key (input will be hidden): '
stty -echo
IFS= read -r key
stty echo
printf '\n'
trap 'stty echo 2>/dev/null || true' EXIT HUP INT TERM
if [ -z "$key" ]; then
  echo 'No key entered; nothing changed.'
  exit 1
fi
case "$key" in *[!A-Za-z0-9_-]*) echo 'The key contains unexpected characters; nothing changed.'; exit 1;; esac
umask 077
tmp="$(mktemp ./rove-env.XXXXXX)"
trap 'rm -f "$tmp"; stty echo 2>/dev/null || true' EXIT HUP INT TERM
if [ -f .env ]; then awk '!/^SF_511_API_KEY=/' .env > "$tmp"; fi
printf 'SF_511_API_KEY=%s\n' "$key" >> "$tmp"
mv "$tmp" .env
chmod 600 .env
unset key
echo 'Saved to .env with owner-only permissions. Restart Rove with: npm start'
