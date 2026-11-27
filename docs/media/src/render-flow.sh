#!/usr/bin/env bash
# Renders docs/media/flow.gif from docs/media/src/flow.html.
# Needs Node (npx), ffmpeg and a Chromium. HyperFrames renders the page frame by frame to MP4,
# then ffmpeg makes a 900 px wide GIF that loops.
#
#   docs/media/src/render-flow.sh
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cd "$work"
npx -y hyperframes@0.8.214 init project --example blank --non-interactive --skip-skills >/dev/null
cp "$repo/docs/media/src/flow.html" project/index.html
(cd project && npx hyperframes render -o "$work/flow.mp4" --fps 30 --quiet)

ffmpeg -v error -y -i "$work/flow.mp4" \
  -vf "fps=15,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" \
  -loop 0 "$repo/docs/media/flow.gif"
ls -l "$repo/docs/media/flow.gif"
