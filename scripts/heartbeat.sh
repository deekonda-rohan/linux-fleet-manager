#!/bin/bash

WINDOWS_HOST="172.25.144.1"
NODE_ID="${NODE_ID:?Set NODE_ID before running}"
URL="http://${WINDOWS_HOST}:3000/api/node/${NODE_ID}/heartbeat"

while true
do
    STATUS=$(curl -s -o /dev/null \
        -w "%{http_code}" \
        --connect-timeout 5 \
        -X POST "$URL")

    if [ "$STATUS" = "200" ]; then
        echo "$(date):Node $NODE_ID Heartbeat successful"
    else
        echo "$(date):Node $NODE_ID Heartbeat failed (HTTP $STATUS)"
    fi

    sleep 10
done
