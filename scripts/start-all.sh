#!/usr/bin/env bash
# start-all.sh — alias for dev-all.sh
exec "$(dirname "$0")/dev-all.sh" "$@"
