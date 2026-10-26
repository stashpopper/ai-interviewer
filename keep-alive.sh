#!/usr/bin/env bash
# Keep-alive ping for Render free-tier backend (prevents cold starts)
# Usage: ./keep-alive.sh <backend-url> [interval-seconds]
#
# Example: ./keep-alive.sh https://ai-interviewer-ky0h.onrender.com 300

set -euo pipefail

BACKEND_URL="${1:?Usage: $0 <backend-url> [interval-seconds]}"
INTERVAL="${2:-240}"  # default: 4 minutes

while true; do
    echo "$(date '+%Y-%m-%d %H:%M:%S') — Pinging $BACKEND_URL ..."
    if curl -sf -o /dev/null -w "HTTP %{http_code} in %.2fs\n" "$BACKEND_URL/api/v1/pre-interview" -X POST -H "Content-Type: application/json" -d '{"github":"keepalive"}' 2>&1; then
        echo "  ✅ Backend is warm"
    else
        echo "  ⚠️  Ping failed (server may be waking up)"
    fi
    sleep "$INTERVAL"
done
