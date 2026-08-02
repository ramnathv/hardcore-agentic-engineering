#!/usr/bin/env bash
# The worker-context authority probe (M6). Six actual attempts, four honest
# labels: contained / refused / allowed / unsupported. Nothing is inferred from
# configuration; nothing in your checkout is touched (throwaway copy).
set -euo pipefail
cd "$(dirname "$0")/.."
export NODE_NO_WARNINGS=1

T="$(mktemp -d "${TMPDIR:-/tmp}/prove-it-probe.XXXXXX")"
trap 'rm -rf "$T"' EXIT
cp -R control working done fixtures "$T/"
mkdir -p "$T/runs"
export PROVE_IT_ROOT="$T"

node src/probe.ts
