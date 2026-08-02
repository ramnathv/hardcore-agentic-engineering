#!/usr/bin/env bash
# Make a throwaway copy of the whole prove-it checkout and print its path.
# Demos mutate working/, runs/ and control/receipts/ — do them in the copy,
# keep your checkout clean. Usage:
#   cd "$(bash sessions/s3-control-plane/fixtures/scratch.sh)"
set -euo pipefail
SRC="$(cd "$(dirname "$0")/../../.." && pwd)"
T="$(mktemp -d "${TMPDIR:-/tmp}/prove-it-s3.XXXXXX")"
cp -R "$SRC/." "$T/"
rm -rf "$T/.git" "$T/runs" "$T/node_modules"
mkdir -p "$T/runs"
echo "$T"
