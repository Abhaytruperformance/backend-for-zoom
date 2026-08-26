#!/usr/bin/env bash
# Local Postgres + Redis without Docker (no sudo needed).
# Docker Desktop isn't installed on this machine, so these replace `docker compose up -d`.
#   ./dev-services.sh start | stop | status
set -euo pipefail

PGBIN="$HOME/.local/pgtmp/node_modules/@embedded-postgres/darwin-arm64/native/bin"
PGDATA="$HOME/.local/pgdata-zri"
REDIS="$HOME/.local/src/redis-7.4.2/src"
REDIS_DIR="$HOME/.local/redis-data"

case "${1:-status}" in
  start)
    "$PGBIN/pg_ctl" -D "$PGDATA" -o "-p 5442 -k /tmp -c listen_addresses=127.0.0.1" \
      -l "$PGDATA/server.log" start
    if ! "$REDIS/redis-cli" -p 6379 ping >/dev/null 2>&1; then
      mkdir -p "$REDIS_DIR"
      nohup "$REDIS/redis-server" --port 6379 --bind 127.0.0.1 --dir "$REDIS_DIR" \
        > "$REDIS_DIR/redis.log" 2>&1 &
      sleep 1
    fi
    ;;
  stop)
    "$PGBIN/pg_ctl" -D "$PGDATA" stop || true
    "$REDIS/redis-cli" -p 6379 shutdown nosave 2>/dev/null || true
    ;;
esac

echo "postgres :5442 -> $("$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1 && echo up || echo down)"
echo "redis    :6379 -> $("$REDIS/redis-cli" -p 6379 ping 2>/dev/null || echo down)"
