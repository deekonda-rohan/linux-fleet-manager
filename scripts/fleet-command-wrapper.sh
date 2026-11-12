#!/bin/sh
set -eu

case "${SSH_ORIGINAL_COMMAND-}" in
  'uptime')
    exec /usr/bin/uptime
    ;;
  'df -h -x tmpfs -x devtmpfs')
    exec /usr/bin/df -h -x tmpfs -x devtmpfs
    ;;
  'free -h')
    exec /usr/bin/free -h
    ;;
  'uname -srmo')
    exec /usr/bin/uname -srmo
    ;;
  'df -h')
    exec /usr/bin/df -h
    ;;
  'free -m')
    exec /usr/bin/free -m
    ;;
  'systemctl status node_exporter.service --no-pager')
    exec /usr/bin/systemctl status node_exporter.service --no-pager
    ;;
  *)
    printf '%s\n' 'Rejected: operation is not allowlisted' >&2
    exit 126
    ;;
esac
