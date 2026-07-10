#!/usr/bin/env bash
# Forward localhost:5433 → VPS Postgres (127.0.0.1:5432 on server).
# Usage: ./scripts/vps-postgres-tunnel.sh start|stop|status
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/deploy/.env"
LOCAL_PORT="${VPS_PG_LOCAL_PORT:-5433}"
REMOTE_PORT=5432
PID_FILE="${TMPDIR:-/tmp}/krunch-vps-pg-tunnel.pid"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing deploy/.env"
  exit 1
fi
# shellcheck disable=SC1090
set -a && source "$ENV_FILE" && set +a

VPS_HOST="${VPS_HOST:?Set VPS_HOST in deploy/.env}"
VPS_USER="${VPS_USER:-root}"

start_tunnel() {
  if nc -z 127.0.0.1 "$LOCAL_PORT" 2>/dev/null; then
    echo "Tunnel already up on localhost:${LOCAL_PORT}"
    return 0
  fi

  if [[ -n "${VPS_PASSWORD:-}" ]] && command -v expect >/dev/null 2>&1; then
    export VPS_PG_LOCAL="$LOCAL_PORT" VPS_PG_REMOTE="$REMOTE_PORT"
    expect -f - <<'EXPECT_EOF' &
set timeout 30
log_user 0
spawn ssh -N -o StrictHostKeyChecking=no -o PreferredAuthentications=password -o PubkeyAuthentication=no -o ExitOnForwardFailure=yes -L $env(VPS_PG_LOCAL):127.0.0.1:$env(VPS_PG_REMOTE) $env(VPS_USER)@$env(VPS_HOST)
expect {
  -re "(?i)password:" { send "$env(VPS_PASSWORD)\r" }
}
set timeout -1
expect eof
EXPECT_EOF
    tunnel_pid=$!
  else
    ssh -N -o StrictHostKeyChecking=no -o ExitOnForwardFailure=yes \
      -L "${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}" "${VPS_USER}@${VPS_HOST}" &
    tunnel_pid=$!
  fi

  echo "$tunnel_pid" >"$PID_FILE"
  sleep 3
  if nc -z 127.0.0.1 "$LOCAL_PORT" 2>/dev/null; then
    echo "VPS Postgres tunnel: localhost:${LOCAL_PORT} → ${VPS_HOST}:${REMOTE_PORT}"
  else
    echo "Tunnel failed to bind localhost:${LOCAL_PORT}" >&2
    exit 1
  fi
}

stop_tunnel() {
  if [[ -f "$PID_FILE" ]]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm -f "$PID_FILE"
  fi
  echo "Tunnel stopped."
}

status_tunnel() {
  if nc -z 127.0.0.1 "$LOCAL_PORT" 2>/dev/null; then
    echo "Tunnel up on localhost:${LOCAL_PORT}"
  else
    echo "Tunnel down."
  fi
}

case "${1:-start}" in
  start) start_tunnel ;;
  stop) stop_tunnel ;;
  status) status_tunnel ;;
  *) echo "Usage: $0 start|stop|status"; exit 1 ;;
esac
