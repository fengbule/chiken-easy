#!/usr/bin/env sh
set -eu

APP_DIR=${APP_DIR:-/opt/chiken-easy}
REPO_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

ensure_runtime() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 && command -v openssl >/dev/null 2>&1; then
    return 0
  fi

  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y ca-certificates curl git openssl nodejs npm
    return 0
  fi

  if command -v dnf >/dev/null 2>&1; then
    dnf install -y ca-certificates curl git openssl nodejs npm
    return 0
  fi

  if command -v yum >/dev/null 2>&1; then
    yum install -y ca-certificates curl git openssl nodejs npm
    return 0
  fi

  echo "unsupported package manager, please install nodejs, npm and openssl manually" >&2
  exit 2
}

command -v systemctl >/dev/null 2>&1 || {
  echo "systemd is required for server service deployment" >&2
  exit 3
}

ensure_runtime
mkdir -p "$APP_DIR"

tar \
  --exclude=".git" \
  --exclude=".local" \
  --exclude="node_modules" \
  --exclude="data" \
  --exclude="dist" \
  -cf - -C "$REPO_DIR" . | tar -xf - -C "$APP_DIR"

cd "$APP_DIR"
npm install
npm run build
mkdir -p data

if [ ! -f .env ]; then
  BOOTSTRAP_TOKEN="ce_$(openssl rand -hex 16)"
  API_TOKEN="ck_$(openssl rand -hex 18)"
  MASTER_KEY="$(openssl rand -hex 32)"
  cat > .env <<EOF
PORT=7788
CHIKEN_BOOTSTRAP_TOKEN=$BOOTSTRAP_TOKEN
CHIKEN_API_TOKEN=$API_TOKEN
CHIKEN_MASTER_KEY=$MASTER_KEY
CHIKEN_REQUIRE_API_TOKEN=1
CHIKEN_ALLOW_QUERY_TOKEN=0
CHIKEN_PUBLIC_BASE_URL=http://127.0.0.1:7788
CHIKEN_PUBLIC_WS_URL=ws://127.0.0.1:7788/agent
CHIKEN_STORAGE=json
CHIKEN_MONITOR_RAW_HOURS=24
CHIKEN_MONITOR_AGG_DAYS=7
CHIKEN_NETWORK_TUNING_ENABLED=1
EOF
fi

cat >/etc/systemd/system/chiken-server.service <<EOF
[Unit]
Description=ChikenEasy control plane
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=$(command -v node) server/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now chiken-server
systemctl status chiken-server --no-pager || true
