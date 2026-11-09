#!/bin/bash

NODE_ID="${NODE_ID:?Set NODE_ID before running}"
NODE_TOKEN="${NODE_TOKEN:?Set NODE_TOKEN before running}"
API_BASE_URL="${API_BASE_URL:?Set API_BASE_URL (for example http://localhost:3000) before running}"
HEARTBEAT_INTERVAL_SECONDS="${HEARTBEAT_INTERVAL_SECONDS:-10}"

if ! [[ "$NODE_ID" =~ ^[1-9][0-9]*$ ]]; then
    echo "NODE_ID must be a positive integer" >&2
    exit 2
fi

if ! [[ "$HEARTBEAT_INTERVAL_SECONDS" =~ ^[1-9][0-9]*$ ]]; then
    echo "HEARTBEAT_INTERVAL_SECONDS must be a positive integer" >&2
    exit 2
fi

if ! [[ "$NODE_TOKEN" =~ ^[A-Za-z0-9_-]{43}$ ]]; then
    echo "NODE_TOKEN must be a valid node credential" >&2
    exit 2
fi

URL="${API_BASE_URL%/}/api/nodes/${NODE_ID}/heartbeat"

while true
do
    STATUS=$(curl -s -o /dev/null \
        -w "%{http_code}" \
        --connect-timeout 5 \
        --max-time 10 \
        --header "Authorization: Bearer ${NODE_TOKEN}" \
        -X POST "$URL")

    if [ "$STATUS" = "200" ]; then
        echo "$(date):Node $NODE_ID Heartbeat successful"
    else
        echo "$(date):Node $NODE_ID Heartbeat failed (HTTP $STATUS)"
    fi

    sleep "$HEARTBEAT_INTERVAL_SECONDS"
done
