#!/usr/bin/env sh
set -eu

APP_DIR=${APP_DIR:-/opt/chiken-easy}
REPO_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

"$REPO_DIR/scripts/install-docker.sh"

mkdir -p "$APP_DIR"
tar \
  --exclude=".git" \
  --exclude=".local" \
  --exclude="node_modules" \
  --exclude="data" \
  --exclude="dist" \
  -cf - -C "$REPO_DIR" . | tar -xf - -C "$APP_DIR"

cd "$APP_DIR"
./scripts/prepare-docker.sh

if ! grep -q '^CHIKEN_API_TOKEN=' .env 2>/dev/null || [ -z "$(grep '^CHIKEN_API_TOKEN=' .env | cut -d= -f2-)" ]; then
  API_TOKEN="ck_$(openssl rand -hex 18)"
  if grep -q '^CHIKEN_API_TOKEN=' .env 2>/dev/null; then
    sed -i "s|^CHIKEN_API_TOKEN=.*|CHIKEN_API_TOKEN=$API_TOKEN|" .env
  else
    echo "CHIKEN_API_TOKEN=$API_TOKEN" >> .env
  fi
fi

if ! grep -q '^CHIKEN_MASTER_KEY=' .env 2>/dev/null || [ -z "$(grep '^CHIKEN_MASTER_KEY=' .env | cut -d= -f2-)" ]; then
  MASTER_KEY="$(openssl rand -hex 32)"
  if grep -q '^CHIKEN_MASTER_KEY=' .env 2>/dev/null; then
    sed -i "s|^CHIKEN_MASTER_KEY=.*|CHIKEN_MASTER_KEY=$MASTER_KEY|" .env
  else
    echo "CHIKEN_MASTER_KEY=$MASTER_KEY" >> .env
  fi
fi

if ! grep -q '^CHIKEN_NETWORK_TUNING_ENABLED=' .env 2>/dev/null; then
  echo "CHIKEN_NETWORK_TUNING_ENABLED=1" >> .env
fi

docker compose -f docker-compose.server.yml up -d --build
docker compose -f docker-compose.server.yml ps || true
