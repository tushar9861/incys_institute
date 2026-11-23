#!/bin/sh
set -eu
/init-unprivileged &
scanner_pid=$!
node /app/server.mjs &
http_pid=$!
trap 'kill "$scanner_pid" "$http_pid" 2>/dev/null || true; wait || true' TERM INT EXIT
# Exit the container if either process dies; Cloud Run can replace it.
wait -n "$scanner_pid" "$http_pid"
exit 1
