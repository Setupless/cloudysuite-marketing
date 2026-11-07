#!/bin/sh
# Playwright 1.64.1 drives Chromium build 1248. Install it once with: bunx playwright@1.64.1 install chromium
set -eu
root="$(cd "$(dirname "$0")/../.." && pwd)"
bunx playwright@1.64.1 screenshot \
  --browser chromium \
  --color-scheme light \
  --viewport-size "1200, 630" \
  --wait-for-timeout 500 \
  "file://$root/scripts/og/template.html" \
  "$root/public/og.png"
