#!/usr/bin/env bash
# Records docs/media/demo.gif against the fake MeroShare. Never touches ~/.ipo or a real host.
#
# Needs vhs (https://github.com/charmbracelet/vhs) and its ttyd, ffmpeg and a Chromium on PATH,
# and the JetBrains Mono font.
#
#   scripts/demo/record.sh
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo"
command -v vhs >/dev/null || { echo "vhs is not on PATH" >&2; exit 1; }

work="$(mktemp -d)"
npx tsx scripts/demo/scenario.ts "$work" >"$work/scenario.log" 2>&1 &
scenario=$!
trap 'kill "$scenario" 2>/dev/null || true; rm -rf "$work"' EXIT

for _ in $(seq 60); do
  [ -f "$work/env.sh" ] && break
  kill -0 "$scenario" 2>/dev/null || { cat "$work/scenario.log" >&2; exit 1; }
  sleep 0.5
done
[ -f "$work/env.sh" ] || { echo "the scenario did not start" >&2; exit 1; }

# shellcheck disable=SC1091
source "$work/env.sh"
case "$IPO_HOME" in "$work"/*) ;; *) echo "IPO_HOME is not the temp folder" >&2; exit 1 ;; esac
case "$MEROSHARE_API_BASE" in http://127.0.0.1:*) ;; *) echo "not the fake server" >&2; exit 1 ;; esac

DEMO_ENV="$work/env.sh" vhs scripts/demo/demo.tape
ls -l docs/media/demo.gif
