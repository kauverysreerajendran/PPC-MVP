#!/usr/bin/env sh
# Minimal TCP wait helper for entrypoints / CI.
set -e
host="$1"; port="$2"; shift 2
timeout="${TIMEOUT:-60}"
i=0
until nc -z "$host" "$port" 2>/dev/null; do
  i=$((i+1))
  if [ "$i" -ge "$timeout" ]; then
    echo "timeout waiting for $host:$port" >&2
    exit 1
  fi
  sleep 1
done
exec "$@"
